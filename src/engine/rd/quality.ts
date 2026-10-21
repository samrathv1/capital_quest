import Decimal from 'decimal.js';
import { QualityResult, DomainConfig, CompanySnapshot } from '../types';
import { D, ZERO } from '../math/precision';

export const Q_BASE = D(20.0);
export const Q_MAX = D(100.0);
export const GAMMA_RD = D('0.0000015'); // 1.5e-6

/**
 * Calculates cumulative R&D capital stock:
 * K_rd,t = R_t + (lambda_rd * K_rd,t-1)
 */
export function calculateCumulativeRdStock(
  rdExpenditure: Decimal.Value,
  priorRdStock: Decimal.Value,
  rdRetentionRate: Decimal.Value
): Decimal {
  const r = D(rdExpenditure);
  const prior = D(priorRdStock);
  const lambda = D(rdRetentionRate);
  return r.plus(lambda.times(prior)).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

/**
 * Calculates Product Quality Index Q_t:
 * Q_t = Q_base + (Q_max - Q_base) * (1 - e^(-gamma_rd * K_rd,t))
 */
export function calculateQualityIndex(cumulativeRdStock: Decimal.Value): Decimal {
  const k = D(cumulativeRdStock);
  if (k.isZero() || k.isNegative()) {
    return Q_BASE;
  }

  // exponent = -gamma * k
  const expArg = GAMMA_RD.negated().times(k);
  const expVal = expArg.exp();
  const qualityDelta = Q_MAX.minus(Q_BASE).times(D(1).minus(expVal));
  const q = Q_BASE.plus(qualityDelta);

  return q.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * Computes the complete R&D and Quality outcome for a company in a round.
 */
export function processCompanyQuality(
  teamId: string,
  rdExpenditure: Decimal.Value,
  snapshot: CompanySnapshot,
  domain: DomainConfig
): QualityResult {
  const r = D(rdExpenditure);
  const priorStock = snapshot.cumulativeRdStock ?? ZERO;
  const rdStock = calculateCumulativeRdStock(r, priorStock, domain.rdRetentionRate);
  const qualityIndex = calculateQualityIndex(rdStock);
  const floor = D(domain.qualityRegulatoryFloor);
  const isBelowRegulatoryFloor = qualityIndex.lt(floor);

  return {
    teamId,
    rdExpenditure: r,
    cumulativeRdStock: rdStock,
    qualityIndex,
    isBelowRegulatoryFloor,
  };
}
