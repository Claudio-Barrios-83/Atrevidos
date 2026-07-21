-- ============================================================================
-- Hallazgo de seguridad: exposición pública de datos sin sesión
-- ============================================================================
-- Ninguna política RLS del esquema original especificaba "TO authenticated",
-- por lo que Postgres las asignaba al rol PUBLIC (que incluye "anon"). En la
-- mayoría de las tablas esto no exponía datos porque el USING dependía de
-- auth.uid() (NULL para anon), pero en "profiles" (is_active = true OR
-- auth.uid() = id) y "posts" (visibility = 'public' OR ...) la condición OR se
-- cumplía igual sin sesión, permitiendo leer perfiles y posts públicos a
-- cualquier visitante sin cuenta. Lo mismo ocurría en storage.objects (los
-- SELECT de avatars/covers/post-images/media-chats ni siquiera comprobaban
-- auth.uid()) y en varias funciones RPC (search_users, rls_auto_enable, etc.)
-- que quedaron ejecutables por "anon" o por el pseudo-rol PUBLIC.
--
-- Decisión de producto: nadie sin sesión puede leer ni escribir nada. Se
-- restringe el rol de TODAS las políticas RLS (tablas + storage.objects) a
-- "authenticated", y se revoca EXECUTE de "anon"/PUBLIC en todas las
-- funciones de public, re-otorgándolo solo a "authenticated" donde una
-- política RLS lo necesita internamente.
-- ============================================================================

-- ---- Políticas de tablas: restringir a authenticated ----
ALTER POLICY profiles_select_public ON profiles TO authenticated;
ALTER POLICY profiles_update_own ON profiles TO authenticated;
ALTER POLICY profiles_insert_own ON profiles TO authenticated;
ALTER POLICY profiles_delete_admin ON profiles TO authenticated;

ALTER POLICY posts_select_public ON posts TO authenticated;
ALTER POLICY posts_insert_own ON posts TO authenticated;
ALTER POLICY posts_update_own ON posts TO authenticated;
ALTER POLICY posts_delete_own ON posts TO authenticated;

ALTER POLICY likes_select_on_visible_posts ON likes TO authenticated;
ALTER POLICY likes_insert_valid ON likes TO authenticated;
ALTER POLICY likes_delete_own ON likes TO authenticated;

ALTER POLICY comments_select_on_visible_posts ON comments TO authenticated;
ALTER POLICY comments_insert_valid ON comments TO authenticated;
ALTER POLICY comments_update_own ON comments TO authenticated;
ALTER POLICY comments_delete_own ON comments TO authenticated;

ALTER POLICY matches_select_own ON matches TO authenticated;
ALTER POLICY matches_insert_own ON matches TO authenticated;
ALTER POLICY matches_update_own ON matches TO authenticated;
ALTER POLICY matches_delete_own ON matches TO authenticated;

ALTER POLICY conversations_select_participant ON conversations TO authenticated;
ALTER POLICY conversations_insert_own ON conversations TO authenticated;

ALTER POLICY participants_select_own ON conversation_participants TO authenticated;
ALTER POLICY participants_insert_system ON conversation_participants TO authenticated;
ALTER POLICY participants_update_own ON conversation_participants TO authenticated;

ALTER POLICY messages_select_participant ON messages TO authenticated;
ALTER POLICY messages_insert_participant ON messages TO authenticated;
ALTER POLICY messages_update_own ON messages TO authenticated;
ALTER POLICY messages_delete_own ON messages TO authenticated;

ALTER POLICY reports_select_own ON reports TO authenticated;
ALTER POLICY reports_insert_own ON reports TO authenticated;
ALTER POLICY reports_update_admin ON reports TO authenticated;

ALTER POLICY report_history_select_admin ON report_history TO authenticated;
ALTER POLICY report_history_insert_admin ON report_history TO authenticated;

-- ---- Políticas de storage.objects: restringir a authenticated ----
ALTER POLICY "Usuarios pueden subir su propio avatar" ON storage.objects TO authenticated;
ALTER POLICY "Usuarios pueden ver avatares" ON storage.objects TO authenticated;
ALTER POLICY "Usuarios pueden actualizar su propio avatar" ON storage.objects TO authenticated;
ALTER POLICY "Usuarios pueden eliminar su propio avatar" ON storage.objects TO authenticated;

ALTER POLICY "Usuarios pueden subir su propia portada" ON storage.objects TO authenticated;
ALTER POLICY "Usuarios pueden ver portadas" ON storage.objects TO authenticated;
ALTER POLICY "Usuarios pueden actualizar su propia portada" ON storage.objects TO authenticated;
ALTER POLICY "Usuarios pueden eliminar su propia portada" ON storage.objects TO authenticated;

ALTER POLICY "Usuarios pueden subir imagenes de post" ON storage.objects TO authenticated;
ALTER POLICY "Usuarios pueden ver imagenes de posts publicos" ON storage.objects TO authenticated;
ALTER POLICY "Usuarios pueden actualizar sus propias imagenes" ON storage.objects TO authenticated;
ALTER POLICY "Usuarios pueden eliminar sus propias imagenes" ON storage.objects TO authenticated;

ALTER POLICY "Usuarios pueden subir archivos de chat" ON storage.objects TO authenticated;
ALTER POLICY "Participantes pueden ver archivos de chat" ON storage.objects TO authenticated;
ALTER POLICY "Usuarios pueden actualizar sus propios archivos" ON storage.objects TO authenticated;
ALTER POLICY "Usuarios pueden eliminar sus propios archivos" ON storage.objects TO authenticated;

-- ---- Funciones: revocar EXECUTE de anon y de PUBLIC ----
REVOKE EXECUTE ON FUNCTION can_access_conversation(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION can_manage_group_participants(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION can_update_own_participation(uuid, uuid, uuid, text, boolean, timestamptz, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION create_conversation_for_match(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION handle_match_check() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION handle_soft_delete() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION has_active_direct_match(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION has_block_between_users(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION is_valid_direct_conversation(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION prevent_duplicate_reports() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION search_users(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION update_last_active() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION update_post_counts() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION update_updated_at_column() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION validate_report_target() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION validate_username() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION rls_auto_enable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION rls_auto_enable() FROM anon;

-- Re-otorgar EXECUTE solo a authenticated donde una política RLS lo invoca
-- internamente (helpers de matches/conversaciones) o donde la app llama al
-- RPC directamente desde una sesión ya logueada (search_users).
GRANT EXECUTE ON FUNCTION can_access_conversation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION can_manage_group_participants(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION can_update_own_participation(uuid, uuid, uuid, text, boolean, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION create_conversation_for_match(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION has_active_direct_match(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION has_block_between_users(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_valid_direct_conversation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION search_users(text) TO authenticated;

-- Nota: las funciones que solo se disparan como triggers (handle_new_user,
-- handle_match_check, update_last_active, update_post_counts,
-- update_updated_at_column, handle_soft_delete, validate_report_target,
-- validate_username, prevent_duplicate_reports, rls_auto_enable) no requieren
-- EXECUTE explícito para ningún rol: el motor de triggers las invoca
-- internamente sin pasar por una comprobación de privilegio de EXECUTE sobre
-- el rol que ejecuta el INSERT/UPDATE/DELETE. Verificado empíricamente tras
-- aplicar esta migración: alta de usuario, likes/comments, match mutuo,
-- conversación automática y mensajería siguieron funcionando con estas
-- funciones sin EXECUTE otorgado a authenticated/anon.
