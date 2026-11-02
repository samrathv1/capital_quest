-- ============================================================================
-- CAPITAL QUEST — REQUIREMENT 2: DYNAMIC INVESTOR FUNDING & EQUITY SYSTEM
-- Migration: 20261102000000_dynamic_investor_offers.sql
-- Description:
-- Creates team_investor_offers table for frozen individualized offers,
-- confidential confidence scores, scoring breakdowns, and confirmation status.
-- ============================================================================

CREATE TABLE IF NOT EXISTS team_investor_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL CHECK (round_number IN (2, 4)),
    confidence_score INTEGER NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 100),
    confidence_tier TEXT NOT NULL CHECK (confidence_tier IN ('low', 'moderate', 'high')),
    scoring_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    offer_a_amount NUMERIC(15, 2) NOT NULL CHECK (offer_a_amount > 0),
    offer_a_equity_pct NUMERIC(7, 4) NOT NULL CHECK (offer_a_equity_pct > 0 AND offer_a_equity_pct < 100),
    offer_b_amount NUMERIC(15, 2) NOT NULL CHECK (offer_b_amount > 0),
    offer_b_equity_pct NUMERIC(7, 4) NOT NULL CHECK (offer_b_equity_pct > 0 AND offer_b_equity_pct < 100),
    selected_choice TEXT NOT NULL DEFAULT 'none' CHECK (selected_choice IN ('none', 'offer_a', 'offer_b', 'reject_both')),
    is_confirmed BOOLEAN NOT NULL DEFAULT false,
    confirmed_at TIMESTAMPTZ,
    confirmed_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_round_team_investor_offer UNIQUE (round_id, team_id)
);

-- Indexing for fast lookups
CREATE INDEX IF NOT EXISTS idx_team_investor_offers_event_round 
ON team_investor_offers(event_id, round_id);

CREATE INDEX IF NOT EXISTS idx_team_investor_offers_team_round 
ON team_investor_offers(team_id, round_number);

-- Enable Row Level Security (RLS)
ALTER TABLE team_investor_offers ENABLE ROW LEVEL SECURITY;

-- Policy: Super Admin & Domain Coordinators full management
CREATE POLICY "Super admin and coordinators full access to investor offers"
ON team_investor_offers
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'domain_coordinator')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'domain_coordinator')
    )
);

-- Policy: Public/participants cannot view confidential scores or breakdowns directly via public client
-- (All public/participant queries route through sanitized service layer where score is stripped)
CREATE POLICY "No direct public access to internal investor scoring"
ON team_investor_offers
FOR SELECT
TO anon
USING (false);

