-- CAPITAL QUEST — ATOMIC SIMULATION TRANSACTION COMMIT RPC
-- Migration: 20261021000001_simulation_commit_rpc.sql
-- Reference: CQ-SPEC-04, CQ-SPEC-07

CREATE OR REPLACE FUNCTION fn_commit_simulation_run(
    p_round_id UUID,
    p_admin_id UUID,
    p_idempotency_key TEXT,
    p_input_state_hash TEXT,
    p_execution_duration_ms INTEGER,
    p_total_companies INTEGER,
    p_is_dry_run BOOLEAN,
    p_snapshots JSONB,
    p_ledger_entries JSONB,
    p_equity_transactions JSONB,
    p_audit_details JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB AS $$
DECLARE
    v_round rounds%ROWTYPE;
    v_new_run_id UUID;
    v_next_version INTEGER := 1;
    v_existing_active_run simulation_runs%ROWTYPE;
    v_inserted_snapshots INTEGER := 0;
    v_inserted_ledger INTEGER := 0;
    v_inserted_equity INTEGER := 0;
BEGIN
    -- 1. ADVISORY LOCK: Prevent race conditions across parallel simulation triggers
    PERFORM pg_advisory_xact_lock(hashtext('capital_quest_sim_' || p_round_id::text));

    -- 2. VERIFY CALLER IS SUPER ADMIN
    IF (SELECT role FROM profiles WHERE id = p_admin_id) != 'super_admin' THEN
        RAISE EXCEPTION 'Unauthorized: Only Super Admin can execute and commit simulations.';
    END IF;

    -- 3. FETCH AND LOCK TARGET ROUND
    SELECT * INTO v_round FROM rounds WHERE id = p_round_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target round not found: %', p_round_id;
    END IF;

    IF v_round.status NOT IN ('locked', 'simulated') THEN
        RAISE EXCEPTION 'Invalid round state for simulation: %. Round must be locked or simulated.', v_round.status;
    END IF;

    -- 4. IDEMPOTENCY CHECK: If identical input hash was already processed and active
    SELECT * INTO v_existing_active_run 
    FROM simulation_runs 
    WHERE round_id = p_round_id 
      AND input_state_hash = p_input_state_hash 
      AND is_active = true 
      AND status = 'completed';

    IF FOUND AND NOT p_is_dry_run THEN
        RETURN jsonb_build_object(
            'success', true,
            'idempotent', true,
            'message', 'Simulation input hash identical to current active run. Returned existing run.',
            'run_id', v_existing_active_run.id,
            'run_version', v_existing_active_run.run_version,
            'status', 'simulated'
        );
    END IF;

    -- 5. DRY RUN HANDLING
    IF p_is_dry_run THEN
        RETURN jsonb_build_object(
            'success', true,
            'is_dry_run', true,
            'message', 'Dry run executed successfully without persisting results.',
            'total_companies_simulated', p_total_companies,
            'input_state_hash', p_input_state_hash
        );
    END IF;

    -- 6. DETERMINE NEXT RUN VERSION
    SELECT COALESCE(MAX(run_version), 0) + 1 INTO v_next_version 
    FROM simulation_runs 
    WHERE round_id = p_round_id;

    -- 7. SUPERSEDE OLD ACTIVE RUNS & SNAPSHOTS NON-DESTRUCTIVELY
    UPDATE simulation_runs 
    SET is_active = false, 
        status = 'superseded',
        void_reason = 'Superseded by run version ' || v_next_version
    WHERE round_id = p_round_id AND is_active = true;

    UPDATE company_snapshots 
    SET is_active = false 
    WHERE round_id = p_round_id AND is_active = true;

    UPDATE financial_ledger 
    SET is_voided = true, 
        voided_at = timezone('utc', now()), 
        void_reason = 'Superseded by simulation run v' || v_next_version 
    WHERE round_id = p_round_id AND is_voided = false;

    UPDATE equity_transactions 
    SET is_voided = true 
    WHERE round_id = p_round_id AND is_voided = false;

    -- 8. CREATE NEW SIMULATION RUN RECORD
    INSERT INTO simulation_runs (
        round_id, executed_by, idempotency_key, run_version, is_active,
        input_state_hash, execution_duration_ms, total_companies_simulated,
        is_dry_run, status
    ) VALUES (
        p_round_id, p_admin_id, p_idempotency_key, v_next_version, true,
        p_input_state_hash, p_execution_duration_ms, p_total_companies,
        false, 'completed'
    ) RETURNING id INTO v_new_run_id;

    -- 9. PERSIST COMPANY SNAPSHOTS
    INSERT INTO company_snapshots (
        round_id, team_id, simulation_run_id, snapshot_version, is_active,
        product_quality_index, brand_equity_score, attractiveness_score,
        market_share_pct, potential_demand, units_available, units_sold,
        units_stockout, ending_inventory, gross_revenue, cogs,
        gross_profit, operating_expenses, inventory_holding_cost,
        ebitda, tax_expense, net_income, operating_cash_flow,
        financing_cash_flow, ending_cash, cumulative_rd_asset,
        enterprise_value, cash_valuation_contribution, company_valuation,
        retained_equity_pct, equity_adjusted_score, domain_rank, tournament_rank
    )
    SELECT 
        p_round_id,
        (elem->>'team_id')::UUID,
        v_new_run_id,
        v_next_version,
        true,
        (elem->>'product_quality_index')::NUMERIC(7, 2),
        (elem->>'brand_equity_score')::NUMERIC(15, 2),
        (elem->>'attractiveness_score')::NUMERIC(15, 4),
        (elem->>'market_share_pct')::NUMERIC(7, 4),
        (elem->>'potential_demand')::INTEGER,
        (elem->>'units_available')::INTEGER,
        (elem->>'units_sold')::INTEGER,
        (elem->>'units_stockout')::INTEGER,
        (elem->>'ending_inventory')::INTEGER,
        (elem->>'gross_revenue')::NUMERIC(15, 2),
        (elem->>'cogs')::NUMERIC(15, 2),
        (elem->>'gross_profit')::NUMERIC(15, 2),
        (elem->>'operating_expenses')::NUMERIC(15, 2),
        (elem->>'inventory_holding_cost')::NUMERIC(15, 2),
        (elem->>'ebitda')::NUMERIC(15, 2),
        (elem->>'tax_expense')::NUMERIC(15, 2),
        (elem->>'net_income')::NUMERIC(15, 2),
        (elem->>'operating_cash_flow')::NUMERIC(15, 2),
        (elem->>'financing_cash_flow')::NUMERIC(15, 2),
        (elem->>'ending_cash')::NUMERIC(15, 2),
        (elem->>'cumulative_rd_asset')::NUMERIC(15, 2),
        (elem->>'enterprise_value')::NUMERIC(15, 2),
        (elem->>'cash_valuation_contribution')::NUMERIC(15, 2),
        (elem->>'company_valuation')::NUMERIC(15, 2),
        (elem->>'retained_equity_pct')::NUMERIC(7, 4),
        (elem->>'equity_adjusted_score')::NUMERIC(18, 2),
        (elem->>'domain_rank')::INTEGER,
        (elem->>'tournament_rank')::INTEGER
    FROM jsonb_array_elements(p_snapshots) AS elem;
    GET DIAGNOSTICS v_inserted_snapshots = ROW_COUNT;

    -- 10. PERSIST FINANCIAL LEDGER
    INSERT INTO financial_ledger (
        event_id, round_id, team_id, entry_type, amount,
        running_balance, reference_id, simulation_run_id,
        is_voided, description
    )
    SELECT 
        v_round.event_id,
        p_round_id,
        (elem->>'team_id')::UUID,
        (elem->>'entry_type')::ledger_entry_type,
        (elem->>'amount')::NUMERIC(15, 2),
        (elem->>'running_balance')::NUMERIC(15, 2),
        NULLIF(elem->>'reference_id', '')::UUID,
        v_new_run_id,
        false,
        (elem->>'description')::TEXT
    FROM jsonb_array_elements(p_ledger_entries) AS elem;
    GET DIAGNOSTICS v_inserted_ledger = ROW_COUNT;

    -- 11. PERSIST EQUITY TRANSACTIONS
    IF jsonb_array_length(p_equity_transactions) > 0 THEN
        INSERT INTO equity_transactions (
            team_id, round_id, simulation_run_id, shareholder_name,
            is_founding_team, pre_round_equity_pct, dilution_delta_pct,
            post_round_equity_pct, investment_amount, is_voided
        )
        SELECT 
            (elem->>'team_id')::UUID,
            p_round_id,
            v_new_run_id,
            (elem->>'shareholder_name')::TEXT,
            (elem->>'is_founding_team')::BOOLEAN,
            (elem->>'pre_round_equity_pct')::NUMERIC(7, 4),
            (elem->>'dilution_delta_pct')::NUMERIC(7, 4),
            (elem->>'post_round_equity_pct')::NUMERIC(7, 4),
            (elem->>'investment_amount')::NUMERIC(15, 2),
            false
        FROM jsonb_array_elements(p_equity_transactions) AS elem;
        GET DIAGNOSTICS v_inserted_equity = ROW_COUNT;
    END IF;

    -- 12. UPDATE ROUND STATE TO 'simulated'
    UPDATE rounds 
    SET status = 'simulated', 
        simulated_at = timezone('utc', now()) 
    WHERE id = p_round_id;

    -- 13. AUDIT LOG RECORD
    INSERT INTO audit_logs (actor_id, action, entity_name, entity_id, before_state, after_state)
    VALUES (
        p_admin_id,
        'EXECUTE_SIMULATION',
        'rounds',
        p_round_id,
        jsonb_build_object('status', v_round.status),
        jsonb_build_object(
            'status', 'simulated',
            'simulation_run_id', v_new_run_id,
            'run_version', v_next_version,
            'total_companies', p_total_companies,
            'snapshots_persisted', v_inserted_snapshots,
            'ledger_rows_persisted', v_inserted_ledger,
            'equity_rows_persisted', v_inserted_equity
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'round_id', p_round_id,
        'run_id', v_new_run_id,
        'run_version', v_next_version,
        'status', 'simulated',
        'snapshots_count', v_inserted_snapshots,
        'ledger_count', v_inserted_ledger,
        'equity_count', v_inserted_equity
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
