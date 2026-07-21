-- ============================================================================
-- Fix crítico: rol de admin propio (is_admin), separado de is_verified
-- ============================================================================
-- Las policies de admin usaban "username = 'admin' OR is_verified = true", lo
-- que le daría poderes de moderación/borrado a CUALQUIER usuario verificado
-- (insignia de verificado en la UI). Esto era inintencional y peligroso: en
-- cuanto se empezara a verificar cuentas, cualquier persona verificada podría
-- ver todos los reportes de la plataforma y borrar perfiles ajenos.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Nadie puede otorgarse a sí mismo is_admin vía la API (solo se puede setear
-- manualmente por SQL/dashboard, o por otro admin en el futuro).
CREATE OR REPLACE FUNCTION prevent_self_admin_elevation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin AND auth.uid() = NEW.id THEN
    NEW.is_admin := OLD.is_admin;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_prevent_self_admin_elevation ON profiles;
CREATE TRIGGER trg_prevent_self_admin_elevation
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_self_admin_elevation();

-- Mismo problema aplicaba a is_verified: profiles_update_own no restringe
-- columnas, así que cualquier usuario podía auto-otorgarse la insignia de
-- verificado con un PATCH directo a su propio perfil.
CREATE OR REPLACE FUNCTION prevent_self_verification_elevation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified AND auth.uid() = NEW.id THEN
    NEW.is_verified := OLD.is_verified;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_prevent_self_verification_elevation ON profiles;
CREATE TRIGGER trg_prevent_self_verification_elevation
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_self_verification_elevation();

-- Estas dos funciones son triggers internos: no deben quedar invocables
-- directamente vía /rest/v1/rpc/... (Postgres otorga EXECUTE a PUBLIC por
-- defecto al crear una función, hay que revocarlo explícitamente).
REVOKE EXECUTE ON FUNCTION prevent_self_admin_elevation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION prevent_self_verification_elevation() FROM PUBLIC;

-- Reemplazo de las policies de admin para usar is_admin en vez de is_verified
DROP POLICY IF EXISTS profiles_delete_admin ON profiles;
CREATE POLICY profiles_delete_admin ON profiles
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

DROP POLICY IF EXISTS report_history_select_admin ON report_history;
CREATE POLICY report_history_select_admin ON report_history
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

DROP POLICY IF EXISTS reports_select_own ON reports;
CREATE POLICY reports_select_own ON reports
  FOR SELECT TO authenticated
  USING (
    reporter_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

DROP POLICY IF EXISTS reports_update_admin ON reports;
CREATE POLICY reports_update_admin ON reports
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

-- Permite a un admin desactivar (banear) un perfil sin necesidad de borrarlo.
DROP POLICY IF EXISTS profiles_update_admin ON profiles;
CREATE POLICY profiles_update_admin ON profiles
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

-- ============================================================================
-- NOTA IMPORTANTE PARA EL OPERADOR: para dar de alta al primer admin, corré
-- manualmente en el SQL editor de Supabase (reemplazando el email):
--   UPDATE profiles SET is_admin = true
--   WHERE id = (SELECT id FROM auth.users WHERE email = 'tu-email@dominio.com');
-- ============================================================================

-- ============================================================================
-- Exponer last_message_media_url en user_conversations (para preview "📷 Foto"
-- en la bandeja de mensajes cuando el último mensaje es solo una imagen).
-- ============================================================================
CREATE OR REPLACE VIEW user_conversations
WITH (security_invoker = true) AS
SELECT
    c.id,
    c.is_group,
    c.name,
    c.avatar_url,
    c.last_message_at,
    c.created_at,
    m.content AS last_message_content,
    m.created_at AS last_message_time,
    sender_profile.display_name AS last_message_sender,
    (SELECT count(*)
       FROM messages new_msg
      WHERE new_msg.conversation_id = c.id
        AND new_msg.created_at > COALESCE(cp.last_read_at, '-infinity'::timestamptz)
        AND new_msg.sender_id <> auth.uid()
        AND new_msg.is_deleted = false) AS unread_count,
    m.media_url AS last_message_media_url
FROM conversations c
JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = auth.uid()
LEFT JOIN LATERAL (
    SELECT messages.id, messages.conversation_id, messages.sender_id, messages.content,
           messages.media_url, messages.media_type, messages.reply_to_id, messages.is_edited,
           messages.is_deleted, messages.read_at, messages.created_at, messages.updated_at
    FROM messages
    WHERE messages.conversation_id = c.id
    ORDER BY messages.created_at DESC
    LIMIT 1
) m ON true
LEFT JOIN profiles sender_profile ON m.sender_id = sender_profile.id
WHERE cp.is_active = true;

GRANT SELECT ON user_conversations TO authenticated;
REVOKE ALL ON user_conversations FROM PUBLIC;
REVOKE ALL ON user_conversations FROM anon;
