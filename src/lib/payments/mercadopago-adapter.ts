import type {
  CheckoutSession,
  NormalizedPaymentEvent,
  PaymentsAdapter,
  WebhookVerificationResult
} from './types';

/**
 * Adaptador REAL de Mercado Pago (Preapproval API = suscripciones recurrentes).
 *
 * Lanzamiento inicial: **Brasil** (BRL, CPF/CNPJ/MEI — no CUIT). Argentina queda
 * para cuando el operador tenga entidad allí (CUIT + ARS).
 *
 * Por qué Mercado Pago y no Stripe: MP es nativo en BR y AR con un plan/moneda
 * por cuenta. Stripe tiene soporte limitado de recurrentes en Brasil.
 *
 * ------------------------------------------------------------------------
 * PENDIENTE DEL LADO DEL USUARIO (Brasil):
 * ------------------------------------------------------------------------
 *   1. Crear conta Mercado Pago Brasil (pessoa física con CPF, MEI ou CNPJ).
 *      No se requiere CUIT argentino.
 *   2. Crear aplicación en https://www.mercadopago.com.br/developers
 *      y obtener Access Token (TEST para sandbox, APP_USR para producción).
 *   3. Crear plan Preapproval en BRL (ver docs/LANZAMIENTO-BR.md):
 *        POST /preapproval_plan  →  auto_recurring.currency_id = "BRL"
 *   4. Variables de entorno en servidor (.env / Supabase secrets, NUNCA PUBLIC_):
 *        MERCADOPAGO_ACCESS_TOKEN=...
 *        MERCADOPAGO_PLAN_ID=...
 *        MERCADOPAGO_WEBHOOK_SECRET=...
 *        MERCADOPAGO_COUNTRY=BR          (opcional, default BR)
 *        MERCADOPAGO_CURRENCY=BRL        (opcional, default BRL)
 *   5. Webhook en dashboard MP:
 *        https://<proyecto>.supabase.co/functions/v1/payments-webhook
 *   6. Con las tres variables obligatorias seteadas, getPaymentsAdapter() deja
 *      de usar el mock automáticamente.
 *
 * Preference API (pagos únicos, no suscripción):
 *   POST /checkout/preferences con items[].currency_id = "BRL" y
 *   items[].unit_price en reales. Atrevidos Premium usa Preapproval; Preference
 *   queda documentada para futuros productos one-shot.
 * ------------------------------------------------------------------------
 */

const MERCADOPAGO_API_BASE = 'https://api.mercadopago.com';

/** Portales de developers por país (solo documentación / onboarding). */
export const MERCADOPAGO_DEVELOPER_PORTALS = {
  BR: 'https://www.mercadopago.com.br/developers',
  AR: 'https://www.mercadopago.com.ar/developers'
} as const;

export type MercadoPagoCountry = keyof typeof MERCADOPAGO_DEVELOPER_PORTALS;

export type MercadoPagoAdapterConfig = {
  accessToken: string;
  planId: string;
  webhookSecret: string;
  /** ISO país de la cuenta MP. Default: BR (lanzamiento inicial). */
  country?: MercadoPagoCountry;
  /** Moneda del plan recurrente. Default: BRL. */
  currency?: 'BRL' | 'ARS';
  backUrl?: string;
};

/** Payload de referencia para crear el plan Preapproval en Brasil (ver docs). */
export const BRL_PREAPPROVAL_PLAN_EXAMPLE = {
  reason: 'Atrevidos Premium',
  auto_recurring: {
    frequency: 1,
    frequency_type: 'months' as const,
    transaction_amount: 19.9,
    currency_id: 'BRL' as const
  }
};

export class MercadoPagoPaymentsAdapter implements PaymentsAdapter {
  readonly provider = 'mercadopago' as const;

  private readonly country: MercadoPagoCountry;
  private readonly currency: 'BRL' | 'ARS';
  private readonly backUrl: string;

  constructor(private readonly config: MercadoPagoAdapterConfig) {
    this.country = config.country ?? 'BR';
    this.currency = config.currency ?? 'BRL';
    this.backUrl =
      config.backUrl ?? 'https://atrevido55.duckdns.org/subscription?checkout=return';
  }

  /** Moneda configurada para este adaptador (BRL en lanzamiento BR). */
  get currencyId(): 'BRL' | 'ARS' {
    return this.currency;
  }

  /** Portal de developers según país de la cuenta. */
  get developerPortalUrl(): string {
    return MERCADOPAGO_DEVELOPER_PORTALS[this.country];
  }

  async createCheckoutSession(userId: string, userEmail: string): Promise<CheckoutSession> {
    const response = await fetch(`${MERCADOPAGO_API_BASE}/preapproval`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        preapproval_plan_id: this.config.planId,
        payer_email: userEmail,
        external_reference: userId,
        back_url: this.backUrl,
        status: 'pending',
        // El plan ya define currency_id (BRL/ARS); reason ayuda en el checkout MP.
        reason: `Atrevidos Premium (${this.currency})`
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `MercadoPago createCheckoutSession failed (${response.status}, ${this.country}/${this.currency}): ${errorBody}`
      );
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
    // webhook secret). Documentación BR:
    // https://www.mercadopago.com.br/developers/es/docs/your-integrations/notifications/webhooks
    const signatureHeader = headers['x-signature'];

    if (!signatureHeader || !this.config.webhookSecret) {
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
      headers: { Authorization: `Bearer ${this.config.accessToken}` }
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
