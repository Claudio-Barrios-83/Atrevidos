-- ============================================================================
-- Fix: el panel de admin no podia banear usuarios (RLS)
-- ============================================================================
-- Bug encontrado en QA: al banear un usuario (UPDATE profiles SET is_active =
-- false), PostgREST evalua la policy de SELECT sobre la fila resultante para
-- poder devolverla (o simplemente para contar filas afectadas). La policy
-- profiles_select_public solo permite ver un perfil si is_active = true o si
-- es el propio usuario. Como el admin no es el usuario banead ni el usuario
-- sigue activo despues del cambio, la fila queda invisible para el propio
-- admin que la modifico, y Postgres responde "new row violates row-level
-- security policy for table profiles" aunque la actualizacion en si era
-- legitima.
--
-- Solucion: los admins (is_admin = true) tambien pueden ver cualquier
-- perfil, activo o no. Esto es necesario para moderacion (ver, banear,
-- desbanear usuarios inactivos).
-- ============================================================================

DROP POLICY IF EXISTS profiles_select_public ON profiles;

CREATE POLICY profiles_select_public ON profiles
    FOR SELECT TO authenticated
    USING (
        is_active = true
        OR auth.uid() = id
        OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
    );

COMMENT ON POLICY profiles_select_public ON profiles IS
    'Perfiles activos son visibles para cualquier usuario autenticado; cada usuario siempre ve su propio perfil; los admins ven todos los perfiles (incluyendo banead@s) para poder moderar.';
