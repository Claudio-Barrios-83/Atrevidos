-- ============================================================================
-- ATREVIDOS - Script de Verificación de Instanciación
-- ============================================================================
-- Ejecutar después de aplicar schema.sql para validar instalación
-- ============================================================================

-- ============================================================================
-- 1. VERIFICAR TABLAS CREADAS
-- ============================================================================

SELECT 
    '✓ Tablas creadas' as status,
    COUNT(*) as total_tablas
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
  AND table_name IN (
    'profiles', 'posts', 'likes', 'comments', 
    'matches', 'conversations', 'conversation_participants',
    'messages', 'reports', 'report_history'
  );

SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
  AND table_name IN (
    'profiles', 'posts', 'likes', 'comments', 
    'matches', 'conversations', 'conversation_participants',
    'messages', 'reports', 'report_history'
  )
ORDER BY table_name;

-- ============================================================================
-- 2. VERIFICAR ÍNDICES
-- ============================================================================

SELECT 
    '✓ Índices creados' as status,
    COUNT(*) as total_indices
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename IN (
    'profiles', 'posts', 'likes', 'comments', 
    'matches', 'conversations', 'conversation_participants',
    'messages', 'reports', 'report_history'
  );

-- ============================================================================
-- 3. VERIFICAR POLÍTICAS RLS
-- ============================================================================

SELECT 
    tablename, 
    policyname, 
    permissive, 
    roles, 
    cmd as command
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Contar políticas por tabla
SELECT 
    tablename, 
    COUNT(*) as policy_count
FROM pg_policies 
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

-- ============================================================================
-- 4. VERIFICAR TRIGGERS
-- ============================================================================

SELECT 
    tgname as trigger_name,
    tgrelid::regclass as table_name,
    tgenabled as enabled,
    p.proname as function_name,
    pg_get_triggerdef(t.oid, true) as trigger_definition,
    pg_get_functiondef(p.oid) as function_definition
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE (
    t.tgrelid = 'auth.users'::regclass
    OR t.tgrelid IN (
        SELECT oid FROM pg_class 
        WHERE relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
          AND relname IN (
            'profiles', 'posts', 'likes', 'comments', 
            'matches', 'conversations', 'conversation_participants',
            'messages', 'reports', 'report_history'
          )
    )
)
  AND NOT t.tgisinternal
ORDER BY tgrelid::regclass::text, tgname;

-- Lista simple de triggers
SELECT 
    tgname as trigger_name,
    tgrelid::regclass as table_name,
    tgenabled as enabled
FROM pg_trigger t
WHERE (
    t.tgrelid = 'auth.users'::regclass
    OR t.tgrelid IN (
        SELECT oid FROM pg_class 
        WHERE relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
          AND relname IN (
            'profiles', 'posts', 'likes', 'comments',
            'matches', 'conversations', 'conversation_participants',
            'messages', 'reports', 'report_history'
          )
    )
)
  AND NOT t.tgisinternal
ORDER BY tgrelid::regclass::text, tgname;

-- ============================================================================
-- 5. VERIFICAR FUNCIONES
-- ============================================================================

SELECT 
    proname as function_name,
    pronargs as args_count,
    pg_get_functiondef(p.oid) as definition_preview
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND proname IN (
    'update_updated_at_column',
    'handle_new_user',
    'validate_username',
    'update_post_counts',
    'handle_match_check',
    'create_conversation_for_match',
    'update_last_active',
    'handle_soft_delete',
    'prevent_duplicate_reports',
    'validate_report_target',
    'suggest_connections',
    'search_users'
  )
ORDER BY proname;

-- ============================================================================
-- 6. VERIFICAR VISTAS
-- ============================================================================

SELECT 
    '✓ Vistas creadas' as status,
    viewname as view_name
FROM pg_views 
WHERE schemaname = 'public'
  AND viewname IN ('public_feed', 'user_conversations')
ORDER BY viewname;

-- ============================================================================
-- 7. VERIFICAR TYPE CUSTOMIZADOS
-- ============================================================================

SELECT 
    t.typname as type_name,
    t.typcategory as category
FROM pg_type t
JOIN pg_namespace n ON t.typnamespace = n.oid
WHERE n.nspname = 'public'
  AND t.typtype = 'e'  -- enum type
ORDER BY t.typname;

-- ============================================================================
-- 8. RESUMEN FINAL
-- ============================================================================

DO $$
DECLARE
    table_count INTEGER;
    expected_table_count CONSTANT INTEGER := 10;
    rls_count INTEGER;
    trigger_count INTEGER;
    function_count INTEGER;
    view_count INTEGER;
    tracked_function_count INTEGER;
    expected_tracked_function_count CONSTANT INTEGER := 18;
    auth_signup_trigger_count INTEGER;
BEGIN
    -- Contar elementos creados
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      AND table_name IN (
        'profiles', 'posts', 'likes', 'comments', 
        'matches', 'conversations', 'conversation_participants',
        'messages', 'reports', 'report_history'
      );

    SELECT COUNT(*) INTO rls_count
    FROM pg_policies 
    WHERE schemaname = 'public';

    SELECT COUNT(*) INTO trigger_count
    FROM pg_trigger t
    WHERE (
        t.tgrelid = 'auth.users'::regclass
        OR t.tgrelid IN (
            SELECT oid FROM pg_class 
            WHERE relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
              AND relname IN (
                'profiles', 'posts', 'likes', 'comments',
                'matches', 'conversations', 'conversation_participants',
                'messages', 'reports', 'report_history'
              )
        )
    )
      AND NOT t.tgisinternal;

    SELECT COUNT(*) INTO function_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public';

    SELECT COUNT(*) INTO tracked_function_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND proname IN (
        'update_updated_at_column',
        'handle_new_user',
        'validate_username',
        'update_post_counts',
        'handle_match_check',
        'has_block_between_users',
        'has_active_direct_match',
        'create_conversation_for_match',
        'is_valid_direct_conversation',
        'can_access_conversation',
        'can_manage_group_participants',
        'can_update_own_participation',
        'update_last_active',
        'handle_soft_delete',
        'prevent_duplicate_reports',
        'validate_report_target',
        'suggest_connections',
        'search_users'
      );

    SELECT COUNT(*) INTO auth_signup_trigger_count
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = 'auth.users'::regclass
      AND t.tgname = 'on_auth_user_created'
      AND p.proname = 'handle_new_user'
      AND NOT t.tgisinternal;

    SELECT COUNT(*) INTO view_count
    FROM pg_views 
    WHERE schemaname = 'public';

    -- Mostrar resumen
    RAISE NOTICE '============================================================';
    IF table_count = expected_table_count
       AND auth_signup_trigger_count = 1
       AND tracked_function_count = expected_tracked_function_count THEN
        RAISE NOTICE '✓ ESQUEMA ATREVIDOS INSTALADO EXITOSAMENTE';
    ELSE
        RAISE WARNING '⚠ ESQUEMA ATREVIDOS INSTALADO CON HUECOS DE VERIFICACIÓN';
    END IF;
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'Tablas creadas: %', table_count;
    RAISE NOTICE 'Políticas RLS: %', rls_count;
    RAISE NOTICE 'Triggers activos: %', trigger_count;
    RAISE NOTICE 'Funciones creadas: %', function_count;
    RAISE NOTICE 'Funciones críticas detectadas: %/%', tracked_function_count, expected_tracked_function_count;
    RAISE NOTICE 'Trigger auth.users -> handle_new_user: %', auth_signup_trigger_count;
    RAISE NOTICE 'Vistas creadas: %', view_count;
    IF table_count <> expected_table_count THEN
        RAISE WARNING 'Faltan tablas esperadas: esperado %, encontrado %', expected_table_count, table_count;
    END IF;
    IF tracked_function_count <> expected_tracked_function_count THEN
        RAISE WARNING 'Faltan funciones críticas: esperado %, encontrado %', expected_tracked_function_count, tracked_function_count;
    END IF;
    IF auth_signup_trigger_count <> 1 THEN
        RAISE WARNING 'No se detectó correctamente el trigger on_auth_user_created -> handle_new_user sobre auth.users';
    END IF;
    RAISE NOTICE '============================================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Próximos pasos:';
    RAISE NOTICE '1. Ejecutar storage-policies.sql para configurar buckets';
    RAISE NOTICE '2. Crear buckets en Dashboard de Supabase';
    RAISE NOTICE '3. Configurar Authentication (emails, providers)';
    RAISE NOTICE '4. Crear usuario de prueba y verificar triggers';
    RAISE NOTICE '5. Testear políticas RLS con diferentes usuarios';
    RAISE NOTICE '';
END $$;

-- ============================================================================
-- 9. TEST BÁSICO DE PERMISOS (DESENVOLVIMIENTO)
-- ============================================================================
/*
-- Para testear RLS, crear usuario de prueba:
-- 1. Ir a Authentication > Users > Add user
-- 2. Email: test@atrevidos.com
-- 3. Password: temp12345
-- 4. Verificar email
-- 5. Copiar el UUID generado por Supabase
-- 6. Ejecutar pruebas como usuario autenticado:
-- SELECT id, username, display_name, created_at FROM profiles WHERE id = 'uuid-del-usuario-test';
--    Esperado: 1 fila creada automáticamente por el trigger on_auth_user_created / handle_new_user().
-- SELECT * FROM posts WHERE visibility = 'public';
-- INSERT INTO posts (user_id, content) VALUES ('uuid-del-usuario-test', 'Test post');
*/

-- ============================================================================
-- FIN DE VERIFICACIÓN
-- ============================================================================