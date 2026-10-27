-- CAPITAL QUEST — FORWARD-ONLY MIGRATION: THREE-DOMAIN STANDARDIZATION & SECURE TOURNAMENT RESETS
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
-- 2. ATOMIC RPC: RESET ROUND DECISIONS (PRE-SIMULATION SAFETY)
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
    -- 1. Determine effective actor (auth.uid() or explicit p_actor_id)
    v_effective_actor_id := COALESCE(auth.uid(), p_actor_id);

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
        RAISE EXCEPTION 'Cannot reset round %: Round has already been simulated, reviewed, or published. Tournament history is protected.'
            USING ERRCODE = '23503';
    END IF;

    -- 6. Check for any persisted simulation runs or financial dependencies
    SELECT count(*) INTO v_sim_count FROM public.simulation_runs WHERE round_id = p_round_id;
    IF v_sim_count > 0 THEN
        RAISE EXCEPTION 'Cannot reset round %: % simulation run(s) already exist for this round.'
            USING ERRCODE = '23503';
    END IF;

    SELECT count(*) INTO v_snapshot_count FROM public.company_snapshots WHERE round_id = p_round_id;
    IF v_snapshot_count > 0 THEN
        RAISE EXCEPTION 'Cannot reset round %: Company performance snapshots already exist for this round.'
            USING ERRCODE = '23503';
    END IF;

    SELECT count(*) INTO v_ledger_count FROM public.financial_ledger WHERE round_id = p_round_id;
    IF v_ledger_count > 0 THEN
        RAISE EXCEPTION 'Cannot reset round %: Financial ledger records already exist for this round.'
            USING ERRCODE = '23503';
    END IF;

    SELECT count(*) INTO v_equity_count FROM public.equity_transactions WHERE round_id = p_round_id;
    IF v_equity_count > 0 THEN
        RAISE EXCEPTION 'Cannot reset round %: Equity transactions already exist for this round.'
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
-- 3. ATOMIC RPC: RESET ENTIRE TOURNAMENT (FULL REHEARSAL & FRESH-START)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_reset_entire_tournament(
    p_event_id UUID,
    p_actor_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT '',
    p_confirm_published BOOLEAN DEFAULT false
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
BEGIN
    -- 1. Determine effective actor (auth.uid() or explicit p_actor_id)
    v_effective_actor_id := COALESCE(auth.uid(), p_actor_id);

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

    -- 4. Lock event row
    SELECT id, name, status, active_round_number, total_rounds, starting_capital, starting_valuation
    INTO v_event
    FROM public.events
    WHERE id = p_event_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Event not found: %', p_event_id
            USING ERRCODE = 'P0002';
    END IF;

    -- 5. Lock all rounds of this event
    PERFORM id FROM public.rounds WHERE event_id = p_event_id FOR UPDATE;

    -- 6. Check if any round was published or tournament completed
    SELECT EXISTS (
        SELECT 1 FROM public.rounds 
        WHERE event_id = p_event_id 
          AND status = 'published'
    ) INTO v_has_published_rounds;

    IF (v_event.status = 'completed' OR v_has_published_rounds) AND NOT p_confirm_published THEN
        RAISE EXCEPTION 'Cannot reset tournament: This event has published rounds or is marked completed. Explicit confirmation (p_confirm_published = true) is required to reset published tournament history.'
            USING ERRCODE = '55000';
    END IF;

    -- 7. Count existing records before reset for audit & metrics
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

    -- 8. Clean up simulation and financial records in dependency order
    -- 8.1 Financial ledger
    DELETE FROM public.financial_ledger 
    WHERE event_id = p_event_id;

    -- 8.2 Equity transactions
    DELETE FROM public.equity_transactions 
    WHERE round_id IN (SELECT id FROM public.rounds WHERE event_id = p_event_id);

    -- 8.3 Company snapshots
    DELETE FROM public.company_snapshots 
    WHERE round_id IN (SELECT id FROM public.rounds WHERE event_id = p_event_id);

    -- 8.4 Simulation runs
    DELETE FROM public.simulation_runs 
    WHERE round_id IN (SELECT id FROM public.rounds WHERE event_id = p_event_id);

    -- 8.5 Decisions
    DELETE FROM public.decisions 
    WHERE round_id IN (SELECT id FROM public.rounds WHERE event_id = p_event_id);

    -- 9. Reset all rounds to draft and clear lifecycle timestamps
    UPDATE public.rounds
    SET status = 'draft',
        opened_at = NULL,
        locked_at = NULL,
        simulated_at = NULL,
        published_at = NULL
    WHERE event_id = p_event_id;

    -- 10. Reset event state
    UPDATE public.events
    SET status = 'setup',
        active_round_number = 0,
        updated_at = timezone('utc', now())
    WHERE id = p_event_id;

    -- 11. Reset presentation state if exists
    UPDATE public.presentation_state
    SET ceremony_stage = 'waiting',
        mode = 'standings',
        is_winner_revealed = false,
        selected_round_number = 1,
        domain_filter = 'ALL',
        updated_at = timezone('utc', now())
    WHERE event_id = p_event_id;

    -- 12. Record immutable audit log
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
            'equity_txs_count', v_equity_count
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
        'reason', p_reason
    );
END;
$$;

-- Grant execution to authenticated users (RLS and internal check enforce super_admin)
GRANT EXECUTE ON FUNCTION public.fn_reset_round_decisions(UUID, UUID, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_reset_entire_tournament(UUID, UUID, TEXT, BOOLEAN) TO authenticated, service_role;
