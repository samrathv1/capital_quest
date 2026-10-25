-- ==============================================================================
-- CAPITAL QUEST — MIGRATION: 20261025000000_winner_embargo_rls.sql
-- SECURE FINAL-RESULTS RELEASE POLICY & ROW LEVEL SECURITY (RLS) HARDENING
-- Reference: CQ-SEC-EMBARGO-01, Phase 7 Production Security
-- ==============================================================================

-- 1. Tighten COMPANY SNAPSHOTS RLS
-- Public anon/authenticated users can view active published snapshots for all normal rounds.
-- For the final round (round_number >= total_rounds), snapshots remain embargoed
-- until presentation_state.ceremony_stage reaches 'podium'.
-- Staff and judges retain unrestricted read access for auditing and review.

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
        ) OR public.is_staff() OR public.get_user_role() = 'judge'
    );

-- 2. Tighten FINANCIAL LEDGER RLS
-- Ledger entries for the final round are embargoed from public view until ceremony 'podium'.
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
        ) OR public.is_staff() OR public.get_user_role() = 'judge'
    );

-- 3. Tighten EQUITY TRANSACTIONS RLS
-- Cap-table transactions for the final round are embargoed from public view until ceremony 'podium'.
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
        ) OR public.is_staff() OR public.get_user_role() = 'judge'
    );

-- 4. Comment on policy hardening
COMMENT ON POLICY snapshots_read_policy ON company_snapshots IS 
    'Restricts public access to final-round snapshots until presentation ceremony reaches podium stage';
COMMENT ON POLICY financial_ledger_read_published ON financial_ledger IS 
    'Restricts public access to final-round financial ledger entries until presentation ceremony reaches podium stage';
COMMENT ON POLICY equity_transactions_read_published ON equity_transactions IS 
    'Restricts public access to final-round equity transactions until presentation ceremony reaches podium stage';
