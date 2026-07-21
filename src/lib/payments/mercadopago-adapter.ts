import type {
  CheckoutSession,
  NormalizedPaymentEvent,
  PaymentsAdapter,
  WebhookVerificationResult
} from './types';

/**
 * Adaptador REAL de MercadoPago (Preapproval API = suscripciones recurrentes).
 *
 * Por qué MercadoPago y no Stripe: el lanzamiento prioriza Argentina y
 * Brasil, y Stripe tiene soporte muy limitado de cobros recurrentes en
 * Brasil (requiere Stripe Connect + entidad local en muchos casos), mientras
 * que MercadoPago es nativo en ambos países con un único plan/moneda por
 * cuenta. Como todavía no existe una cuenta de MercadoPago para Atrevidos,
 * este adaptador NO se usa en runtime (ver src/lib/payments/index.ts): queda
 * implementado y documentado para activarlo el día que el usuario cree la
 * cuenta y complete el alta de aplicación.
 *
 * ------------------------------------------------------------------------
 * PENDIENTE DEL LADO DEL USUARIO (no resoluble por el agente):
 * ------------------------------------------------------------------------
 *   1. Crear cuenta de MercadoPago (o MercadoPago Brasil) para el negocio.
 *   2. Crear una aplicación en https://www.mercadopago.com.ar/developers
 *      y obtener el Access Token de producción.
 *   3. Crear un plan de "Preapproval" (suscripción recurrente) desde el
 *      dashboard o vía API con el precio único definido para Atrevidos
 *      Premium.
 *   4. Configurar estas variables de entorno en el servidor (.env, NUNCA
 *      con prefijo PUBLIC_/VITE_ porque son secretas):
 *        MERCADOPAGO_ACCESS_TOKEN=...          (token privado de la app)
 *        MERCADOPAGO_PLAN_ID=...               (id del plan de preapproval)
 *        MERCADOPAGO_WEBHOOK_SECRET=...        (para validar firma de webhooks)
 *   5. Registrar la URL del webhook en el dashboard de MercadoPago:
 *        https://<tu-proyecto>.supabase.co/functions/v1/payments-webhook
 *   6. Una vez configuradas esas variables, cambiar
 *      PAYMENTS_PROVIDER=mercadopago en el entorno del servidor (ver
 *      src/lib/payments/index.ts) para que la app deje de usar el adaptador
 *      mock automáticamente.
 * ------------------------------------------------------------------------
 */

const MERCADOPAGO_API_BASE = 'https://api.mercadopago.com';

export class MercadoPagoPaymentsAdapter implements PaymentsAdapter {
  readonly provider = 'mercadopago' as const;

  constructor(
    private readonly accessToken: string,
    private readonly planId: string,
    private readonly webhookSecret: string
  ) {}

  async createCheckoutSession(userId: string, userEmail: string): Promise<CheckoutSession> {
    const response = await fetch(`${MERCADOPAGO_API_BASE}/preapproval`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        preapproval_plan_id: this.planId,
        payer_email: userEmail,
        external_reference: userId,
        back_url: 'https://atrevido55.duckdns.org/subscription?checkout=return',
        status: 'pending'
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`MercadoPago createCheckoutSession failed (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as {
      id: string;
      init_point: string;
      payer_id?: string;
    };

    return {
      provider: 'mercadopago',
      checkoutUrl: data.init_point,
      providerCustomerId: data.payer_id ? String(data.payer_id) : null,
      providerSubscriptionId: data.id
    };
  }

  async cancelSubscription(userId: string): Promise<void> {
    // MercadoPago identifica la preapproval por su propio id, no por
    // external_reference, en su endpoint de update. En una implementación
    // completa habría que buscar primero el provider_subscription_id
    // guardado en la tabla `subscriptions` para este userId y hacer:
    //   PUT /preapproval/{id}  { "status": "cancelled" }
    throw new Error(
      `cancelSubscription no implementado para MercadoPago todavía (userId=${userId}). ` +
        'Buscar provider_subscription_id en la tabla subscriptions y llamar PUT /preapproval/{id}.'
    );
  }

  async verifyWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookVerificationResult> {
    // MercadoPago firma los webhooks con un header "x-signature" (HMAC-SHA256
    // sobre "id:{data.id};request-id:{x-request-id};ts:{ts};" usando el
    // webhook secret). Documentación:
    // https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
    const signatureHeader = headers['x-signature'];

    if (!signatureHeader || !this.webhookSecret) {
      return { valid: false, reason: 'Falta x-signature o MERCADOPAGO_WEBHOOK_SECRET no configurado.' };
    }

    let payload: {
      data?: { id?: string };
      type?: string;
      action?: string;
    };

    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { valid: false, reason: 'Body de webhook no es JSON válido.' };
    }

    if (payload.type !== 'subscription_preapproval' && payload.type !== 'preapproval') {
      return { valid: false, reason: `Tipo de evento no soportado: ${payload.type}` };
    }

    const preapprovalId = payload.data?.id;

    if (!preapprovalId) {
      return { valid: false, reason: 'Webhook sin data.id de preapproval.' };
    }

    const detailResponse = await fetch(`${MERCADOPAGO_API_BASE}/preapproval/${preapprovalId}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });

    if (!detailResponse.ok) {
      return { valid: false, reason: `No se pudo confirmar el preapproval ${preapprovalId} contra la API.` };
    }

    const detail = (await detailResponse.json()) as {
      status: 'authorized' | 'paused' | 'cancelled' | 'pending';
      external_reference: string;
      payer_id?: number;
      id: string;
      next_payment_date?: string;
    };

    const statusMap: Record<string, NormalizedPaymentEvent['status']> = {
      authorized: 'active',
      paused: 'past_due',
      cancelled: 'canceled',
      pending: 'inactive'
    };

    return {
      valid: true,
      event: {
        provider: 'mercadopago',
        userId: detail.external_reference,
        status: statusMap[detail.status] ?? 'inactive',
        providerCustomerId: detail.payer_id ? String(detail.payer_id) : null,
        providerSubscriptionId: detail.id,
        currentPeriodEnd: detail.next_payment_date ?? null
      }
    };
  }
}
