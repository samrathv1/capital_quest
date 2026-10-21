import Decimal from 'decimal.js';
import { D, ZERO } from '../math/precision';

export const WORKING_CAPITAL_FLOOR = D(250000); // $250,000 working capital floor
export const OMEGA_CASH_MULTIPLIER = D(0.25); // 0.25 valuation multiplier per surplus dollar

/**
 * Interface isolating cash valuation policies to resolve financial formula ambiguities
 * without hardcoding unapproved rules.
 */
export interface CashValuationPolicy {
  readonly policyName: string;
  calculateCashContribution(
    roundNumber: number,
    endingCash: Decimal.Value,
    grossRevenue: Decimal.Value
  ): Decimal;
}

/**
 * Authoritative Policy (CQ-SPEC-03 Step 10 & Section 3 Worked Example):
 * V_cash = $0.00 at Round 0;
 * V_cash = omega_cash * max(0, Cash - WC_floor) for Round t >= 1.
 */
export class ExcessCashMultiplierPolicy implements CashValuationPolicy {
  readonly policyName = 'ExcessCashMultiplier (0.25 * max(0, Cash - $250k)) [Authoritative Default]';

  calculateCashContribution(
    roundNumber: number,
    endingCash: Decimal.Value,
    _grossRevenue: Decimal.Value
  ): Decimal {
    void _grossRevenue;
    // Invariant F-01: Round 0 strictly produces $0.00 cash contribution
    if (roundNumber === 0) {
      return ZERO;
    }

    const cash = D(endingCash);
    const surplusCash = Decimal.max(ZERO, cash.minus(WORKING_CAPITAL_FLOOR));
    return surplusCash.times(OMEGA_CASH_MULTIPLIER).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }
}

/**
 * Alternative Audit Policy:
 * V_cash = $0.00 at Round 0;
 * V_cash = min(Cash, 2 * Revenue) * 0.25 for Round t >= 1.
 * Caps recognized cash to 2x trailing revenue to prevent zero-revenue cash hoarding.
 */
export class RevenueCappedCashPolicy implements CashValuationPolicy {
  readonly policyName = 'RevenueCappedCash (min(Cash, 2 * Revenue) * 0.25) [Alternative Proposed]';

  calculateCashContribution(
    roundNumber: number,
    endingCash: Decimal.Value,
    grossRevenue: Decimal.Value
  ): Decimal {
    if (roundNumber === 0) {
      return ZERO;
    }

    const cash = D(endingCash);
    const rev = D(grossRevenue);
    const cappedCash = Decimal.min(cash, rev.times(2.0));
    return cappedCash.times(OMEGA_CASH_MULTIPLIER).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }
}

/**
 * Default global policy instance (Authoritative Specification).
 */
export const DEFAULT_CASH_VALUATION_POLICY: CashValuationPolicy = new ExcessCashMultiplierPolicy();
