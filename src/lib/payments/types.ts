/**
 * Abstracción de proveedor de pagos para el plan único "Atrevidos Premium".
 *
 * Por qué existe esta capa: todavía no tenemos credenciales reales de ningún
 * proveedor de pago (eso depende de que el usuario cree una cuenta de
 * MercadoPago y complete su verificación de negocio). Para no bloquear el
 * resto del producto, todo el código de la app habla con esta interfaz
 * `PaymentsAdapter` en vez de llamar directamente a un proveedor. Hoy resuelve
 * al adaptador "mock" (src/lib/payments/mock-adapter.ts), que simula el ciclo
 * completo de suscripción sin salir de nuestra propia base de datos. El día
 * que existan credenciales reales, alcanza con configurar las variables de
 * entorno documentadas en mercadopago-adapter.ts para que la fábrica
 * (src/lib/payments/index.ts) empiece a resolver ese adaptador real, sin
 * tocar ninguna pantalla ni lógica de negocio del resto de la app.
 */

export type PaymentsProvider = 'mock' | 'mercadopago';

export type CheckoutSession = {
  provider: PaymentsProvider;
  /** URL a la que redirigir al usuario para completar el pago. En modo mock
   * es una URL interna que activa la suscripción al instante. */
  checkoutUrl: string;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
};

export type WebhookVerificationResult =
  | { valid: true; event: NormalizedPaymentEvent }
  | { valid: false; reason: string };

export type NormalizedPaymentEvent = {
  provider: PaymentsProvider;
  userId: string;
  status: 'active' | 'past_due' | 'canceled' | 'inactive';
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  currentPeriodEnd: string | null;
};

export interface PaymentsAdapter {
  readonly provider: PaymentsProvider;

  /** Inicia un checkout de suscripción para el usuario dado. */
  createCheckoutSession(userId: string, userEmail: string): Promise<CheckoutSession>;

  /** Cancela la suscripción activa del usuario ante el proveedor. */
  cancelSubscription(userId: string): Promise<void>;

  /**
   * Valida la autenticidad de un webhook entrante (firma/secreto compartido)
   * y lo normaliza a un evento genérico que el llamador puede aplicar sobre
   * la tabla `subscriptions` sin conocer el formato específico del proveedor.
   */
  verifyWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookVerificationResult>;
}
