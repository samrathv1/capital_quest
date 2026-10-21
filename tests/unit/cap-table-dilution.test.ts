import { describe, it, expect } from 'vitest';
import { resolveEquityAndDilution } from '@/engine/equity/cap-table';
import {
  UniformInvestmentOfferProvider,
  PerformanceTieredInvestmentOfferProvider,
} from '@/engine/config/investment-offers';
import { CompanySnapshot } from '@/engine/types';
import { D, ZERO } from '@/engine/math/precision';

describe('Engine Equity: Investment Offers & Compounding Cap Table Dilution', () => {
  const uniformProvider = new UniformInvestmentOfferProvider();

  const baselineSnapshot: CompanySnapshot = {
    teamId: 'TEAM-1',
    roundNumber: 1,
    cash: D(1000000),
    beginningInventoryUnits: ZERO,
    inventoryAverageUnitCost: D(600),
    cumulativeRdStock: ZERO,
    cumulativeBrandStock: ZERO,
    retainedEquityPct: D(100), // 100%
    valuation: D(200000),
  };

  it('preserves 100% equity when rejecting offers in Round 2', () => {
    const res = resolveEquityAndDilution('TEAM-1', 2, 'REJECT_BOTH', baselineSnapshot, uniformProvider);
    expect(res.cashInjected.toNumber()).toBe(0);
    expect(res.investorEquityStakePct.toNumber()).toBe(0);
    expect(res.postRoundRetainedEquityPct.toNumber()).toBe(100);
    expect(res.dilutionFactor.toNumber()).toBe(1);
  });

  it('dilutes team ownership by 25% when accepting Offer A in Round 2 ($400k for 25%)', () => {
    const res = resolveEquityAndDilution('TEAM-1', 2, 'OFFER_A', baselineSnapshot, uniformProvider);
    expect(res.cashInjected.toNumber()).toBe(400000);
    expect(res.investorEquityStakePct.toNumber()).toBe(25.0);
    expect(res.postRoundRetainedEquityPct.toNumber()).toBe(75.0);
    expect(res.dilutionFactor.toNumber()).toBe(0.75);
  });

  it('compounds multi-round dilution accurately across Round 2 and Round 4', () => {
    // Round 2: Accept Offer A (25% stake -> team retains 75%)
    const resR2 = resolveEquityAndDilution('TEAM-1', 2, 'OFFER_A', baselineSnapshot, uniformProvider);
    expect(resR2.postRoundRetainedEquityPct.toNumber()).toBe(75.0);

    const snapshotAfterR2: CompanySnapshot = {
      ...baselineSnapshot,
      roundNumber: 2,
      retainedEquityPct: resR2.postRoundRetainedEquityPct,
    };

    // Round 4: Accept Offer B (10% stake -> team retains 75% * 0.90 = 67.50%)
    const resR4 = resolveEquityAndDilution('TEAM-1', 4, 'OFFER_B', snapshotAfterR2, uniformProvider);
    expect(resR4.cashInjected.toNumber()).toBe(450000);
    expect(resR4.investorEquityStakePct.toNumber()).toBe(10.0);
    expect(resR4.postRoundRetainedEquityPct.toNumber()).toBe(67.50);

    // Matches worked example line 399: Retained Equity = 67.50%
  });

  it('ignores investment selections during non-investment rounds (e.g. Round 1, 3, 5)', () => {
    // If a team accidentally wrote Offer A on Round 3 slip, it is ignored
    const resR3 = resolveEquityAndDilution('TEAM-1', 3, 'OFFER_A', baselineSnapshot, uniformProvider);
    expect(resR3.cashInjected.toNumber()).toBe(0);
    expect(resR3.investorEquityStakePct.toNumber()).toBe(0);
    expect(resR3.postRoundRetainedEquityPct.toNumber()).toBe(100);
  });

  it('supports performance-tiered investment offer provider without breaking rules', () => {
    const tieredProvider = new PerformanceTieredInvestmentOfferProvider();

    // High performing company in Round 4 (Valuation = $3.5M >= $3M tier threshold)
    const highValSnapshot: CompanySnapshot = {
      ...baselineSnapshot,
      roundNumber: 3,
      valuation: D(3500000),
      retainedEquityPct: D(75),
    };

    const res = resolveEquityAndDilution('TEAM-1', 4, 'OFFER_A', highValSnapshot, tieredProvider);
    // Base cash $800k + 20% tier bonus = $960,000 for the same 20% equity stake
    expect(res.cashInjected.toNumber()).toBe(960000);
    expect(res.investorEquityStakePct.toNumber()).toBe(20.0);
    expect(res.postRoundRetainedEquityPct.toNumber()).toBe(60.0); // 75% * 0.80 = 60%
  });
});
