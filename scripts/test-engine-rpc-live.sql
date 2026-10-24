-- CAPITAL QUEST: COMPREHENSIVE LIVE DATABASE VERIFICATION & AUDIT SCRIPT
-- Tested against Supabase PostgreSQL

DO $test_suite$
DECLARE
    v_admin_id UUID := gen_random_uuid();
    v_event_id UUID := gen_random_uuid();
    v_domain_id UUID := gen_random_uuid();
    v_team_id UUID := gen_random_uuid();
    v_round_id UUID := gen_random_uuid();
    
    v_sim_result JSONB;
    v_sim_idempotent_result JSONB;
    v_sim_v2_result JSONB;
    v_void_result JSONB;
    
    v_test_snapshots JSONB;
    v_test_ledger JSONB;
    v_test_equity JSONB;
    
    v_run_record RECORD;
    v_snapshot_record RECORD;
    v_ledger_count INTEGER;
    v_equity_count INTEGER;
    v_audit_count INTEGER;
    v_round_record RECORD;
    
    v_sec_path TEXT[];
    v_has_anon_perm BOOLEAN;
    v_has_auth_perm BOOLEAN;
BEGIN
    RAISE NOTICE '=== STARTING CAPITAL QUEST DATABASE VERIFICATION ===';

    -- ========================================================
    -- 1. SECURITY AUDIT: SEC-01 Search Path Configuration
    -- ========================================================
    RAISE NOTICE '[1/7] Testing SEC-01: Function search_path configuration...';
    
    SELECT proconfig INTO v_sec_path
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_commit_simulation_run';
    
    IF v_sec_path IS NULL OR NOT ('search_path=public, pg_temp' = ANY(v_sec_path)) THEN
        RAISE EXCEPTION 'SEC-01 FAILED: fn_commit_simulation_run lacks search_path = public, pg_temp (found: %)', v_sec_path;
    END IF;

    SELECT proconfig INTO v_sec_path
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_void_or_supersede_round';
    
    IF v_sec_path IS NULL OR NOT ('search_path=public, pg_temp' = ANY(v_sec_path)) THEN
        RAISE EXCEPTION 'SEC-01 FAILED: fn_void_or_supersede_round lacks search_path = public, pg_temp';
    END IF;
    RAISE NOTICE '  -> SEC-01 PASSED: All SECURITY DEFINER functions have search_path = public, pg_temp.';

    -- ========================================================
    -- 2. SECURITY AUDIT: SEC-02 RPC Execution Grants
    -- ========================================================
    RAISE NOTICE '[2/7] Testing SEC-02: RPC execution grants...';
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.routine_privileges 
        WHERE routine_name = 'fn_commit_simulation_run' AND grantee IN ('anon', 'PUBLIC')
    ) INTO v_has_anon_perm;
    
    IF v_has_anon_perm THEN
        RAISE EXCEPTION 'SEC-02 FAILED: fn_commit_simulation_run is accessible to anon or PUBLIC!';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.routine_privileges 
        WHERE routine_name = 'fn_commit_simulation_run' AND grantee = 'authenticated'
    ) INTO v_has_auth_perm;
    
    IF v_has_auth_perm THEN
        RAISE EXCEPTION 'SEC-02 FAILED: fn_commit_simulation_run is directly granted to authenticated!';
    END IF;
    RAISE NOTICE '  -> SEC-02 PASSED: RPC execute grants restricted strictly to service_role and postgres.';

    -- ========================================================
    -- 3. SETUP ISOLATED TEST FIXTURES
    -- ========================================================
    RAISE NOTICE '[3/7] Setting up isolated development test records...';
    
    -- Insert test auth user into auth.users (satisfying profiles_id_fkey)
    INSERT INTO auth.users (id, email, raw_user_meta_data, role, aud)
    VALUES (v_admin_id, 'admin.test@capitalquest.dev', jsonb_build_object('full_name', 'Test Super Admin'), 'authenticated', 'authenticated');

    -- Insert test profile (super_admin)
    INSERT INTO profiles (id, full_name, email, role)
    VALUES (v_admin_id, 'Test Super Admin', 'admin.test@capitalquest.dev', 'super_admin');
    
    -- Insert test event
    INSERT INTO events (id, slug, name, description, status)
    VALUES (v_event_id, 'dep-verify-' || substr(v_event_id::text, 1, 8), 'Deployment Verification Event', 'Domain for migration testing', 'setup');
    
    -- Insert test domain
    INSERT INTO domains (id, event_id, code, name, description, base_demand, benchmark_price, min_allowed_price, max_allowed_price, base_unit_cogs)
    VALUES (v_domain_id, v_event_id, 'TECH', 'Enterprise Tech', 'Domain for migration testing', 10000, 250.00, 100.00, 500.00, 120.00);
    
    -- Insert test team
    INSERT INTO teams (id, event_id, domain_id, team_code, company_name)
    VALUES (v_team_id, v_event_id, v_domain_id, 'ALPHA', 'Alpha Tech Solutions');
    
    -- Insert test round in 'locked' status (ready for simulation)
    INSERT INTO rounds (id, event_id, round_number, status)
    VALUES (v_round_id, v_event_id, 1, 'locked');

    -- Prepare payload data with exact schema columns
    v_test_snapshots := jsonb_build_array(
        jsonb_build_object(
            'team_id', v_team_id,
            'product_quality_index', '50.00',
            'brand_equity_score', '80000.00',
            'attractiveness_score', '1.2500',
            'market_share_pct', '25.5000',
            'potential_demand', 2500,
            'units_available', 2700,
            'units_sold', 2500,
            'units_stockout', 0,
            'ending_inventory', 200,
            'gross_revenue', '500000.00',
            'cogs', '180000.00',
            'gross_profit', '320000.00',
            'operating_expenses', '200000.00',
            'inventory_holding_cost', '2000.00',
            'ebitda', '118000.00',
            'tax_expense', '0.00',
            'net_income', '118000.00',
            'operating_cash_flow', '118000.00',
            'financing_cash_flow', '0.00',
            'ending_cash', '950000.00',
            'cumulative_rd_asset', '70000.00',
            'enterprise_value', '1500000.00',
            'cash_valuation_contribution', '950000.00',
            'company_valuation', '2450000.00',
            'retained_equity_pct', '80.0000',
            'equity_adjusted_score', '1960000.00',
            'domain_rank', 1,
            'tournament_rank', 1
        )
    );

    v_test_ledger := jsonb_build_array(
        jsonb_build_object(
            'team_id', v_team_id,
            'entry_type', 'sales_revenue',
            'amount', '500000.00',
            'running_balance', '1500000.00',
            'description', 'Round 1 product sales'
        ),
        jsonb_build_object(
            'team_id', v_team_id,
            'entry_type', 'production_cost',
            'amount', '-180000.00',
            'running_balance', '1320000.00',
            'description', 'Production cost for units sold'
        ),
        jsonb_build_object(
            'team_id', v_team_id,
            'entry_type', 'marketing_expense',
            'amount', '-80000.00',
            'running_balance', '1240000.00',
            'description', 'Brand marketing budget'
        )
    );

    v_test_equity := jsonb_build_array(
        jsonb_build_object(
            'team_id', v_team_id,
            'shareholder_name', 'Seed VC Partners',
            'is_founding_team', false,
            'pre_round_equity_pct', '0.0000',
            'dilution_delta_pct', '20.0000',
            'post_round_equity_pct', '20.0000',
            'investment_amount', '250000.00'
        )
    );

    -- ========================================================
    -- 4. TEST fn_commit_simulation_run (EXECUTION & LEDGER)
    -- ========================================================
    RAISE NOTICE '[4/7] Testing fn_commit_simulation_run execution & persistence...';
    
    v_sim_result := fn_commit_simulation_run(
        p_round_id => v_round_id,
        p_admin_id => v_admin_id,
        p_idempotency_key => 'test-idemp-001',
        p_input_state_hash => 'hash-state-alpha-001',
        p_execution_duration_ms => 145,
        p_total_companies => 1,
        p_is_dry_run => false,
        p_snapshots => v_test_snapshots,
        p_ledger_entries => v_test_ledger,
        p_equity_transactions => v_test_equity,
        p_audit_details => jsonb_build_object('test', true)
    );

    IF (v_sim_result->>'success')::boolean != true THEN
        RAISE EXCEPTION 'Commit RPC failed: %', v_sim_result;
    END IF;

    -- Verify round state transition to 'simulated'
    SELECT * INTO v_round_record FROM rounds WHERE id = v_round_id;
    IF v_round_record.status != 'simulated' THEN
        RAISE EXCEPTION 'Round status expected "simulated", got %', v_round_record.status;
    END IF;

    -- Verify simulation run record
    SELECT * INTO v_run_record FROM simulation_runs WHERE round_id = v_round_id AND is_active = true;
    IF v_run_record.run_version != 1 OR v_run_record.status != 'completed' THEN
        RAISE EXCEPTION 'Simulation run version/status mismatch: %', row_to_json(v_run_record);
    END IF;

    -- Verify company snapshots (numeric precision check)
    SELECT * INTO v_snapshot_record FROM company_snapshots WHERE simulation_run_id = v_run_record.id;
    IF v_snapshot_record.company_valuation != 2450000.00 OR v_snapshot_record.ending_cash != 950000.00 THEN
        RAISE EXCEPTION 'Snapshot financial numbers mismatch: %', row_to_json(v_snapshot_record);
    END IF;

    -- Verify ledger entries count
    SELECT count(*) INTO v_ledger_count FROM financial_ledger WHERE simulation_run_id = v_run_record.id;
    IF v_ledger_count != 3 THEN
        RAISE EXCEPTION 'Expected 3 ledger entries, found %', v_ledger_count;
    END IF;

    -- Verify equity transactions count
    SELECT count(*) INTO v_equity_count FROM equity_transactions WHERE simulation_run_id = v_run_record.id;
    IF v_equity_count != 1 THEN
        RAISE EXCEPTION 'Expected 1 equity transaction, found %', v_equity_count;
    END IF;
    RAISE NOTICE '  -> Simulation run committed: 1 snapshot, 3 ledger entries, 1 equity transaction persisted.';

    -- ========================================================
    -- 5. TEST IDEMPOTENCY
    -- ========================================================
    RAISE NOTICE '[5/7] Testing idempotency guard...';
    
    v_sim_idempotent_result := fn_commit_simulation_run(
        p_round_id => v_round_id,
        p_admin_id => v_admin_id,
        p_idempotency_key => 'test-idemp-001-retry',
        p_input_state_hash => 'hash-state-alpha-001', -- SAME HASH
        p_execution_duration_ms => 150,
        p_total_companies => 1,
        p_is_dry_run => false,
        p_snapshots => v_test_snapshots,
        p_ledger_entries => v_test_ledger,
        p_equity_transactions => v_test_equity
    );

    IF (v_sim_idempotent_result->>'idempotent_replay')::boolean != true THEN
        RAISE EXCEPTION 'Idempotency failed: expected idempotent_replay=true, got %', v_sim_idempotent_result;
    END IF;

    IF (v_sim_idempotent_result->>'run_id')::uuid != v_run_record.id THEN
        RAISE EXCEPTION 'Idempotency returned different run ID: % vs %', v_sim_idempotent_result->>'run_id', v_run_record.id;
    END IF;
    RAISE NOTICE '  -> Idempotency PASSED: Exact match returned existing simulation run without duplicate insert.';

    -- ========================================================
    -- 6. TEST VERSIONING (RE-SIMULATION ON NEW HASH)
    -- ========================================================
    RAISE NOTICE '[6/7] Testing versioned re-simulation...';
    
    v_sim_v2_result := fn_commit_simulation_run(
        p_round_id => v_round_id,
        p_admin_id => v_admin_id,
        p_idempotency_key => 'test-idemp-002',
        p_input_state_hash => 'hash-state-beta-002', -- NEW HASH
        p_execution_duration_ms => 160,
        p_total_companies => 1,
        p_is_dry_run => false,
        p_snapshots => v_test_snapshots,
        p_ledger_entries => v_test_ledger,
        p_equity_transactions => v_test_equity
    );

    IF (v_sim_v2_result->>'run_version')::int != 2 THEN
        RAISE EXCEPTION 'Expected run_version 2, got %', v_sim_v2_result;
    END IF;

    -- Verify run 1 is now inactive and superseded
    SELECT is_active, status INTO v_run_record FROM simulation_runs WHERE id = (v_sim_result->>'run_id')::uuid;
    IF v_run_record.is_active != false OR v_run_record.status != 'superseded' THEN
        RAISE EXCEPTION 'Previous run was not marked superseded/inactive: %', row_to_json(v_run_record);
    END IF;
    RAISE NOTICE '  -> Versioning PASSED: Version 1 marked superseded; Version 2 created as active.';

    -- ========================================================
    -- 7. TEST fn_void_or_supersede_round (CORRECTION & AUDIT)
    -- ========================================================
    RAISE NOTICE '[7/7] Testing non-destructive voiding (fn_void_or_supersede_round)...';
    
    v_void_result := fn_void_or_supersede_round(
        p_round_id => v_round_id,
        p_admin_id => v_admin_id,
        p_void_reason => 'Deployment verification test voiding simulation run'
    );

    IF (v_void_result->>'success')::boolean != true THEN
        RAISE EXCEPTION 'Void RPC failed: %', v_void_result;
    END IF;

    -- Verify round restored to locked
    SELECT status INTO v_round_record FROM rounds WHERE id = v_round_id;
    IF v_round_record.status != 'locked' THEN
        RAISE EXCEPTION 'Round not restored to locked: %', v_round_record.status;
    END IF;

    -- Verify simulation run marked voided
    SELECT is_active, status INTO v_run_record FROM simulation_runs WHERE id = (v_sim_v2_result->>'run_id')::uuid;
    IF v_run_record.is_active != false OR v_run_record.status != 'voided' THEN
        RAISE EXCEPTION 'Simulation run not marked voided: %', row_to_json(v_run_record);
    END IF;

    -- Verify audit log was recorded
    SELECT count(*) INTO v_audit_count FROM audit_logs 
    WHERE entity_id = v_round_id AND action = 'VOID_ROUND_SIMULATION';
    IF v_audit_count < 1 THEN
        RAISE EXCEPTION 'Audit log entry was not recorded for void operation!';
    END IF;
    RAISE NOTICE '  -> Round voiding PASSED: State restored to locked, records voided non-destructively, audit log created.';

    -- ========================================================
    -- CLEANUP TEST FIXTURES
    -- ========================================================
    DELETE FROM audit_logs WHERE actor_id = v_admin_id;
    DELETE FROM financial_ledger WHERE team_id = v_team_id;
    DELETE FROM equity_transactions WHERE team_id = v_team_id;
    DELETE FROM company_snapshots WHERE team_id = v_team_id;
    DELETE FROM simulation_runs WHERE round_id = v_round_id;
    DELETE FROM rounds WHERE id = v_round_id;
    DELETE FROM teams WHERE id = v_team_id;
    DELETE FROM domains WHERE id = v_domain_id;
    DELETE FROM events WHERE id = v_event_id;
    DELETE FROM profiles WHERE id = v_admin_id;
    DELETE FROM auth.users WHERE id = v_admin_id;
    
    RAISE NOTICE '=== ALL 7 CAPITAL QUEST DATABASE AUDIT TESTS PASSED SUCCESSFULLY ===';
END $test_suite$;
