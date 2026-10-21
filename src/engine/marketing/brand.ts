import Decimal from 'decimal.js';
import { BrandResult, DomainConfig, CompanySnapshot } from '../types';
import { D, ZERO } from '../math/precision';

export const EPSILON_BRAND_FLOOR = D(1000); // $1,000 smoothing constant

/**
 * Calculates cumulative Brand Equity Stock:
 * B_t = M_t + (lambda_mkt * B_t-1)
 */
export function calculateCumulativeBrandStock(
  marketingExpenditure: Decimal.Value,
  priorBrandStock: Decimal.Value,
  mktRetentionRate: Decimal.Value
): Decimal {
  const m = D(marketingExpenditure);
  const prior = D(priorBrandStock);
  const lambda = D(mktRetentionRate);
  return m.plus(lambda.times(prior)).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

/**
 * Calculates normalized brand attractiveness ratio (beta_i,t):
 * beta_i,t = (B_i,t + epsilon) / (B_bar_t + epsilon)
 * NOTE: P-01 Fix: Linear ratio, NO exponentiation here.
 */
export function calculateNormalizedBrandRatio(
  brandStock: Decimal.Value,
  averageDomainBrandStock: Decimal.Value,
  epsilon: Decimal.Value = EPSILON_BRAND_FLOOR
): Decimal {
  const b = D(brandStock);
  const bBar = D(averageDomainBrandStock);
  const eps = D(epsilon);

  const numerator = b.plus(eps);
  const denominator = bBar.plus(eps);
  return numerator.dividedBy(denominator);
}

/**
 * Computes brand results for an entire domain of companies simultaneously.
 */
export function processDomainBrandResults(
  decisions: readonly { teamId: string; marketingBudget: Decimal.Value }[],
  snapshots: readonly CompanySnapshot[],
  domain: DomainConfig
): readonly BrandResult[] {
  // 1. Calculate each company's new brand stock
  const snapshotMap = new Map(snapshots.map(s => [s.teamId, s]));
  const stocks: { teamId: string; marketing: Decimal; stock: Decimal }[] = decisions.map(d => {
    const snap = snapshotMap.get(d.teamId);
    const prior = snap?.cumulativeBrandStock ?? ZERO;
    const m = D(d.marketingBudget);
    const stock = calculateCumulativeBrandStock(m, prior, domain.mktRetentionRate);
    return { teamId: d.teamId, marketing: m, stock };
  });

  // 2. Calculate average domain brand stock
  const count = stocks.length;
  const totalStock = stocks.reduce((acc, s) => acc.plus(s.stock), ZERO);
  const averageStock = count > 0 ? totalStock.dividedBy(count) : ZERO;

  // 3. Calculate normalized linear ratio for each
  return stocks.map(s => {
    const ratio = calculateNormalizedBrandRatio(s.stock, averageStock);
    return {
      teamId: s.teamId,
      marketingExpenditure: s.marketing,
      cumulativeBrandStock: s.stock,
      normalizedBrandRatio: ratio,
    };
  });
}
