-- ============================================================================
-- CAPITAL QUEST — REQUIREMENT 2: DYNAMIC INVESTOR FUNDING & EQUITY SYSTEM
-- Migration: 20261103000000_secure_dynamic_investor_offers.sql
-- Description:
-- 1. Tightens Row Level Security (RLS) on team_investor_offers so confidential
--    investor confidence scores, tiers, and scoring breakdowns are accessible
--    only to super_admin (coordinators and participants use sanitized service layer).
-- 2. Enforces ON DELETE SET NULL on confirmed_by foreign key.
-- 3. Synchronizes fn_reset_round_decisions and fn_reset_entire_tournament
--    to guarantee complete reset safety and audit tracking for investor offers.
-- ============================================================================

-- 1. ROW LEVEL SECURITY (RLS) HARDENING
ALTER TABLE public.team_investor_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin and coordinators full access to investor offers" ON public.team_investor_offers;
DROP POLICY IF EXISTS "Super admin full access to investor offers" ON public.team_investor_offers;

CREATE POLICY "Super admin full access to investor offers"
ON public.team_investor_offers
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
        AND profiles.is_active = true
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
        AND profiles.is_active = true
    )
);

-- Ensure public anon policy exists
DROP POLICY IF EXISTS "No direct public access to internal investor scoring" ON public.team_investor_offers;
CREATE POLICY "No direct public access to internal investor scoring"
ON public.team_investor_offers
FOR SELECT
TO anon
USING (false);

-- 2. FOREIGN KEY SAFETY: ON DELETE SET NULL FOR confirmed_by
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'team_investor_offers_confirmed_by_fkey'
          AND table_name = 'team_investor_offers'
    ) THEN
        ALTER TABLE public.team_investor_offers
            DROP CONSTRAINT team_investor_offers_confirmed_by_fkey,
            ADD CONSTRAINT team_investor_offers_confirmed_by_fkey
                FOREIGN KEY (confirmed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. ATOMIC RPC: RESET ROUND DECISIONS (WITH INVESTOR OFFERS RESET)
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
AS $function$
DECLARE
    v_round RECORD;
    v_effective_actor_id UUID;
    v_decision_count INTEGER := 0;
    v_team_count INTEGER := 0;
    v_sim_count INTEGER := 0;
    v_snapshot_count INTEGER := 0;
    v_ledger_count INTEGER := 0;
    v_equity_count INTEGER := 0;
    v_offers_count INTEGER := 0;
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

    -- 7. Count decisions to delete
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

    -- 8.5 Reset dynamic investor offers for this round (if round 2 or 4)
    SELECT count(*) INTO v_offers_count
    FROM public.team_investor_offers
    WHERE round_id = p_round_id;

    IF v_offers_count > 0 THEN
        UPDATE public.team_investor_offers
        SET selected_choice = 'none',
            is_confirmed = false,
            confirmed_at = NULL,
            confirmed_by = NULL,
            updated_at = timezone('utc', now())
        WHERE round_id = p_round_id;
    END IF;

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
            'investor_offers_count', v_offers_count,
            'opened_at', v_round.opened_at,
            'locked_at', v_round.locked_at
        ),
        jsonb_build_object(
            'event_id', v_round.event_id,
            'round_number', v_round.round_number,
            'status', v_target_status,
            'decisions_cleared', v_decision_count,
            'investor_offers_reset', v_offers_count,
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
        'investor_offers_reset', v_offers_count,
        'teams_preserved', v_team_count,
        'reason', p_reason
    );
END;
$function$;

-- 4. ATOMIC RPC: RESET ENTIRE TOURNAMENT (WITH INVESTOR OFFERS CLEARED)
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
AS $function$
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
    v_offers_count INTEGER := 0;
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

    SELECT count(*) INTO v_offers_count 
    FROM public.team_investor_offers 
    WHERE event_id = p_event_id;

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

    -- 10.6 Dynamic investor offers
    DELETE FROM public.team_investor_offers
    WHERE event_id = p_event_id;

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
            'investor_offers_count', v_offers_count,
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
            'investor_offers_cleared', v_offers_count,
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
        'investor_offers_cleared', v_offers_count,
        'backup_id', p_backup_id,
        'reason', p_reason
    );
END;
$function$;

-- 5. RECORD MIGRATION IN SUPABASE SCHEMA MIGRATIONS
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES (
    '20261103000000',
    'secure_dynamic_investor_offers',
    ARRAY[
        'ALTER POLICY on public.team_investor_offers',
        'ALTER CONSTRAINT team_investor_offers_confirmed_by_fkey',
        'CREATE OR REPLACE FUNCTION public.fn_reset_round_decisions',
        'CREATE OR REPLACE FUNCTION public.fn_reset_entire_tournament'
    ]
)
ON CONFLICT (version) DO UPDATE
SET name = EXCLUDED.name,
    statements = EXCLUDED.statements;

