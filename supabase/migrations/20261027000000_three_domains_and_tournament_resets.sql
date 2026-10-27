-- CAPITAL QUEST — FORWARD-ONLY MIGRATION: THREE-DOMAIN STANDARDIZATION, DURABLE BACKUPS & SECURE TOURNAMENT RESETS
-- Migration: 20261027000000_three_domains_and_tournament_resets.sql
-- Reference: CQ-SPEC-02, CQ-SPEC-05, CQ-SPEC-08, CQ-SPEC-11

-- ============================================================================
-- 1. DOMAINS: ACTIVE DOMAIN ENFORCEMENT & ARCHIVING
-- ============================================================================

-- Add is_active column to domains if not present
ALTER TABLE public.domains 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Archive / mark CleanTech & Hardware as inactive while preserving all historical records & foreign keys
UPDATE public.domains 
SET is_active = false 
WHERE upper(trim(code)) IN ('CLEAN', 'CLEANTECH');

-- Index for active domain lookups
CREATE INDEX IF NOT EXISTS idx_domains_event_active ON public.domains(event_id, is_active);

-- ============================================================================
-- 2. DURABLE RECOVERY: TOURNAMENT BACKUPS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tournament_backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    operation_id UUID NOT NULL DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    created_by UUID REFERENCES public.profiles(id),
    backup_version TEXT NOT NULL DEFAULT '1.0',
    checksum TEXT NOT NULL,
    record_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
    payload JSONB NOT NULL,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    restored_at TIMESTAMPTZ,
    restored_by UUID REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_tournament_backups_event ON public.tournament_backups(event_id, created_at DESC);

ALTER TABLE public.tournament_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tournament_backups_super_admin ON public.tournament_backups;
CREATE POLICY tournament_backups_super_admin ON public.tournament_backups
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() 
              AND role = 'super_admin' 
              AND is_active = true
        )
    );

GRANT ALL ON public.tournament_backups TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.tournament_backups TO authenticated;

-- ============================================================================
-- 3. ATOMIC RPC: RESTORE TOURNAMENT FROM DURABLE BACKUP
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_restore_tournament_from_backup(
    p_backup_id UUID,
    p_actor_id UUID DEFAULT NULL,
    p_confirm_overwrite BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_backup RECORD;
    v_effective_actor_id UUID;
    v_event_id UUID;
    v_item RECORD;
    v_has_newer_run BOOLEAN := false;
    v_has_in_progress_simulation BOOLEAN := false;
    v_decisions_restored INTEGER := 0;
    v_sim_runs_restored INTEGER := 0;
    v_snapshots_restored INTEGER := 0;
    v_ledger_restored INTEGER := 0;
    v_equity_restored INTEGER := 0;
BEGIN
    -- 1. Determine effective actor (auth.uid() or service_role authorized p_actor_id)
    v_effective_actor_id := auth.uid();
    IF v_effective_actor_id IS NULL THEN
        IF COALESCE(current_setting('request.jwt.claim.role', true), '') IN ('service_role', 'supabase_admin') OR current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
            v_effective_actor_id := p_actor_id;
        ELSE
            RAISE EXCEPTION 'Access denied: Direct unauthenticated execution of administrative restore is prohibited.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- 2. Enforce super_admin authorization
    IF v_effective_actor_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = v_effective_actor_id 
          AND role = 'super_admin' 
          AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Access denied: Only active Super Administrators can restore tournament backups.'
            USING ERRCODE = '42501';
    END IF;

    -- 3. Lock and retrieve backup record
    SELECT * INTO v_backup
    FROM public.tournament_backups
    WHERE id = p_backup_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tournament backup not found: %', p_backup_id
            USING ERRCODE = 'P0002';
    END IF;

    IF NOT v_backup.is_verified THEN
        RAISE EXCEPTION 'Cannot restore unverified backup: %', p_backup_id
            USING ERRCODE = '23503';
    END IF;

    v_event_id := v_backup.event_id;

    -- 4. Lock event and rounds
    PERFORM id FROM public.events WHERE id = v_event_id FOR UPDATE;
    PERFORM id FROM public.rounds WHERE event_id = v_event_id FOR UPDATE;

    -- 4.1 Guard against active in-progress simulation
    SELECT EXISTS (
        SELECT 1 FROM public.simulation_runs sr
        JOIN public.rounds r ON r.id = sr.round_id
        WHERE r.event_id = v_event_id
          AND sr.status IN ('in_progress', 'running')
    ) INTO v_has_in_progress_simulation;

    IF v_has_in_progress_simulation THEN
        RAISE EXCEPTION 'Cannot restore tournament: A simulation run is currently in progress for this event.'
            USING ERRCODE = '55000';
    END IF;

    -- 4.2 Guard against silently overwriting a newer tournament run without explicit confirmation
    SELECT EXISTS (
        SELECT 1 FROM public.simulation_runs sr
        JOIN public.rounds r ON r.id = sr.round_id
        WHERE r.event_id = v_event_id
          AND sr.created_at > v_backup.created_at
    ) OR EXISTS (
        SELECT 1 FROM public.rounds
        WHERE event_id = v_event_id
          AND status IN ('simulated', 'reviewed', 'published')
          AND COALESCE(published_at, simulated_at, locked_at, opened_at, created_at) > v_backup.created_at
    ) INTO v_has_newer_run;

    IF v_has_newer_run AND NOT p_confirm_overwrite THEN
        RAISE EXCEPTION 'Cannot restore backup: The current tournament has newer simulation progress or published rounds. Explicit confirmation (p_confirm_overwrite = true) is required to overwrite newer tournament progress.'
            USING ERRCODE = '55000';
    END IF;

    -- 5. Wipe post-reset simulation / decision state to prepare clean restore
    DELETE FROM public.financial_ledger WHERE event_id = v_event_id;
    DELETE FROM public.equity_transactions WHERE round_id IN (SELECT id FROM public.rounds WHERE event_id = v_event_id);
    DELETE FROM public.company_snapshots WHERE round_id IN (SELECT id FROM public.rounds WHERE event_id = v_event_id);
    DELETE FROM public.simulation_runs WHERE round_id IN (SELECT id FROM public.rounds WHERE event_id = v_event_id);
    DELETE FROM public.decisions WHERE round_id IN (SELECT id FROM public.rounds WHERE event_id = v_event_id);

    -- 6. Restore event header
    IF v_backup.payload ? 'event' AND v_backup.payload->'event' IS NOT NULL THEN
        UPDATE public.events
        SET status = (v_backup.payload->'event'->>'status')::event_status,
            active_round_number = (v_backup.payload->'event'->>'active_round_number')::INTEGER,
            updated_at = timezone('utc', now())
        WHERE id = v_event_id;
    END IF;

    -- 7. Restore round states
    IF v_backup.payload ? 'rounds' AND jsonb_typeof(v_backup.payload->'rounds') = 'array' THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_backup.payload->'rounds') LOOP
            UPDATE public.rounds
            SET status = (v_item.value->>'status')::round_status,
                opened_at = CASE WHEN v_item.value->>'opened_at' IS NOT NULL THEN (v_item.value->>'opened_at')::TIMESTAMPTZ ELSE NULL END,
                locked_at = CASE WHEN v_item.value->>'locked_at' IS NOT NULL THEN (v_item.value->>'locked_at')::TIMESTAMPTZ ELSE NULL END,
                simulated_at = CASE WHEN v_item.value->>'simulated_at' IS NOT NULL THEN (v_item.value->>'simulated_at')::TIMESTAMPTZ ELSE NULL END,
                published_at = CASE WHEN v_item.value->>'published_at' IS NOT NULL THEN (v_item.value->>'published_at')::TIMESTAMPTZ ELSE NULL END
            WHERE id = (v_item.value->>'id')::UUID;
        END LOOP;
    END IF;

    -- 8. Restore decisions
    IF v_backup.payload ? 'decisions' AND jsonb_typeof(v_backup.payload->'decisions') = 'array' THEN
        INSERT INTO public.decisions (
            id, round_id, team_id, status, marketing_budget, rd_budget,
            production_units, unit_price, operations_budget, investment_decision,
            entered_by, entered_at, verified_by, verified_at, admin_override_notes,
            created_at, updated_at
        )
        SELECT
            (d->>'id')::UUID, (d->>'round_id')::UUID, (d->>'team_id')::UUID,
            (d->>'status')::decision_status, (d->>'marketing_budget')::NUMERIC, (d->>'rd_budget')::NUMERIC,
            (d->>'production_units')::INTEGER, (d->>'unit_price')::NUMERIC, (d->>'operations_budget')::NUMERIC,
            (d->>'investment_decision')::investment_choice,
            CASE WHEN d->>'entered_by' IS NOT NULL THEN (d->>'entered_by')::UUID ELSE NULL END,
            CASE WHEN d->>'entered_at' IS NOT NULL THEN (d->>'entered_at')::TIMESTAMPTZ ELSE NULL END,
            CASE WHEN d->>'verified_by' IS NOT NULL THEN (d->>'verified_by')::UUID ELSE NULL END,
            CASE WHEN d->>'verified_at' IS NOT NULL THEN (d->>'verified_at')::TIMESTAMPTZ ELSE NULL END,
            d->>'admin_override_notes',
            (d->>'created_at')::TIMESTAMPTZ, (d->>'updated_at')::TIMESTAMPTZ
        FROM jsonb_array_elements(v_backup.payload->'decisions') AS d;

        GET DIAGNOSTICS v_decisions_restored = ROW_COUNT;
    END IF;

    -- 9. Restore simulation runs
    IF v_backup.payload ? 'simulationRuns' AND jsonb_typeof(v_backup.payload->'simulationRuns') = 'array' THEN
        INSERT INTO public.simulation_runs (
            id, round_id, executed_by, idempotency_key, run_version, is_active,
            input_state_hash, execution_duration_ms, total_companies_simulated,
            is_dry_run, status, void_reason, error_payload, created_at
        )
        SELECT
            (s->>'id')::UUID, (s->>'round_id')::UUID, (s->>'executed_by')::UUID,
            s->>'idempotency_key', (s->>'run_version')::INTEGER, (s->>'is_active')::BOOLEAN,
            s->>'input_state_hash', (s->>'execution_duration_ms')::INTEGER, (s->>'total_companies_simulated')::INTEGER,
            (s->>'is_dry_run')::BOOLEAN, s->>'status', s->>'void_reason', s->'error_payload',
            (s->>'created_at')::TIMESTAMPTZ
        FROM jsonb_array_elements(v_backup.payload->'simulationRuns') AS s;

        GET DIAGNOSTICS v_sim_runs_restored = ROW_COUNT;
    END IF;

    -- 10. Restore company snapshots
    IF v_backup.payload ? 'companySnapshots' AND jsonb_typeof(v_backup.payload->'companySnapshots') = 'array' THEN
        INSERT INTO public.company_snapshots (
            id, round_id, team_id, simulation_run_id, snapshot_version, is_active,
            product_quality_index, brand_equity_score, attractiveness_score, market_share_pct,
            potential_demand, units_available, units_sold, units_stockout, ending_inventory,
            gross_revenue, cogs, gross_profit, operating_expenses, inventory_holding_cost,
            ebitda, tax_expense, net_income, operating_cash_flow, financing_cash_flow,
            ending_cash, cumulative_rd_asset, enterprise_value, cash_valuation_contribution,
            company_valuation, retained_equity_pct, equity_adjusted_score, domain_rank, tournament_rank,
            created_at
        )
        SELECT
            (cs->>'id')::UUID, (cs->>'round_id')::UUID, (cs->>'team_id')::UUID,
            CASE WHEN cs->>'simulation_run_id' IS NOT NULL THEN (cs->>'simulation_run_id')::UUID ELSE NULL END,
            (cs->>'snapshot_version')::INTEGER, (cs->>'is_active')::BOOLEAN,
            (cs->>'product_quality_index')::NUMERIC, (cs->>'brand_equity_score')::NUMERIC,
            (cs->>'attractiveness_score')::NUMERIC, (cs->>'market_share_pct')::NUMERIC,
            (cs->>'potential_demand')::INTEGER, (cs->>'units_available')::INTEGER,
            (cs->>'units_sold')::INTEGER, (cs->>'units_stockout')::INTEGER, (cs->>'ending_inventory')::INTEGER,
            (cs->>'gross_revenue')::NUMERIC, (cs->>'cogs')::NUMERIC, (cs->>'gross_profit')::NUMERIC,
            (cs->>'operating_expenses')::NUMERIC, (cs->>'inventory_holding_cost')::NUMERIC,
            (cs->>'ebitda')::NUMERIC, (cs->>'tax_expense')::NUMERIC, (cs->>'net_income')::NUMERIC,
            (cs->>'operating_cash_flow')::NUMERIC, (cs->>'financing_cash_flow')::NUMERIC,
            (cs->>'ending_cash')::NUMERIC, (cs->>'cumulative_rd_asset')::NUMERIC,
            (cs->>'enterprise_value')::NUMERIC, (cs->>'cash_valuation_contribution')::NUMERIC,
            (cs->>'company_valuation')::NUMERIC, (cs->>'retained_equity_pct')::NUMERIC,
            (cs->>'equity_adjusted_score')::NUMERIC, (cs->>'domain_rank')::INTEGER,
            (cs->>'tournament_rank')::INTEGER, (cs->>'created_at')::TIMESTAMPTZ
        FROM jsonb_array_elements(v_backup.payload->'companySnapshots') AS cs;

        GET DIAGNOSTICS v_snapshots_restored = ROW_COUNT;
    END IF;

    -- 11. Restore financial ledger
    IF v_backup.payload ? 'financialLedger' AND jsonb_typeof(v_backup.payload->'financialLedger') = 'array' THEN
        INSERT INTO public.financial_ledger (
            id, event_id, round_id, team_id, entry_type, amount,
            running_balance, reference_id, simulation_run_id, is_voided,
            voided_at, void_reason, description, created_at
        )
        SELECT
            (fl->>'id')::UUID, (fl->>'event_id')::UUID,
            CASE WHEN fl->>'round_id' IS NOT NULL THEN (fl->>'round_id')::UUID ELSE NULL END,
            (fl->>'team_id')::UUID, (fl->>'entry_type')::ledger_entry_type,
            (fl->>'amount')::NUMERIC, (fl->>'running_balance')::NUMERIC,
            CASE WHEN fl->>'reference_id' IS NOT NULL THEN (fl->>'reference_id')::UUID ELSE NULL END,
            CASE WHEN fl->>'simulation_run_id' IS NOT NULL THEN (fl->>'simulation_run_id')::UUID ELSE NULL END,
            (fl->>'is_voided')::BOOLEAN,
            CASE WHEN fl->>'voided_at' IS NOT NULL THEN (fl->>'voided_at')::TIMESTAMPTZ ELSE NULL END,
            fl->>'void_reason', fl->>'description', (fl->>'created_at')::TIMESTAMPTZ
        FROM jsonb_array_elements(v_backup.payload->'financialLedger') AS fl;

        GET DIAGNOSTICS v_ledger_restored = ROW_COUNT;
    END IF;

    -- 12. Restore equity transactions
    IF v_backup.payload ? 'equityTransactions' AND jsonb_typeof(v_backup.payload->'equityTransactions') = 'array' THEN
        INSERT INTO public.equity_transactions (
            id, team_id, round_id, simulation_run_id, shareholder_name,
            is_founding_team, pre_round_equity_pct, dilution_delta_pct,
            post_round_equity_pct, investment_amount, is_voided, created_at
        )
        SELECT
            (et->>'id')::UUID, (et->>'team_id')::UUID, (et->>'round_id')::UUID,
            CASE WHEN et->>'simulation_run_id' IS NOT NULL THEN (et->>'simulation_run_id')::UUID ELSE NULL END,
            et->>'shareholder_name', (et->>'is_founding_team')::BOOLEAN,
            (et->>'pre_round_equity_pct')::NUMERIC, (et->>'dilution_delta_pct')::NUMERIC,
            (et->>'post_round_equity_pct')::NUMERIC, (et->>'investment_amount')::NUMERIC,
            (et->>'is_voided')::BOOLEAN, (et->>'created_at')::TIMESTAMPTZ
        FROM jsonb_array_elements(v_backup.payload->'equityTransactions') AS et;

        GET DIAGNOSTICS v_equity_restored = ROW_COUNT;
    END IF;

    -- 13. Restore presentation state
    IF v_backup.payload ? 'presentationState' AND jsonb_typeof(v_backup.payload->'presentationState') = 'array' THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_backup.payload->'presentationState') LOOP
            UPDATE public.presentation_state
            SET mode = COALESCE(v_item.value->>'mode', 'standings'),
                selected_round_number = COALESCE((v_item.value->>'selected_round_number')::INTEGER, 1),
                domain_filter = COALESCE(v_item.value->>'domain_filter', 'ALL'),
                ceremony_stage = COALESCE(v_item.value->>'ceremony_stage', 'waiting'),
                updated_at = timezone('utc', now()),
                updated_by = v_effective_actor_id
            WHERE event_id = v_event_id;
        END LOOP;
    END IF;

    -- 14. Mark backup record as restored
    UPDATE public.tournament_backups
    SET restored_at = timezone('utc', now()),
        restored_by = v_effective_actor_id
    WHERE id = p_backup_id;

    -- 14. Audit log
    INSERT INTO public.audit_logs (
        actor_id, action, entity_name, entity_id, before_state, after_state, created_at
    ) VALUES (
        v_effective_actor_id,
        'RESTORE_TOURNAMENT_BACKUP',
        'tournament_backups',
        p_backup_id,
        jsonb_build_object('event_id', v_event_id, 'backup_id', p_backup_id),
        jsonb_build_object(
            'event_id', v_event_id,
            'decisions_restored', v_decisions_restored,
            'sim_runs_restored', v_sim_runs_restored,
            'snapshots_restored', v_snapshots_restored,
            'ledger_restored', v_ledger_restored,
            'equity_restored', v_equity_restored
        ),
        timezone('utc', now())
    );

    RETURN jsonb_build_object(
        'success', true,
        'backup_id', p_backup_id,
        'event_id', v_event_id,
        'decisions_restored', v_decisions_restored,
        'simulation_runs_restored', v_sim_runs_restored,
        'snapshots_restored', v_snapshots_restored,
        'ledger_entries_restored', v_ledger_restored,
        'equity_transactions_restored', v_equity_restored
    );
END;
$$;

-- ============================================================================
-- 4. ATOMIC RPC: RESET ROUND DECISIONS (PRE-SIMULATION SAFETY)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_reset_round_decisions(
    p_round_id UUID,
    p_actor_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT '',
    p_target_status TEXT DEFAULT 'draft'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_round RECORD;
    v_effective_actor_id UUID;
    v_decision_count INTEGER := 0;
    v_team_count INTEGER := 0;
    v_sim_count INTEGER := 0;
    v_snapshot_count INTEGER := 0;
    v_ledger_count INTEGER := 0;
    v_equity_count INTEGER := 0;
    v_target_status TEXT;
BEGIN
    -- 1. Determine effective actor (auth.uid() or service_role authorized p_actor_id)
    v_effective_actor_id := auth.uid();
    IF v_effective_actor_id IS NULL THEN
        IF COALESCE(current_setting('request.jwt.claim.role', true), '') IN ('service_role', 'supabase_admin') OR current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
            v_effective_actor_id := p_actor_id;
        ELSE
            RAISE EXCEPTION 'Access denied: Direct unauthenticated execution of administrative round reset is prohibited.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- 2. Enforce super_admin authorization
    IF v_effective_actor_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = v_effective_actor_id 
          AND role = 'super_admin' 
          AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Access denied: Only active Super Administrators can reset round decisions.'
            USING ERRCODE = '42501';
    END IF;

    -- 3. Validate reason
    IF length(trim(COALESCE(p_reason, ''))) < 5 THEN
        RAISE EXCEPTION 'A structured audit reason of at least 5 characters is required for round reset.'
            USING ERRCODE = '22023';
    END IF;

    -- Normalize target status (allowed: 'draft' or 'open')
    v_target_status := lower(trim(COALESCE(p_target_status, 'draft')));
    IF v_target_status NOT IN ('draft', 'open') THEN
        v_target_status := 'draft';
    END IF;

    -- 4. Lock round row to prevent concurrent simulations or transitions
    SELECT id, event_id, round_number, type, status, opened_at, locked_at, simulated_at, published_at
    INTO v_round
    FROM public.rounds
    WHERE id = p_round_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Round not found: %', p_round_id
            USING ERRCODE = 'P0002';
    END IF;

    -- 5. Block reset if round has already been simulated, reviewed, or published
    IF v_round.status IN ('simulated', 'reviewed', 'published') THEN
        RAISE EXCEPTION 'Cannot reset round %: Round has already been simulated, reviewed, or published. Tournament history is protected.', v_round.round_number
            USING ERRCODE = '23503';
    END IF;

    -- 6. Check for any persisted simulation runs or financial dependencies
    SELECT count(*) INTO v_sim_count FROM public.simulation_runs WHERE round_id = p_round_id;
    IF v_sim_count > 0 THEN
        RAISE EXCEPTION 'Cannot reset round %: % simulation run(s) already exist for this round.', v_round.round_number, v_sim_count
            USING ERRCODE = '23503';
    END IF;

    SELECT count(*) INTO v_snapshot_count FROM public.company_snapshots WHERE round_id = p_round_id;
    IF v_snapshot_count > 0 THEN
        RAISE EXCEPTION 'Cannot reset round %: Company performance snapshots already exist for this round.', v_round.round_number
            USING ERRCODE = '23503';
    END IF;

    SELECT count(*) INTO v_ledger_count FROM public.financial_ledger WHERE round_id = p_round_id;
    IF v_ledger_count > 0 THEN
        RAISE EXCEPTION 'Cannot reset round %: Financial ledger records already exist for this round.', v_round.round_number
            USING ERRCODE = '23503';
    END IF;

    SELECT count(*) INTO v_equity_count FROM public.equity_transactions WHERE round_id = p_round_id;
    IF v_equity_count > 0 THEN
        RAISE EXCEPTION 'Cannot reset round %: Equity transactions already exist for this round.', v_round.round_number
            USING ERRCODE = '23503';
    END IF;

    -- 7. Count and lock decisions to delete
    SELECT count(*) INTO v_decision_count
    FROM public.decisions
    WHERE round_id = p_round_id;

    -- Count teams preserved in this event
    SELECT count(*) INTO v_team_count
    FROM public.teams
    WHERE event_id = v_round.event_id;

    -- 8. Delete decisions for this round
    DELETE FROM public.decisions
    WHERE round_id = p_round_id;

    -- 9. Update round state and clear timestamps
    IF v_target_status = 'draft' THEN
        UPDATE public.rounds
        SET status = 'draft',
            opened_at = NULL,
            locked_at = NULL,
            simulated_at = NULL,
            published_at = NULL
        WHERE id = p_round_id;
    ELSE
        UPDATE public.rounds
        SET status = 'open',
            locked_at = NULL,
            simulated_at = NULL,
            published_at = NULL
        WHERE id = p_round_id;
    END IF;

    -- 10. Record immutable audit log
    INSERT INTO public.audit_logs (
        actor_id,
        action,
        entity_name,
        entity_id,
        before_state,
        after_state,
        created_at
    ) VALUES (
        v_effective_actor_id,
        'RESET_ROUND_DECISIONS',
        'rounds',
        p_round_id,
        jsonb_build_object(
            'event_id', v_round.event_id,
            'round_number', v_round.round_number,
            'status', v_round.status,
            'decisions_count', v_decision_count,
            'opened_at', v_round.opened_at,
            'locked_at', v_round.locked_at
        ),
        jsonb_build_object(
            'event_id', v_round.event_id,
            'round_number', v_round.round_number,
            'status', v_target_status,
            'decisions_cleared', v_decision_count,
            'teams_preserved', v_team_count,
            'reason', p_reason
        ),
        timezone('utc', now())
    );

    RETURN jsonb_build_object(
        'success', true,
        'round_id', p_round_id,
        'round_number', v_round.round_number,
        'previous_status', v_round.status,
        'new_status', v_target_status,
        'decisions_cleared', v_decision_count,
        'teams_preserved', v_team_count,
        'reason', p_reason
    );
END;
$$;

-- ============================================================================
-- 5. ATOMIC RPC: RESET ENTIRE TOURNAMENT (FULL REHEARSAL & FRESH-START)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_reset_entire_tournament(
    p_event_id UUID,
    p_actor_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT '',
    p_confirm_published BOOLEAN DEFAULT false,
    p_backup_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_event RECORD;
    v_effective_actor_id UUID;
    v_team_count INTEGER := 0;
    v_member_count INTEGER := 0;
    v_decision_count INTEGER := 0;
    v_sim_count INTEGER := 0;
    v_snapshot_count INTEGER := 0;
    v_ledger_count INTEGER := 0;
    v_equity_count INTEGER := 0;
    v_has_published_rounds BOOLEAN := false;
    v_has_in_progress_simulation BOOLEAN := false;
BEGIN
    -- 1. Determine effective actor (auth.uid() or service_role authorized p_actor_id)
    v_effective_actor_id := auth.uid();
    IF v_effective_actor_id IS NULL THEN
        IF COALESCE(current_setting('request.jwt.claim.role', true), '') IN ('service_role', 'supabase_admin') OR current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
            v_effective_actor_id := p_actor_id;
        ELSE
            RAISE EXCEPTION 'Access denied: Direct unauthenticated execution of administrative tournament reset is prohibited.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- 2. Enforce super_admin authorization
    IF v_effective_actor_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = v_effective_actor_id 
          AND role = 'super_admin' 
          AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Access denied: Only active Super Administrators can reset the tournament.'
            USING ERRCODE = '42501';
    END IF;

    -- 3. Validate reason
    IF length(trim(COALESCE(p_reason, ''))) < 5 THEN
        RAISE EXCEPTION 'A structured audit reason of at least 5 characters is required for full tournament reset.'
            USING ERRCODE = '22023';
    END IF;

    -- 4. If p_backup_id is provided, verify it exists and is verified
    IF p_backup_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.tournament_backups 
            WHERE id = p_backup_id 
              AND event_id = p_event_id 
              AND is_verified = true
        ) THEN
            RAISE EXCEPTION 'Cannot reset tournament: Specified backup % was not found or is unverified.', p_backup_id
                USING ERRCODE = '23503';
        END IF;
    END IF;

    -- 5. Lock event row
    SELECT id, name, status, active_round_number, total_rounds, starting_capital, starting_valuation
    INTO v_event
    FROM public.events
    WHERE id = p_event_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Event not found: %', p_event_id
            USING ERRCODE = 'P0002';
    END IF;

    -- 6. Lock all rounds of this event
    PERFORM id FROM public.rounds WHERE event_id = p_event_id FOR UPDATE;

    -- 7. Block reset if any simulation run is currently in progress
    SELECT EXISTS (
        SELECT 1 FROM public.simulation_runs sr
        JOIN public.rounds r ON r.id = sr.round_id
        WHERE r.event_id = p_event_id
          AND sr.status IN ('in_progress', 'running')
    ) INTO v_has_in_progress_simulation;

    IF v_has_in_progress_simulation THEN
        RAISE EXCEPTION 'Cannot reset tournament: A simulation run is currently in progress for this event.'
            USING ERRCODE = '55000';
    END IF;

    -- 8. Check if any round was published or tournament completed
    SELECT EXISTS (
        SELECT 1 FROM public.rounds 
        WHERE event_id = p_event_id 
          AND status = 'published'
    ) INTO v_has_published_rounds;

    IF (v_event.status = 'completed' OR v_has_published_rounds) AND NOT p_confirm_published THEN
        RAISE EXCEPTION 'Cannot reset tournament: This event has published rounds or is marked completed. Explicit confirmation (p_confirm_published = true) is required to reset published tournament history.'
            USING ERRCODE = '55000';
    END IF;

    -- 9. Count existing records before reset for audit & metrics
    SELECT count(*) INTO v_team_count FROM public.teams WHERE event_id = p_event_id;
    SELECT count(*) INTO v_member_count 
    FROM public.team_members 
    WHERE team_id IN (SELECT id FROM public.teams WHERE event_id = p_event_id);

    SELECT count(*) INTO v_decision_count 
    FROM public.decisions 
    WHERE round_id IN (SELECT id FROM public.rounds WHERE event_id = p_event_id);

    SELECT count(*) INTO v_sim_count 
    FROM public.simulation_runs 
    WHERE round_id IN (SELECT id FROM public.rounds WHERE event_id = p_event_id);

    SELECT count(*) INTO v_snapshot_count 
    FROM public.company_snapshots 
    WHERE round_id IN (SELECT id FROM public.rounds WHERE event_id = p_event_id);

    SELECT count(*) INTO v_ledger_count 
    FROM public.financial_ledger 
    WHERE event_id = p_event_id;

    SELECT count(*) INTO v_equity_count 
    FROM public.equity_transactions 
    WHERE round_id IN (SELECT id FROM public.rounds WHERE event_id = p_event_id);

    -- 10. Clean up simulation and financial records in dependency order
    -- 10.1 Financial ledger
    DELETE FROM public.financial_ledger 
    WHERE event_id = p_event_id;

    -- 10.2 Equity transactions
    DELETE FROM public.equity_transactions 
    WHERE round_id IN (SELECT id FROM public.rounds WHERE event_id = p_event_id);

    -- 10.3 Company snapshots
    DELETE FROM public.company_snapshots 
    WHERE round_id IN (SELECT id FROM public.rounds WHERE event_id = p_event_id);

    -- 10.4 Simulation runs
    DELETE FROM public.simulation_runs 
    WHERE round_id IN (SELECT id FROM public.rounds WHERE event_id = p_event_id);

    -- 10.5 Decisions
    DELETE FROM public.decisions 
    WHERE round_id IN (SELECT id FROM public.rounds WHERE event_id = p_event_id);

    -- 11. Reset all rounds to draft and clear lifecycle timestamps
    UPDATE public.rounds
    SET status = 'draft',
        opened_at = NULL,
        locked_at = NULL,
        simulated_at = NULL,
        published_at = NULL
    WHERE event_id = p_event_id;

    -- 12. Reset event state
    UPDATE public.events
    SET status = 'setup',
        active_round_number = 0,
        updated_at = timezone('utc', now())
    WHERE id = p_event_id;

    -- 13. Reset presentation state if exists
    UPDATE public.presentation_state
    SET ceremony_stage = 'waiting',
        mode = 'standings',
        selected_round_number = 1,
        domain_filter = 'ALL',
        updated_at = timezone('utc', now())
    WHERE event_id = p_event_id;

    -- 14. Record immutable audit log
    INSERT INTO public.audit_logs (
        actor_id,
        action,
        entity_name,
        entity_id,
        before_state,
        after_state,
        created_at
    ) VALUES (
        v_effective_actor_id,
        'RESET_ENTIRE_TOURNAMENT',
        'events',
        p_event_id,
        jsonb_build_object(
            'name', v_event.name,
            'status', v_event.status,
            'active_round_number', v_event.active_round_number,
            'decisions_count', v_decision_count,
            'simulation_runs_count', v_sim_count,
            'snapshots_count', v_snapshot_count,
            'ledger_entries_count', v_ledger_count,
            'equity_txs_count', v_equity_count,
            'backup_id', p_backup_id
        ),
        jsonb_build_object(
            'status', 'setup',
            'active_round_number', 0,
            'rounds_reset_count', 5,
            'teams_preserved', v_team_count,
            'team_members_preserved', v_member_count,
            'decisions_cleared', v_decision_count,
            'simulations_cleared', v_sim_count,
            'snapshots_cleared', v_snapshot_count,
            'ledger_cleared', v_ledger_count,
            'equity_cleared', v_equity_count,
            'backup_id', p_backup_id,
            'reason', p_reason
        ),
        timezone('utc', now())
    );

    RETURN jsonb_build_object(
        'success', true,
        'event_id', p_event_id,
        'event_name', v_event.name,
        'new_event_status', 'setup',
        'active_round_number', 0,
        'teams_preserved', v_team_count,
        'team_members_preserved', v_member_count,
        'decisions_cleared', v_decision_count,
        'simulations_cleared', v_sim_count,
        'snapshots_cleared', v_snapshot_count,
        'ledger_entries_cleared', v_ledger_count,
        'equity_transactions_cleared', v_equity_count,
        'backup_id', p_backup_id,
        'reason', p_reason
    );
END;
$$;

-- Revoke execution from PUBLIC and anon to prevent unauthenticated direct RPC execution
REVOKE ALL ON FUNCTION public.fn_restore_tournament_from_backup(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_reset_round_decisions(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_reset_entire_tournament(UUID, UUID, TEXT, BOOLEAN, UUID) FROM PUBLIC, anon;

-- Grant execution exclusively to authenticated users and service_role
GRANT EXECUTE ON FUNCTION public.fn_restore_tournament_from_backup(UUID, UUID, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_reset_round_decisions(UUID, UUID, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_reset_entire_tournament(UUID, UUID, TEXT, BOOLEAN, UUID) TO authenticated, service_role;
