import type { OnboardingStatus } from '$lib/auth-routing';

type ShouldRefreshOnboardingStateOptions = {
  currentOnboardingKey: string | null;
  onboardingCheckedKey: string | null;
  onboardingErroredKey: string | null;
  onboardingErrorPathname: string | null;
  onboardingLoading: boolean;
  onboardingStatus: OnboardingStatus;
  pathname: string;
};

export function shouldRefreshOnboardingState({
  currentOnboardingKey,
  onboardingCheckedKey,
  onboardingErroredKey,
  onboardingErrorPathname,
  onboardingLoading,
  onboardingStatus,
  pathname
}: ShouldRefreshOnboardingStateOptions): boolean {
  if (!currentOnboardingKey || onboardingLoading) {
    return false;
  }

  if (
    onboardingStatus === 'error' &&
    onboardingErroredKey === currentOnboardingKey &&
    onboardingErrorPathname === pathname
  ) {
    return false;
  }

  return onboardingCheckedKey !== currentOnboardingKey;
}
