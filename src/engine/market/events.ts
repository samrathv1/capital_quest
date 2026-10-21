import Decimal from 'decimal.js';
import { MarketEventShock, DomainConfig } from '../types';
import { D } from '../math/precision';

export interface DomainShockParameters {
  readonly demandMultiplierDelta: Decimal; // Sum of demand shocks
  readonly cogsMultiplierShock: Decimal; // Product of cost shocks (default 1.0)
  readonly maxCapacityCapPct: Decimal; // Minimum capacity cap (default 1.0 = 100%)
  readonly effectiveMktElasticity: Decimal;
  readonly effectivePriceElasticity: Decimal;
  readonly minQualityThreshold: Decimal | null;
  readonly minQualityPenaltyPct: Decimal | null;
}

/**
 * Resolves all active market event shocks for a domain into aggregate parameters.
 */
export function resolveDomainShocks(
  domain: DomainConfig,
  activeEvents: readonly MarketEventShock[]
): DomainShockParameters {
  let demandDelta = D(0);
  let cogsShock = D(1.0);
  let capacityCap = D(1.0);
  let mktMultiplier = D(1.0);
  let priceMultiplier = D(1.0);
  let minQuality: Decimal | null = null;
  let minQualityPenalty: Decimal | null = null;

  for (const event of activeEvents) {
    if (event.demandMultiplierDelta) {
      demandDelta = demandDelta.plus(event.demandMultiplierDelta);
    }
    if (event.cogsMultiplierShock) {
      cogsShock = cogsShock.times(event.cogsMultiplierShock);
    }
    if (event.maxCapacityCapPct) {
      capacityCap = Decimal.min(capacityCap, D(event.maxCapacityCapPct));
    }
    if (event.marketingSensitivityMultiplier) {
      mktMultiplier = mktMultiplier.times(event.marketingSensitivityMultiplier);
    }
    if (event.priceElasticityMultiplier) {
      priceMultiplier = priceMultiplier.times(event.priceElasticityMultiplier);
    }
    if (event.minQualitySalesThreshold) {
      minQuality = D(event.minQualitySalesThreshold);
      minQualityPenalty = event.minQualitySalesPenaltyPct ? D(event.minQualitySalesPenaltyPct) : D(0.50);
    }
  }

  const effectiveMkt = D(domain.mktElasticity).times(mktMultiplier);
  const effectivePrice = D(domain.priceElasticity).times(priceMultiplier);

  return {
    demandMultiplierDelta: demandDelta,
    cogsMultiplierShock: cogsShock,
    maxCapacityCapPct: capacityCap,
    effectiveMktElasticity: effectiveMkt,
    effectivePriceElasticity: effectivePrice,
    minQualityThreshold: minQuality,
    minQualityPenaltyPct: minQualityPenalty,
  };
}
