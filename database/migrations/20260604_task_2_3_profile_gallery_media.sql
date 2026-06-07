ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS gallery_urls TEXT[];

UPDATE profiles
SET gallery_urls = '{}'
WHERE gallery_urls IS NULL;

ALTER TABLE profiles
    ALTER COLUMN gallery_urls SET DEFAULT '{}',
    ALTER COLUMN gallery_urls SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'profiles_gallery_urls_max_6_check'
    ) THEN
        ALTER TABLE profiles
            ADD CONSTRAINT profiles_gallery_urls_max_6_check
            CHECK (cardinality(gallery_urls) <= 6);
    END IF;
END $$;

COMMENT ON COLUMN profiles.avatar_url IS
    'Puede guardar una URL directa o una referencia storage:avatars/... para resolverse con Signed URL en cliente.';

COMMENT ON COLUMN profiles.gallery_urls IS
    'Lista de hasta 6 referencias storage:covers/... o URLs directas. Requiere buckets privados avatars/covers y políticas de storage activas.';
