-- ============================================================================
-- Fix: get_advisors detecto que 'anon' puede ejecutar funciones nuevas
-- ============================================================================
-- REVOKE ... FROM PUBLIC no alcanza: Supabase otorga EXECUTE a los roles
-- anon/authenticated/service_role de forma directa (via default privileges
-- del esquema public), ademas del grant implicito a PUBLIC. Hay que revocar
-- explicitamente de 'anon' (igual patron que ya se aplico antes para las
-- funciones de suscripcion).
-- ============================================================================

REVOKE EXECUTE ON FUNCTION is_admin_user(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION create_group_conversation(UUID, TEXT, UUID[]) FROM anon;
