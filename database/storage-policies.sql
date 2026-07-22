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
-- AUDITORÍA DE SEGURIDAD DE FOTOS (privacidad de contenido de usuarios)
-- ============================================================================
-- Verificado contra el proyecto de producción (ynkhwsbeeyhtmkjjsmoo) probando
-- accesos reales con curl (anónimo / usuario A / usuario B) el día de este
-- pase de seguridad:
--   1. Los 4 buckets son PRIVADOS (public = false). Un pedido anónimo (sin
--      sesión) a /storage/v1/object/public/<bucket>/<path> devuelve 400 para
--      los 4 buckets: nadie sin loguearse puede ver ninguna foto. OK.
--   2. El código cliente (profile-media.ts, post-media.ts, message-media.ts)
--      usa exclusivamente createSignedUrl() con expiración de 1 hora; no hay
--      ningún uso de getPublicUrl() en el repo. OK.
--   3. avatars/covers: cualquier usuario AUTENTICADO puede ver el avatar o
--      galería de cualquier otro usuario. Esto es intencional (perfiles
--      visibles en Descubrir/Matches/Feed para gente logueada), no un bug.
--   4. media-chats: se detectó y corrigió un hallazgo real (ver policy de
--      SELECT de este bucket más abajo) — la policy vieja no comprobaba
--      pertenencia a la conversación, solo exigía estar autenticado.
--   5. post-images: hallazgo similar pero de menor severidad, documentado
--      como pendiente junto a su policy (no se modificó en este pase).
-- ============================================================================

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

-- HALLAZGO DE SEGURIDAD (pendiente de decisión de producto, NO corregido en
-- este pase): esta política permite a cualquier usuario AUTENTICADO generar
-- una URL firmada para CUALQUIER imagen de post, sin verificar si ese post en
-- particular es público, propio, o visible por match mutuo (esa lógica hoy
-- solo se aplica en la tabla "posts" vía posts_select_public). En la práctica
-- el nombre de archivo incluye un sufijo único (UUID) que no es adivinable, y
-- la única forma normal de conocer esa ruta es leyendo antes la fila del post
-- en la tabla "posts" (ya protegida por posts_select_public), así que hoy no
-- hay una vía real de filtración para posts privados/solo-matches. Aun así,
-- como buena práctica de "defense in depth" se recomienda como siguiente paso
-- endurecer esta policy para que replique la misma condición de
-- posts_select_public (público, propio, o con match mutuo), similar al fix ya
-- aplicado arriba para "media-chats". No se aplica en este pase porque
-- requiere probarse contra la base en vivo (no hay acceso MCP de Supabase
-- disponible en este entorno) antes de arriesgar el bucket de mayor tráfico.
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

-- Solo participantes de la conversación pueden ver el archivo.
--
-- HALLAZGO DE SEGURIDAD (auditoría de almacenamiento de fotos, corregido aquí):
-- la política anterior solo exigía "bucket_id = 'media-chats'" y dejaba la
-- validación de pertenencia a la conversación completamente del lado de la
-- aplicación ("Nota: Validación completa en aplicación"). En la práctica esto
-- significa que CUALQUIER usuario autenticado (no solo los participantes de
-- esa conversación puntual) podía generar una URL firmada o pedir el objeto
-- directamente si conocía o adivinaba la ruta exacta
-- "{uploaderId}/chats/{conversationId}/{archivo}". El path de ese archivo solo
-- se expone hoy a través de la columna messages.media_url, protegida por la
-- policy messages_select_participant (solo participantes), así que no había
-- una vía real para que un tercero lo descubriera — pero igual es una capa de
-- defensa insuficiente ("defense in depth") para contenido explícitamente
-- privado como fotos de chat. Se endurece exigiendo que quien lee sea el
-- propio autor del archivo O un participante registrado de esa conversación
-- (conversation_participants), replicando a nivel de Storage la misma regla
-- que ya protege la tabla messages.
DROP POLICY IF EXISTS "Participantes pueden ver archivos de chat" ON storage.objects;
CREATE POLICY "Participantes pueden ver archivos de chat" ON storage.objects
FOR SELECT TO authenticated USING (
    bucket_id = 'media-chats'
    AND (
        -- El autor del archivo siempre puede verlo (coincide con la carpeta
        -- {uploaderId}/chats/{conversationId}/{archivo}).
        auth.uid()::text = (storage.foldername(name))[1]
        OR
        -- Cualquier participante de la conversación indicada en el path.
        EXISTS (
            SELECT 1
            FROM conversation_participants cp
            WHERE cp.user_id = auth.uid()
              AND cp.conversation_id::text = (storage.foldername(name))[3]
        )
    )
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