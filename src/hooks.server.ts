import { isOnboardingComplete } from '$lib/onboarding';
import { createServerClient } from '@supabase/ssr';
import type { Handle } from '@sveltejs/kit';
import { decideAuthRedirect, type OnboardingStatus } from '$lib/auth-routing';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createServerClient(import.meta.env.PUBLIC_SUPABASE_URL, import.meta.env.PUBLIC_SUPABASE_ANON_KEY, {
		cookies: {
			getAll: () => event.cookies.getAll(),
			setAll: (cookiesToSet) => {
				cookiesToSet.forEach(({ name, value, options }) => {
					event.cookies.set(name, value, { ...options, path: '/' });
				});
			}
		}
	});

	event.locals.getSession = async () => {
		const {
			data: { session }
		} = await event.locals.supabase.auth.getSession();
		return session;
	};

	// Auth Guard logic
	const session = await event.locals.getSession();

    let onboardingStatus: string = 'unknown';
    if (session) {
        try {
            const { data } = await event.locals.supabase
                .from('profiles')
                .select('onboarding_completed_at')
                .eq('id', session.user.id)
                .maybeSingle();
            onboardingStatus = data?.onboarding_completed_at ? 'complete' : 'incomplete';
        } catch (e) {
            onboardingStatus = 'error';
        }
    }

	const redirectPath = decideAuthRedirect({
        pathname: event.url.pathname,
        isAuthenticated: !!session,
        onboardingStatus: onboardingStatus as OnboardingStatus
    });

    if (redirectPath) {
        return Response.redirect(new URL(redirectPath, event.url.origin), 303);
    }

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};
