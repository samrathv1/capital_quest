import Decimal from 'decimal.js';
import { AttractivenessResult, MarketShareResult, DomainConfig } from '../types';
import { D, ZERO, ONE, safeDiv, decPow, toFloorInt } from '../math/precision';

export const MU_DOMAIN_MACRO = D(0.50); // Macro price sensitivity exponent

/**
 * Calculates total customer demand across the domain for the round:
 * D_domain,t = D_0 * (1 + Psi_macro,t) * (P_bench / P_bar)^0.50
 */
export function calculateTotalDomainDemand(
  domain: DomainConfig,
  prices: readonly Decimal.Value[],
  macroDemandShockDelta: Decimal.Value = 0
): { totalDemand: Decimal; averagePrice: Decimal } {
  const d0 = D(domain.baseDemand);
  const pBench = D(domain.benchmarkPrice);
  const psi = D(macroDemandShockDelta);

  const count = prices.length;
  if (count === 0) {
    return { totalDemand: d0, averagePrice: pBench };
  }

  const sumPrices = prices.reduce<Decimal>((acc, p) => acc.plus(D(p)), ZERO);
  const avgPrice = sumPrices.dividedBy(count);

  const priceRatio = safeDiv(pBench, avgPrice, ONE);
  const macroPriceSensitivity = decPow(priceRatio, MU_DOMAIN_MACRO);

  const macroMultiplier = Decimal.max(ZERO, ONE.plus(psi));
  const rawTotalDemand = d0.times(macroMultiplier).times(macroPriceSensitivity);

  return {
    totalDemand: toFloorInt(Decimal.max(ZERO, rawTotalDemand)),
    averagePrice: avgPrice,
  };
}

/**
 * Normalizes attractiveness scores into strictly conserved market shares
 * and assigns preliminary customer demand.
 */
export function calculateMarketSharesAndDemand(
  attractivenessResults: readonly AttractivenessResult[],
  totalDomainDemand: Decimal.Value
): readonly MarketShareResult[] {
  const count = attractivenessResults.length;
  const dTotal = D(totalDomainDemand);

  if (count === 0) return [];

  const totalAttractiveness = attractivenessResults.reduce<Decimal>(
    (acc, r) => acc.plus(r.rawAttractiveness),
    ZERO
  );

  // If all companies have zero attractiveness (edge case), divide equally
  const isAllZero = totalAttractiveness.isZero();
  const equalShare = safeDiv(ONE, count);

  return attractivenessResults.map(r => {
    const share = isAllZero
      ? equalShare
      : safeDiv(r.rawAttractiveness, totalAttractiveness);

    const preliminaryDemand = toFloorInt(dTotal.times(share));

    return {
      teamId: r.teamId,
      attractivenessScore: r.rawAttractiveness,
      marketSharePct: share,
      preliminaryDemandUnits: preliminaryDemand,
    };
  });
}
