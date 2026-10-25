-- ==============================================================================
-- CAPITAL QUEST — MIGRATION: 20261025000001_tighten_winner_embargo_roles.sql
-- TIGHTEN WINNER EMBARGO RLS: RESTRICT EMBARGO BYPASS TO ORGANIZER & JUDGE ONLY
-- Reference: CQ-SEC-EMBARGO-02, Release Security Hardening
-- ==============================================================================

-- 1. Create helper security function: is_organizer_or_judge()
-- Only super_admin (organizer) and judge have authorized preview/audit access to embargoed results.
-- Volunteers and domain coordinators are explicitly excluded from bypassing the final round embargo.
CREATE OR REPLACE FUNCTION public.is_organizer_or_judge()
RETURNS BOOLEAN AS $$
    SELECT public.get_user_role() IN ('super_admin', 'judge');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- 2. Tighten COMPANY SNAPSHOTS RLS
-- Normal published rounds (round_number < total_rounds) remain readable by public anon/authenticated.
-- Final round snapshots remain strictly embargoed until ceremony_stage = 'podium',
-- UNLESS the caller is super_admin or judge.
DROP POLICY IF EXISTS snapshots_read_policy ON company_snapshots;
CREATE POLICY snapshots_read_policy ON company_snapshots
    FOR SELECT TO anon, authenticated
    USING (
        (
            is_active = true 
            AND EXISTS (
                SELECT 1 FROM rounds 
                JOIN events ON events.id = rounds.event_id
                WHERE rounds.id = company_snapshots.round_id 
                AND rounds.status = 'published'
                AND (
                    rounds.round_number < events.total_rounds
                    OR EXISTS (
                        SELECT 1 FROM presentation_state
                        WHERE presentation_state.event_id = events.id
                        AND presentation_state.ceremony_stage = 'podium'
                    )
                )
            )
        ) OR public.is_organizer_or_judge()
    );

-- 3. Tighten FINANCIAL LEDGER RLS
-- Financial ledger entries for the final round are embargoed from public/volunteer/coordinator view until 'podium'.
DROP POLICY IF EXISTS financial_ledger_read_published ON financial_ledger;
CREATE POLICY financial_ledger_read_published ON financial_ledger
    FOR SELECT TO anon, authenticated
    USING (
        (
            EXISTS (
                SELECT 1 FROM rounds 
                JOIN events ON events.id = rounds.event_id
                WHERE rounds.id = financial_ledger.round_id 
                AND rounds.status = 'published'
                AND (
                    rounds.round_number < events.total_rounds
                    OR EXISTS (
                        SELECT 1 FROM presentation_state
                        WHERE presentation_state.event_id = events.id
                        AND presentation_state.ceremony_stage = 'podium'
                    )
                )
            )
        ) OR public.is_organizer_or_judge()
    );

-- 4. Tighten EQUITY TRANSACTIONS RLS
-- Cap-table transactions for the final round are embargoed from public/volunteer/coordinator view until 'podium'.
DROP POLICY IF EXISTS equity_transactions_read_published ON equity_transactions;
CREATE POLICY equity_transactions_read_published ON equity_transactions
    FOR SELECT TO anon, authenticated
    USING (
        (
            EXISTS (
                SELECT 1 FROM rounds 
                JOIN events ON events.id = rounds.event_id
                WHERE rounds.id = equity_transactions.round_id 
                AND rounds.status = 'published'
                AND (
                    rounds.round_number < events.total_rounds
                    OR EXISTS (
                        SELECT 1 FROM presentation_state
                        WHERE presentation_state.event_id = events.id
                        AND presentation_state.ceremony_stage = 'podium'
                    )
                )
            )
        ) OR public.is_organizer_or_judge()
    );

-- 5. Comments on policies
COMMENT ON FUNCTION public.is_organizer_or_judge() IS 
    'Returns true only for super_admin (organizer) and judge roles. Volunteers and domain coordinators return false.';
COMMENT ON POLICY snapshots_read_policy ON company_snapshots IS 
    'Restricts final-round snapshots to organizer and judge until presentation ceremony reaches podium stage';
COMMENT ON POLICY financial_ledger_read_published ON financial_ledger IS 
    'Restricts final-round financial ledger to organizer and judge until presentation ceremony reaches podium stage';
COMMENT ON POLICY equity_transactions_read_published ON equity_transactions IS 
    'Restricts final-round equity transactions to organizer and judge until presentation ceremony reaches podium stage';
