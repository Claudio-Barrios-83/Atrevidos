import type { CheckoutSession, PaymentsAdapter, WebhookVerificationResult } from './types';

/**
 * Adaptador "mock": simula el ciclo de vida completo de una suscripción sin
 * ningún proveedor externo real. Se usa mientras no existan credenciales de
 * MercadoPago (ver mercadopago-adapter.ts). El "checkout" no cobra nada de
 * verdad: activa la suscripción al instante llamando al RPC
 * `start_mock_subscription_checkout` de Supabase (ver
 * database/migrations/20260721_add_subscriptions_system.sql), que corre con
 * SECURITY DEFINER y solo permite que un usuario active su propio plan mock.
 *
 * Esto deja el resto de la app (paywall, gating de super-likes, gating de
 * "quién te dio like") completamente funcional y probado end-to-end hoy
 * mismo, y el día que haya credenciales reales solo hay que activar el
 * adaptador de MercadoPago: ningún componente de UI necesita cambiar porque
 * todos hablan con la interfaz `PaymentsAdapter`.
 */
export class MockPaymentsAdapter implements PaymentsAdapter {
  readonly provider = 'mock' as const;

  async createCheckoutSession(userId: string): Promise<CheckoutSession> {
    return {
      provider: 'mock',
      // Ruta interna que el cliente resuelve llamando al RPC de activación
      // instantánea; no es una URL de pasarela de pago real.
      checkoutUrl: `/subscription?mock_checkout=1&user=${encodeURIComponent(userId)}`,
      providerCustomerId: `mock_customer_${userId}`,
      providerSubscriptionId: `mock_${userId}`
    };
  }

  async cancelSubscription(): Promise<void> {
    // La cancelación real la ejecuta el RPC `cancel_mock_subscription` desde
    // el cliente (ver src/routes/subscription/+page.svelte). Este método
    // existe para cumplir la interfaz cuando el flujo se dispara del lado
    // del servidor (por ejemplo, desde una futura tarea administrativa).
  }

  async verifyWebhook(): Promise<WebhookVerificationResult> {
    return {
      valid: false,
      reason: 'El proveedor mock no recibe webhooks reales; la activación ocurre vía RPC desde el cliente.'
    };
  }
}
