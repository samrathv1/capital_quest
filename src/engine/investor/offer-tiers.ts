import Decimal from 'decimal.js';
import { D } from '../math/precision';

export type InvestorConfidenceTier = 'low' | 'moderate' | 'high';

export interface DynamicInvestorOffer {
  readonly roundNumber: number;
  readonly offerType: 'OFFER_A' | 'OFFER_B';
  readonly tier: InvestorConfidenceTier;
  readonly name: string;
  readonly label: string;
  readonly fundingAmount: Decimal;
  readonly equityStakePct: Decimal; // e.g. 10.0 for 10%
  readonly impliedPostMoneyValuation: Decimal;
  readonly impliedPreMoneyValuation: Decimal;
  readonly description: string;
}

export interface TeamInvestorOffers {
  readonly teamId: string;
  readonly roundNumber: number;
  readonly tier: InvestorConfidenceTier;
  readonly offerA: DynamicInvestorOffer;
  readonly offerB: DynamicInvestorOffer;
}

/**
 * Predefined investment terms by confidence tier (CQ Requirement 2 Phase 3):
 *
 * LOW CONFIDENCE (Score 0–39):
 * - Offer A (Conservative): $150,000 for 10.0% equity
 * - Offer B (Growth):       $250,000 for 20.0% equity
 *
 * MODERATE CONFIDENCE (Score 40–69):
 * - Offer A (Conservative): $200,000 for 10.0% equity
 * - Offer B (Growth):       $350,000 for 20.0% equity
 *
 * HIGH CONFIDENCE (Score 70–100):
 * - Offer A (Conservative): $250,000 for 8.0% equity
 * - Offer B (Growth):       $450,000 for 18.0% equity
 */
export const TIER_DEFINITIONS: Record<
  InvestorConfidenceTier,
  {
    offerA: { funding: number; equityPct: number; name: string; label: string; description: string };
    offerB: { funding: number; equityPct: number; name: string; label: string; description: string };
  }
> = {
  low: {
    offerA: {
      funding: 150000,
      equityPct: 10.0,
      name: 'Seed Bridge Capital (Conservative Term Sheet)',
      label: 'Offer A — Conservative Investment',
      description: 'Stabilizing capital injection preserving founder equity with disciplined runway extension.',
    },
    offerB: {
      funding: 250000,
      equityPct: 20.0,
      name: 'Turnaround Growth Partners (Expansion Term Sheet)',
      label: 'Offer B — Growth Investment',
      description: 'Substantial liquidity infusion for market re-positioning and capacity recovery.',
    },
  },
  moderate: {
    offerA: {
      funding: 200000,
      equityPct: 10.0,
      name: 'Strategic Synergy Angels (Conservative Term Sheet)',
      label: 'Offer A — Conservative Investment',
      description: 'Balanced capital partnership offering non-dilutive mentorship and healthy cash flow support.',
    },
    offerB: {
      funding: 350000,
      equityPct: 20.0,
      name: 'Apex Venture Partners (Expansion Term Sheet)',
      label: 'Offer B — Growth Investment',
      description: 'Aggressive growth funding accelerating go-to-market scaling and brand dominance.',
    },
  },
  high: {
    offerA: {
      funding: 250000,
      equityPct: 8.0,
      name: 'Founders-First Syndicate (Premier Conservative Term Sheet)',
      label: 'Offer A — Conservative Investment',
      description: 'Top-tier founder-friendly financing minimizing dilution for high-conviction ventures.',
    },
    offerB: {
      funding: 450000,
      equityPct: 18.0,
      name: 'Tier-1 Global Growth Fund (Premier Expansion Term Sheet)',
      label: 'Offer B — Growth Investment',
      description: 'Maximum firepower growth injection enabling rapid category leadership.',
    },
  },
};

/**
 * Resolves confidence tier deterministically from a score between 0 and 100.
 * Boundaries:
 * - 0 to 39: Low
 * - 40 to 69: Moderate
 * - 70 to 100: High
 */
export function getTierFromConfidenceScore(score: number): InvestorConfidenceTier {
  const rounded = Math.round(score);
  if (rounded <= 39) return 'low';
  if (rounded <= 69) return 'moderate';
  return 'high';
}

/**
 * Builds the exact Offer A and Offer B for a given round number and tier.
 */
export function buildTierOffers(
  roundNumber: number,
  tier: InvestorConfidenceTier
): { offerA: DynamicInvestorOffer; offerB: DynamicInvestorOffer } {
  const def = TIER_DEFINITIONS[tier];

  const fundingA = D(def.offerA.funding);
  const equityPctA = D(def.offerA.equityPct);
  const postMoneyA = fundingA.dividedBy(equityPctA.dividedBy(100));
  const preMoneyA = postMoneyA.minus(fundingA);

  const fundingB = D(def.offerB.funding);
  const equityPctB = D(def.offerB.equityPct);
  const postMoneyB = fundingB.dividedBy(equityPctB.dividedBy(100));
  const preMoneyB = postMoneyB.minus(fundingB);

  const offerA: DynamicInvestorOffer = {
    roundNumber,
    offerType: 'OFFER_A',
    tier,
    name: def.offerA.name,
    label: def.offerA.label,
    fundingAmount: fundingA,
    equityStakePct: equityPctA,
    impliedPostMoneyValuation: postMoneyA,
    impliedPreMoneyValuation: preMoneyA,
    description: def.offerA.description,
  };

  const offerB: DynamicInvestorOffer = {
    roundNumber,
    offerType: 'OFFER_B',
    tier,
    name: def.offerB.name,
    label: def.offerB.label,
    fundingAmount: fundingB,
    equityStakePct: equityPctB,
    impliedPostMoneyValuation: postMoneyB,
    impliedPreMoneyValuation: preMoneyB,
    description: def.offerB.description,
  };

  validateOfferConsistency(offerA, offerB);

  return { offerA, offerB };
}

/**
 * Validates that Offer A and Offer B adhere to required invariant rules:
 * - Offer A funding < Offer B funding
 * - Offer A equity <= Offer B equity
 */
export function validateOfferConsistency(
  offerA: DynamicInvestorOffer,
  offerB: DynamicInvestorOffer
): void {
  if (offerA.fundingAmount.gte(offerB.fundingAmount)) {
    throw new Error(
      `Offer Consistency Violation: Offer A funding ($${offerA.fundingAmount}) must be less than Offer B funding ($${offerB.fundingAmount})`
    );
  }
  if (offerA.equityStakePct.gt(offerB.equityStakePct)) {
    throw new Error(
      `Offer Consistency Violation: Offer A equity (${offerA.equityStakePct}%) must be less than or equal to Offer B equity (${offerB.equityStakePct}%)`
    );
  }
}
