-- ============================================================================
-- Sistema de suscripción (plan único "Atrevidos Premium")
-- ============================================================================
-- Aplicado en producción vía MCP de Supabase el 2026-07-21. Este archivo
-- documenta esa migración para que el esquema versionado en git coincida con
-- la base de datos real.

CREATE TYPE subscription_status AS ENUM ('inactive', 'active', 'past_due', 'canceled');

CREATE TABLE IF NOT EXISTS subscriptions (
    user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    status subscription_status NOT NULL DEFAULT 'inactive',
    plan TEXT NOT NULL DEFAULT 'atrevidos_premium',
    provider TEXT NOT NULL DEFAULT 'mock' CHECK (provider IN ('mock', 'mercadopago')),
    provider_customer_id TEXT,
    provider_subscription_id TEXT,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_sub_id ON subscriptions(provider_subscription_id) WHERE provider_subscription_id IS NOT NULL;

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Cada usuario solo puede ver su propia suscripción. Las escrituras normales
-- NO se permiten desde el cliente (ni siquiera para el propio dueño): el
-- estado real lo actualiza el webhook del proveedor de pago (o el RPC de
-- checkout mock) corriendo con SECURITY DEFINER, para evitar que un usuario
-- se otorgue premium gratis con un UPDATE directo vía API.
CREATE POLICY subscriptions_select_own ON subscriptions
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Función helper: saber si un usuario tiene suscripción activa vigente.
CREATE OR REPLACE FUNCTION has_active_subscription(target_user_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM subscriptions
        WHERE user_id = target_user_id
          AND status = 'active'
          AND (current_period_end IS NULL OR current_period_end > NOW())
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION has_active_subscription(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION has_active_subscription(UUID) TO authenticated;

-- RPC para activar/actualizar suscripción. SECURITY DEFINER porque escribe en
-- una tabla sin policies de INSERT/UPDATE para el cliente. Dos llamadores:
--   1) La Edge Function "payments-webhook" (rol service_role, bypassea RLS
--      igual, pero también puede llamar este RPC para reusar la lógica).
--   2) El modo mock de UI (provider='mock'), para simular activación
--      instantánea SIN credenciales reales de pasarela de pago. En
--      producción con MercadoPago real, esta función la invoca el webhook
--      tras confirmar el pago, nunca el cliente directamente con
--      provider='mercadopago'.
CREATE OR REPLACE FUNCTION upsert_subscription_status(
    target_user_id UUID,
    new_status subscription_status,
    new_provider TEXT,
    new_provider_customer_id TEXT,
    new_provider_subscription_id TEXT,
    new_current_period_end TIMESTAMPTZ
)
RETURNS subscriptions AS $$
    INSERT INTO subscriptions (
        user_id, status, provider, provider_customer_id, provider_subscription_id,
        current_period_end, updated_at
    )
    VALUES (
        target_user_id, new_status, new_provider, new_provider_customer_id,
        new_provider_subscription_id, new_current_period_end, NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
        status = EXCLUDED.status,
        provider = EXCLUDED.provider,
        provider_customer_id = COALESCE(EXCLUDED.provider_customer_id, subscriptions.provider_customer_id),
        provider_subscription_id = COALESCE(EXCLUDED.provider_subscription_id, subscriptions.provider_subscription_id),
        current_period_end = EXCLUDED.current_period_end,
        updated_at = NOW()
    RETURNING *;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION upsert_subscription_status(UUID, subscription_status, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_subscription_status(UUID, subscription_status, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO authenticated;

-- RPC de conveniencia para el flujo MOCK desde el cliente: el propio usuario
-- activa su plan mock (self-service, solo para provider='mock'; nunca otorga
-- provider='mercadopago' sin pasar por el webhook real).
CREATE OR REPLACE FUNCTION start_mock_subscription_checkout(target_user_id UUID)
RETURNS subscriptions AS $$
BEGIN
    IF target_user_id != auth.uid() THEN
        RAISE EXCEPTION 'No puedes activar la suscripción de otro usuario';
    END IF;

    RETURN upsert_subscription_status(
        target_user_id,
        'active'::subscription_status,
        'mock',
        NULL,
        'mock_' || target_user_id::text,
        NOW() + INTERVAL '30 days'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION start_mock_subscription_checkout(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION start_mock_subscription_checkout(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION cancel_mock_subscription(target_user_id UUID)
RETURNS subscriptions AS $$
BEGIN
    IF target_user_id != auth.uid() THEN
        RAISE EXCEPTION 'No puedes cancelar la suscripción de otro usuario';
    END IF;

    RETURN upsert_subscription_status(
        target_user_id,
        'canceled'::subscription_status,
        'mock',
        NULL,
        'mock_' || target_user_id::text,
        NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION cancel_mock_subscription(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cancel_mock_subscription(UUID) TO authenticated;

CREATE TRIGGER on_subscriptions_updated
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
