-- ============================================================================
-- Gating de funciones premium detrás de la suscripción (plan único)
-- ============================================================================
-- Criterio elegido: 1) super-like requiere suscripción activa (el like común
-- sigue siendo gratis para todos, no se toca el core de discover/match).
-- 2) ver quién te dio like sin ser todavía match mutuo ("a quién le gustás")
-- requiere suscripción activa; los matches mutuos y tus propios likes
-- enviados siempre son visibles para vos, gratis.

DROP POLICY IF EXISTS matches_insert_own ON matches;
CREATE POLICY matches_insert_own ON matches
    FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND (
            match_type != 'super-like'
            OR has_active_subscription(auth.uid())
        )
    );

DROP POLICY IF EXISTS matches_update_own ON matches;
CREATE POLICY matches_update_own ON matches
    FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (
        user_id = auth.uid()
        AND (
            match_type != 'super-like'
            OR has_active_subscription(auth.uid())
        )
    );

DROP POLICY IF EXISTS matches_select_own ON matches;
CREATE POLICY matches_select_own ON matches
    FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()
        OR (
            target_user_id = auth.uid()
            AND (
                is_mutual = true
                OR match_type = 'block'
                OR has_active_subscription(auth.uid())
            )
        )
    );

COMMENT ON COLUMN subscriptions.plan IS 'Plan único Atrevidos Premium: desbloquea super-likes y ver quién te dio like antes del match mutuo.';

-- ============================================================================
-- Soporte de posts anónimos en el feed público
-- ============================================================================
-- La vista public_feed excluía por completo los posts anónimos (is_anonymous
-- = false). Eso hacía inútil el toggle de "publicación anónima" que ya
-- existía en el esquema: el post simplemente nunca aparecía en el feed. Se
-- corrige para que los posts anónimos SÍ aparezcan, pero con la identidad
-- del autor enmascarada (username/avatar/display_name -> 'Anonimo').
CREATE OR REPLACE VIEW public_feed
WITH (security_invoker = true) AS
SELECT
    p.id,
    p.user_id,
    p.content,
    p.image_urls,
    p.video_url,
    p.is_anonymous,
    p.visibility,
    p.like_count,
    p.comment_count,
    p.share_count,
    p.is_pinned,
    p.is_archived,
    p.created_at,
    p.updated_at,
    CASE WHEN p.is_anonymous THEN NULL ELSE pr.username END AS username,
    CASE WHEN p.is_anonymous THEN 'Anonimo' ELSE pr.display_name END AS display_name,
    CASE WHEN p.is_anonymous THEN NULL ELSE pr.avatar_url END AS avatar_url,
    CASE WHEN p.is_anonymous THEN false ELSE pr.is_verified END AS is_verified,
    CASE
        WHEN pr.id = auth.uid() THEN 'own'
        WHEN EXISTS (
            SELECT 1 FROM matches
            WHERE ((user_id = auth.uid() AND target_user_id = pr.id)
               OR (target_user_id = auth.uid() AND user_id = pr.id))
              AND match_type IN ('like', 'super-like')
        ) THEN 'connected'
        ELSE 'public'
    END AS relation_type
FROM posts p
JOIN profiles pr ON p.user_id = pr.id
WHERE p.is_archived = false
  AND (p.visibility = 'public'
       OR p.user_id = auth.uid()
       OR EXISTS (
           SELECT 1 FROM matches
           WHERE ((user_id = auth.uid() AND target_user_id = p.user_id)
              OR (target_user_id = auth.uid() AND user_id = p.user_id))
             AND match_type IN ('like', 'super-like')
       ))
ORDER BY p.created_at DESC;

GRANT SELECT ON public_feed TO authenticated;
REVOKE ALL ON public_feed FROM PUBLIC;
REVOKE ALL ON public_feed FROM anon;

-- ============================================================================
-- Grants para la Edge Function payments-webhook (rol service_role)
-- ============================================================================
GRANT EXECUTE ON FUNCTION upsert_subscription_status(UUID, subscription_status, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION has_active_subscription(UUID) TO service_role;

-- ============================================================================
-- Fix: los defaults de Supabase otorgan EXECUTE a anon/authenticated
-- automáticamente al crear funciones (ALTER DEFAULT PRIVILEGES), así que
-- REVOKE FROM PUBLIC no alcanza: hay que revocar explícitamente de anon
-- también (mismo patrón que se aplicó antes para search_users). El linter de
-- seguridad de Supabase (get_advisors) detectó que anon podía ejecutar estas
-- 4 funciones SECURITY DEFINER de suscripciones.
-- ============================================================================
REVOKE EXECUTE ON FUNCTION has_active_subscription(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION upsert_subscription_status(UUID, subscription_status, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM anon;
REVOKE EXECUTE ON FUNCTION start_mock_subscription_checkout(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION cancel_mock_subscription(UUID) FROM anon;
