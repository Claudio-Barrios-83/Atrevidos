CREATE OR REPLACE FUNCTION validate_report_target()
RETURNS TRIGGER AS $$
DECLARE
    target_owner_id UUID;
BEGIN
    IF NEW.reporter_id IS NULL OR NEW.target_id IS NULL OR NEW.target_type IS NULL THEN
        RAISE EXCEPTION 'No pudimos identificar qué quieres reportar. Inténtalo de nuevo.';
    END IF;

    CASE NEW.target_type
        WHEN 'user' THEN
            SELECT id INTO target_owner_id
            FROM profiles
            WHERE id = NEW.target_id;
        WHEN 'post' THEN
            SELECT user_id INTO target_owner_id
            FROM posts
            WHERE id = NEW.target_id;
        WHEN 'comment' THEN
            SELECT user_id INTO target_owner_id
            FROM comments
            WHERE id = NEW.target_id;
        WHEN 'message' THEN
            SELECT sender_id INTO target_owner_id
            FROM messages
            WHERE id = NEW.target_id;
        ELSE
            RAISE EXCEPTION 'No pudimos identificar qué quieres reportar. Inténtalo de nuevo.';
    END CASE;

    IF target_owner_id IS NULL THEN
        RAISE EXCEPTION 'No pudimos identificar qué quieres reportar. Inténtalo de nuevo.';
    END IF;

    IF target_owner_id = NEW.reporter_id THEN
        RAISE EXCEPTION 'No puedes reportarte a ti misma/o.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_report_target_trigger ON reports;
CREATE TRIGGER validate_report_target_trigger
    BEFORE INSERT ON reports
    FOR EACH ROW EXECUTE FUNCTION validate_report_target();
