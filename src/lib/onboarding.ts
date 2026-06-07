import type { User } from '@supabase/supabase-js';
import { writable } from 'svelte/store';
import type { Database } from '$lib/database.types';
import { supabase } from '$lib/supabase/client';

export type ProfileRow = Pick<
	Database['public']['Tables']['profiles']['Row'],
	| 'id'
	| 'username'
	| 'display_name'
	| 'bio'
	| 'avatar_url'
	| 'gallery_urls'
	| 'location'
	| 'interests'
	| 'relationship_intent'
	| 'relationship_preferences'
	| 'consent_acknowledged'
	| 'age_confirmed'
	| 'onboarding_completed_at'
>;

type ProfileUpsert = Pick<
	Database['public']['Tables']['profiles']['Insert'],
	| 'id'
	| 'username'
	| 'display_name'
	| 'bio'
	| 'avatar_url'
	| 'gallery_urls'
	| 'location'
	| 'interests'
	| 'relationship_intent'
	| 'relationship_preferences'
	| 'consent_acknowledged'
	| 'age_confirmed'
	| 'onboarding_completed_at'
>;

export type RelationshipIntent =
	| 'amistad'
	| 'citas'
	| 'relacion_seria'
	| 'conocer_personas'
	| 'aun_explorando';

export type ProfileFormValues = {
	username: string;
	displayName: string;
	bio: string;
	location: string;
	interests: string;
	relationshipIntent: RelationshipIntent | '';
	relationshipPreferences: string;
	consentAcknowledged: boolean;
	ageConfirmed: boolean;
};

export type OnboardingFormValues = ProfileFormValues;

export type OnboardingState = {
	profile: ProfileRow | null;
	isComplete: boolean;
};

const onboardingRevision = writable(0);

export const onboardingStateRevision = {
	subscribe: onboardingRevision.subscribe
};

export function invalidateOnboardingState() {
	onboardingRevision.update((revision) => revision + 1);
}

export const RELATIONSHIP_INTENT_OPTIONS: Array<{
	value: RelationshipIntent;
	label: string;
	description: string;
}> = [
	{
		value: 'amistad',
		label: 'Amistad',
		description: 'Quiero conocer gente y hacer nuevas amistades.'
	},
	{
		value: 'citas',
		label: 'Citas',
		description: 'Me interesa salir con personas y ver qué pasa.'
	},
	{
		value: 'relacion_seria',
		label: 'Relación seria',
		description: 'Busco una conexión con intención de largo plazo.'
	},
	{
		value: 'conocer_personas',
		label: 'Conocer personas',
		description: 'Estoy abierta/o a conversar y descubrir afinidades.'
	},
	{
		value: 'aun_explorando',
		label: 'Aún explorando',
		description: 'Todavía no tengo una intención definida.'
	}
];

export const EMPTY_ONBOARDING_FORM: OnboardingFormValues = {
	username: '',
	displayName: '',
	bio: '',
	location: '',
	interests: '',
	relationshipIntent: '',
	relationshipPreferences: '',
	consentAcknowledged: false,
	ageConfirmed: false
};

const relationshipIntentValues = new Set(RELATIONSHIP_INTENT_OPTIONS.map((option) => option.value));

function normalizeText(value: string, maxLength: number) {
	return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

export function normalizeUsername(value: string) {
	return value
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9_]+/g, '_')
		.replace(/_+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 30);
}

export function parseInterests(value: string) {
	const unique = new Set<string>();

	for (const item of value.split(',')) {
		const normalized = normalizeText(item, 32);

		if (normalized) {
			unique.add(normalized);
		}
	}

	return Array.from(unique).slice(0, 8);
}

export function formatInterests(interests: string[] | null | undefined) {
	return (interests ?? []).join(', ');
}

function normalizeRelationshipIntent(value: string | null | undefined): RelationshipIntent | null {
	return relationshipIntentValues.has(value as RelationshipIntent)
		? (value as RelationshipIntent)
		: null;
}

function normalizeProfile(profile: ProfileRow | null): ProfileRow | null {
	return profile
		? {
				...profile,
				gallery_urls: profile.gallery_urls ?? [],
				relationship_intent: normalizeRelationshipIntent(profile.relationship_intent)
			}
		: null;
}

export function isOnboardingComplete(profile: ProfileRow | null) {
	return Boolean(
		profile?.username &&
			profile.display_name &&
			profile.bio &&
			profile.location &&
			(profile.interests?.length ?? 0) > 0 &&
			profile.relationship_intent &&
			profile.consent_acknowledged &&
			profile.age_confirmed &&
			profile.onboarding_completed_at
	);
}

export async function loadOnboardingState(user: User): Promise<OnboardingState> {
	const { data: profile, error } = await supabase
		.from('profiles')
		.select(
			'id, username, display_name, bio, avatar_url, gallery_urls, location, interests, relationship_intent, relationship_preferences, consent_acknowledged, age_confirmed, onboarding_completed_at'
		)
		.eq('id', user.id)
		.maybeSingle();

	if (error) {
		throw error;
	}

	const normalizedProfile = normalizeProfile(profile);

	return {
		profile: normalizedProfile,
		isComplete: isOnboardingComplete(normalizedProfile)
	};
}

export function buildProfileFormValues(profile: ProfileRow | null): ProfileFormValues {
	return {
		username: profile?.username ?? '',
		displayName: profile?.display_name ?? '',
		bio: profile?.bio ?? '',
		location: profile?.location ?? '',
		interests: formatInterests(profile?.interests),
		relationshipIntent: profile?.relationship_intent ?? '',
		relationshipPreferences: profile?.relationship_preferences ?? '',
		consentAcknowledged: profile?.consent_acknowledged ?? false,
		ageConfirmed: profile?.age_confirmed ?? false
	};
}

export function buildOnboardingFormValues(state: OnboardingState): OnboardingFormValues {
	return buildProfileFormValues(state.profile);
}

type SaveProfileOptions = {
	preserveOnboardingCompletion?: boolean;
	requireAcknowledgements?: boolean;
	currentProfile?: ProfileRow | null;
};

export async function saveProfile(
	user: User,
	values: ProfileFormValues,
	options: SaveProfileOptions = {}
) {
	const username = normalizeUsername(values.username);
	const displayName = normalizeText(values.displayName, 80);
	const bio = values.bio.trim().slice(0, 280);
	const location = normalizeText(values.location, 120);
	const interests = parseInterests(values.interests);
	const relationshipPreferences = values.relationshipPreferences.trim().slice(0, 200);
	const preserveOnboardingCompletion = options.preserveOnboardingCompletion ?? false;
	const requireAcknowledgements = options.requireAcknowledgements ?? true;
	const consentAcknowledged = preserveOnboardingCompletion
		? (options.currentProfile?.consent_acknowledged ?? values.consentAcknowledged)
		: values.consentAcknowledged;
	const ageConfirmed = preserveOnboardingCompletion
		? (options.currentProfile?.age_confirmed ?? values.ageConfirmed)
		: values.ageConfirmed;
	const onboardingCompletedAt = preserveOnboardingCompletion
		? (options.currentProfile?.onboarding_completed_at ?? new Date().toISOString())
		: new Date().toISOString();

	if (username.length < 3) {
		throw new Error('El nombre de usuario debe tener al menos 3 caracteres.');
	}

	if (!displayName) {
		throw new Error('Tu nombre visible es obligatorio.');
	}

	if (!bio) {
		throw new Error('Cuéntanos algo sobre ti en la biografía.');
	}

	if (!location) {
		throw new Error('La ubicación es obligatoria.');
	}

	if (interests.length === 0) {
		throw new Error('Agrega al menos un interés.');
	}

	if (!values.relationshipIntent || !relationshipIntentValues.has(values.relationshipIntent)) {
		throw new Error('Selecciona qué tipo de conexión estás buscando.');
	}

	if (requireAcknowledgements && !consentAcknowledged) {
		throw new Error('Debes aceptar el consentimiento para continuar.');
	}

	if (requireAcknowledgements && !ageConfirmed) {
		throw new Error('Debes confirmar que eres mayor de 18 años.');
	}

	const profilePayload: ProfileUpsert = {
		id: user.id,
		username,
		display_name: displayName,
		bio,
		location,
		interests,
		relationship_intent: values.relationshipIntent,
		relationship_preferences: relationshipPreferences,
		consent_acknowledged: consentAcknowledged,
		age_confirmed: ageConfirmed,
		onboarding_completed_at: onboardingCompletedAt
	};

	const { data, error } = await supabase
		.from('profiles')
		.upsert(profilePayload, { onConflict: 'id' })
		.select(
			'id, username, display_name, bio, avatar_url, gallery_urls, location, interests, relationship_intent, relationship_preferences, consent_acknowledged, age_confirmed, onboarding_completed_at'
		)
		.single();

	if (error) {
		throw error;
	}

	invalidateOnboardingState();

	return normalizeProfile(data);
}

export async function saveOnboarding(user: User, values: OnboardingFormValues) {
	return saveProfile(user, values, {
		preserveOnboardingCompletion: false,
		requireAcknowledgements: true
	});
}
