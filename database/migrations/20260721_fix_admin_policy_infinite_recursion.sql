-- ============================================================================
-- Fix: recursion infinita al agregar el chequeo de admin a profiles_select_public
-- ============================================================================
-- La migracion anterior (fix_admin_can_view_banned_profiles) agrego un
-- EXISTS (SELECT 1 FROM profiles ...) directo dentro de la propia policy de
-- SELECT de profiles. Como CUALQUIER lectura de profiles (incluida la que
-- hace esa misma subconsulta) vuelve a aplicar esa misma policy, Postgres
-- detecta "infinite recursion detected in policy for relation profiles" y
-- rechaza toda la operacion.
--
-- Solucion estandar: mover el chequeo "es admin?" a una funcion
-- SECURITY DEFINER. Al ejecutarse con los privilegios del owner de la
-- funcion, esa consulta interna no vuelve a evaluar las policies de RLS de
-- profiles, rompiendo el ciclo. De paso, se reescriben profiles_update_admin
-- y profiles_delete_admin para usar la misma funcion (antes tenian el mismo
-- patron de subquery inline, que funcionaba ahi porque profiles_select_public
-- todavia no se referenciaba a si misma, pero es mas fragil a futuro).
-- ============================================================================

CREATE OR REPLACE FUNCTION is_admin_user(uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (SELECT 1 FROM profiles WHERE id = uid AND is_admin = true);
$$;

REVOKE EXECUTE ON FUNCTION is_admin_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_admin_user(UUID) TO authenticated;

DROP POLICY IF EXISTS profiles_select_public ON profiles;
CREATE POLICY profiles_select_public ON profiles
    FOR SELECT TO authenticated
    USING (is_active = true OR auth.uid() = id OR is_admin_user(auth.uid()));

DROP POLICY IF EXISTS profiles_update_admin ON profiles;
CREATE POLICY profiles_update_admin ON profiles
    FOR UPDATE TO authenticated
    USING (is_admin_user(auth.uid()))
    WITH CHECK (is_admin_user(auth.uid()));

DROP POLICY IF EXISTS profiles_delete_admin ON profiles;
CREATE POLICY profiles_delete_admin ON profiles
    FOR DELETE TO authenticated
    USING (is_admin_user(auth.uid()));

COMMENT ON FUNCTION is_admin_user(UUID) IS
    'Chequea si un usuario es admin sin re-evaluar RLS de profiles (SECURITY DEFINER), evitando recursion infinita al usarse dentro de las propias policies de profiles.';
