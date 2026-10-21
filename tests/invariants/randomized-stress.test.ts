import { describe, it, expect } from 'vitest';
import { simulateDomainRound } from '@/engine/simulation/domain-simulation';
import { DOMAIN_ARCHETYPES } from '@/engine/config/domain-archetypes';
import { CompanyDecision, CompanySnapshot, DomainConfig, InvestmentChoice } from '@/engine/types';
import { D, ZERO } from '@/engine/math/precision';

/**
 * Seeded Mulberry32 Pseudo-Random Number Generator for 100% reproducible randomized testing.
 */
function createSeededRng(seed: number) {
  let s = seed >>> 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Engine Invariants: 1,000 Reproducible Randomized Stress Scenarios', () => {
  it(
    'passes 1,000 randomized simulation scenarios without violating any financial or mathematical invariants',
    { timeout: 45000 },
    () => {
    const rng = createSeededRng(42); // Deterministic seed
    const domainKeys = Object.keys(DOMAIN_ARCHETYPES);
    const investmentOptions: InvestmentChoice[] = ['OFFER_A', 'OFFER_B', 'REJECT_BOTH'];

    const TOTAL_ITERATIONS = 1000;

    for (let iter = 1; iter <= TOTAL_ITERATIONS; iter++) {
      // 1. Pick a random domain
      const domainKey = domainKeys[Math.floor(rng() * domainKeys.length)];
      const domain: DomainConfig = DOMAIN_ARCHETYPES[domainKey];

      // 2. Random round number 1 to 5
      const roundNumber = 1 + Math.floor(rng() * 5);

      // 3. Random number of competing teams (3 to 6 teams)
      const numTeams = 3 + Math.floor(rng() * 4);

      const decisions: CompanyDecision[] = [];
      const snapshots: CompanySnapshot[] = [];

      for (let t = 0; t < numTeams; t++) {
        const teamId = `T-${iter}-${t}`;
        // Cash between $50k and $2.5M
        const cashAmount = 50000 + Math.floor(rng() * 2450000);
        // Prior inventory 0 to 500
        const priorInv = Math.floor(rng() * 500);
        // Prior equity 50% to 100%
        const priorEquity = 50 + rng() * 50;

        snapshots.push({
          teamId,
          roundNumber: roundNumber - 1,
          cash: D(cashAmount),
          beginningInventoryUnits: D(priorInv),
          inventoryAverageUnitCost: D(domain.baseUnitCogs),
          cumulativeRdStock: D(rng() * 500000),
          cumulativeBrandStock: D(rng() * 500000),
          retainedEquityPct: D(priorEquity),
          valuation: D(200000 + rng() * 5000000),
        });

        // Generate decision with random allocation
        const minP = D(domain.minPrice).toNumber();
        const maxP = D(domain.maxPrice).toNumber();
        const unitPrice = minP + rng() * (maxP - minP);

        // Budget split of cash (either affordable or slightly aggressive)
        const budgetPool = cashAmount * (0.10 + rng() * 0.85);
        const mkt = budgetPool * rng() * 0.3;
        const rd = budgetPool * rng() * 0.3;
        const ops = budgetPool * rng() * 0.15;
        const remainingForProd = Math.max(0, budgetPool - (mkt + rd + ops));
        const estimatedUnitCost = D(domain.baseUnitCogs).toNumber();
        const prodUnits = Math.floor(remainingForProd / estimatedUnitCost);

        decisions.push({
          teamId,
          marketingBudget: Math.floor(mkt),
          rdBudget: Math.floor(rd),
          operationsBudget: Math.floor(ops),
          productionUnits: prodUnits,
          unitPrice: Math.round(unitPrice),
          investmentDecision: investmentOptions[Math.floor(rng() * investmentOptions.length)],
        });
      }

      // Execute domain round
      const result = simulateDomainRound(domain, roundNumber, decisions, snapshots, {
        autoApplyFallbackOnInvalid: true,
      });

      // Verify Non-Negotiable Invariants on Every Iteration:
      // Invariant A: Total market share conservation
      const totalMarketShare = result.companyResults.reduce(
        (acc, r) => acc.plus(r.marketShare.marketSharePct),
        ZERO
      );
      expect(totalMarketShare.toNumber()).toBeCloseTo(1.0, 4);

      // Invariant B: Per-company conservation rules
      for (const res of result.companyResults) {
        // No NaN or Infinite values
        expect(res.financial.endingCash.isFinite()).toBe(true);
        expect(res.valuation.finalValuation.isFinite()).toBe(true);
        expect(res.marketShare.marketSharePct.isFinite()).toBe(true);

        // Non-negative inventory
        expect(res.fulfillment.endingInventoryUnits.gte(ZERO)).toBe(true);
        expect(res.fulfillment.unitsAvailable.gte(ZERO)).toBe(true);
        expect(res.fulfillment.totalUnitsSold.gte(ZERO)).toBe(true);

        // Conservation of physical units: sold + ending == available
        const unitsReconciled = res.fulfillment.totalUnitsSold
          .plus(res.fulfillment.endingInventoryUnits)
          .equals(res.fulfillment.unitsAvailable);
        expect(unitsReconciled).toBe(true);

        // Liquid cash non-negativity (Emergency borrowing disabled)
        expect(res.financial.endingCash.gte(ZERO)).toBe(true);

        // Absolute valuation floor
        expect(res.valuation.finalValuation.gte(D(50000))).toBe(true);

        // Retained equity bounded between 0% and 100%
        expect(res.valuation.retainedEquityPct.gt(ZERO)).toBe(true);
        expect(res.valuation.retainedEquityPct.lte(D(100))).toBe(true);
      }
    }
  });
});
