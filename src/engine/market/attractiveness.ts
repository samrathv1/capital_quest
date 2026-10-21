import Decimal from 'decimal.js';
import { AttractivenessResult, QualityResult, BrandResult, DomainConfig } from '../types';
import { D, decPow } from '../math/precision';

/**
 * Calculates price competitiveness ratio:
 * pi = (P_bench / P_i)^epsilon_p
 */
export function calculatePriceCompetitiveness(
  price: Decimal.Value,
  benchmarkPrice: Decimal.Value,
  priceElasticity: Decimal.Value
): Decimal {
  const p = D(price);
  const pBench = D(benchmarkPrice);
  const eps = D(priceElasticity);

  if (p.isZero() || p.isNegative()) {
    return D(1.0);
  }

  const ratio = pBench.dividedBy(p);
  return decPow(ratio, eps);
}

/**
 * Calculates raw company attractiveness score A_i,t:
 * A_i,t = (Q^alpha_q) * (beta^alpha_m) * (pi) * Phi_event * (0.50 if Q < Q_floor)
 */
export function calculateRawAttractiveness(
  quality: QualityResult,
  brand: BrandResult,
  price: Decimal.Value,
  domain: DomainConfig,
  effectivePriceElasticity: Decimal.Value,
  effectiveMktElasticity: Decimal.Value,
  eventMultiplier: Decimal.Value = 1.0
): AttractivenessResult {
  const p = D(price);
  const qVal = D(quality.qualityIndex);
  const betaVal = D(brand.normalizedBrandRatio);
  const alphaQ = D(domain.rdElasticity);
  const alphaM = D(effectiveMktElasticity);
  const phiEvent = D(eventMultiplier);

  // 1. Quality component: Q^alpha_q
  const qComp = decPow(qVal, alphaQ);

  // 2. Brand component: beta^alpha_m (single exponentiation)
  const bComp = decPow(betaVal, alphaM);

  // 3. Price competitiveness: pi
  const pi = calculatePriceCompetitiveness(p, domain.benchmarkPrice, effectivePriceElasticity);

  // 4. Raw product
  let rawA = qComp.times(bComp).times(pi).times(phiEvent);

  // 5. Regulatory quality floor penalty: 50% penalty if Q < Q_floor
  const qualityPenaltyApplied = quality.isBelowRegulatoryFloor;
  if (qualityPenaltyApplied) {
    rawA = rawA.times(0.50);
  }

  return {
    teamId: quality.teamId,
    price: p,
    priceCompetitiveness: pi,
    rawAttractiveness: rawA,
    qualityPenaltyApplied,
  };
}
