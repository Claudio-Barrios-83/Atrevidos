ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS relationship_intent TEXT,
    ADD COLUMN IF NOT EXISTS relationship_preferences TEXT,
    ADD COLUMN IF NOT EXISTS consent_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS age_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'profiles_relationship_intent_check'
    ) THEN
        ALTER TABLE profiles
            ADD CONSTRAINT profiles_relationship_intent_check
            CHECK (relationship_intent IN ('amistad', 'citas', 'relacion_seria', 'conocer_personas', 'aun_explorando'));
    END IF;
END $$;
