import Decimal from 'decimal.js';
import { CompanyDecision, FulfillmentResult, DomainConfig } from '../types';
import { D, ZERO, toMoney } from '../math/precision';
import { RevenueAndCogs } from './revenue-cogs';

export const TAX_RATE = D(0.20); // 20% corporate tax rate

export interface IncomeStatementResult {
  readonly teamId: string;
  readonly grossRevenue: Decimal;
  readonly cogs: Decimal;
  readonly grossProfit: Decimal;
  readonly marketingExpense: Decimal;
  readonly rdExpense: Decimal;
  readonly operationsExpense: Decimal;
  readonly inventoryHoldingCost: Decimal;
  readonly adminFee: Decimal;
  readonly totalOpEx: Decimal;
  readonly ebitda: Decimal;
  readonly taxExpense: Decimal;
  readonly netIncome: Decimal;
  readonly newTaxLossCarryforward: Decimal;
}

/**
 * Calculates operating expenses, EBITDA, corporate taxes with NOL carryforwards, and net income.
 */
export function calculateIncomeStatement(
  revenueAndCogs: RevenueAndCogs,
  decision: CompanyDecision,
  fulfillment: FulfillmentResult,
  domain: DomainConfig,
  priorTaxLossCarryforward: Decimal.Value = 0,
  adminFee: Decimal.Value = 0
): IncomeStatementResult {
  const m = D(decision.marketingBudget);
  const r = D(decision.rdBudget);
  const o = D(decision.operationsBudget);
  const fee = D(adminFee);

  // 1. Holding cost on unsold inventory
  const holdingUnitCost = D(domain.unitHoldingCost);
  const inventoryHoldingCost = toMoney(fulfillment.endingInventoryUnits.times(holdingUnitCost));

  // 2. Total OpEx
  const totalOpEx = toMoney(m.plus(r).plus(o).plus(inventoryHoldingCost).plus(fee));

  // 3. EBITDA
  const ebitda = revenueAndCogs.grossProfit.minus(totalOpEx);

  // 4. Taxes & Tax Loss Carryforwards (NOL)
  const priorNOL = D(priorTaxLossCarryforward);
  let taxExpense = ZERO;
  let newNOL = ZERO;

  if (ebitda.gt(ZERO)) {
    if (ebitda.gt(priorNOL)) {
      const taxableIncome = ebitda.minus(priorNOL);
      taxExpense = toMoney(taxableIncome.times(TAX_RATE));
      newNOL = ZERO;
    } else {
      taxExpense = ZERO;
      newNOL = priorNOL.minus(ebitda);
    }
  } else {
    // Loss round: accumulate NOL, zero tax
    taxExpense = ZERO;
    newNOL = priorNOL.plus(ebitda.abs());
  }

  // 5. Net Income
  const netIncome = ebitda.minus(taxExpense);

  return {
    teamId: decision.teamId,
    grossRevenue: revenueAndCogs.grossRevenue,
    cogs: revenueAndCogs.cogs,
    grossProfit: revenueAndCogs.grossProfit,
    marketingExpense: m,
    rdExpense: r,
    operationsExpense: o,
    inventoryHoldingCost,
    adminFee: fee,
    totalOpEx,
    ebitda,
    taxExpense,
    netIncome,
    newTaxLossCarryforward: newNOL,
  };
}
