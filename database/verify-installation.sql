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
    pg_get_functiondef(.adbin::regproc::integer::oid) as function_definition
FROM pg_trigger t
JOIN pg_attribute a ON a.attrelid = t.tgrelid AND a.attnum = t.tgattr[0]
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE t.tgrelid IN (
    SELECT oid FROM pg_class 
    WHERE relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      AND relname IN (
        'profiles', 'posts', 'likes', 'comments', 
        'matches', 'conversations', 'conversation_participants',
        'messages', 'reports', 'report_history'
      )
)
ORDER BY tgrelid::regclass::text, tgname;

-- Lista simple de triggers
SELECT 
    tgname as trigger_name,
    tgrelid::regclass as table_name,
    tgenabled as enabled
FROM pg_trigger t
WHERE t.tgrelid IN (
    SELECT oid FROM pg_class 
    WHERE relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
)
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
    rls_count INTEGER;
    trigger_count INTEGER;
    function_count INTEGER;
    view_count INTEGER;
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
    WHERE t.tgrelid IN (
        SELECT oid FROM pg_class 
        WHERE relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    );

    SELECT COUNT(*) INTO function_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public';

    SELECT COUNT(*) INTO view_count
    FROM pg_views 
    WHERE schemaname = 'public';

    -- Mostrar resumen
    RAISE NOTICE '============================================================';
    RAISE NOTICE '✓ ESQUEMA ATREVIDOS INSTALADO EXITOSAMENTE';
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'Tablas creadas: %', table_count;
    RAISE NOTICE 'Políticas RLS: %', rls_count;
    RAISE NOTICE 'Triggers activos: %', trigger_count;
    RAISE NOTICE 'Funciones creadas: %', function_count;
    RAISE NOTICE 'Vistas creadas: %', view_count;
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
-- Para testear RLS, crear user de prueba:
-- 1. Ir a Authentication > Users > Add user
-- 2. Emails: test@atrevidos.com
-- 3.闯痛点: temp123
-- 4. Verificar email
-- 5. Ejecutar:
SELECT * FROM profiles WHERE id = 'uuid-del-usuario-test';
SELECT * FROM posts WHERE visibility = 'public';
INSERT INTO posts (user_id, content) VALUES ('uuid', 'Test post');
*/

-- ============================================================================
-- FIN DE VERIFICACIÓN
-- ============================================================================