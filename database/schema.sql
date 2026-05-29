-- ============================================================================
-- ATREVIDOS - Esquema Completo de Base de Datos para Supabase
-- Red Social para Usuarios Liberales (Tipo D4swing)
-- ============================================================================

-- ============================================================================
-- 1. CONFIGURACIÓN INICIAL
-- ============================================================================

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 2. TABLAS PRINCIPALES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tabla: profiles (Perfiles de usuarios)
-- ----------------------------------------------------------------------------
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT,
    bio TEXT,
    avatar_url TEXT,
    cover_url TEXT,
    location TEXT,
    website TEXT,
    date_of_birth DATE,
    gender TEXT,
    political_orientation TEXT[],
    interests TEXT[],
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- Tabla: posts (Publicaciones)
-- ----------------------------------------------------------------------------
CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    image_urls TEXT[],
    video_url TEXT,
    is_anonymous BOOLEAN DEFAULT FALSE,
    visibility TEXT CHECK (visibility IN ('public', 'followers', 'private')) DEFAULT 'public',
    like_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    share_count INTEGER DEFAULT 0,
    is_pinned BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- Tabla: likes (Me gusta/Reacciones)
-- ----------------------------------------------------------------------------
CREATE TABLE likes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    reaction_type TEXT CHECK (reaction_type IN ('like', 'love', 'like-liberal', 'agreement')) DEFAULT 'like',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, post_id)
);

-- ----------------------------------------------------------------------------
-- Tabla: comments (Comentarios)
-- ----------------------------------------------------------------------------
CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_edited BOOLEAN DEFAULT FALSE,
    like_count INTEGER DEFAULT 0,
    is_hidden BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- Tabla: matches (Conexiones/Interacciones mutuas - tipo "swipe")
-- ----------------------------------------------------------------------------
CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    target_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    match_type TEXT CHECK (match_type IN ('like', 'super-like', 'block')) DEFAULT 'like',
    is_mutual BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, target_user_id),
    CONSTRAINT check_not_self CHECK (user_id != target_user_id)
);

-- ----------------------------------------------------------------------------
-- Tabla: conversations (Conversaciones entre usuarios)
-- ----------------------------------------------------------------------------
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    is_group BOOLEAN DEFAULT FALSE,
    name TEXT,
    avatar_url TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla intermedia: conversation_participants
CREATE TABLE conversation_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role TEXT CHECK (role IN ('admin', 'moderator', 'member')) DEFAULT 'member',
    is_active BOOLEAN DEFAULT TRUE,
    last_read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(conversation_id, user_id)
);

-- ----------------------------------------------------------------------------
-- Tabla: messages (Mensajes de chat)
-- ----------------------------------------------------------------------------
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT,
    media_url TEXT,
    media_type TEXT CHECK (media_type IN ('image', 'video', 'audio', 'file')) DEFAULT NULL,
    reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    is_edited BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- Tabla: reports (Reportes de contenido/infracciones)
-- ----------------------------------------------------------------------------
CREATE TYPE report_status AS ENUM ('pending', 'under_review', 'resolved', 'dismissed');
CREATE TYPE report_category AS ENUM ('spam', 'harassment', 'hate_speech', 'false_info', 'inappropriate_content', 'other');

CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    target_type TEXT CHECK (target_type IN ('user', 'post', 'comment', 'message')) NOT NULL,
    target_id UUID NOT NULL,
    category report_category NOT NULL,
    reason TEXT NOT NULL,
    status report_status DEFAULT 'pending',
    reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    resolution_notes TEXT,
    is_action_taken BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla: report_history (Historial de acciones sobre reportes)
CREATE TABLE report_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    action_taken TEXT NOT NULL,
    notes TEXT,
    performed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 3. ÍNDICES PARA OPTIMIZACIÓN
-- ============================================================================

-- Índices para profiles
CREATE INDEX idx_profiles_username ON profiles(username);
CREATE INDEX idx_profiles_is_active ON profiles(is_active);
CREATE INDEX idx_profiles_location ON profiles(location) WHERE location IS NOT NULL;
CREATE INDEX idx_profiles_created_at ON profiles(created_at DESC);

-- Índices para posts
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX idx_posts_visibility ON posts(visibility);
CREATE INDEX idx_posts_user_visibility ON posts(user_id, visibility, created_at DESC);
CREATE INDEX idx_posts_anonymous ON posts(is_anonymous) WHERE is_anonymous = true;

-- Índices para likes
CREATE INDEX idx_likes_user_id ON likes(user_id);
CREATE INDEX idx_likes_post_id ON likes(post_id);
CREATE INDEX idx_likes_created_at ON likes(created_at DESC);

-- Índices para comments
CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_comments_user_id ON comments(user_id);
CREATE INDEX idx_comments_parent_id ON comments(parent_comment_id);
CREATE INDEX idx_comments_created_at ON comments(created_at DESC);

-- Índices para matches
CREATE INDEX idx_matches_user_id ON matches(user_id);
CREATE INDEX idx_matches_target_id ON matches(target_user_id);
CREATE INDEX idx_matches_is_mutual ON matches(is_mutual) WHERE is_mutual = true;

-- Índices para conversations
CREATE INDEX idx_conversations_created_by ON conversations(created_by);
CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC);

-- Índices para conversation_participants
CREATE INDEX idx_participants_user_id ON conversation_participants(user_id);
CREATE INDEX idx_participants_conversation_id ON conversation_participants(conversation_id);

-- Índices para messages
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_sender_id ON messages(sender_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_messages_read_status ON messages(conversation_id, read_at) WHERE read_at IS NOT NULL;

-- Índices para reports
CREATE INDEX idx_reports_target ON reports(target_type, target_id);
CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_reports_created_at ON reports(created_at DESC);

-- ============================================================================
-- 4. FUNCIONES PARA TRIGGERS DE AUTOMATIZACIÓN
-- ============================================================================

-- Función: Actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Función: Crear perfil automáticamente al registrarse
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (id, username, display_name, created_at)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', 'usuario_' || LEFT(NEW.id::text, 8)),
        COALESCE(NEW.raw_user_meta_data->>'display_name', 'Usuario'),
        NOW()
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Función: Validar nombre de usuario único
CREATE OR REPLACE FUNCTION validate_username()
RETURNS TRIGGER AS $$
DECLARE
    username_text TEXT;
BEGIN
    username_text := LOWER(TRIM(NEW.username));
    
    -- Validar formato: alfanumérico + guión bajo, 3-30 caracteres
    IF username_text !~ '^[a-z0-9_]{3,30}$' THEN
        RAISE EXCEPTION 'El nombre de usuario debe tener 3-30 caracteres y solo letras minúsculas, números y guiones bajos';
    END IF;
    
    -- Verificar que no sea una palabra reservada
    IF username_text IN ('admin', 'system', 'moderator', 'support', '_atrevidos', 'atrevidos') THEN
        RAISE EXCEPTION 'Este nombre de usuario no está disponible';
    END IF;
    
    NEW.username := username_text;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Función: Actualizar conteos de posts
CREATE OR REPLACE FUNCTION update_post_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF TG_TABLE_NAME = 'likes' THEN
            UPDATE posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
        ELSIF TG_TABLE_NAME = 'comments' THEN
            UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF TG_TABLE_NAME = 'likes' THEN
            UPDATE posts SET like_count = GREATEST(0, like_count - 1) WHERE id = OLD.post_id;
        ELSIF TG_TABLE_NAME = 'comments' THEN
            UPDATE posts SET comment_count = GREATEST(0, comment_count - 1) WHERE id = OLD.post_id;
        END IF;
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Función: Manejar match mutuo
CREATE OR REPLACE FUNCTION handle_match_check()
RETURNS TRIGGER AS $$
DECLARE
    is_mutual BOOLEAN;
BEGIN
    -- Verificar si ya existe un like del target hacia el usuario
    SELECT EXISTS (
        SELECT 1 FROM matches 
        WHERE user_id = NEW.target_user_id 
        AND target_user_id = NEW.user_id 
        AND match_type IN ('like', 'super-like')
    ) INTO is_mutual;
    
    IF is_mutual THEN
        -- Marcar como mutuo ambos registros
        UPDATE matches SET is_mutual = true WHERE id = NEW.id;
        UPDATE matches SET is_mutual = true 
        WHERE user_id = NEW.target_user_id 
        AND target_user_id = NEW.user_id;
        
        -- Opcional: Crear conversación automática para matches mutuos
        PERFORM create_conversation_for_match(NEW.user_id, NEW.target_user_id);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Función: Crear conversación para match mutuo
CREATE OR REPLACE FUNCTION create_conversation_for_match(user1 UUID, user2 UUID)
RETURNS UUID AS $$
DECLARE
    conv_id UUID;
BEGIN
    -- Verificar si ya existe conversación entre estos usuarios
    SELECT c.id INTO conv_id
    FROM conversations c
    JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = user1
    JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = user2
    WHERE c.is_group = false;
    
    IF conv_id IS NULL THEN
        -- Crear nueva conversación
        INSERT INTO conversations (is_group, created_by, last_message_at)
        VALUES (false, user1, NOW())
        RETURNING id INTO conv_id;
        
        -- Agregar participantes
        INSERT INTO conversation_participants (conversation_id, user_id, role)
        VALUES 
            (conv_id, user1, 'member'),
            (conv_id, user2, 'member');
    END IF;
    
    RETURN conv_id;
END;
$$ LANGUAGE plpgsql;

-- Función: Actualizar last_active_at del perfil
CREATE OR REPLACE FUNCTION update_last_active()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE profiles SET last_active_at = NOW() WHERE id = NEW.user_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Función: Manejar eliminación suave de contenido
CREATE OR REPLACE FUNCTION handle_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_TABLE_NAME = 'posts' THEN
        UPDATE posts SET is_archived = true, updated_at = NOW() WHERE id = OLD.id;
    ELSIF TG_TABLE_NAME = 'comments' THEN
        UPDATE comments SET is_hidden = true, updated_at = NOW() WHERE id = OLD.id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Función para validar reportes duplicados
CREATE OR REPLACE FUNCTION prevent_duplicate_reports()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM reports 
        WHERE reporter_id = NEW.reporter_id 
        AND target_type = NEW.target_type 
        AND target_id = NEW.target_id 
        AND status IN ('pending', 'under_review')
    ) THEN
        RAISE EXCEPTION 'Ya has reportado este contenido';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. TRIGGERS
-- ============================================================================

-- Trigger: Actualizar updated_at en todas las tablas
CREATE TRIGGER update_profiles_updated_at 
    BEFORE UPDATE ON profiles 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_posts_updated_at 
    BEFORE UPDATE ON posts 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_comments_updated_at 
    BEFORE UPDATE ON comments 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_messages_updated_at 
    BEFORE UPDATE ON messages 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reports_updated_at 
    BEFORE UPDATE ON reports 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at 
    BEFORE UPDATE ON conversations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Crear perfil al registrarse
CREATE TRIGGER on_auth_user_created 
    AFTER INSERT ON auth.users 
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Trigger: Validar username
CREATE TRIGGER validate_username_trigger 
    BEFORE INSERT OR UPDATE ON profiles 
    FOR EACH ROW EXECUTE FUNCTION validate_username();

-- Trigger: Actualizar conteos de posts
CREATE TRIGGER on_like_insert 
    AFTER INSERT ON likes 
    FOR EACH ROW EXECUTE FUNCTION update_post_counts();

CREATE TRIGGER on_like_delete 
    AFTER DELETE ON likes 
    FOR EACH ROW EXECUTE FUNCTION update_post_counts();

CREATE TRIGGER on_comment_insert 
    AFTER INSERT ON comments 
    FOR EACH ROW EXECUTE FUNCTION update_post_counts();

CREATE TRIGGER on_comment_delete 
    AFTER DELETE ON comments 
    FOR EACH ROW EXECUTE FUNCTION update_post_counts();

-- Trigger: Manejar match mutuo
CREATE TRIGGER on_match_create 
    AFTER INSERT ON matches 
    FOR EACH ROW EXECUTE FUNCTION handle_match_check();

-- Trigger: Prevenir reportes duplicados
CREATE TRIGGER prevent_duplicate_reports_trigger 
    BEFORE INSERT ON reports 
    FOR EACH ROW EXECUTE FUNCTION prevent_duplicate_reports();

-- Trigger: Actualizar last_active_at en cada acción del usuario
CREATE TRIGGER on_user_activity 
    AFTER INSERT ON posts 
    FOR EACH ROW EXECUTE FUNCTION update_last_active();

CREATE TRIGGER on_user_activity_comments 
    AFTER INSERT ON comments 
    FOR EACH ROW EXECUTE FUNCTION update_last_active();

CREATE TRIGGER on_user_activity_messages 
    AFTER INSERT ON messages 
    FOR EACH ROW EXECUTE FUNCTION update_last_active();

-- ============================================================================
-- 6. POLÍTICAS RLS (ROW LEVEL SECURITY)
-- ============================================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Políticas RLS para profiles
-- ----------------------------------------------------------------------------

-- Usuarios pueden leer perfiles de otros usuarios activos
CREATE POLICY profiles_select_public ON profiles
    FOR SELECT
    USING (
        is_active = true 
        OR auth.uid() = id
    );

-- Usuarios solo pueden actualizar su propio perfil
CREATE POLICY profiles_update_own ON profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Solo el usuario puede insertar su propio perfil (trigger lo maneja)
CREATE POLICY profiles_insert_own ON profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Solo admins/moderadores pueden eliminar perfiles
CREATE POLICY profiles_delete_admin ON profiles
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND (username = 'admin' OR is_verified = true)
        )
    );

-- ----------------------------------------------------------------------------
-- Políticas RLS para posts
-- ----------------------------------------------------------------------------

-- Todos pueden ver posts públicos
CREATE POLICY posts_select_public ON posts
    FOR SELECT
    USING (
        visibility = 'public' 
        OR user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM matches 
            WHERE (user_id = auth.uid() AND target_user_id = posts.user_id)
            OR (target_user_id = auth.uid() AND user_id = posts.user_id)
            AND match_type IN ('like', 'super-like')
        )
    );

-- Usuarios solo pueden crear sus propios posts
CREATE POLICY posts_insert_own ON posts
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Usuarios solo pueden actualizar sus propios posts
CREATE POLICY posts_update_own ON posts
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Usuarios puedenSoft-delete (archivar) sus propios posts
CREATE POLICY posts_delete_own ON posts
    FOR DELETE
    USING (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Políticas RLS para likes
-- ----------------------------------------------------------------------------

-- Usuarios pueden ver likes en posts que ellos pueden ver
CREATE POLICY likes_select_on_visible_posts ON likes
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM posts 
            WHERE id = post_id 
            AND (
                visibility = 'public' 
                OR user_id = auth.uid()
            )
        )
    );

-- Usuarios solo pueden crear likes en posts que pueden ver
CREATE POLICY likes_insert_valid ON likes
    FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM posts 
            WHERE id = post_id 
            AND (
                visibility = 'public' 
                OR user_id = auth.uid()
            )
        )
    );

-- Usuarios solo pueden eliminar sus propios likes
CREATE POLICY likes_delete_own ON likes
    FOR DELETE
    USING (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Políticas RLS para comments
-- ----------------------------------------------------------------------------

-- Usuarios pueden ver comentarios en posts que pueden ver
CREATE POLICY comments_select_on_visible_posts ON comments
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM posts 
            WHERE id = post_id 
            AND (
                visibility = 'public' 
                OR user_id = auth.uid()
            )
        )
        AND is_hidden = false
    );

-- Usuarios solo pueden crear comentarios en posts que pueden ver
CREATE POLICY comments_insert_valid ON comments
    FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        AND is_hidden = false
        AND EXISTS (
            SELECT 1 FROM posts 
            WHERE id = post_id 
            AND (
                visibility = 'public' 
                OR user_id = auth.uid()
            )
        )
    );

-- Usuarios solo pueden actualizar sus propios comentarios
CREATE POLICY comments_update_own ON comments
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Usuarios solo pueden eliminar sus propios comentarios
CREATE POLICY comments_delete_own ON comments
    FOR DELETE
    USING (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Políticas RLS para matches
-- ----------------------------------------------------------------------------

-- Usuarios solo pueden ver sus propios matches
CREATE POLICY matches_select_own ON matches
    FOR SELECT
    USING (
        user_id = auth.uid() 
        OR target_user_id = auth.uid()
    );

-- Usuarios solo pueden crear matches para sí mismos
CREATE POLICY matches_insert_own ON matches
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Usuarios solo pueden actualizar sus propios matches
CREATE POLICY matches_update_own ON matches
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Usuarios solo pueden eliminar sus propios matches
CREATE POLICY matches_delete_own ON matches
    FOR DELETE
    USING (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Políticas RLS para conversations
-- ----------------------------------------------------------------------------

-- Usuarios solo pueden ver conversaciones donde son participantes
CREATE POLICY conversations_select_participant ON conversations
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM conversation_participants 
            WHERE conversation_id = conversations.id 
            AND user_id = auth.uid()
            AND is_active = true
        )
        OR created_by = auth.uid()
    );

-- Usuarios solo pueden crear conversaciones donde son creador
CREATE POLICY conversations_insert_own ON conversations
    FOR INSERT
    WITH CHECK (created_by = auth.uid());

-- ----------------------------------------------------------------------------
-- Políticas RLS para conversation_participants
-- ----------------------------------------------------------------------------

-- Usuarios solo pueden ver participantes de sus conversaciones
CREATE POLICY participants_select_own ON conversation_participants
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM conversations c
            JOIN conversation_participants cp ON cp.conversation_id = c.id
            WHERE c.id = conversation_id
            AND (
                cp.user_id = auth.uid() 
                AND cp.is_active = true
            )
        )
    );

-- Sistema solo puede insertar participantes (trigger)
CREATE POLICY participants_insert_system ON conversation_participants
    FOR INSERT
    WITH CHECK (true); -- Controlado por triggers/sistema

-- Usuarios solo pueden actualizar su propia participación
CREATE POLICY participants_update_own ON conversation_participants
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Políticas RLS para messages
-- ----------------------------------------------------------------------------

-- Usuarios solo pueden ver mensajes de sus conversaciones
CREATE POLICY messages_select_participant ON messages
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM conversation_participants 
            WHERE conversation_id = messages.conversation_id 
            AND user_id = auth.uid()
            AND is_active = true
        )
    );

-- Usuarios solo pueden enviar mensajes a sus conversaciones
CREATE POLICY messages_insert_participant ON messages
    FOR INSERT
    WITH CHECK (
        sender_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM conversation_participants 
            WHERE conversation_id = messages.conversation_id 
            AND user_id = auth.uid()
            AND is_active = true
        )
    );

-- Usuarios solo pueden actualizar sus propios mensajes (editar)
CREATE POLICY messages_update_own ON messages
    FOR UPDATE
    USING (sender_id = auth.uid())
    WITH CHECK (sender_id = auth.uid());

-- Usuarios solo pueden "eliminar" (soft-delete) sus propios mensajes
CREATE POLICY messages_delete_own ON messages
    FOR DELETE
    USING (sender_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Políticas RLS para reports
-- ----------------------------------------------------------------------------

-- Usuarios pueden ver sus propios reportes
CREATE POLICY reports_select_own ON reports
    FOR SELECT
    USING (
        reporter_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND (username = 'admin' OR is_verified = true)
        )
    );

-- Usuarios pueden crear reportes
CREATE POLICY reports_insert_own ON reports
    FOR INSERT
    WITH CHECK (reporter_id = auth.uid());

-- Solo admins pueden actualizar reportes (revisar/resolver)
CREATE POLICY reports_update_admin ON reports
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND (username = 'admin' OR is_verified = true)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND (username = 'admin' OR is_verified = true)
        )
    );

-- ============================================================================
-- 7. VISTAS PARA CONSULTAS COMUNES
-- ============================================================================

-- Vista: Feed de posts públicos y de contactos
CREATE OR REPLACE VIEW public_feed AS
SELECT 
    p.*,
    pr.username,
    pr.display_name,
    pr.avatar_url,
    pr.is_verified,
    CASE 
        WHEN pr.id = auth.uid() THEN 'own'
        WHEN EXISTS (
            SELECT 1 FROM matches 
            WHERE (user_id = auth.uid() AND target_user_id = pr.id)
               OR (target_user_id = auth.uid() AND user_id = pr.id)
            AND match_type IN ('like', 'super-like')
        ) THEN 'connected'
        ELSE 'public'
    END AS relation_type
FROM posts p
JOIN profiles pr ON p.user_id = pr.id
WHERE p.is_archived = false
  AND p.is_anonymous = false
  AND (p.visibility = 'public' 
       OR p.user_id = auth.uid()
       OR EXISTS (
           SELECT 1 FROM matches 
           WHERE (user_id = auth.uid() AND target_user_id = p.user_id)
              OR (target_user_id = auth.uid() AND user_id = p.user_id)
           AND match_type IN ('like', 'super-like')
       ))
ORDER BY p.created_at DESC;

-- Vista: Conversaciones del usuario con última información
CREATE OR REPLACE VIEW user_conversations AS
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
    (
        SELECT COUNT(*)
        FROM messages new_msg
        WHERE new_msg.conversation_id = c.id
          AND new_msg.created_at > cp.last_read_at
          AND new_msg.sender_id != auth.uid()
          AND new_msg.is_deleted = false
    ) AS unread_count
FROM conversations c
JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = auth.uid()
LEFT JOIN LATERAL (
    SELECT * FROM messages 
    WHERE conversation_id = c.id 
    ORDER BY created_at DESC 
    LIMIT 1
) m ON true
LEFT JOIN profiles sender_profile ON m.sender_id = sender_profile.id
WHERE cp.is_active = true;

-- ============================================================================
-- 8. FUNCIONES DE UTILIDAD
-- ============================================================================

-- Función: Obtener usuarios sugeridos para conectar
CREATE OR REPLACE FUNCTION suggest_connections(user_id UUID, limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
    id UUID,
    username TEXT,
    display_name TEXT,
    avatar_url TEXT,
    mutual_connections INTEGER,
    common_interests TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.username,
        p.display_name,
        p.avatar_url,
        (
            SELECT COUNT(*)
            FROM matches m1
            JOIN matches m2 ON m1.target_user_id = m2.target_user_id
            WHERE m1.user_id = user_id
              AND m2.user_id = p.id
              AND m1.target_user_id != user_id
              AND m1.target_user_id != p.id
        ) AS mutual_connections,
        (
            SELECT array_intersect(p.interests, users_int.interests)
            FROM profiles users_int
            WHERE users_int.id = user_id
        ) AS common_interests
    FROM profiles p
    WHERE p.id != user_id
      AND p.is_active = true
      AND NOT EXISTS (
          SELECT 1 FROM matches 
          WHERE (user_id = user_id AND target_user_id = p.id)
             OR (user_id = p.id AND target_user_id = user_id)
      )
    ORDER BY mutual_connections DESC, p.created_at DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función: Buscar usuarios
CREATE OR REPLACE FUNCTION search_users(search_term TEXT)
RETURNS TABLE (
    id UUID,
    username TEXT,
    display_name TEXT,
    avatar_url TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.username,
        p.display_name,
        p.avatar_url
    FROM profiles p
    WHERE p.is_active = true
      AND (
          p.username ILIKE '%' || search_term || '%'
          OR p.display_name ILIKE '%' || search_term || '%'
          OR p.bio ILIKE '%' || search_term || '%'
      )
    LIMIT 20;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 9. CONFIGURACIÓN DE STORAGE (Referencias)
-- ============================================================================

-- Nota: Los buckets de Storage se configuran en el Dashboard de Supabase
-- Bucket sugeridos: 
-- - avatars: Perfiles de usuario (public: false)
-- - covers: Imágenes de portada (public: false)
-- - post-images: Imágenes de posts (public: false)
-- - media-chats: Archivos multimedia de chats (public: false)

-- Políticas de Storage (se aplican en el Dashboard o vía API)
-- Ejemplo para bucket 'avatars':
-- CREATE POLICY "Usuarios pueden subir su propio avatar" ON storage.objects
-- FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = foldername);
-- CREATE POLICY "Usuarios pueden ver avatares" ON storage.objects
-- FOR SELECT USING (bucket_id = 'avatars');

-- ============================================================================
-- 10. DATOS DE PRUEBA (OPCIONAL - Comentar en producción)
-- ============================================================================

/*
--datos de prueba - descomentar solo para desarrollo
DO $$
DECLARE
    test_user_id UUID;
BEGIN
    -- Crear usuario de prueba (esto normalmente lo hace el sistema de auth)
    -- Para desarrollo, usar el UID de un usuario real creado en Supabase Auth
    
    -- Insertar perfil de prueba
    INSERT INTO profiles (id, username, display_name, bio, is_verified)
    VALUES (
        auth.uid(), -- Usar el UID del usuario actual
        'testuser',
        'Usuario de Prueba',
        'Este es un perfil de prueba para desarrollo',
        true
    )
    ON CONFLICT (id) DO NOTHING;
    
    -- Crear posts de prueba
    INSERT INTO posts (user_id, content, visibility)
    VALUES 
        (auth.uid(), '¡Hola mundo! Este es mi primer post en Atrevidos', 'public'),
        (auth.uid(), 'Compartiendo ideas liberales y libres', 'public');
    
    RAISE NOTICE 'Datos de prueba insertados exitosamente';
END $$;
*/

-- ============================================================================
-- FIN DEL ESQUEMA
-- ============================================================================

-- Mensaje de confirmación
DO $$
BEGIN
    RAISE NOTICE 'Esquema "Atrevidos" creado exitosamente!';
    RAISE NOTICE 'Próximos pasos:';
    RAISE NOTICE '1. Configurar buckets de Storage en el Dashboard de Supabase';
    RAISE NOTICE '2. Configurar políticas de Storage según necesidad';
    RAISE NOTICE '3. Agregar usuarios de prueba via Auth';
    RAISE NOTICE '4. Personalizar roles y permisos de admin/moderador';
END $$;