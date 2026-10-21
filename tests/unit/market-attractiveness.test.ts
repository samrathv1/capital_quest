import { describe, it, expect } from 'vitest';
import {
  calculatePriceCompetitiveness,
  calculateRawAttractiveness,
} from '@/engine/market/attractiveness';
import {
  calculateTotalDomainDemand,
  calculateMarketSharesAndDemand,
} from '@/engine/market/market-share';
import { DOMAIN_ARCHETYPES } from '@/engine/config/domain-archetypes';
import { AttractivenessResult, QualityResult, BrandResult } from '@/engine/types';
import { D, ZERO } from '@/engine/math/precision';

describe('Engine Market: Attractiveness & Luce Choice Axiom Market Share', () => {
  const domain = DOMAIN_ARCHETYPES.cleantech; // Bench: 1200, epsilon_p: 1.20, alpha_q: 0.85, alpha_m: 0.45

  it('calculates price competitiveness ratio (pi = (P_bench / P)^epsilon_p)', () => {
    // Exactly at benchmark price ($1200) -> pi = 1.000
    expect(calculatePriceCompetitiveness(1200, 1200, 1.20).toNumber()).toBe(1.0);

    // Premium price ($1300) -> (1200 / 1300)^1.2 = 0.9084 (rounded to 0.909 in worked example line 352)
    expect(calculatePriceCompetitiveness(1300, 1200, 1.20).toNumber()).toBeCloseTo(0.9084, 3);

    // Discount price ($1000) -> (1200 / 1000)^1.2 = 1.2446
    expect(calculatePriceCompetitiveness(1000, 1200, 1.20).toNumber()).toBeCloseTo(1.2446, 3);
  });

  it('calculates raw attractiveness matching worked example (Single Exponentiation)', () => {
    // Co A: Q = 45.02, beta = 2.07438, P = 1200 -> A = 35.318 (line 351)
    const qA: QualityResult = { teamId: 'A', rdExpenditure: D(250000), cumulativeRdStock: D(250000), qualityIndex: D(45.02), isBelowRegulatoryFloor: false };
    const bA: BrandResult = { teamId: 'A', marketingExpenditure: D(250000), cumulativeBrandStock: D(250000), normalizedBrandRatio: D(2.07438) };
    const attrA = calculateRawAttractiveness(qA, bA, 1200, domain, domain.priceElasticity, domain.mktElasticity);
    expect(attrA.rawAttractiveness.toNumber()).toBeCloseTo(35.318, 2);

    // Co B: Q = 36.12, beta = 0.83471, P = 1300 -> A = 17.664 (line 352)
    const qB: QualityResult = { teamId: 'B', rdExpenditure: D(150000), cumulativeRdStock: D(150000), qualityIndex: D(36.12), isBelowRegulatoryFloor: false };
    const bB: BrandResult = { teamId: 'B', marketingExpenditure: D(100000), cumulativeBrandStock: D(100000), normalizedBrandRatio: D(0.83471) };
    const attrB = calculateRawAttractiveness(qB, bB, 1300, domain, domain.priceElasticity, domain.mktElasticity);
    expect(attrB.rawAttractiveness.toNumber()).toBeCloseTo(17.664, 2);

    // Co C: Q = 21.19 (< 30.0 floor -> 50% penalty), beta = 0.09091, P = 1200 -> A = 2.278 (line 353)
    const qC: QualityResult = { teamId: 'C', rdExpenditure: D(10000), cumulativeRdStock: D(10000), qualityIndex: D(21.19), isBelowRegulatoryFloor: true };
    const bC: BrandResult = { teamId: 'C', marketingExpenditure: D(10000), cumulativeBrandStock: D(10000), normalizedBrandRatio: D(0.09091) };
    const attrC = calculateRawAttractiveness(qC, bC, 1200, domain, domain.priceElasticity, domain.mktElasticity);
    expect(attrC.qualityPenaltyApplied).toBe(true);
    expect(attrC.rawAttractiveness.toNumber()).toBeCloseTo(2.278, 2);
  });

  it('guarantees 100.000% market share conservation under Luce choice axiom', () => {
    const attractivenessResults: AttractivenessResult[] = [
      { teamId: 'A', price: D(1200), priceCompetitiveness: D(1.0), rawAttractiveness: D(35.318), qualityPenaltyApplied: false },
      { teamId: 'B', price: D(1300), priceCompetitiveness: D(0.909), rawAttractiveness: D(17.664), qualityPenaltyApplied: false },
      { teamId: 'C', price: D(1200), priceCompetitiveness: D(1.0), rawAttractiveness: D(2.278), qualityPenaltyApplied: true },
    ];

    const marketShares = calculateMarketSharesAndDemand(attractivenessResults, 20000);
    expect(marketShares).toHaveLength(3);

    const sumShares = marketShares.reduce((acc, m) => acc.plus(m.marketSharePct), ZERO);
    expect(sumShares.toNumber()).toBeCloseTo(1.0, 6);

    const shareA = marketShares.find(m => m.teamId === 'A')!;
    const shareB = marketShares.find(m => m.teamId === 'B')!;
    const shareC = marketShares.find(m => m.teamId === 'C')!;

    expect(shareA.marketSharePct.toNumber()).toBeCloseTo(0.639, 3);
    expect(shareB.marketSharePct.toNumber()).toBeCloseTo(0.320, 3);
    expect(shareC.marketSharePct.toNumber()).toBeCloseTo(0.041, 3);

    // Potential demand allocation
    expect(shareA.preliminaryDemandUnits.toNumber()).toBe(12782);
    expect(shareB.preliminaryDemandUnits.toNumber()).toBe(6393);
    expect(shareC.preliminaryDemandUnits.toNumber()).toBe(824);
  });

  it('handles zero demand and macro event shocks cleanly', () => {
    // Macro event subsidy: +30% demand
    const { totalDemand: subsidyDemand } = calculateTotalDomainDemand(domain, [1200, 1200], 0.30);
    expect(subsidyDemand.toNumber()).toBe(26000); // 20k * 1.30 = 26,000

    // Macro recession: -20% demand
    const { totalDemand: recessionDemand } = calculateTotalDomainDemand(domain, [1200, 1200], -0.20);
    expect(recessionDemand.toNumber()).toBe(16000); // 20k * 0.80 = 16,000
  });
});
