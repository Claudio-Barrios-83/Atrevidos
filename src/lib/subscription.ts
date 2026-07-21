import type { Database } from '$lib/database.types';

export type SubscriptionRow = Database['public']['Tables']['subscriptions']['Row'];

export function isSubscriptionActive(subscription: SubscriptionRow | null): boolean {
  if (!subscription || subscription.status !== 'active') {
    return false;
  }

  if (!subscription.current_period_end) {
    return true;
  }

  return new Date(subscription.current_period_end).getTime() > Date.now();
}

export function formatSubscriptionPeriodEnd(subscription: SubscriptionRow | null): string {
  if (!subscription?.current_period_end) {
    return '';
  }

  return new Date(subscription.current_period_end).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
}

export const PREMIUM_BENEFITS = [
  'Super-likes ilimitados para destacar tu interés al instante',
  'Mirá quién te dio like antes de que sea match mutuo',
  'Insignia Premium visible en tu perfil',
  'Soporte prioritario y acceso anticipado a funciones nuevas'
] as const;
