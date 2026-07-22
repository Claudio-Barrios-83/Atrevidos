import { describe, expect, it } from 'vitest';
import { decideAuthRedirect, type OnboardingStatus } from './auth-routing';

const decide = ({
  pathname,
  isAuthenticated,
  onboardingStatus = 'unknown'
}: {
  pathname: string;
  isAuthenticated: boolean;
  onboardingStatus?: OnboardingStatus;
}) => decideAuthRedirect({ pathname, isAuthenticated, onboardingStatus });

describe('decideAuthRedirect', () => {
  it('redirects anonymous users on protected routes to /login', () => {
    expect(decide({ pathname: '/feed', isAuthenticated: false })).toBe('/login');
  });

  it('redirects anonymous users on the root route to the public landing page', () => {
    expect(decide({ pathname: '/', isAuthenticated: false })).toBe('/welcome');
  });

  it('redirects anonymous users away from /onboarding to the public landing', () => {
    expect(decide({ pathname: '/onboarding', isAuthenticated: false })).toBe('/welcome');
  });

  it('allows anonymous users to stay on /login', () => {
    expect(decide({ pathname: '/login', isAuthenticated: false })).toBeNull();
  });

  it('allows anonymous users to stay on /signup', () => {
    expect(decide({ pathname: '/signup', isAuthenticated: false })).toBeNull();
  });

  it('allows anonymous users to stay on the public landing page /welcome', () => {
    expect(decide({ pathname: '/welcome', isAuthenticated: false })).toBeNull();
  });

  it('redirects authenticated users away from /welcome to the app', () => {
    expect(decide({ pathname: '/welcome', isAuthenticated: true, onboardingStatus: 'complete' })).toBe('/');
    expect(decide({ pathname: '/welcome', isAuthenticated: true, onboardingStatus: 'incomplete' })).toBe('/onboarding');
  });

  it('allows anonymous users to open the legal notice pages', () => {
    expect(decide({ pathname: '/privacy', isAuthenticated: false })).toBeNull();
    expect(decide({ pathname: '/terms', isAuthenticated: false })).toBeNull();
    expect(decide({ pathname: '/safety', isAuthenticated: false })).toBeNull();
  });

  it('redirects authenticated users away from /login based on onboarding completeness', () => {
    expect(decide({ pathname: '/login', isAuthenticated: true, onboardingStatus: 'complete' })).toBe('/');
    expect(decide({ pathname: '/login', isAuthenticated: true, onboardingStatus: 'incomplete' })).toBe('/onboarding');
  });

  it('redirects authenticated users with incomplete onboarding to /onboarding', () => {
    expect(decide({ pathname: '/matches', isAuthenticated: true, onboardingStatus: 'incomplete' })).toBe('/onboarding');
  });

  it('does not trap authenticated users on /onboarding when onboarding state fetch errored', () => {
    expect(decide({ pathname: '/matches', isAuthenticated: true, onboardingStatus: 'error' })).toBeNull();
  });

  it('allows authenticated users to stay on /onboarding when onboarding state fetch errored', () => {
    expect(decide({ pathname: '/onboarding', isAuthenticated: true, onboardingStatus: 'error' })).toBeNull();
  });

  it('redirects authenticated users with complete onboarding away from /onboarding', () => {
    expect(decide({ pathname: '/onboarding', isAuthenticated: true, onboardingStatus: 'complete' })).toBe('/');
  });
});
