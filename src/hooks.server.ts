import { isOnboardingComplete } from '$lib/onboarding';
import { createServerClient } from '@supabase/ssr';
import type { Handle } from '@sveltejs/kit';

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
	const protectedRoutes = ['/feed', '/profile', '/discover', '/matches', '/messages', '/create'];
	const publicRoutes = ['/login', '/signup', '/privacy', '/terms', '/safety'];

	const isProtectedRoute = protectedRoutes.some(route => event.url.pathname.startsWith(route));
	const isPublicRoute = publicRoutes.some(route => event.url.pathname.startsWith(route));

	if (isProtectedRoute && !session) {
		return Response.redirect(new URL('/login', event.url.origin), 303);
	}
	
	if (session) {
		const { data: profile } = await event.locals.supabase
			.from('profiles')
			.select('id, username, display_name, bio, avatar_url, gallery_urls, location, interests, relationship_intent, relationship_preferences, consent_acknowledged, age_confirmed, onboarding_completed_at')
			.eq('id', session.user.id)
			.maybeSingle();

		if (!isOnboardingComplete(profile) && event.url.pathname !== '/onboarding') {
			return Response.redirect(new URL('/onboarding', event.url.origin), 303);
		}
        
        // Redirect away from auth routes if already authenticated and onboarded
        if ((event.url.pathname === '/login' || event.url.pathname === '/signup') && isOnboardingComplete(profile)) {
            return Response.redirect(new URL('/feed', event.url.origin), 303);
        }
	} else if (event.url.pathname === '/onboarding') {
        // Redirect anonymous users away from onboarding
        return Response.redirect(new URL('/login', event.url.origin), 303);
    }

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};
