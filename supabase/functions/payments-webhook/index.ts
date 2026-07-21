// Edge Function: payments-webhook
//
// Recibe las notificaciones del proveedor de pago (MercadoPago) y actualiza
// el estado real de la suscripción en la tabla `subscriptions` usando el rol
// service_role (necesario porque esa tabla no tiene policies de
// INSERT/UPDATE para clientes, ver database/migrations/20260721_*).
//
// verify_jwt = false: los webhooks de MercadoPago no llevan un JWT de
// Supabase, llevan su propia firma HMAC en el header "x-signature". Por eso
// esta función se despliega sin verificación de JWT y en cambio valida esa
// firma manualmente contra MERCADOPAGO_WEBHOOK_SECRET.
//
// Estado actual: MERCADOPAGO_ACCESS_TOKEN / MERCADOPAGO_WEBHOOK_SECRET NO
// están configurados todavía (pendiente de que el usuario cree la cuenta de
// MercadoPago, ver src/lib/payments/mercadopago-adapter.ts). Mientras tanto
// esta función responde 200 sin aplicar cambios reales y loguea el intento,
// para que registrar la URL del webhook en MercadoPago no falle aunque el
// modo mock siga siendo el que gestiona las suscripciones desde el cliente
// (RPC start_mock_subscription_checkout / cancel_mock_subscription).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MERCADOPAGO_ACCESS_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');
const MERCADOPAGO_WEBHOOK_SECRET = Deno.env.get('MERCADOPAGO_WEBHOOK_SECRET');

const MERCADOPAGO_API_BASE = 'https://api.mercadopago.com';

type MercadoPagoStatus = 'authorized' | 'paused' | 'cancelled' | 'pending';

const STATUS_MAP: Record<MercadoPagoStatus, 'active' | 'past_due' | 'canceled' | 'inactive'> = {
  authorized: 'active',
  paused: 'past_due',
  cancelled: 'canceled',
  pending: 'inactive'
};

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  if (!MERCADOPAGO_ACCESS_TOKEN || !MERCADOPAGO_WEBHOOK_SECRET) {
    console.log(
      'payments-webhook: MercadoPago no está configurado todavía (modo mock activo). Ignorando webhook sin aplicar cambios.'
    );
    return new Response(
      JSON.stringify({
        ok: true,
        note: 'MercadoPago no configurado; las suscripciones se gestionan en modo mock desde el cliente.'
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const rawBody = await req.text();

  let payload: { type?: string; data?: { id?: string } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  if (payload.type !== 'subscription_preapproval' && payload.type !== 'preapproval') {
    // Otros tipos de eventos (pagos únicos, etc.) no aplican al modelo de
    // suscripción única; se reconocen con 200 para que MercadoPago no
    // reintente indefinidamente.
    return new Response(JSON.stringify({ ok: true, ignored: payload.type }), { status: 200 });
  }

  const preapprovalId = payload.data?.id;
  if (!preapprovalId) {
    return new Response('Missing data.id', { status: 400 });
  }

  const detailResponse = await fetch(`${MERCADOPAGO_API_BASE}/preapproval/${preapprovalId}`, {
    headers: { Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}` }
  });

  if (!detailResponse.ok) {
    console.error(`payments-webhook: no se pudo confirmar preapproval ${preapprovalId}`);
    return new Response('Could not verify preapproval with MercadoPago', { status: 502 });
  }

  const detail = (await detailResponse.json()) as {
    status: MercadoPagoStatus;
    external_reference: string;
    payer_id?: number;
    id: string;
    next_payment_date?: string;
  };

  const userId = detail.external_reference;
  if (!userId) {
    return new Response('Missing external_reference (user id)', { status: 400 });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { error } = await supabaseAdmin.rpc('upsert_subscription_status', {
    target_user_id: userId,
    new_status: STATUS_MAP[detail.status] ?? 'inactive',
    new_provider: 'mercadopago',
    new_provider_customer_id: detail.payer_id ? String(detail.payer_id) : null,
    new_provider_subscription_id: detail.id,
    new_current_period_end: detail.next_payment_date ?? null
  });

  if (error) {
    console.error('payments-webhook: error al actualizar subscriptions', error);
    return new Response('Failed to update subscription', { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
});
