import { describe, it, expect } from 'vitest';
import {
  calculateCumulativeBrandStock,
  calculateNormalizedBrandRatio,
  processDomainBrandResults,
} from '@/engine/marketing/brand';
import { DOMAIN_ARCHETYPES } from '@/engine/config/domain-archetypes';
import { CompanySnapshot } from '@/engine/types';
import { D, ZERO } from '@/engine/math/precision';

describe('Engine Marketing: Cumulative Brand Stock & Normalized Ratio', () => {
  const domain = DOMAIN_ARCHETYPES.cleantech; // lambda_mkt = 0.40

  it('accumulates brand stock with round-to-round decay', () => {
    // Round 1: $250k marketing, $0 prior -> $250,000
    const b1 = calculateCumulativeBrandStock(250000, 0, 0.40);
    expect(b1.toNumber()).toBe(250000);

    // Round 2: $100k marketing, $250k prior -> 100k + (0.40 * 250k) = 100k + 100k = $200,000
    const b2 = calculateCumulativeBrandStock(100000, b1, 0.40);
    expect(b2.toNumber()).toBe(200000);
  });

  it('computes linear unweighted beta ratio (P-01 Fix)', () => {
    // Brand stocks: 250k, 100k, 10k -> Average = 120,000
    const bA = D(250000);
    const bB = D(100000);
    const bC = D(10000);
    const bBar = bA.plus(bB).plus(bC).dividedBy(3);

    const betaA = calculateNormalizedBrandRatio(bA, bBar);
    const betaB = calculateNormalizedBrandRatio(bB, bBar);
    const betaC = calculateNormalizedBrandRatio(bC, bBar);

    // betaA = 251,000 / 121,000 ~ 2.07438
    expect(betaA.toNumber()).toBeCloseTo(2.07438, 4);
    // betaB = 101,000 / 121,000 ~ 0.83471
    expect(betaB.toNumber()).toBeCloseTo(0.83471, 4);
    // betaC = 11,000 / 121,000 ~ 0.09091
    expect(betaC.toNumber()).toBeCloseTo(0.09091, 4);
  });

  it('processes multi-company domain brand equity correctly', () => {
    const decisions = [
      { teamId: 'A', marketingBudget: 250000 },
      { teamId: 'B', marketingBudget: 100000 },
      { teamId: 'C', marketingBudget: 10000 },
    ];

    const snapshots: CompanySnapshot[] = [
      { teamId: 'A', roundNumber: 0, cash: D(1e6), beginningInventoryUnits: ZERO, inventoryAverageUnitCost: D(600), cumulativeRdStock: ZERO, cumulativeBrandStock: ZERO, retainedEquityPct: D(100), valuation: D(2e5) },
      { teamId: 'B', roundNumber: 0, cash: D(1e6), beginningInventoryUnits: ZERO, inventoryAverageUnitCost: D(600), cumulativeRdStock: ZERO, cumulativeBrandStock: ZERO, retainedEquityPct: D(100), valuation: D(2e5) },
      { teamId: 'C', roundNumber: 0, cash: D(1e6), beginningInventoryUnits: ZERO, inventoryAverageUnitCost: D(600), cumulativeRdStock: ZERO, cumulativeBrandStock: ZERO, retainedEquityPct: D(100), valuation: D(2e5) },
    ];

    const results = processDomainBrandResults(decisions, snapshots, domain);
    expect(results).toHaveLength(3);

    const resA = results.find(r => r.teamId === 'A')!;
    const resB = results.find(r => r.teamId === 'B')!;
    const resC = results.find(r => r.teamId === 'C')!;

    expect(resA.cumulativeBrandStock.toNumber()).toBe(250000);
    expect(resB.cumulativeBrandStock.toNumber()).toBe(100000);
    expect(resC.cumulativeBrandStock.toNumber()).toBe(10000);

    expect(resA.normalizedBrandRatio.toNumber()).toBeCloseTo(2.07438, 4);
  });
});
