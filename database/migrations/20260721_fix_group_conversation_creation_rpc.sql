-- ============================================================================
-- Fix: creación de chats grupales rota por orden de evaluación de RLS
-- ============================================================================
-- Bug encontrado en QA: el flujo de la UI hace
--   INSERT INTO conversations (...) ... RETURNING id
-- Para poder devolver la fila insertada, Postgres también evalúa la policy
-- de SELECT (conversations_select_participant -> can_access_conversation),
-- que para conversaciones grupales exige que auth.uid() ya sea un
-- conversation_participants activo de ese grupo. Como el participante
-- todavía no existe en ese punto (se inserta en el paso siguiente), el
-- INSERT falla con "new row violates row-level security policy for table
-- conversations", incluso siendo el creador legítimo.
--
-- Solución: igual patrón que ya usa create_conversation_for_match() para
-- chats 1 a 1 -- una función SECURITY DEFINER que crea la conversación y
-- agrega a todos los participantes (creador como admin, resto como member)
-- de forma atómica, sin pasar por RLS a mitad de camino. Además valida en
-- el servidor que todos los miembros agregados sean matches mutuos del
-- creador (defensa en profundidad, la UI ya restringe esto pero no hay que
-- confiar solo en el cliente) y que no haya bloqueos de por medio.
-- ============================================================================

CREATE OR REPLACE FUNCTION create_group_conversation(
    creator_id UUID,
    group_name TEXT,
    member_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    conv_id UUID;
    clean_name TEXT;
    unique_member_ids UUID[];
    member_id UUID;
BEGIN
    IF creator_id IS NULL OR creator_id != auth.uid() THEN
        RAISE EXCEPTION 'creator_id debe coincidir con el usuario autenticado';
    END IF;

    clean_name := trim(coalesce(group_name, ''));
    IF length(clean_name) = 0 THEN
        RAISE EXCEPTION 'El grupo necesita un nombre';
    END IF;

    unique_member_ids := ARRAY(
        SELECT DISTINCT m FROM unnest(coalesce(member_ids, ARRAY[]::UUID[])) AS m WHERE m IS NOT NULL AND m != creator_id
    );

    IF unique_member_ids IS NULL OR array_length(unique_member_ids, 1) IS NULL OR array_length(unique_member_ids, 1) < 2 THEN
        RAISE EXCEPTION 'Se necesitan al menos 2 integrantes ademas del creador';
    END IF;

    FOREACH member_id IN ARRAY unique_member_ids LOOP
        IF has_block_between_users(creator_id, member_id) THEN
            RAISE EXCEPTION 'No podes agregar a un usuario bloqueado al grupo';
        END IF;
        IF NOT has_active_direct_match(creator_id, member_id) THEN
            RAISE EXCEPTION 'Solo podes agregar matches mutuos al grupo';
        END IF;
    END LOOP;

    INSERT INTO conversations (is_group, name, created_by, last_message_at)
    VALUES (true, clean_name, creator_id, NOW())
    RETURNING id INTO conv_id;

    INSERT INTO conversation_participants (conversation_id, user_id, role)
    VALUES (conv_id, creator_id, 'admin');

    INSERT INTO conversation_participants (conversation_id, user_id, role)
    SELECT conv_id, unnest(unique_member_ids), 'member';

    RETURN conv_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_group_conversation(UUID, TEXT, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_group_conversation(UUID, TEXT, UUID[]) TO authenticated;

COMMENT ON FUNCTION create_group_conversation(UUID, TEXT, UUID[]) IS
    'Crea un chat grupal y agrega a los participantes de forma atomica (SECURITY DEFINER) evitando el problema de orden de RLS entre conversations y conversation_participants. Solo permite agregar matches mutuos sin bloqueo.';
