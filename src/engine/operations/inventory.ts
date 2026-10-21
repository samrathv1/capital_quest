import Decimal from 'decimal.js';
import {
  CompanyDecision,
  CompanySnapshot,
  MarketShareResult,
  AttractivenessResult,
  FulfillmentResult,
  DomainConfig,
} from '../types';
import { D, ZERO, ONE, safeDiv, toFloorInt } from '../math/precision';
import { calculateEstimatedUnitCost } from '../validation/budget-validator';
import { DomainShockParameters } from '../market/events';

export const THETA_RECAPTURE = D(0.40); // 40% of stockout customers seek alternatives

/**
 * Resolves inventory production, primary fulfillment, stockout redistribution,
 * and ending inventory with weighted-average unit cost tracking.
 */
export function resolveInventoryFulfillment(
  decisions: readonly CompanyDecision[],
  snapshots: readonly CompanySnapshot[],
  marketShares: readonly MarketShareResult[],
  attractivenessResults: readonly AttractivenessResult[],
  domain: DomainConfig,
  shocks: DomainShockParameters,
  qualityIndices: ReadonlyMap<string, Decimal>
): readonly FulfillmentResult[] {
  const snapshotMap = new Map(snapshots.map(s => [s.teamId, s]));
  const shareMap = new Map(marketShares.map(m => [m.teamId, m]));
  const attrMap = new Map(attractivenessResults.map(a => [a.teamId, a]));

  interface IntermediateCompany {
    teamId: string;
    preliminaryDemand: Decimal;
    beginningUnits: Decimal;
    priorAvgCost: Decimal;
    orderedUnits: Decimal;
    actualProducedUnits: Decimal;
    unitProdCost: Decimal;
    unitsAvailable: Decimal;
    newAverageCost: Decimal;
    primarySold: Decimal;
    primaryStockout: Decimal;
    rawAttractiveness: Decimal;
  }

  // Stage 1: Primary production and sales allocation
  const intermediates: IntermediateCompany[] = decisions.map(d => {
    const snap = snapshotMap.get(d.teamId);
    const share = shareMap.get(d.teamId);
    const attr = attrMap.get(d.teamId);

    const orderedUnits = D(d.productionUnits);
    // Apply event capacity cap (e.g. 65% in EV-02)
    const actualProducedUnits = toFloorInt(orderedUnits.times(shocks.maxCapacityCapPct));

    const unitProdCost = calculateEstimatedUnitCost(
      domain.baseUnitCogs,
      d.operationsBudget,
      shocks.cogsMultiplierShock
    );

    const beginningUnits = snap?.beginningInventoryUnits ?? ZERO;
    const priorAvgCost = snap?.inventoryAverageUnitCost ?? unitProdCost;
    const unitsAvailable = beginningUnits.plus(actualProducedUnits);

    // Weighted average unit cost
    const totalInventoryCostBasis = beginningUnits
      .times(priorAvgCost)
      .plus(actualProducedUnits.times(unitProdCost));

    const newAverageCost = unitsAvailable.gt(ZERO)
      ? totalInventoryCostBasis.dividedBy(unitsAvailable).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      : unitProdCost;

    let preliminaryDemand = share?.preliminaryDemandUnits ?? ZERO;

    // Apply security/quality sales penalty if active (EV-03: Quality < 40 loses 50% sales)
    if (shocks.minQualityThreshold && shocks.minQualityPenaltyPct) {
      const q = qualityIndices.get(d.teamId) ?? ZERO;
      if (q.lt(shocks.minQualityThreshold)) {
        preliminaryDemand = toFloorInt(
          preliminaryDemand.times(ONE.minus(shocks.minQualityPenaltyPct))
        );
      }
    }

    const primarySold = Decimal.min(preliminaryDemand, unitsAvailable);
    const primaryStockout = Decimal.max(ZERO, preliminaryDemand.minus(unitsAvailable));

    return {
      teamId: d.teamId,
      preliminaryDemand,
      beginningUnits,
      priorAvgCost,
      orderedUnits,
      actualProducedUnits,
      unitProdCost,
      unitsAvailable,
      newAverageCost,
      primarySold,
      primaryStockout,
      rawAttractiveness: attr?.rawAttractiveness ?? ZERO,
    };
  });

  // Stage 2: Stockout customer redistribution (40% recapture pro-rata to firms with surplus inventory)
  const totalStockoutUnits = intermediates.reduce(
    (acc, item) => acc.plus(item.primaryStockout),
    ZERO
  );
  const totalRecapturableDemand = toFloorInt(totalStockoutUnits.times(THETA_RECAPTURE));

  const recapturedMap = new Map<string, Decimal>();

  if (totalRecapturableDemand.gt(ZERO)) {
    // Find firms with surplus inventory remaining after primary fulfillment
    const surplusFirms = intermediates.filter(item =>
      item.unitsAvailable.minus(item.primarySold).gt(ZERO)
    );

    const surplusAttractivenessSum = surplusFirms.reduce(
      (acc, item) => acc.plus(item.rawAttractiveness),
      ZERO
    );

    if (surplusFirms.length > 0 && surplusAttractivenessSum.gt(ZERO)) {
      for (const firm of surplusFirms) {
        const remainingCapacity = firm.unitsAvailable.minus(firm.primarySold);
        const firmShare = safeDiv(firm.rawAttractiveness, surplusAttractivenessSum);
        const firmRecaptureDemand = toFloorInt(totalRecapturableDemand.times(firmShare));
        const actualRecapturedSold = Decimal.min(firmRecaptureDemand, remainingCapacity);
        recapturedMap.set(firm.teamId, actualRecapturedSold);
      }
    }
  }

  // Stage 3: Assemble final fulfillment results
  return intermediates.map(item => {
    const recapturedSold = recapturedMap.get(item.teamId) ?? ZERO;
    const totalSold = item.primarySold.plus(recapturedSold);
    const endingInventory = Decimal.max(ZERO, item.unitsAvailable.minus(totalSold));

    return {
      teamId: item.teamId,
      preliminaryDemandUnits: item.preliminaryDemand,
      beginningInventoryUnits: item.beginningUnits,
      productionUnitsOrdered: item.orderedUnits,
      actualProductionUnits: item.actualProducedUnits,
      unitsAvailable: item.unitsAvailable,
      primaryUnitsSold: item.primarySold,
      primaryStockoutUnits: item.primaryStockout,
      recapturedUnitsSold: recapturedSold,
      totalUnitsSold: totalSold,
      endingInventoryUnits: endingInventory,
      effectiveUnitProductionCost: item.unitProdCost,
      averageInventoryUnitCost: item.newAverageCost,
    };
  });
}
