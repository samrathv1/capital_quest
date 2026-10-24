-- CAPITAL QUEST — SECURE SUPER ADMIN PROVISIONING SCRIPT
-- Usage: Run via `npx supabase db query --linked --file scripts/provision-super-admin.sql`
-- Or execute directly in Supabase SQL Editor.
-- Note: Replaces 'admin@capitalquest.dev' with the administrator's authorized email.

DO $admin_provision$
DECLARE
    v_admin_email TEXT := 'admin@capitalquest.dev';
    v_admin_id UUID;
BEGIN
    -- 1. Check if user exists in auth.users
    SELECT id INTO v_admin_id FROM auth.users WHERE email = v_admin_email;

    IF v_admin_id IS NULL THEN
        -- Generate new auth user UUID
        v_admin_id := gen_random_uuid();
        
        -- Insert user into auth.users (development mode)
        INSERT INTO auth.users (
            id, email, raw_user_meta_data, role, aud, encrypted_password, email_confirmed_at, created_at, updated_at
        ) VALUES (
            v_admin_id,
            v_admin_email,
            jsonb_build_object('full_name', 'Lead Super Administrator'),
            'authenticated',
            'authenticated',
            crypt('CapitalQuest2026!', gen_salt('bf')),
            timezone('utc', now()),
            timezone('utc', now()),
            timezone('utc', now())
        );
        RAISE NOTICE 'Created auth.users record for % (UID: %)', v_admin_email, v_admin_id;
    END IF;

    -- 2. Upsert super_admin profile in public.profiles
    INSERT INTO public.profiles (id, email, full_name, role, is_active)
    VALUES (v_admin_id, v_admin_email, 'Lead Super Administrator', 'super_admin', true)
    ON CONFLICT (id) DO UPDATE 
    SET role = 'super_admin', is_active = true, updated_at = timezone('utc', now());

    RAISE NOTICE 'SUCCESS: % successfully provisioned with role super_admin.', v_admin_email;
END $admin_provision$;
