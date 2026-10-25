-- CAPITAL QUEST — PRESENTATION STATE & STAGE SYNCHRONIZATION
-- Migration: 20261024000000_presentation_state.sql
-- Reference: CQ-SPEC-06, CQ-SPEC-08

CREATE TABLE IF NOT EXISTS presentation_state (
    event_id UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    mode TEXT NOT NULL DEFAULT 'standings',
    selected_round_number INTEGER NOT NULL DEFAULT 1,
    domain_filter TEXT NOT NULL DEFAULT 'ALL',
    ceremony_stage TEXT NOT NULL DEFAULT 'waiting',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_by UUID REFERENCES profiles(id)
);

ALTER TABLE presentation_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS presentation_state_read_public ON presentation_state;
CREATE POLICY presentation_state_read_public ON presentation_state
    FOR SELECT TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS presentation_state_admin_mutate ON presentation_state;
CREATE POLICY presentation_state_admin_mutate ON presentation_state
    FOR ALL TO authenticated
    USING (public.is_super_admin() OR public.get_user_role() = 'judge');
