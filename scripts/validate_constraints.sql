CREATE OR REPLACE FUNCTION public.handle_new_user_provisioning()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    workspace_name TEXT;
    email_company  TEXT;
BEGIN
    email_company := NULLIF(
        BTRIM(split_part(split_part(LOWER(COALESCE(NEW.email, '')), '@', 2), '.', 1)),
        ''
    );

    workspace_name := NULLIF(BTRIM(COALESCE(
        NEW.raw_user_meta_data->>'workspace_name',
        NEW.raw_user_meta_data->>'company_name',
        ''
    )), '');

    workspace_name := COALESCE(
        workspace_name,
        CASE
            WHEN email_company IS NOT NULL THEN INITCAP(email_company) || ' Workspace'
            ELSE 'Workspace'
        END
    );

    PERFORM public.provision_initial_workspace(NEW.id, workspace_name);

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user_provisioning() FROM PUBLIC;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user_provisioning();
