# 📊 Esquema de Base de Datos - Atrevidos

## 👋 Descripción

Este documento contiene el esquema completo de la base de datos para la red social **Atrevidos**, diseñado específicamente para Supabase con políticas RLS estrictas y triggers de automatización.

---

## 🗂️ Estructura de Tablas

### 1. **profiles** - Perfiles de usuarios
- `id` (UUID, PK) - Referencia a auth.users
- `username` (TEXT) - Nombre de usuario único
- `display_name` (TEXT) - Nombre visible
- `bio` (TEXT) - Biografía del usuario
- `avatar_url`, `cover_url` (TEXT) - Imágenes de perfil
- `location` (TEXT) - Ubicación opcional
- `political_orientation` (TEXT[]) - Orientaciones políticas
- `interests` (TEXT[]) - Intereses del usuario
- `is_verified`, `is_active` (BOOLEAN) - Estado del perfil
- `last_active_at` (TIMESTAMPTZ) - Última actividad

### 2. **posts** - Publicaciones
- `id` (UUID, PK)
- `user_id` (UUID, FK → profiles)
- `content` (TEXT) - Contenido del post
- `image_urls` (TEXT[]) - Imágenes adjuntas
- `is_anonymous` (BOOLEAN) - Publicación anónima
- `visibility` (ENUM: public, followers, private)
- `like_count`, `comment_count`, `share_count` (INTEGER)
- `is_pinned`, `is_archived` (BOOLEAN)

### 3. **likes** - Reacciones/Me gusta
- `id` (UUID, PK)
- `user_id` (UUID, FK → profiles)
- `post_id` (UUID, FK → posts)
- `reaction_type` (ENUM: like, love, like-liberal, agreement)
- `UNIQUE(user_id, post_id)`

### 4. **comments** - Comentarios
- `id` (UUID, PK)
- `user_id`, `post_id` (UUID, FK)
- `parent_comment_id` (UUID, FK self-reference) - Respuestas
- `content` (TEXT)
- `is_edited`, `is_hidden` (BOOLEAN)
- `like_count` (INTEGER)

### 5. **matches** - Conexiones/Interacciones
- `id` (UUID, PK)
- `user_id`, `target_user_id` (UUID, FK → profiles)
- `match_type` (ENUM: like, super-like, block)
- `is_mutual` (BOOLEAN) - Match mutuo
- `UNIQUE(user_id, target_user_id)`

### 6. **conversations** - Conversaciones
- `id` (UUID, PK)
- `is_group` (BOOLEAN) - Grupo vs chat privado
- `name`, `avatar_url` (TEXT) - Para grupos
- `created_by` (UUID, FK → profiles)
- `last_message_at` (TIMESTAMPTZ)

### 7. **conversation_participants** - Participantes de conversaciones
- `id` (UUID, PK)
- `conversation_id`, `user_id` (UUID, FK)
- `role` (ENUM: admin, moderator, member)
- `is_active`, `last_read_at`

### 8. **messages** - Mensajes
- `id` (UUID, PK)
- `conversation_id`, `sender_id` (UUID, FK)
- `content` (TEXT)
- `media_url`, `media_type` (image, video, audio, file)
- `reply_to_id` (UUID, FK self-reference)
- `is_edited`, `is_deleted`, `read_at`

### 9. **reports** - Reportes de contenido
- `id` (UUID, PK)
- `reporter_id` (UUID, FK → profiles)
- `target_type` (user, post, comment, message)
- `target_id` (UUID)
- `category` (ENUM: spam, harassment, hate_speech, false_info, inappropriate_content, other)
- `reason` (TEXT)
- `status` (ENUM: pending, under_review, resolved, dismissed)
- `reviewed_by`, `resolution_notes`

### 10. **report_history** - Historial de reportes
- `id` (UUID, PK)
- `report_id`, `action_taken`, `notes`
- `performed_by` (UUID, FK → profiles)

---

## 🔐 Políticas RLS (Row Level Security)

### Principios de Seguridad
1. **Privacidad por defecto**: Solo el contenido público es visible para todos
2. **Propiedad estricta**: Cada usuario solo puede modificar su propio contenido
3. **Conexión requerida**: Contenido "followers-only" solo visible para contactos
4. **Anónimato protegido**: Posts anónimos no revelan identidad

### Resumen de Políticas

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| **profiles** | Usuarios activos o propio | Solo propio (trigger) | Solo propio | Admin solo |
| **posts** | Público o propio o contactos | Solo propio | Solo propio | Solo propio (soft-delete) |
| **likes** | En posts visibles | Solo propio en posts visibles | N/A | Solo propio |
| **comments** | En posts visibles, no ocultos | Solo propio en posts visibles | Solo propio | Solo propio |
| **matches** | Solo propios | Solo propio | Solo propio | Solo propio |
| **conversations** | Donde es participante | Solo como creador | Sistema | Admin |
| **messages** | En conversaciones propias | En conversación propia | Solo propios | Solo propios (soft-delete) |
| **reports** | Propios o admin | Todo usuario | Solo admin | Admin |

---

## ⚙️ Triggers de Automatización

| Trigger | Función | Descripción |
|---------|---------|-------------|
| `on_auth_user_created` | `handle_new_user()` | Crea perfil automáticamente al registrarse |
| `validate_username_trigger` | `validate_username()` | Valida formato de username (3-30 caracteres) |
| `on_like_insert/delete` | `update_post_counts()` | Actualiza conteo de likes en posts |
| `on_comment_insert/delete` | `update_post_counts()` | Actualiza conteo de comentarios en posts |
| `on_match_create` | `handle_match_check()` | Detecta matches mutuos y crea conversación |
| `prevent_duplicate_reports_trigger` | `prevent_duplicate_reports()` | Bloquea reportes duplicados |
| `on_user_activity` | `update_last_active()` | Actualiza last_active_at en posts/comments/messages |
| `update_*_updated_at` | `update_updated_at_column()` | Actualiza timestamp en cada modificación |

---

## 🔍 Vistas Utilitarias

### `public_feed`
- Muestra posts públicos y de contactos
- Incluye metadatos del autor (username, avatar, verified)
- Clásifica relación: own/connected/public
- Filtra posts archivados y anónimos

### `user_conversations`
- Lista de conversaciones del usuario
- Último mensaje y remitente
- Conteo de mensajes no leídos
- Información en tiempo real

---

## 🚀 Funciones de Utilidad

### `suggest_connections(user_id, limit_count)`
Sugiere usuarios para conectar basados en:
- Conexiones mutuas
- Intereses comunes
- Orden: más conexiones mutuas primero

### `search_users(search_term)`
Búsqueda de usuarios por:
- Username (ILIKE)
- Display name (ILIKE)
- Bio (ILIKE)
- Límite de 20 resultados

---

## 📦 Configuración de Storage

### Buckets Recomendados
```
avatars/          - Photos de perfil (private)
covers/           - Imágenes de portada (private)
post-images/      - Imágenes de posts (private)
media-chats/      - Archivos de chat (private)
```

### Políticas de Storage (ejemplo)
```sql
-- Bucket: avatars
CREATE POLICY "Usuarios pueden subir su propio avatar" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Usuarios pueden ver avatares" ON storage.objects
FOR SELECT USING (bucket_id = 'avatars');
```

---

## 🛠️ Instrucciones de Implementación

### Paso 1: Crear Proyecto en Supabase
1. Ir a https://supabase.com
2. Crear nuevo proyecto
3. Guardar: API Key, Project URL, Database Password

### Paso 2: Ejecutar el Schema
```bash
# Opción A: Dashboard de Supabase
1. Ir a SQL Editor
2. Copiar y pegar contenido de database/schema.sql
3. Ejecutar (Ctrl+Enter)

# Opción B: CLI de Supabase
supabase db push
# o
psql -h YOUR_PROJECT.supabase.co -U postgres -d postgres -f database/schema.sql
```

### Paso 3: Configurar Storage
1. Ir a Storage en Dashboard
2. Crear buckets: `avatars`, `covers`, `post-images`, `media-chats`
3. Configurar políticas de acceso según ayuda

### Paso 4: Verificar Instalación
```sql
-- Verificar tablas creadas
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Verificar roles RLS
SELECT tablename, policyname, permissive, roles, cmd 
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Verificar triggers
SELECT tgname, tgrelid::regclass, tgfunc 
FROM pg_trigger 
WHERE tgrelid IN (
    SELECT oid FROM pg_class WHERE relnamespace = 
    (SELECT oid FROM pg_namespace WHERE nspname = 'public')
);
```

### Paso 5: Crear Usuario de Prueba
```bash
# Via Dashboard de Auth
1. Ir a Authentication > Users
2. Add user manualmente o con invite
3. Verificar que el trigger cree el perfil en profiles
```

---

## 🎯 Consideraciones de Arquitectura

### Escalabilidad
- Índicientes en columnas de busca frecuentes (username, created_at, user_id)
- Composite indexes para queries complejas (user_id, visibility, created_at)
- Partitioning a considerar para posts > 1M registros

### Rendimiento
- Views materializadas para feeds muy accedidas
- Paginación cursor-based para feeds infinits
- Cache de conteos (likes, comments) via triggers

### Seguridad Adicional
- Rate limiting a nivel de aplicación (no DB)
- Validación de input en backend
- Audit logs para acciones sensibles
- Encyption de datos sensibles en application layer

---

## 📝 Notificaciones/Alertas

###场景中
- `last_active_at` se actualiza automáticamente
- `is_mutual` se detecta automáticamente en matches
- Conversaciones se crean automáticamente para matches mutuos
- Conteos de posts se mantienen actualizados en tiempo real

---

## 🔄 Migraciones Futuras

### Versionado
- Guardar cada versión de schema en `migrations/`
- Usar《supabase migration》para track de cambios
- Never modify existing columns in production (create new, migrate, drop old)

### Ejemplo de Migración
```sql
-- Añadir campo nuevo
ALTER TABLE profiles ADD COLUMN timezone TEXT DEFAULT 'UTC';

-- Crear índice nuevo
CREATE INDEX idx_posts_created_at_desc ON posts(created_at DESC);
```

---

## 📞 Soporte

### Problemas Comunes
1. **".username ya existe"**: Validación de trigger funciona correctamente
2. **"Permission denied"**: Verificar política RLS activa
3. **"Trigger error"**: Revisar logs de Supabase (Dashboard > Logs)
4. **Storage upload failed**: Buccet configurados + políticas asignadas

### Recursos
- [Supabase Docs RLS](https://supabase.com/docs/guides/auth/row-level-security)
- [Supabase Storage](https://supabase.com/docs/guides/storage)
- [PostgreSQL Triggers](https://www.postgresql.org/docs/current/statements-create-trigger.html)

---

## 📅 Fecha de Creación
Mayo 29, 2026

---

**Atrevidos** - Red Social para Usuarios Liberales  
*"Audaces ideas, comunidades libres"*