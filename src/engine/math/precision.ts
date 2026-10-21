import Decimal from 'decimal.js';

// Configure standard banking decimal precision
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -9,
  toExpPos: 28,
});

export { Decimal };

export type DecimalValue = Decimal.Value;

/**
 * Convenience constructor for Decimal instances.
 */
export function D(val: DecimalValue): Decimal {
  return new Decimal(val);
}

export const ZERO = new Decimal(0);
export const ONE = new Decimal(1);
export const HUNDRED = new Decimal(100);

/**
 * Rounds a Decimal value to 2 decimal places (standard currency).
 */
export function toMoney(val: DecimalValue): Decimal {
  return new Decimal(val).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * Rounds a Decimal value to nearest integer.
 */
export function toInteger(val: DecimalValue): Decimal {
  return new Decimal(val).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
}

/**
 * Floors a Decimal value to integer (for demand and unit counts).
 */
export function toFloorInt(val: DecimalValue): Decimal {
  return new Decimal(val).floor();
}

/**
 * Clamps a Decimal value between a minimum and maximum bound.
 */
export function clamp(val: DecimalValue, min: DecimalValue, max: DecimalValue): Decimal {
  const dVal = new Decimal(val);
  const dMin = new Decimal(min);
  const dMax = new Decimal(max);
  return Decimal.max(dMin, Decimal.min(dMax, dVal));
}

/**
 * Performs safe division to prevent division by zero or NaN.
 */
export function safeDiv(num: DecimalValue, den: DecimalValue, fallback: DecimalValue = 0): Decimal {
  const dDen = new Decimal(den);
  if (dDen.isZero() || !dDen.isFinite()) {
    return new Decimal(fallback);
  }
  return new Decimal(num).dividedBy(dDen);
}

/**
 * Calculates exponential value e^(x) using Decimal natural exponentiation.
 */
export function decExp(x: DecimalValue): Decimal {
  return new Decimal(x).exp();
}

/**
 * Calculates power x^y safely.
 */
export function decPow(base: DecimalValue, exp: DecimalValue): Decimal {
  const dBase = new Decimal(base);
  const dExp = new Decimal(exp);
  if (dBase.isZero()) return ZERO;
  if (dBase.isNegative()) {
    // If base is negative and exp is integer, standard math applies; otherwise clamp to 0
    if (dExp.isInteger()) {
      return dBase.pow(dExp);
    }
    return ZERO;
  }
  return dBase.pow(dExp);
}
