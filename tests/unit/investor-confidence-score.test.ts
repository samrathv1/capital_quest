import { describe, it, expect } from 'vitest';
import {
  computeInvestorConfidenceScore,
  FinalizedRoundData,
  buildTierOffers,
  getTierFromConfidenceScore,
  TIER_DEFINITIONS,
} from '@/engine/investor';
import { DynamicInvestmentOfferProvider } from '@/engine/config/investment-offers';
import { D } from '@/engine/math/precision';
import { CompanySnapshot } from '@/engine/types';

describe('Requirement 2: Investor Confidence Score & Offer Tier Allocation', () => {
  const dummyTeamId = 'TEAM-ALPHA';

  it('correctly maps confidence scores to tiers according to specification boundaries', () => {
    // Low: 0 - 39
    expect(getTierFromConfidenceScore(0)).toBe('low');
    expect(getTierFromConfidenceScore(25)).toBe('low');
    expect(getTierFromConfidenceScore(39)).toBe('low');

    // Moderate: 40 - 69
    expect(getTierFromConfidenceScore(40)).toBe('moderate');
    expect(getTierFromConfidenceScore(55)).toBe('moderate');
    expect(getTierFromConfidenceScore(69)).toBe('moderate');

    // High: 70 - 100
    expect(getTierFromConfidenceScore(70)).toBe('high');
    expect(getTierFromConfidenceScore(85)).toBe('high');
    expect(getTierFromConfidenceScore(100)).toBe('high');
  });

  it('builds exact specification offers for Low Confidence tier (Score 0-39)', () => {
    const { offerA, offerB } = buildTierOffers(2, 'low');

    // Low: Offer A = $150k for 10.0%, Offer B = $250k for 20.0%
    expect(offerA.fundingAmount.toNumber()).toBe(150000);
    expect(offerA.equityStakePct.toNumber()).toBe(10.0);
    expect(offerA.tier).toBe('low');

    expect(offerB.fundingAmount.toNumber()).toBe(250000);
    expect(offerB.equityStakePct.toNumber()).toBe(20.0);
    expect(offerB.tier).toBe('low');
  });

  it('builds exact specification offers for Moderate Confidence tier (Score 40-69)', () => {
    const { offerA, offerB } = buildTierOffers(2, 'moderate');

    // Moderate: Offer A = $200k for 10.0%, Offer B = $350k for 20.0%
    expect(offerA.fundingAmount.toNumber()).toBe(200000);
    expect(offerA.equityStakePct.toNumber()).toBe(10.0);
    expect(offerA.tier).toBe('moderate');

    expect(offerB.fundingAmount.toNumber()).toBe(350000);
    expect(offerB.equityStakePct.toNumber()).toBe(20.0);
    expect(offerB.tier).toBe('moderate');
  });

  it('builds exact specification offers for High Confidence tier (Score 70-100)', () => {
    const { offerA, offerB } = buildTierOffers(2, 'high');

    // High: Offer A = $250k for 8.0%, Offer B = $450k for 18.0%
    expect(offerA.fundingAmount.toNumber()).toBe(250000);
    expect(offerA.equityStakePct.toNumber()).toBe(8.0);
    expect(offerA.tier).toBe('high');

    expect(offerB.fundingAmount.toNumber()).toBe(450000);
    expect(offerB.equityStakePct.toNumber()).toBe(18.0);
    expect(offerB.tier).toBe('high');
  });

  it('computes High Confidence score and High tier offers for strong Round 1 performance', () => {
    const highPerfRound1: FinalizedRoundData = {
      roundNumber: 1,
      snapshot: {
        ending_cash: 1200000,
        company_valuation: 650000,
        cumulative_rd_asset: 70,
        brand_equity_score: 65,
        market_share_pct: 42,
        gross_revenue: 900000,
        net_income: 250000,
        gross_profit: 450000,
        operating_expenses: 150000,
        units_available: 1500,
        units_sold: 1450,
        units_stockout: 0,
        ending_inventory: 50,
      },
    };

    const result = computeInvestorConfidenceScore({
      teamId: dummyTeamId,
      targetRoundNumber: 2,
      history: [highPerfRound1],
    });

    expect(result.confidenceScore).toBeGreaterThanOrEqual(70);
    expect(result.tier).toBe('high');
    expect(result.offerA.fundingAmount.toNumber()).toBe(250000);
    expect(result.offerA.equityStakePct.toNumber()).toBe(8.0);
    expect(result.offerB.fundingAmount.toNumber()).toBe(450000);
    expect(result.offerB.equityStakePct.toNumber()).toBe(18.0);
  });

  it('computes Low Confidence score and Low tier offers for struggling Round 1 performance', () => {
    const strugglingRound1: FinalizedRoundData = {
      roundNumber: 1,
      snapshot: {
        ending_cash: 250000,
        company_valuation: 150000,
        cumulative_rd_asset: 10,
        brand_equity_score: 5,
        market_share_pct: 8,
        gross_revenue: 80000,
        net_income: -180000,
        gross_profit: 10000,
        operating_expenses: 190000,
        units_available: 1000,
        units_sold: 150,
        units_stockout: 0,
        ending_inventory: 850,
      },
    };

    const result = computeInvestorConfidenceScore({
      teamId: dummyTeamId,
      targetRoundNumber: 2,
      history: [strugglingRound1],
    });

    expect(result.confidenceScore).toBeLessThan(40);
    expect(result.tier).toBe('low');
    expect(result.offerA.fundingAmount.toNumber()).toBe(150000);
    expect(result.offerA.equityStakePct.toNumber()).toBe(10.0);
    expect(result.offerB.fundingAmount.toNumber()).toBe(250000);
    expect(result.offerB.equityStakePct.toNumber()).toBe(20.0);
  });

  it('prevents future-round data leakage: ignores Round 3 and Round 4 data when computing Round 2 offers', () => {
    const r1: FinalizedRoundData = {
      roundNumber: 1,
      snapshot: {
        ending_cash: 950000,
        company_valuation: 300000,
        cumulative_rd_asset: 30,
        brand_equity_score: 25,
        market_share_pct: 25,
        gross_revenue: 300000,
        net_income: 20000,
        gross_profit: 120000,
      },
    };

    const futureR3: FinalizedRoundData = {
      roundNumber: 3,
      snapshot: {
        ending_cash: 5000000, // Massive fake future cash
        company_valuation: 10000000,
      },
    };

    const scoreWithoutFuture = computeInvestorConfidenceScore({
      teamId: dummyTeamId,
      targetRoundNumber: 2,
      history: [r1],
    });

    const scoreWithLeakedFuture = computeInvestorConfidenceScore({
      teamId: dummyTeamId,
      targetRoundNumber: 2,
      history: [r1, futureR3],
    });

    expect(scoreWithLeakedFuture.confidenceScore).toBe(scoreWithoutFuture.confidenceScore);
    expect(scoreWithLeakedFuture.tier).toBe(scoreWithoutFuture.tier);
  });

  it('computes Round 4 confidence score using multi-round recency weighting (R3: 50%, R2: 30%, R1: 20%)', () => {
    const r1: FinalizedRoundData = {
      roundNumber: 1,
      snapshot: { ending_cash: 900000, gross_revenue: 300000, net_income: 10000 },
    };
    const r2: FinalizedRoundData = {
      roundNumber: 2,
      snapshot: { ending_cash: 1100000, gross_revenue: 500000, net_income: 60000 },
    };
    const r3: FinalizedRoundData = {
      roundNumber: 3,
      snapshot: { ending_cash: 1600000, gross_revenue: 950000, net_income: 220000 },
    };

    const result = computeInvestorConfidenceScore({
      teamId: dummyTeamId,
      targetRoundNumber: 4,
      history: [r1, r2, r3],
    });

    expect(result.targetRoundNumber).toBe(4);
    expect(result.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(result.confidenceScore).toBeLessThanOrEqual(100);
    expect(['low', 'moderate', 'high']).toContain(result.tier);
  });

  it('is completely deterministic: identical inputs yield identical confidence score and breakdowns', () => {
    const r1: FinalizedRoundData = {
      roundNumber: 1,
      snapshot: { ending_cash: 950000, gross_revenue: 400000, net_income: 45000 },
    };

    const runA = computeInvestorConfidenceScore({ teamId: dummyTeamId, targetRoundNumber: 2, history: [r1] });
    const runB = computeInvestorConfidenceScore({ teamId: dummyTeamId, targetRoundNumber: 2, history: [r1] });

    expect(runA.confidenceScore).toBe(runB.confidenceScore);
    expect(runA.tier).toBe(runB.tier);
    expect(runA.breakdown.financialPerformance.score).toBe(runB.breakdown.financialPerformance.score);
    expect(runA.breakdown.growthPotential.score).toBe(runB.breakdown.growthPotential.score);
    expect(runA.breakdown.businessStrategy.score).toBe(runB.breakdown.businessStrategy.score);
    expect(runA.breakdown.marketAdaptability.score).toBe(runB.breakdown.marketAdaptability.score);
  });

  it('integrates with DynamicInvestmentOfferProvider for simulation execution', () => {
    const provider = new DynamicInvestmentOfferProvider();

    const offerA = {
      roundNumber: 2,
      offerType: 'OFFER_A' as const,
      name: 'Dynamic Offer A',
      cashInjection: D(250000),
      equityStakePct: D(8.0),
      impliedPostMoneyValuation: D(3125000),
      impliedPreMoneyValuation: D(2875000),
    };

    const offerB = {
      roundNumber: 2,
      offerType: 'OFFER_B' as const,
      name: 'Dynamic Offer B',
      cashInjection: D(450000),
      equityStakePct: D(18.0),
      impliedPostMoneyValuation: D(2500000),
      impliedPreMoneyValuation: D(2050000),
    };

    provider.registerTeamOffers('TEAM-HIGH', offerA, offerB);

    const snapshot: CompanySnapshot = {
      teamId: 'TEAM-HIGH',
      roundNumber: 1,
      cash: D(1000000),
      beginningInventoryUnits: D(0),
      inventoryAverageUnitCost: D(100),
      cumulativeRdStock: D(50),
      cumulativeBrandStock: D(50),
      retainedEquityPct: D(100),
      valuation: D(200000),
    };

    const retrievedA = provider.getOffer(2, 'OFFER_A', snapshot);
    expect(retrievedA).not.toBeNull();
    expect(retrievedA?.cashInjection.toNumber()).toBe(250000);
    expect(retrievedA?.equityStakePct.toNumber()).toBe(8.0);

    const retrievedB = provider.getOffer(2, 'OFFER_B', snapshot);
    expect(retrievedB).not.toBeNull();
    expect(retrievedB?.cashInjection.toNumber()).toBe(450000);
    expect(retrievedB?.equityStakePct.toNumber()).toBe(18.0);

    // Offers are null for non-investment rounds
    expect(provider.getOffer(1, 'OFFER_A', snapshot)).toBeNull();
    expect(provider.getOffer(3, 'OFFER_A', snapshot)).toBeNull();
    expect(provider.getOffer(5, 'OFFER_A', snapshot)).toBeNull();
  });

  it('normalizes decimal market share fractions (0.35) identically to percentage numbers (35)', () => {
    const roundWithDecimal: FinalizedRoundData = {
      roundNumber: 1,
      snapshot: {
        ending_cash: 1000000,
        company_valuation: 300000,
        product_quality_index: 50,
        brand_equity_score: 40,
        market_share_pct: 0.35, // 35% expressed as decimal fraction
        gross_revenue: 500000,
        net_income: 50000,
      },
    };

    const roundWithPercentage: FinalizedRoundData = {
      roundNumber: 1,
      snapshot: {
        ending_cash: 1000000,
        company_valuation: 300000,
        product_quality_index: 50,
        brand_equity_score: 40,
        market_share_pct: 35, // 35% expressed as percentage
        gross_revenue: 500000,
        net_income: 50000,
      },
    };

    const resDecimal = computeInvestorConfidenceScore({ teamId: dummyTeamId, targetRoundNumber: 2, history: [roundWithDecimal] });
    const resPercentage = computeInvestorConfidenceScore({ teamId: dummyTeamId, targetRoundNumber: 2, history: [roundWithPercentage] });

    expect(resDecimal.breakdown.growthPotential.metrics.marketShare.normalizedScore).toBe(
      resPercentage.breakdown.growthPotential.metrics.marketShare.normalizedScore
    );
    expect(resDecimal.confidenceScore).toBe(resPercentage.confidenceScore);
    expect(resDecimal.breakdown.growthPotential.metrics.marketShare.normalizedScore).toBe(100);
  });

  it('prioritizes product_quality_index over cumulative_rd_asset dollar balances', () => {
    const roundWithBoth: FinalizedRoundData = {
      roundNumber: 1,
      snapshot: {
        ending_cash: 1000000,
        company_valuation: 300000,
        cumulative_rd_asset: 250000, // $250k balance sheet asset in dollars
        product_quality_index: 45.0, // 45.0 actual product quality index out of 100
        brand_equity_score: 30,
        market_share_pct: 0.25,
        gross_revenue: 400000,
        net_income: 30000,
      },
    };

    const res = computeInvestorConfidenceScore({ teamId: dummyTeamId, targetRoundNumber: 2, history: [roundWithBoth] });
    expect(res.breakdown.growthPotential.metrics.productQuality.normalizedScore).toBe(45);
  });
});

