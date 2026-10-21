import Decimal from 'decimal.js';
import { ValuationResult, DomainConfig } from '../types';
import { D, ZERO, HUNDRED, toMoney, toInteger } from '../math/precision';
import { CashValuationPolicy, DEFAULT_CASH_VALUATION_POLICY } from './valuation-policy';

export const BASE_SEED_VALUATION = D(200000); // EV_0: Exactly $200,000.00
export const ABSOLUTE_VALUATION_FLOOR = D(50000); // $50,000.00 salvage floor
export const MARKET_LEADERSHIP_BASE = D(1000000); // $1,000,000 base for market share premium

/**
 * Calculates multi-factor enterprise value, cash capital contribution,
 * final company valuation, and equity-adjusted final tournament score.
 */
export function calculateCompanyValuation(
  teamId: string,
  roundNumber: number,
  grossRevenue: Decimal.Value,
  ebitda: Decimal.Value,
  cumulativeRdStock: Decimal.Value,
  marketSharePct: Decimal.Value,
  endingCash: Decimal.Value,
  retainedEquityPct: Decimal.Value,
  domain: DomainConfig,
  cashValuationPolicy: CashValuationPolicy = DEFAULT_CASH_VALUATION_POLICY
): ValuationResult {
  const rev = D(grossRevenue);
  const eb = D(ebitda);
  const rd = D(cumulativeRdStock);
  const ms = D(marketSharePct);
  const cash = D(endingCash);
  const equityPct = D(retainedEquityPct);

  // 1. Enterprise Value Components
  // w_rev (domain specific: 1.8 CleanTech/HealthTech, 2.5 SaaS, 1.2 D2C)
  const wRev = D(domain.revenueMultiple);
  const revComponent = toMoney(wRev.times(rev));

  // w_ebit (3.5 applied strictly to positive operating profit)
  const wEbit = domain.ebitdaMultiple ? D(domain.ebitdaMultiple) : D(3.5);
  const positiveEbitda = Decimal.max(ZERO, eb);
  const ebitdaComponent = toMoney(wEbit.times(positiveEbitda));

  // w_rd (0.40 converting cumulative R&D asset value into equity)
  const wRd = domain.rdMultiple ? D(domain.rdMultiple) : D(0.40);
  const rdComponent = toMoney(wRd.times(rd));

  // w_ms (0.50 * MarketShare * $1,000,000)
  const wMs = domain.marketShareMultiple ? D(domain.marketShareMultiple) : D(0.50);
  const msComponent = toMoney(wMs.times(ms).times(MARKET_LEADERSHIP_BASE));

  // Invariant F-01: At Round 0, enterprise value is exactly BASE_SEED_VALUATION ($200k)
  const enterpriseValue = roundNumber === 0
    ? BASE_SEED_VALUATION
    : toMoney(BASE_SEED_VALUATION.plus(revComponent).plus(ebitdaComponent).plus(rdComponent).plus(msComponent));

  // 2. Cash Capital Contribution via isolated policy
  const cashContribution = cashValuationPolicy.calculateCashContribution(roundNumber, cash, rev);

  // 3. Total Company Valuation
  const unconstrainedValuation = enterpriseValue.plus(cashContribution);
  const finalValuation = Decimal.max(ABSOLUTE_VALUATION_FLOOR, unconstrainedValuation);

  // 4. Final Equity-Adjusted Score: Valuation * (RetainedEquityPct / 100)
  const equityRatio = equityPct.dividedBy(HUNDRED);
  const finalScore = toInteger(finalValuation.times(equityRatio));

  return {
    teamId,
    baseSeedValuation: BASE_SEED_VALUATION,
    revenueValuationComponent: revComponent,
    ebitdaValuationComponent: ebitdaComponent,
    rdValuationComponent: rdComponent,
    marketShareValuationComponent: msComponent,
    enterpriseValue,
    cashValuationComponent: cashContribution,
    unconstrainedValuation,
    finalValuation,
    retainedEquityPct: equityPct,
    finalScore,
  };
}
