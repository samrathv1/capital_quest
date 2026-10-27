-- CAPITAL QUEST — DEVELOPMENT ENVIRONMENT TOURNAMENT SEED SCRIPT
-- Provisions default event, domains, rounds, sample teams, and staff accounts.

DO $seed_tournament$
DECLARE
    v_admin_id UUID := gen_random_uuid();
    v_vol_id UUID := gen_random_uuid();
    v_event_id UUID := gen_random_uuid();
    
    v_clean_id UUID := gen_random_uuid();
    v_health_id UUID := gen_random_uuid();
    v_saas_id UUID := gen_random_uuid();
    v_d2c_id UUID := gen_random_uuid();
    
    v_team_ct1 UUID := gen_random_uuid();
    v_team_ct2 UUID := gen_random_uuid();
    v_team_ht1 UUID := gen_random_uuid();
    v_team_ht2 UUID := gen_random_uuid();
    v_team_saas1 UUID := gen_random_uuid();
    v_team_saas2 UUID := gen_random_uuid();
    v_team_d2c1 UUID := gen_random_uuid();
    v_team_d2c2 UUID := gen_random_uuid();
    
    v_round1_id UUID := gen_random_uuid();
    v_round2_id UUID := gen_random_uuid();
    v_round3_id UUID := gen_random_uuid();
    v_round4_id UUID := gen_random_uuid();
    v_round5_id UUID := gen_random_uuid();
BEGIN
    RAISE NOTICE '=== SEEDING CAPITAL QUEST DEVELOPMENT ENVIRONMENT ===';

    -- 1. STAFF ACCOUNTS
    -- 1.1 Super Admin: admin@capitalquest.dev
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@capitalquest.dev') THEN
        INSERT INTO auth.users (id, email, raw_user_meta_data, role, aud, encrypted_password, email_confirmed_at)
        VALUES (
            v_admin_id,
            'admin@capitalquest.dev',
            jsonb_build_object('full_name', 'Lead Super Administrator'),
            'authenticated',
            'authenticated',
            crypt('CapitalQuest2026!', gen_salt('bf')),
            timezone('utc', now())
        );
        INSERT INTO public.profiles (id, email, full_name, role, is_active)
        VALUES (v_admin_id, 'admin@capitalquest.dev', 'Lead Super Administrator', 'super_admin', true);
    ELSE
        SELECT id INTO v_admin_id FROM auth.users WHERE email = 'admin@capitalquest.dev';
        UPDATE public.profiles SET role = 'super_admin', is_active = true WHERE id = v_admin_id;
    END IF;

    -- 1.2 Volunteer: volunteer@capitalquest.dev
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'volunteer@capitalquest.dev') THEN
        INSERT INTO auth.users (id, email, raw_user_meta_data, role, aud, encrypted_password, email_confirmed_at)
        VALUES (
            v_vol_id,
            'volunteer@capitalquest.dev',
            jsonb_build_object('full_name', 'Volunteer Operator Alpha'),
            'authenticated',
            'authenticated',
            crypt('CapitalQuest2026!', gen_salt('bf')),
            timezone('utc', now())
        );
        INSERT INTO public.profiles (id, email, full_name, role, is_active)
        VALUES (v_vol_id, 'volunteer@capitalquest.dev', 'Volunteer Operator Alpha', 'volunteer', true);
    END IF;

    -- 2. TOURNAMENT EVENT
    IF NOT EXISTS (SELECT 1 FROM public.events WHERE slug = 'capital-quest-2026') THEN
        INSERT INTO public.events (
            id, slug, name, description, status, total_rounds, starting_capital, starting_valuation, active_round_number, created_by
        ) VALUES (
            v_event_id,
            'capital-quest-2026',
            'Capital Quest 2026 Championship',
            'Annual inter-collegiate entrepreneurship simulation championship',
            'setup',
            5,
            1000000.00,
            200000.00,
            1,
            v_admin_id
        );

        -- 3. DOMAINS (3 Active Approved Archetypes + 1 Archived Legacy Archetype)
        INSERT INTO public.domains (id, event_id, code, name, description, is_active, base_demand, benchmark_price, min_allowed_price, max_allowed_price, base_unit_cogs, rd_elasticity, mkt_elasticity, price_elasticity)
        VALUES 
            (v_clean_id, v_event_id, 'CLEAN', 'CleanTech Hardware', 'Grid batteries & solar hardware solutions (Archived legacy domain)', false, 10000, 1000.00, 500.00, 2000.00, 200.00, 0.75, 0.75, 1.20),
            (v_health_id, v_event_id, 'HEALTH', 'HealthTech Devices', 'Point-of-care diagnostics & wearable medical devices', true, 12000, 2500.00, 1600.00, 3800.00, 1100.00, 1.10, 0.50, 0.85),
            (v_saas_id, v_event_id, 'SAAS', 'Enterprise SaaS & AI', 'B2B workflow automation & analytics platforms', true, 60000, 350.00, 200.00, 600.00, 25.00, 0.75, 0.85, 1.45),
            (v_d2c_id, v_event_id, 'D2C', 'D2C Consumer Goods', 'Eco-friendly consumer lifestyle products', true, 120000, 65.00, 40.00, 110.00, 28.00, 0.45, 1.15, 1.80);

        -- 4. ROUNDS (Round 1 OPEN, Rounds 2-5 DRAFT)
        INSERT INTO public.rounds (id, event_id, round_number, type, status, opened_at)
        VALUES 
            (v_round1_id, v_event_id, 1, 'regular', 'open', timezone('utc', now())),
            (v_round2_id, v_event_id, 2, 'investment_seed', 'draft', null),
            (v_round3_id, v_event_id, 3, 'regular', 'draft', null),
            (v_round4_id, v_event_id, 4, 'investment_series_a', 'draft', null),
            (v_round5_id, v_event_id, 5, 'final_harvest', 'draft', null);

        -- 5. INITIAL COMPETING TEAMS (2 per Domain)
        INSERT INTO public.teams (id, event_id, domain_id, team_code, company_name, table_station)
        VALUES 
            (v_team_ct1, v_event_id, v_clean_id, 'CT-01', 'HelioGrid Energy', '1A'),
            (v_team_ct2, v_event_id, v_clean_id, 'CT-02', 'AeroVolt Dynamics', '1B'),
            (v_team_ht1, v_event_id, v_health_id, 'HT-01', 'BioPulse Therapeutics', '2A'),
            (v_team_ht2, v_event_id, v_health_id, 'HT-02', 'NeuroVital Diagnostics', '2B'),
            (v_team_saas1, v_event_id, v_saas_id, 'SAAS-01', 'Synthetix Cloud', '3A'),
            (v_team_saas2, v_event_id, v_saas_id, 'SAAS-02', 'DataWeave AI', '3B'),
            (v_team_d2c1, v_event_id, v_d2c_id, 'D2C-01', 'Verde Botanicals', '4A'),
            (v_team_d2c2, v_event_id, v_d2c_id, 'D2C-02', 'Lumina Lifestyle', '4B');

        -- 6. SAMPLE ROSTER MEMBERS
        INSERT INTO public.team_members (team_id, full_name, email, role_title)
        VALUES 
            (v_team_ct1, 'Alex Mercer', 'alex.mercer@univ.edu', 'Chief Executive Officer'),
            (v_team_ct1, 'Samira Khan', 'samira.khan@univ.edu', 'Chief Technology Officer'),
            (v_team_saas1, 'Marcus Vance', 'marcus.v@univ.edu', 'Founder & Lead Architect');

        RAISE NOTICE 'SUCCESS: Capital Quest 2026 event seeded with 4 domains, 5 rounds, and 8 teams.';
    ELSE
        RAISE NOTICE 'Event already exists. Skipping duplication.';
    END IF;
END $seed_tournament$;
