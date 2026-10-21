import Decimal from 'decimal.js';
import { CompanyDecision, DomainConfig, CompanySnapshot } from '../types';
import { D, ZERO } from '../math/precision';

export interface ValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
  readonly totalPlannedOutflow: Decimal;
  readonly estimatedUnitCost: Decimal;
}

/**
 * Calculates effective unit manufacturing cost given an operations budget and domain baseline.
 * c_t = c_0 * (1 - min(0.20, (O_t / 250,000) * 0.20))
 */
export function calculateEstimatedUnitCost(
  baseUnitCogs: Decimal.Value,
  operationsBudget: Decimal.Value,
  cogsMultiplierShock: Decimal.Value = 1.0
): Decimal {
  const c0 = D(baseUnitCogs);
  const o = D(operationsBudget);
  const shock = D(cogsMultiplierShock);

  // Operations budget discount: up to 20% discount achieved at $250,000
  const discountFactor = Decimal.min(
    D(0.20),
    o.dividedBy(250000).times(0.20)
  );

  const effectiveCogs = c0.times(D(1).minus(discountFactor)).times(shock);
  return effectiveCogs.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * Validates a team's decision slip against domain constraints and liquid cash reserves.
 * Enforces P-02: Hard block on overspending exceeding available cash.
 */
export function validateCompanyDecision(
  decision: CompanyDecision,
  domain: DomainConfig,
  snapshot: CompanySnapshot,
  cogsMultiplierShock: Decimal.Value = 1.0
): ValidationResult {
  const errors: string[] = [];

  const marketing = D(decision.marketingBudget);
  const rd = D(decision.rdBudget);
  const operations = D(decision.operationsBudget);
  const units = D(decision.productionUnits);
  const price = D(decision.unitPrice);
  const availableCash = D(snapshot.cash);

  // 1. Non-negativity checks
  if (marketing.isNegative()) errors.push(`Marketing budget cannot be negative (got ${marketing.toString()}).`);
  if (rd.isNegative()) errors.push(`R&D budget cannot be negative (got ${rd.toString()}).`);
  if (operations.isNegative()) errors.push(`Operations budget cannot be negative (got ${operations.toString()}).`);
  if (units.isNegative() || !units.isInteger()) {
    errors.push(`Production units must be a non-negative integer (got ${units.toString()}).`);
  }

  // 2. Price range check
  const minPrice = D(domain.minPrice);
  const maxPrice = D(domain.maxPrice);
  if (price.lt(minPrice) || price.gt(maxPrice)) {
    errors.push(
      `Unit price $${price.toString()} is outside domain allowed range [$${minPrice.toString()} - $${maxPrice.toString()}].`
    );
  }

  // 3. Investment decision validation
  if (!['OFFER_A', 'OFFER_B', 'REJECT_BOTH'].includes(decision.investmentDecision)) {
    errors.push(`Invalid investment decision: "${decision.investmentDecision}".`);
  }

  // 4. Outflow vs Cash check (Solvency Constraint)
  const unitCost = calculateEstimatedUnitCost(domain.baseUnitCogs, operations, cogsMultiplierShock);
  const productionCashDrain = units.times(unitCost);
  const totalPlannedOutflow = marketing.plus(rd).plus(operations).plus(productionCashDrain);

  if (totalPlannedOutflow.gt(availableCash)) {
    errors.push(
      `Planned cash outflow ($${totalPlannedOutflow.toFixed(2)}) exceeds available liquid cash ($${availableCash.toFixed(2)}) by $${totalPlannedOutflow.minus(availableCash).toFixed(2)}.`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    totalPlannedOutflow,
    estimatedUnitCost: unitCost,
  };
}

/**
 * Creates the approved default fallback decision if a team fails to submit or correct an overspending slip
 * (CQ-SPEC-02 Section 4.3).
 */
export function createDefaultFallbackDecision(
  teamId: string,
  domain: DomainConfig,
  snapshot: CompanySnapshot
): CompanyDecision {
  const availableCash = Decimal.max(ZERO, snapshot.cash.minus(10000)); // Account for $10k administrative penalty
  const unitCost = calculateEstimatedUnitCost(domain.baseUnitCogs, ZERO);
  const affordableUnits = unitCost.isZero()
    ? ZERO
    : availableCash.dividedBy(unitCost).floor();

  return {
    teamId,
    marketingBudget: ZERO,
    rdBudget: ZERO,
    operationsBudget: ZERO,
    productionUnits: affordableUnits,
    unitPrice: domain.benchmarkPrice,
    investmentDecision: 'REJECT_BOTH',
  };
}
