import Decimal from 'decimal.js';
import { CompanySnapshot, FulfillmentResult, FinancialResult } from '../types';
import { D, ZERO, toMoney } from '../math/precision';
import { IncomeStatementResult } from './income-statement';

/**
 * Reconciles cash flows, operating working capital, and ending liquid cash reserves.
 * Enforces decoupling of cash from accounting net income:
 * OCF = Cash Inflows - Cash Outflows = NI - Delta(Inventory Value)
 */
export function calculateCashFlowAndEndingBalances(
  income: IncomeStatementResult,
  fulfillment: FulfillmentResult,
  snapshot: CompanySnapshot,
  investorCapitalInjected: Decimal.Value = 0,
  deductTaxFromCash: boolean = true
): FinancialResult {
  const beginningCash = D(snapshot.cash);
  const investorCash = D(investorCapitalInjected);

  // 1. Operating Cash Inflows
  const cashInflows = income.grossRevenue;

  // 2. Operating Cash Outflows
  // NOTE: Production units produced this round are paid for in cash immediately upon production!
  const productionCashDrain = toMoney(
    fulfillment.actualProductionUnits.times(fulfillment.effectiveUnitProductionCost)
  );

  const taxOutflow = deductTaxFromCash ? income.taxExpense : ZERO;

  const operatingOutflows = toMoney(
    income.marketingExpense
      .plus(income.rdExpense)
      .plus(income.operationsExpense)
      .plus(productionCashDrain)
      .plus(income.inventoryHoldingCost)
      .plus(taxOutflow)
      .plus(income.adminFee)
  );

  // 3. Operating Cash Flow (OCF)
  const ocf = cashInflows.minus(operatingOutflows);

  // 4. Financing Cash Flow (FCF) - Outside VC investment
  const fcf = investorCash;

  // 5. Ending Liquid Cash
  // Emergency borrowing is DISABLED in MVP: ending cash is floor-bounded at 0.00
  const rawEndingCash = beginningCash.plus(ocf).plus(fcf);
  const endingCash = toMoney(Decimal.max(ZERO, rawEndingCash));

  // 6. Ending Inventory Book Value
  const endingInventoryValue = toMoney(
    fulfillment.endingInventoryUnits.times(fulfillment.averageInventoryUnitCost)
  );

  return {
    teamId: income.teamId,
    grossRevenue: income.grossRevenue,
    cogs: income.cogs,
    grossProfit: income.grossProfit,
    inventoryHoldingCost: income.inventoryHoldingCost,
    totalOpEx: income.totalOpEx,
    ebitda: income.ebitda,
    taxExpense: income.taxExpense,
    netIncome: income.netIncome,
    newTaxLossCarryforward: income.newTaxLossCarryforward,
    operatingCashFlow: ocf,
    financingCashFlow: fcf,
    endingCash,
    endingInventoryValue,
  };
}
