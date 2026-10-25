-- CAPITAL QUEST — TRANSACTION-SAFE TEAM DELETION RPC
-- Migration: 20261026000000_safe_team_deletion_rpc.sql
-- Reference: CQ-SPEC-05, CQ-SPEC-08

CREATE OR REPLACE FUNCTION public.fn_safe_delete_team(
    p_team_id UUID,
    p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_team RECORD;
    v_simulated_rounds INTEGER;
    v_active_decisions INTEGER;
    v_snapshots INTEGER;
    v_ledger_entries INTEGER;
    v_equity_txs INTEGER;
    v_effective_actor_id UUID;
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
        RAISE EXCEPTION 'Access denied: Only active Super Administrators can delete teams.'
            USING ERRCODE = '42501';
    END IF;

    -- 3. Lock the team row to prevent concurrent modifications / race conditions
    SELECT id, event_id, domain_id, team_code, company_name, table_station
    INTO v_team
    FROM public.teams
    WHERE id = p_team_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Team not found or already deleted: %', p_team_id
            USING ERRCODE = 'P0002';
    END IF;

    -- 4. Check if any tournament rounds have already been simulated in this event
    SELECT count(*)
    INTO v_simulated_rounds
    FROM public.rounds
    WHERE event_id = v_team.event_id
      AND status IN ('simulated', 'reviewed', 'published');

    IF v_simulated_rounds > 0 THEN
        RAISE EXCEPTION 'Cannot delete team: Tournament rounds have already been simulated. Modifying teams after simulation is prohibited to preserve tournament integrity.'
            USING ERRCODE = '23503';
    END IF;

    -- 5. Check for active (entered, verified, locked) decisions
    SELECT count(*)
    INTO v_active_decisions
    FROM public.decisions
    WHERE team_id = p_team_id
      AND status != 'unsubmitted';

    IF v_active_decisions > 0 THEN
        RAISE EXCEPTION 'Cannot delete team ''%'': Team has % submitted or verified decision(s) in active rounds.', v_team.team_code, v_active_decisions
            USING ERRCODE = '23503';
    END IF;

    -- 6. Check for company simulation snapshots
    SELECT count(*)
    INTO v_snapshots
    FROM public.company_snapshots
    WHERE team_id = p_team_id;

    IF v_snapshots > 0 THEN
        RAISE EXCEPTION 'Cannot delete team ''%'': Simulation performance snapshots exist for this company.', v_team.team_code
            USING ERRCODE = '23503';
    END IF;

    -- 7. Check for financial ledger records
    SELECT count(*)
    INTO v_ledger_entries
    FROM public.financial_ledger
    WHERE team_id = p_team_id;

    IF v_ledger_entries > 0 THEN
        RAISE EXCEPTION 'Cannot delete team ''%'': Financial ledger records exist for this company. Ledger history cannot be erased.', v_team.team_code
            USING ERRCODE = '23503';
    END IF;

    -- 8. Check for equity transactions
    SELECT count(*)
    INTO v_equity_txs
    FROM public.equity_transactions
    WHERE team_id = p_team_id;

    IF v_equity_txs > 0 THEN
        RAISE EXCEPTION 'Cannot delete team ''%'': Cap table or equity transactions exist for this company.', v_team.team_code
            USING ERRCODE = '23503';
    END IF;

    -- 9. Transactionally remove unsubmitted draft decisions
    DELETE FROM public.decisions WHERE team_id = p_team_id;

    -- 10. Transactionally remove student founder roster entries
    DELETE FROM public.team_members WHERE team_id = p_team_id;

    -- 11. Transactionally delete the team record
    DELETE FROM public.teams WHERE id = p_team_id;

    -- 12. Transactionally write immutable audit log
    INSERT INTO public.audit_logs (
        actor_id,
        action,
        entity_name,
        entity_id,
        before_state,
        after_state
    ) VALUES (
        v_effective_actor_id,
        'team.delete',
        'teams',
        p_team_id,
        jsonb_build_object(
            'team_code', v_team.team_code,
            'company_name', v_team.company_name,
            'event_id', v_team.event_id,
            'domain_id', v_team.domain_id,
            'table_station', v_team.table_station
        ),
        NULL
    );

    RETURN jsonb_build_object(
        'success', true,
        'deletedTeam', jsonb_build_object(
            'id', v_team.id,
            'teamCode', v_team.team_code,
            'companyName', v_team.company_name
        )
    );
END;
$$;

-- Grant execution permission to authenticated users (function self-enforces super_admin check)
GRANT EXECUTE ON FUNCTION public.fn_safe_delete_team(UUID, UUID) TO authenticated, service_role;
