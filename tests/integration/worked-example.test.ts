import { describe, it, expect } from 'vitest';
import { simulateDomainRound } from '@/engine/simulation/domain-simulation';
import { DOMAIN_ARCHETYPES } from '@/engine/config/domain-archetypes';
import { CompanyDecision, CompanySnapshot } from '@/engine/types';
import { D, ZERO } from '@/engine/math/precision';

describe('Integration Test: Section 3 Complete Worked Example (CleanTech Round 1)', () => {
  const domain = DOMAIN_ARCHETYPES.cleantech;

  const decisions: CompanyDecision[] = [
    {
      teamId: 'Co-A',
      marketingBudget: 250000,
      rdBudget: 250000,
      operationsBudget: 50000,
      productionUnits: 700,
      unitPrice: 1200,
      investmentDecision: 'REJECT_BOTH',
    },
    {
      teamId: 'Co-B',
      marketingBudget: 100000,
      rdBudget: 150000,
      operationsBudget: 50000,
      productionUnits: 500,
      unitPrice: 1300,
      investmentDecision: 'REJECT_BOTH',
    },
    {
      teamId: 'Co-C',
      marketingBudget: 10000,
      rdBudget: 10000,
      operationsBudget: 0,
      productionUnits: 100,
      unitPrice: 1200,
      investmentDecision: 'REJECT_BOTH',
    },
  ];

  const round0Snapshots: CompanySnapshot[] = [
    { teamId: 'Co-A', roundNumber: 0, cash: D(1000000), beginningInventoryUnits: ZERO, inventoryAverageUnitCost: D(600), cumulativeRdStock: ZERO, cumulativeBrandStock: ZERO, retainedEquityPct: D(100), valuation: D(200000) },
    { teamId: 'Co-B', roundNumber: 0, cash: D(1000000), beginningInventoryUnits: ZERO, inventoryAverageUnitCost: D(600), cumulativeRdStock: ZERO, cumulativeBrandStock: ZERO, retainedEquityPct: D(100), valuation: D(200000) },
    { teamId: 'Co-C', roundNumber: 0, cash: D(1000000), beginningInventoryUnits: ZERO, inventoryAverageUnitCost: D(600), cumulativeRdStock: ZERO, cumulativeBrandStock: ZERO, retainedEquityPct: D(100), valuation: D(200000) },
  ];

  it('reproduces all worked example calculations exactly in an end-to-end domain simulation', () => {
    // Section 3 narrative walkthrough calculated cash before immediate tax deduction
    const domainResult = simulateDomainRound(domain, 1, decisions, round0Snapshots, {
      deductTaxFromCash: false,
    });

    expect(domainResult.companyResults).toHaveLength(3);

    const resA = domainResult.companyResults.find(r => r.teamId === 'Co-A')!;
    const resB = domainResult.companyResults.find(r => r.teamId === 'Co-B')!;
    const resC = domainResult.companyResults.find(r => r.teamId === 'Co-C')!;

    // 1. Production Unit Costs
    expect(resA.fulfillment.effectiveUnitProductionCost.toNumber()).toBe(576);
    expect(resB.fulfillment.effectiveUnitProductionCost.toNumber()).toBe(576);
    expect(resC.fulfillment.effectiveUnitProductionCost.toNumber()).toBe(600);

    // 2. Quality & Brand
    expect(resA.quality.qualityIndex.toNumber()).toBe(45.02);
    expect(resB.quality.qualityIndex.toNumber()).toBe(36.12);
    expect(resC.quality.qualityIndex.toNumber()).toBe(21.19);
    expect(resC.quality.isBelowRegulatoryFloor).toBe(true);

    // 3. Attractiveness & Market Shares
    expect(resA.attractiveness.rawAttractiveness.toNumber()).toBeCloseTo(35.318, 2);
    expect(resB.attractiveness.rawAttractiveness.toNumber()).toBeCloseTo(17.664, 2);
    expect(resC.attractiveness.rawAttractiveness.toNumber()).toBeCloseTo(2.278, 2);

    expect(resA.marketShare.marketSharePct.toNumber()).toBeCloseTo(0.639, 3);
    expect(resB.marketShare.marketSharePct.toNumber()).toBeCloseTo(0.320, 3);
    expect(resC.marketShare.marketSharePct.toNumber()).toBeCloseTo(0.041, 3);

    // 4. Sales Units (All 3 sell 100% of manufactured units due to massive domain demand)
    expect(resA.fulfillment.totalUnitsSold.toNumber()).toBe(700);
    expect(resB.fulfillment.totalUnitsSold.toNumber()).toBe(500);
    expect(resC.fulfillment.totalUnitsSold.toNumber()).toBe(100);

    // 5. Financial Results
    // Revenue
    expect(resA.financial.grossRevenue.toNumber()).toBe(840000);
    expect(resB.financial.grossRevenue.toNumber()).toBe(650000);
    expect(resC.financial.grossRevenue.toNumber()).toBe(120000);

    // COGS
    expect(resA.financial.cogs.toNumber()).toBe(403200);
    expect(resB.financial.cogs.toNumber()).toBe(288000);
    expect(resC.financial.cogs.toNumber()).toBe(60000);

    // Gross Profit
    expect(resA.financial.grossProfit.toNumber()).toBe(436800);
    expect(resB.financial.grossProfit.toNumber()).toBe(362000);
    expect(resC.financial.grossProfit.toNumber()).toBe(60000);

    // OpEx
    expect(resA.financial.totalOpEx.toNumber()).toBe(550000);
    expect(resB.financial.totalOpEx.toNumber()).toBe(300000);
    expect(resC.financial.totalOpEx.toNumber()).toBe(20000);

    // EBITDA
    expect(resA.financial.ebitda.toNumber()).toBe(-113200);
    expect(resB.financial.ebitda.toNumber()).toBe(62000);
    expect(resC.financial.ebitda.toNumber()).toBe(40000);

    // Ending Cash
    expect(resA.financial.endingCash.toNumber()).toBe(886800);
    expect(resB.financial.endingCash.toNumber()).toBe(1062000);
    expect(resC.financial.endingCash.toNumber()).toBe(1040000);

    // 6. Company Valuations (Matches Section 3 lines 387-389 within 0.003% of text with unrounded Decimal market share)
    expect(resA.valuation.finalValuation.toNumber()).toBeCloseTo(2290700, -3);
    expect(resB.valuation.finalValuation.toNumber()).toBeCloseTo(2010000, -3);
    expect(resC.valuation.finalValuation.toNumber()).toBeCloseTo(778000, -3);
  });
});
