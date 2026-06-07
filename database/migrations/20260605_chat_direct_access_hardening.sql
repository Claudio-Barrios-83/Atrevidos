CREATE OR REPLACE FUNCTION has_block_between_users(user1 UUID, user2 UUID)
RETURNS BOOLEAN AS $$
BEGIN
    IF user1 IS NULL OR user2 IS NULL OR user1 = user2 THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM matches m
        WHERE m.match_type = 'block'
          AND (
              (m.user_id = user1 AND m.target_user_id = user2)
              OR (m.user_id = user2 AND m.target_user_id = user1)
          )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION has_active_direct_match(user1 UUID, user2 UUID)
RETURNS BOOLEAN AS $$
BEGIN
    IF user1 IS NULL OR user2 IS NULL OR user1 = user2 THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM matches m1
        JOIN matches m2
          ON m2.user_id = user2
         AND m2.target_user_id = user1
        WHERE m1.user_id = user1
          AND m1.target_user_id = user2
          AND m1.match_type IN ('like', 'super-like')
          AND m2.match_type IN ('like', 'super-like')
          AND m1.is_mutual = true
          AND m2.is_mutual = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION create_conversation_for_match(user1 UUID, user2 UUID)
RETURNS UUID AS $$
DECLARE
    conv_id UUID;
    lock_key TEXT;
BEGIN
    IF user1 IS NULL OR user2 IS NULL OR user1 = user2 THEN
        RETURN NULL;
    END IF;

    IF has_block_between_users(user1, user2) OR NOT has_active_direct_match(user1, user2) THEN
        RETURN NULL;
    END IF;

    lock_key := LEAST(user1::TEXT, user2::TEXT) || ':' || GREATEST(user1::TEXT, user2::TEXT);
    PERFORM pg_advisory_xact_lock(hashtext(lock_key));

    SELECT c.id INTO conv_id
    FROM conversations c
    JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = user1
    JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = user2
    WHERE c.is_group = false
      AND (
          SELECT COUNT(*)
          FROM conversation_participants cp_all
          WHERE cp_all.conversation_id = c.id
      ) = 2
    ORDER BY c.created_at ASC
    LIMIT 1;

    IF conv_id IS NULL THEN
        INSERT INTO conversations (is_group, created_by, last_message_at)
        VALUES (false, user1, NOW())
        RETURNING id INTO conv_id;

        INSERT INTO conversation_participants (conversation_id, user_id, role)
        VALUES
            (conv_id, user1, 'member'),
            (conv_id, user2, 'member');
    ELSE
        UPDATE conversation_participants
        SET is_active = true,
            role = 'member'
        WHERE conversation_id = conv_id
          AND user_id IN (user1, user2);
    END IF;

    RETURN conv_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION is_valid_direct_conversation(conversation_uuid UUID, requesting_user UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
DECLARE
    active_participant_ids UUID[];
BEGIN
    IF conversation_uuid IS NULL OR requesting_user IS NULL THEN
        RETURN FALSE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM conversations c
        WHERE c.id = conversation_uuid
          AND c.is_group = false
    ) THEN
        RETURN FALSE;
    END IF;

    SELECT array_agg(cp.user_id ORDER BY cp.user_id)
    INTO active_participant_ids
    FROM conversation_participants cp
    WHERE cp.conversation_id = conversation_uuid
      AND cp.is_active = true;

    IF active_participant_ids IS NULL OR array_length(active_participant_ids, 1) <> 2 THEN
        RETURN FALSE;
    END IF;

    IF NOT requesting_user = ANY(active_participant_ids) THEN
        RETURN FALSE;
    END IF;

    IF active_participant_ids[1] = active_participant_ids[2] THEN
        RETURN FALSE;
    END IF;

    IF has_block_between_users(active_participant_ids[1], active_participant_ids[2]) THEN
        RETURN FALSE;
    END IF;

    RETURN has_active_direct_match(active_participant_ids[1], active_participant_ids[2]);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION can_access_conversation(conversation_uuid UUID, requesting_user UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
DECLARE
    conversation_is_group BOOLEAN;
BEGIN
    IF conversation_uuid IS NULL OR requesting_user IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT c.is_group
    INTO conversation_is_group
    FROM conversations c
    WHERE c.id = conversation_uuid;

    IF conversation_is_group IS NULL THEN
        RETURN FALSE;
    END IF;

    IF conversation_is_group = true THEN
        RETURN EXISTS (
            SELECT 1
            FROM conversation_participants cp
            WHERE cp.conversation_id = conversation_uuid
              AND cp.user_id = requesting_user
              AND cp.is_active = true
        );
    END IF;

    RETURN is_valid_direct_conversation(conversation_uuid, requesting_user);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION can_manage_group_participants(conversation_uuid UUID, requesting_user UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
    IF conversation_uuid IS NULL OR requesting_user IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM conversations c
        JOIN conversation_participants cp
          ON cp.conversation_id = c.id
        WHERE c.id = conversation_uuid
          AND c.is_group = true
          AND cp.user_id = requesting_user
          AND cp.is_active = true
          AND cp.role IN ('admin', 'moderator')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION can_update_own_participation(
    participant_uuid UUID,
    conversation_uuid UUID,
    participant_user UUID,
    participant_role TEXT,
    participant_is_active BOOLEAN,
    participant_created_at TIMESTAMPTZ,
    requesting_user UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN AS $$
DECLARE
    stored_row conversation_participants%ROWTYPE;
BEGIN
    IF participant_uuid IS NULL OR conversation_uuid IS NULL OR participant_user IS NULL OR requesting_user IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT *
    INTO stored_row
    FROM conversation_participants
    WHERE id = participant_uuid;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF stored_row.user_id <> requesting_user OR participant_user <> requesting_user THEN
        RETURN FALSE;
    END IF;

    IF stored_row.conversation_id <> conversation_uuid
       OR stored_row.user_id <> participant_user
       OR stored_row.role <> participant_role
       OR stored_row.is_active <> participant_is_active
       OR stored_row.created_at <> participant_created_at THEN
        RETURN FALSE;
    END IF;

    RETURN can_access_conversation(conversation_uuid, requesting_user);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

DROP POLICY IF EXISTS conversations_select_participant ON conversations;
CREATE POLICY conversations_select_participant ON conversations
    FOR SELECT
    USING (can_access_conversation(id, auth.uid()));

DROP POLICY IF EXISTS participants_select_own ON conversation_participants;
CREATE POLICY participants_select_own ON conversation_participants
    FOR SELECT
    USING (can_access_conversation(conversation_id, auth.uid()));

DROP POLICY IF EXISTS participants_insert_system ON conversation_participants;
CREATE POLICY participants_insert_system ON conversation_participants
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM conversations c
            WHERE c.id = conversation_id
              AND c.is_group = true
        )
        AND (
            user_id = auth.uid()
            OR can_manage_group_participants(conversation_id, auth.uid())
        )
    );

DROP POLICY IF EXISTS participants_update_own ON conversation_participants;
CREATE POLICY participants_update_own ON conversation_participants
    FOR UPDATE
    USING (
        user_id = auth.uid()
        AND can_access_conversation(conversation_id, auth.uid())
    )
    WITH CHECK (
        can_update_own_participation(
            id,
            conversation_id,
            user_id,
            role,
            is_active,
            created_at,
            auth.uid()
        )
    );

DROP POLICY IF EXISTS messages_select_participant ON messages;
CREATE POLICY messages_select_participant ON messages
    FOR SELECT
    USING (can_access_conversation(conversation_id, auth.uid()));

DROP POLICY IF EXISTS messages_insert_participant ON messages;
CREATE POLICY messages_insert_participant ON messages
    FOR INSERT
    WITH CHECK (
        sender_id = auth.uid()
        AND can_access_conversation(conversation_id, auth.uid())
    );

DROP POLICY IF EXISTS messages_update_own ON messages;
CREATE POLICY messages_update_own ON messages
    FOR UPDATE
    USING (
        sender_id = auth.uid()
        AND can_access_conversation(conversation_id, auth.uid())
    )
    WITH CHECK (
        sender_id = auth.uid()
        AND can_access_conversation(conversation_id, auth.uid())
    );

DROP POLICY IF EXISTS messages_delete_own ON messages;
CREATE POLICY messages_delete_own ON messages
    FOR DELETE
    USING (
        sender_id = auth.uid()
        AND can_access_conversation(conversation_id, auth.uid())
    );

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
          AND new_msg.created_at > COALESCE(cp.last_read_at, '-infinity'::timestamptz)
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