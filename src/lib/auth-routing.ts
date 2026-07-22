import { LEGAL_ROUTE_PATHS } from '$lib/legal';

export type OnboardingStatus = 'unknown' | 'complete' | 'incomplete' | 'error';

type DecideAuthRedirectOptions = {
  pathname: string;
  isAuthenticated: boolean;
  onboardingStatus: OnboardingStatus;
};

  const publicRoutes = new Set(['/login', '/signup', '/welcome', ...LEGAL_ROUTE_PATHS]);

export function decideAuthRedirect({
  pathname,
  isAuthenticated,
  onboardingStatus
}: DecideAuthRedirectOptions): string | null {
  const isPublicRoute = publicRoutes.has(pathname);
  const requiresOnboarding = onboardingStatus === 'incomplete';

  // La raíz "/" es el feed autenticado. Para visitantes anónimos mostramos la
  // landing de marketing (hero + propuesta de valor + CTA) en vez de mandarlos
  // directo a /login, siguiendo el patrón de D4Swing/Sexlog de tener una
  // página pública de presentación antes del login.
  if (!isAuthenticated && pathname === '/') {
    return '/welcome';
  }

  // Anónimo en /onboarding (p. ej. justo después de cerrar sesión): nunca
  // quedarse ahí esperando una sesión que ya no existe. Preferimos la landing.
  if (!isAuthenticated && pathname === '/onboarding') {
    return '/welcome';
  }

  if (isAuthenticated && pathname === '/welcome') {
    return requiresOnboarding ? '/onboarding' : '/';
  }

  if (!isAuthenticated && !isPublicRoute) {
    return '/login';
  }

  if (pathname === '/login' || pathname === '/signup') {
    return isAuthenticated ? (requiresOnboarding ? '/onboarding' : '/') : null;
  }

  if (requiresOnboarding && pathname !== '/onboarding' && !isPublicRoute) {
    return '/onboarding';
  }

  if (onboardingStatus === 'complete' && pathname === '/onboarding') {
    return '/';
  }

  return null;
}
