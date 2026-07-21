-- ============================================================================
-- ATREVIDOS - Políticas de Storage (Supabase)
-- ============================================================================
-- Este archivo contiene las políticas de Storage para los buckets de archivos
-- Ejecutar en SQL Editor de Supabase o configurar via Dashboard
-- ============================================================================

-- Nota: Los buckets deben existir antes de aplicar estas políticas
-- Crear buckets en Dashboard: Storage > New Bucket
-- - avatars (private)
-- - covers (private)  
-- - post-images (private)
-- - media-chats (private)

-- ============================================================================
-- POLÍTICAS PARA BUCKET: avatars
-- ============================================================================

-- IMPORTANTE: "TO authenticated" es obligatorio en todas las políticas de este
-- archivo. Sin esa cláusula, Postgres asigna el rol PUBLIC por defecto (incluye
-- "anon"), permitiendo descargar/subir archivos sin sesión.

-- Usuarios pueden subir su propio avatar (carpeta = user_id)
CREATE POLICY "Usuarios pueden subir su propio avatar" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'avatars' 
    AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Usuarios autenticados pueden ver avatares
CREATE POLICY "Usuarios pueden ver avatares" ON storage.objects
FOR SELECT TO authenticated USING (
    bucket_id = 'avatars'
);

-- Usuarios pueden actualizar su propio avatar
CREATE POLICY "Usuarios pueden actualizar su propio avatar" ON storage.objects
FOR UPDATE TO authenticated
USING (auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (auth.uid()::text = (storage.foldername(name))[1]);

-- Usuarios pueden eliminar su propio avatar
CREATE POLICY "Usuarios pueden eliminar su propio avatar" ON storage.objects
FOR DELETE TO authenticated
USING (auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================================
-- POLÍTICAS PARA BUCKET: covers
-- ============================================================================

CREATE POLICY "Usuarios pueden subir su propia portada" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'covers' 
    AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Usuarios pueden ver portadas" ON storage.objects
FOR SELECT TO authenticated USING (bucket_id = 'covers');

CREATE POLICY "Usuarios pueden actualizar su propia portada" ON storage.objects
FOR UPDATE TO authenticated
USING (auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Usuarios pueden eliminar su propia portada" ON storage.objects
FOR DELETE TO authenticated
USING (auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================================
-- POLÍTICAS PARA BUCKET: post-images
-- ============================================================================

CREATE POLICY "Usuarios pueden subir imágenes de post" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'post-images' 
    AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Usuarios pueden ver imágenes de posts públicos" ON storage.objects
FOR SELECT TO authenticated USING (
    bucket_id = 'post-images'
    -- Nota: La validación de si el post es público se hace en la app
    -- Esta política permite ver todas las imágenes (a usuarios logueados), filtrar en backend
);

CREATE POLICY "Usuarios pueden actualizar sus propias imágenes" ON storage.objects
FOR UPDATE TO authenticated
USING (auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Usuarios pueden eliminar sus propias imágenes" ON storage.objects
FOR DELETE TO authenticated
USING (auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================================
-- POLÍTICAS PARA BUCKET: media-chats
-- ============================================================================

CREATE POLICY "Usuarios pueden subir archivos de chat" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'media-chats' 
    AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Solo participantes de la conversación pueden ver el archivo
-- Nota: Validación completa en aplicación (conversation_id de la carpeta)
CREATE POLICY "Participantes pueden ver archivos de chat" ON storage.objects
FOR SELECT TO authenticated USING (
    bucket_id = 'media-chats'
    -- Validación de pertenencia a conversación en backend
);

CREATE POLICY "Usuarios pueden actualizar sus propios archivos" ON storage.objects
FOR UPDATE TO authenticated
USING (auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Usuarios pueden eliminar sus propios archivos" ON storage.objects
FOR DELETE TO authenticated
USING (auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================================
-- FUNCIONES UTILITARIAS PARA STORAGE
-- ============================================================================

-- Función: Obtener URL pública temporal de un archivo
CREATE OR REPLACE FUNCTION get_temporary_upload_url(
    bucket_name TEXT,
    file_name TEXT,
    file_type TEXT DEFAULT 'image/jpeg'
)
RETURNS TEXT AS $$
DECLARE
    upload_url TEXT;
BEGIN
    -- Esta función retorna información para subir via Signed URL
    -- Implementación detallada requiere configuración en Supabase
    RETURN CONCAT(
        'https://', current_setting('app.supabase_project_ref'), 
        '.supabase.co/storage/v1/object/sign/', 
        bucket_name, '/', file_name, 
        '?token=placeholder&expiresIn=3600'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- VERIFICACIÓN DE POLÍTICAS
-- ============================================================================

-- Verificar buckets creados
-- SELECT name, public, created_at FROM storage.buckets;

-- Verificar políticas aplicadas
-- SELECT bucket_id, policyname, cmd, roles 
-- FROM storage.policies 
-- ORDER BY bucket_id, policyname;

-- ============================================================================
-- INSTRUCCIONES DE CONFIGURACIÓN
-- ============================================================================
/*
1. Crear buckets en Dashboard de Supabase:
   - Ir a Storage
   - Click "New bucket"
   - Llamar: avatars, covers, post-images, media-chats
   - Set "Public" = false para todos

2. Ejecutar este script en SQL Editor

3. Variar desde la aplicación:
   - Subir avatar: POST /storage/v1/object/avatars/{user_id}/avatar.jpg
   - Obtener URL: GET /storage/v1/object/avatars/{user_id}/avatar.jpg
   
4. Configurar MIME types en aplicación:
   - avatars: image/jpeg, image/png, image/webp
   - post-images: image/*, video/mp4
   - media-chats: */* (con límites de tamaño)
*/

-- ============================================================================
-- FIN DE POLÍTICAS DE STORAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Políticas de Storage configuradas exitosamente!';
    RAISE NOTICE 'Nota: Asegúrese de crear los buckets antes de usarlos.';
END $$;