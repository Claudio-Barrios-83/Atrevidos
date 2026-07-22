import type { PaymentsAdapter } from './types';
import { MockPaymentsAdapter } from './mock-adapter';
import { MercadoPagoPaymentsAdapter, type MercadoPagoCountry } from './mercadopago-adapter';

export type { PaymentsAdapter, CheckoutSession, NormalizedPaymentEvent } from './types';
export { BRL_PREAPPROVAL_PLAN_EXAMPLE, MERCADOPAGO_DEVELOPER_PORTALS } from './mercadopago-adapter';

/**
 * Fábrica de adaptador de pagos para código de SERVIDOR (rutas +server.ts /
 * hooks). Nunca importar este módulo desde un componente `.svelte` que
 * corre en el navegador: `MERCADOPAGO_ACCESS_TOKEN` es secreto y nunca debe
 * llegar al bundle del cliente.
 *
 * Resolución automática: si existen las variables de entorno de Mercado Pago,
 * usa el adaptador real; si no, cae al mock. Lanzamiento inicial en Brasil:
 * MERCADOPAGO_COUNTRY=BR y MERCADOPAGO_CURRENCY=BRL (defaults).
 */
export function getPaymentsAdapter(env: {
  MERCADOPAGO_ACCESS_TOKEN?: string;
  MERCADOPAGO_PLAN_ID?: string;
  MERCADOPAGO_WEBHOOK_SECRET?: string;
  MERCADOPAGO_COUNTRY?: string;
  MERCADOPAGO_CURRENCY?: string;
  MERCADOPAGO_BACK_URL?: string;
} = {}): PaymentsAdapter {
  const accessToken = env.MERCADOPAGO_ACCESS_TOKEN;
  const planId = env.MERCADOPAGO_PLAN_ID;
  const webhookSecret = env.MERCADOPAGO_WEBHOOK_SECRET;

  if (accessToken && planId && webhookSecret) {
    const country = (env.MERCADOPAGO_COUNTRY?.toUpperCase() === 'AR' ? 'AR' : 'BR') as MercadoPagoCountry;
    const currency =
      env.MERCADOPAGO_CURRENCY?.toUpperCase() === 'ARS'
        ? ('ARS' as const)
        : country === 'AR'
          ? ('ARS' as const)
          : ('BRL' as const);

    return new MercadoPagoPaymentsAdapter({
      accessToken,
      planId,
      webhookSecret,
      country,
      currency,
      backUrl: env.MERCADOPAGO_BACK_URL
    });
  }

  return new MockPaymentsAdapter();
}
