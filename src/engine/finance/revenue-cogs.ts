import Decimal from 'decimal.js';
import { FulfillmentResult } from '../types';
import { D, toMoney } from '../math/precision';

export interface RevenueAndCogs {
  readonly teamId: string;
  readonly grossRevenue: Decimal;
  readonly cogs: Decimal;
  readonly grossProfit: Decimal;
}

/**
 * Calculates Revenue, Cost of Goods Sold, and Gross Profit for a company.
 * COGS is recognized strictly based on weighted average cost of units actually sold.
 */
export function calculateRevenueAndCogs(
  fulfillment: FulfillmentResult,
  unitSellingPrice: Decimal.Value
): RevenueAndCogs {
  const p = D(unitSellingPrice);
  const unitsSold = fulfillment.totalUnitsSold;
  const avgCost = fulfillment.averageInventoryUnitCost;

  const grossRevenue = toMoney(unitsSold.times(p));
  const cogs = toMoney(unitsSold.times(avgCost));
  const grossProfit = grossRevenue.minus(cogs);

  return {
    teamId: fulfillment.teamId,
    grossRevenue,
    cogs,
    grossProfit,
  };
}
