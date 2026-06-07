CREATE OR REPLACE FUNCTION handle_match_check()
RETURNS TRIGGER AS $$
DECLARE
    is_mutual BOOLEAN;
BEGIN
    IF NEW.match_type NOT IN ('like', 'super-like') THEN
        UPDATE matches
        SET is_mutual = false
        WHERE id = NEW.id
           OR (
                user_id = NEW.target_user_id
            AND target_user_id = NEW.user_id
            AND is_mutual = true
           );

        RETURN NEW;
    END IF;

    -- Verificar si ya existe un like del target hacia el usuario
    SELECT EXISTS (
        SELECT 1 FROM matches
        WHERE user_id = NEW.target_user_id
          AND target_user_id = NEW.user_id
          AND match_type IN ('like', 'super-like')
    ) INTO is_mutual;

    IF is_mutual THEN
        -- Marcar como mutuo ambos registros
        UPDATE matches SET is_mutual = true WHERE id = NEW.id;
        UPDATE matches SET is_mutual = true
        WHERE user_id = NEW.target_user_id
          AND target_user_id = NEW.user_id;

        -- Opcional: Crear conversación automática para matches mutuos
        PERFORM create_conversation_for_match(NEW.user_id, NEW.target_user_id);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_match_create ON matches;

CREATE TRIGGER on_match_create
    AFTER INSERT OR UPDATE OF match_type ON matches
    FOR EACH ROW EXECUTE FUNCTION handle_match_check();
