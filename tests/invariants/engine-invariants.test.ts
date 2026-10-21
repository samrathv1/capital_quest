import { describe, it, expect } from 'vitest';
import { simulateDomainRound } from '@/engine/simulation/domain-simulation';
import { DOMAIN_ARCHETYPES } from '@/engine/config/domain-archetypes';
import { CompanyDecision, CompanySnapshot } from '@/engine/types';
import { D, ZERO } from '@/engine/math/precision';

describe('Engine Mathematical & Architectural Invariants', () => {
  const domain = DOMAIN_ARCHETYPES.cleantech;

  const baseDecisions: CompanyDecision[] = [
    { teamId: 'ALPHA', marketingBudget: 200000, rdBudget: 200000, operationsBudget: 50000, productionUnits: 600, unitPrice: 1200, investmentDecision: 'REJECT_BOTH' },
    { teamId: 'BETA', marketingBudget: 150000, rdBudget: 150000, operationsBudget: 30000, productionUnits: 500, unitPrice: 1250, investmentDecision: 'REJECT_BOTH' },
    { teamId: 'GAMMA', marketingBudget: 50000, rdBudget: 50000, operationsBudget: 10000, productionUnits: 200, unitPrice: 1100, investmentDecision: 'REJECT_BOTH' },
  ];

  const baseSnapshots: CompanySnapshot[] = [
    { teamId: 'ALPHA', roundNumber: 0, cash: D(1e6), beginningInventoryUnits: ZERO, inventoryAverageUnitCost: D(600), cumulativeRdStock: ZERO, cumulativeBrandStock: ZERO, retainedEquityPct: D(100), valuation: D(2e5) },
    { teamId: 'BETA', roundNumber: 0, cash: D(1e6), beginningInventoryUnits: ZERO, inventoryAverageUnitCost: D(600), cumulativeRdStock: ZERO, cumulativeBrandStock: ZERO, retainedEquityPct: D(100), valuation: D(2e5) },
    { teamId: 'GAMMA', roundNumber: 0, cash: D(1e6), beginningInventoryUnits: ZERO, inventoryAverageUnitCost: D(600), cumulativeRdStock: ZERO, cumulativeBrandStock: ZERO, retainedEquityPct: D(100), valuation: D(2e5) },
  ];

  it('Invariant 1: Absolute Determinism (Repeated runs yield identical outputs)', () => {
    const run1 = simulateDomainRound(domain, 1, baseDecisions, baseSnapshots);
    const run2 = simulateDomainRound(domain, 1, baseDecisions, baseSnapshots);

    for (let i = 0; i < run1.companyResults.length; i++) {
      const c1 = run1.companyResults[i];
      const c2 = run2.companyResults[i];

      expect(c1.financial.endingCash.equals(c2.financial.endingCash)).toBe(true);
      expect(c1.valuation.finalValuation.equals(c2.valuation.finalValuation)).toBe(true);
      expect(c1.marketShare.marketSharePct.equals(c2.marketShare.marketSharePct)).toBe(true);
      expect(c1.fulfillment.totalUnitsSold.equals(c2.fulfillment.totalUnitsSold)).toBe(true);
    }
  });

  it('Invariant 2: Order Independence (Array ordering has zero impact on calculations)', () => {
    const forwardDecisions = [...baseDecisions];
    const reverseDecisions = [...baseDecisions].reverse();

    const forwardRes = simulateDomainRound(domain, 1, forwardDecisions, baseSnapshots);
    const reverseRes = simulateDomainRound(domain, 1, reverseDecisions, baseSnapshots);

    const fMap = new Map(forwardRes.companyResults.map(r => [r.teamId, r]));
    const rMap = new Map(reverseRes.companyResults.map(r => [r.teamId, r]));

    for (const teamId of ['ALPHA', 'BETA', 'GAMMA']) {
      const f = fMap.get(teamId)!;
      const r = rMap.get(teamId)!;

      expect(f.marketShare.marketSharePct.equals(r.marketShare.marketSharePct)).toBe(true);
      expect(f.fulfillment.totalUnitsSold.equals(r.fulfillment.totalUnitsSold)).toBe(true);
      expect(f.financial.endingCash.equals(r.financial.endingCash)).toBe(true);
      expect(f.valuation.finalValuation.equals(r.valuation.finalValuation)).toBe(true);
    }
  });

  it('Invariant 3: Input Immutability (Input objects are completely unmutated)', () => {
    const clonedDecisions = JSON.parse(JSON.stringify(baseDecisions));
    const frozenSnapshots = Object.freeze(baseSnapshots.map(s => Object.freeze({ ...s })));

    simulateDomainRound(domain, 1, baseDecisions, frozenSnapshots);

    expect(JSON.stringify(baseDecisions)).toEqual(JSON.stringify(clonedDecisions));
  });

  it('Invariant 4: Zero-Spending Strategy (Does not crash or generate NaN)', () => {
    const zeroDecisions: CompanyDecision[] = [
      { teamId: 'PASSIVE', marketingBudget: 0, rdBudget: 0, operationsBudget: 0, productionUnits: 0, unitPrice: 1200, investmentDecision: 'REJECT_BOTH' },
      { teamId: 'ACTIVE', marketingBudget: 100000, rdBudget: 100000, operationsBudget: 0, productionUnits: 500, unitPrice: 1200, investmentDecision: 'REJECT_BOTH' },
    ];

    const snapshots: CompanySnapshot[] = [
      { teamId: 'PASSIVE', roundNumber: 0, cash: D(1e6), beginningInventoryUnits: ZERO, inventoryAverageUnitCost: D(600), cumulativeRdStock: ZERO, cumulativeBrandStock: ZERO, retainedEquityPct: D(100), valuation: D(2e5) },
      { teamId: 'ACTIVE', roundNumber: 0, cash: D(1e6), beginningInventoryUnits: ZERO, inventoryAverageUnitCost: D(600), cumulativeRdStock: ZERO, cumulativeBrandStock: ZERO, retainedEquityPct: D(100), valuation: D(2e5) },
    ];

    const res = simulateDomainRound(domain, 1, zeroDecisions, snapshots);
    const passiveRes = res.companyResults.find(r => r.teamId === 'PASSIVE')!;

    expect(passiveRes.financial.endingCash.toNumber()).toBe(1000000); // Kept all cash
    expect(passiveRes.fulfillment.totalUnitsSold.toNumber()).toBe(0);
    expect(passiveRes.valuation.finalValuation.toNumber()).toBeGreaterThan(0);
  });
});
