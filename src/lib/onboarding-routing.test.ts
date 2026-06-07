import { describe, expect, it } from 'vitest';
import { shouldRefreshOnboardingState } from './onboarding-routing';

const decideRefresh = (
  overrides: Partial<Parameters<typeof shouldRefreshOnboardingState>[0]> = {}
) =>
  shouldRefreshOnboardingState({
    currentOnboardingKey: 'user-1:0',
    onboardingCheckedKey: null,
    onboardingErroredKey: null,
    onboardingErrorPathname: null,
    onboardingLoading: false,
    onboardingStatus: 'unknown',
    pathname: '/matches',
    ...overrides
  });

describe('shouldRefreshOnboardingState', () => {
  it('refreshes when the current onboarding state has not been checked yet', () => {
    expect(decideRefresh()).toBe(true);
  });

  it('does not immediately retry after an error on the same path', () => {
    expect(
      decideRefresh({
        onboardingStatus: 'error',
        onboardingErroredKey: 'user-1:0',
        onboardingErrorPathname: '/matches'
      })
    ).toBe(false);
  });

  it('retries after an error when the user navigates to a different path', () => {
    expect(
      decideRefresh({
        onboardingStatus: 'error',
        onboardingErroredKey: 'user-1:0',
        onboardingErrorPathname: '/matches',
        pathname: '/discover'
      })
    ).toBe(true);
  });

  it('retries after an error when onboarding state is invalidated', () => {
    expect(
      decideRefresh({
        currentOnboardingKey: 'user-1:1',
        onboardingStatus: 'error',
        onboardingErroredKey: 'user-1:0',
        onboardingErrorPathname: '/matches'
      })
    ).toBe(true);
  });

  it('does not refresh while a request is already in flight', () => {
    expect(decideRefresh({ onboardingLoading: true })).toBe(false);
  });
});
