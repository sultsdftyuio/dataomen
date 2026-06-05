-- 1. Create the trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user_provisioning()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    default_workspace_name text;
BEGIN
    -- Try to get company name from metadata, fallback to email prefix
    default_workspace_name := COALESCE(
        NEW.raw_user_meta_data->>'company_name',
        split_part(NEW.email, '@', 1) || '''s Workspace'
    );

    -- Call your existing race-safe RPC
    PERFORM public.provision_initial_workspace(NEW.id, default_workspace_name);

    RETURN NEW;
END;
$$;

-- 2. Attach the trigger to Supabase Auth
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user_provisioning();