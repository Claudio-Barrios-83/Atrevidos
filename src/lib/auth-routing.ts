import { LEGAL_ROUTE_PATHS } from '$lib/legal';

export type OnboardingStatus = 'unknown' | 'complete' | 'incomplete' | 'error';

type DecideAuthRedirectOptions = {
  pathname: string;
  isAuthenticated: boolean;
  onboardingStatus: OnboardingStatus;
};

const publicRoutes = new Set(['/login', ...LEGAL_ROUTE_PATHS]);

export function decideAuthRedirect({
  pathname,
  isAuthenticated,
  onboardingStatus
}: DecideAuthRedirectOptions): string | null {
  const isPublicRoute = publicRoutes.has(pathname);
  const requiresOnboarding = onboardingStatus === 'incomplete';

  if (!isAuthenticated) {
    return isPublicRoute ? null : '/login';
  }

  if (pathname === '/login') {
    return requiresOnboarding ? '/onboarding' : '/';
  }

  if (requiresOnboarding && pathname !== '/onboarding' && !isPublicRoute) {
    return '/onboarding';
  }

  if (onboardingStatus === 'complete' && pathname === '/onboarding') {
    return '/';
  }

  return null;
}
