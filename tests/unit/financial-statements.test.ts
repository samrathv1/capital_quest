import { describe, it, expect } from 'vitest';
import { calculateRevenueAndCogs } from '@/engine/finance/revenue-cogs';
import { calculateIncomeStatement } from '@/engine/finance/income-statement';
import { calculateCashFlowAndEndingBalances } from '@/engine/finance/cash-flow';
import { DOMAIN_ARCHETYPES } from '@/engine/config/domain-archetypes';
import { FulfillmentResult, CompanyDecision, CompanySnapshot } from '@/engine/types';
import { D, ZERO } from '@/engine/math/precision';

describe('Engine Finance: Income Statement, Taxes, and Cash Reconciliation', () => {
  const domain = DOMAIN_ARCHETYPES.cleantech; // unitHoldingCost: 40

  it('calculates Round 1 financial results matching worked example specifications', () => {
    // Co A in Round 1:
    // Sells 700 units @ $1200 = $840,000 revenue
    // Unit COGS = $576 -> COGS = $403,200, Gross Profit = $436,800
    // M = 250k, R = 250k, O = 50k, H = 0 -> OpEx = $550,000
    // EBITDA = 436,800 - 550,000 = -$113,200 (Net loss)
    // Ending cash = $1,000,000 - $953,200 + $840,000 = $886,800

    const fA: FulfillmentResult = {
      teamId: 'Co-A',
      preliminaryDemandUnits: D(12782),
      beginningInventoryUnits: ZERO,
      productionUnitsOrdered: D(700),
      actualProductionUnits: D(700),
      unitsAvailable: D(700),
      primaryUnitsSold: D(700),
      primaryStockoutUnits: D(12082),
      recapturedUnitsSold: ZERO,
      totalUnitsSold: D(700),
      endingInventoryUnits: ZERO,
      effectiveUnitProductionCost: D(576),
      averageInventoryUnitCost: D(576),
    };

    const decA: CompanyDecision = {
      teamId: 'Co-A',
      marketingBudget: 250000,
      rdBudget: 250000,
      operationsBudget: 50000,
      productionUnits: 700,
      unitPrice: 1200,
      investmentDecision: 'REJECT_BOTH',
    };

    const snapA: CompanySnapshot = {
      teamId: 'Co-A',
      roundNumber: 0,
      cash: D(1000000),
      beginningInventoryUnits: ZERO,
      inventoryAverageUnitCost: D(600),
      cumulativeRdStock: ZERO,
      cumulativeBrandStock: ZERO,
      retainedEquityPct: D(100),
      valuation: D(200000),
    };

    const revAndCogs = calculateRevenueAndCogs(fA, 1200);
    expect(revAndCogs.grossRevenue.toNumber()).toBe(840000);
    expect(revAndCogs.cogs.toNumber()).toBe(403200);
    expect(revAndCogs.grossProfit.toNumber()).toBe(436800);

    const income = calculateIncomeStatement(revAndCogs, decA, fA, domain, 0, 0);
    expect(income.totalOpEx.toNumber()).toBe(550000);
    expect(income.ebitda.toNumber()).toBe(-113200);
    expect(income.taxExpense.toNumber()).toBe(0);
    expect(income.netIncome.toNumber()).toBe(-113200);
    expect(income.newTaxLossCarryforward.toNumber()).toBe(113200);

    const cashFlow = calculateCashFlowAndEndingBalances(income, fA, snapA, 0);
    expect(cashFlow.endingCash.toNumber()).toBe(886800);
  });

  it('correctly applies Net Operating Loss (NOL) carryforwards to offset future taxes', () => {
    // Round with $200,000 EBITDA and $100,000 prior NOL:
    // Taxable income = $200k - $100k = $100k
    // Tax (20%) = $20,000
    // Remaining NOL = 0
    const f: FulfillmentResult = {
      teamId: 'T1',
      preliminaryDemandUnits: D(100),
      beginningInventoryUnits: ZERO,
      productionUnitsOrdered: D(100),
      actualProductionUnits: D(100),
      unitsAvailable: D(100),
      primaryUnitsSold: D(100),
      primaryStockoutUnits: ZERO,
      recapturedUnitsSold: ZERO,
      totalUnitsSold: D(100),
      endingInventoryUnits: ZERO,
      effectiveUnitProductionCost: D(500),
      averageInventoryUnitCost: D(500),
    };

    const dec: CompanyDecision = {
      teamId: 'T1',
      marketingBudget: 0,
      rdBudget: 0,
      operationsBudget: 0,
      productionUnits: 100,
      unitPrice: 2500, // Revenue = 250,000, COGS = 50,000 -> GP = 200,000, OpEx = 0 -> EBITDA = 200,000
      investmentDecision: 'REJECT_BOTH',
    };

    const revAndCogs = calculateRevenueAndCogs(f, 2500);
    const income = calculateIncomeStatement(revAndCogs, dec, f, domain, 100000, 0);

    expect(income.ebitda.toNumber()).toBe(200000);
    expect(income.taxExpense.toNumber()).toBe(20000); // 20% of (200k - 100k)
    expect(income.netIncome.toNumber()).toBe(180000);
    expect(income.newTaxLossCarryforward.toNumber()).toBe(0);
  });

  it('proves fundamental accounting identity: OCF == Net Income - Delta(Inventory Value)', () => {
    // Starting with 0 inventory
    // Produce 500 units @ $600 ($300k cash paid)
    // Sell 300 units @ $1200 ($360k cash in, $180k COGS)
    // Ending inventory = 200 units @ $600 = $120,000 inventory value
    // Gross Profit = 360k - 180k = $180,000
    // OpEx = $50k
    // EBITDA = $130,000
    // Tax (20%) = $26,000
    // Net Income = $104,000
    // Delta(Inventory Value) = +$120,000
    // Expected OCF = NI ($104k) - Delta(Inventory) ($120k) = -$16,000
    // Cash flow direct: Inflows (360k) - Outflows (50k OpEx + 300k Prod + 26k Tax) = 360k - 376k = -$16,000

    const f: FulfillmentResult = {
      teamId: 'T2',
      preliminaryDemandUnits: D(300),
      beginningInventoryUnits: ZERO,
      productionUnitsOrdered: D(500),
      actualProductionUnits: D(500),
      unitsAvailable: D(500),
      primaryUnitsSold: D(300),
      primaryStockoutUnits: ZERO,
      recapturedUnitsSold: ZERO,
      totalUnitsSold: D(300),
      endingInventoryUnits: D(200),
      effectiveUnitProductionCost: D(600),
      averageInventoryUnitCost: D(600),
    };

    const dec: CompanyDecision = {
      teamId: 'T2',
      marketingBudget: 50000,
      rdBudget: 0,
      operationsBudget: 0,
      productionUnits: 500,
      unitPrice: 1200,
      investmentDecision: 'REJECT_BOTH',
    };

    const snap: CompanySnapshot = {
      teamId: 'T2',
      roundNumber: 1,
      cash: D(1000000),
      beginningInventoryUnits: ZERO,
      inventoryAverageUnitCost: D(600),
      cumulativeRdStock: ZERO,
      cumulativeBrandStock: ZERO,
      retainedEquityPct: D(100),
      valuation: D(200000),
    };

    const revAndCogs = calculateRevenueAndCogs(f, 1200);
    const income = calculateIncomeStatement(revAndCogs, dec, f, domain, 0, 0);
    const cashFlow = calculateCashFlowAndEndingBalances(income, f, snap, 0);

    const deltaInventoryValue = cashFlow.endingInventoryValue.minus(ZERO);
    const ocfFromFormula = income.netIncome.minus(deltaInventoryValue);

    expect(cashFlow.operatingCashFlow.toNumber()).toBe(-22400);
    expect(ocfFromFormula.toNumber()).toBe(-22400);
    expect(cashFlow.operatingCashFlow.equals(ocfFromFormula)).toBe(true);
  });
});
