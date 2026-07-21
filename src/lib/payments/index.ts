import type { PaymentsAdapter } from './types';
import { MockPaymentsAdapter } from './mock-adapter';
import { MercadoPagoPaymentsAdapter } from './mercadopago-adapter';

export type { PaymentsAdapter, CheckoutSession, NormalizedPaymentEvent } from './types';

/**
 * Fábrica de adaptador de pagos para código de SERVIDOR (rutas +server.ts /
 * hooks). Nunca importar este módulo desde un componente `.svelte` que
 * corre en el navegador: `MERCADOPAGO_ACCESS_TOKEN` es secreto y nunca debe
 * llegar al bundle del cliente.
 *
 * Resolución automática: si existen las variables de entorno de MercadoPago,
 * usa el adaptador real; si no, cae al mock. Esto permite desplegar hoy sin
 * credenciales (modo mock) y activar el proveedor real más adelante solo
 * seteando variables de entorno, sin cambiar código.
 */
export function getPaymentsAdapter(env: {
  MERCADOPAGO_ACCESS_TOKEN?: string;
  MERCADOPAGO_PLAN_ID?: string;
  MERCADOPAGO_WEBHOOK_SECRET?: string;
} = {}): PaymentsAdapter {
  const accessToken = env.MERCADOPAGO_ACCESS_TOKEN;
  const planId = env.MERCADOPAGO_PLAN_ID;
  const webhookSecret = env.MERCADOPAGO_WEBHOOK_SECRET;

  if (accessToken && planId && webhookSecret) {
    return new MercadoPagoPaymentsAdapter(accessToken, planId, webhookSecret);
  }

  return new MockPaymentsAdapter();
}
