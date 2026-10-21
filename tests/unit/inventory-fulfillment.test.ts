import { describe, it, expect } from 'vitest';
import { resolveInventoryFulfillment } from '@/engine/operations/inventory';
import { DOMAIN_ARCHETYPES } from '@/engine/config/domain-archetypes';
import { resolveDomainShocks } from '@/engine/market/events';
import {
  CompanyDecision,
  CompanySnapshot,
  MarketShareResult,
  AttractivenessResult,
} from '@/engine/types';
import { D, ZERO } from '@/engine/math/precision';

describe('Engine Operations: Inventory, Fulfillment & Stockout Redistribution', () => {
  const domain = DOMAIN_ARCHETYPES.cleantech; // base COGS: 600

  it('correctly allocates sales when demand exceeds inventory (Stockout Scenario)', () => {
    const decisions: CompanyDecision[] = [
      { teamId: 'A', marketingBudget: 250000, rdBudget: 250000, operationsBudget: 50000, productionUnits: 700, unitPrice: 1200, investmentDecision: 'REJECT_BOTH' },
      { teamId: 'B', marketingBudget: 100000, rdBudget: 150000, operationsBudget: 50000, productionUnits: 500, unitPrice: 1300, investmentDecision: 'REJECT_BOTH' },
      { teamId: 'C', marketingBudget: 10000, rdBudget: 10000, operationsBudget: 0, productionUnits: 100, unitPrice: 1200, investmentDecision: 'REJECT_BOTH' },
    ];

    const snapshots: CompanySnapshot[] = [
      { teamId: 'A', roundNumber: 0, cash: D(1e6), beginningInventoryUnits: ZERO, inventoryAverageUnitCost: D(600), cumulativeRdStock: ZERO, cumulativeBrandStock: ZERO, retainedEquityPct: D(100), valuation: D(2e5) },
      { teamId: 'B', roundNumber: 0, cash: D(1e6), beginningInventoryUnits: ZERO, inventoryAverageUnitCost: D(600), cumulativeRdStock: ZERO, cumulativeBrandStock: ZERO, retainedEquityPct: D(100), valuation: D(2e5) },
      { teamId: 'C', roundNumber: 0, cash: D(1e6), beginningInventoryUnits: ZERO, inventoryAverageUnitCost: D(600), cumulativeRdStock: ZERO, cumulativeBrandStock: ZERO, retainedEquityPct: D(100), valuation: D(2e5) },
    ];

    const marketShares: MarketShareResult[] = [
      { teamId: 'A', attractivenessScore: D(35.318), marketSharePct: D(0.639), preliminaryDemandUnits: D(12782) },
      { teamId: 'B', attractivenessScore: D(17.664), marketSharePct: D(0.320), preliminaryDemandUnits: D(6394) },
      { teamId: 'C', attractivenessScore: D(2.278), marketSharePct: D(0.041), preliminaryDemandUnits: D(824) },
    ];

    const attractivenessResults: AttractivenessResult[] = [
      { teamId: 'A', price: D(1200), priceCompetitiveness: D(1.0), rawAttractiveness: D(35.318), qualityPenaltyApplied: false },
      { teamId: 'B', price: D(1300), priceCompetitiveness: D(0.909), rawAttractiveness: D(17.664), qualityPenaltyApplied: false },
      { teamId: 'C', price: D(1200), priceCompetitiveness: D(1.0), rawAttractiveness: D(2.278), qualityPenaltyApplied: true },
    ];

    const shocks = resolveDomainShocks(domain, []);
    const qualityMap = new Map([['A', D(45.02)], ['B', D(36.12)], ['C', D(21.19)]]);

    const results = resolveInventoryFulfillment(
      decisions,
      snapshots,
      marketShares,
      attractivenessResults,
      domain,
      shocks,
      qualityMap
    );

    expect(results).toHaveLength(3);

    const fA = results.find(r => r.teamId === 'A')!;
    const fB = results.find(r => r.teamId === 'B')!;
    const fC = results.find(r => r.teamId === 'C')!;

    // Units sold equal manufactured inventory (stockout)
    expect(fA.totalUnitsSold.toNumber()).toBe(700);
    expect(fA.endingInventoryUnits.toNumber()).toBe(0);
    expect(fA.primaryStockoutUnits.toNumber()).toBe(12082); // 12,782 - 700

    expect(fB.totalUnitsSold.toNumber()).toBe(500);
    expect(fB.endingInventoryUnits.toNumber()).toBe(0);
    expect(fB.primaryStockoutUnits.toNumber()).toBe(5894); // 6,394 - 500

    expect(fC.totalUnitsSold.toNumber()).toBe(100);
    expect(fC.endingInventoryUnits.toNumber()).toBe(0);
    expect(fC.primaryStockoutUnits.toNumber()).toBe(724); // 824 - 100

    // Unit manufacturing cost with 4% discount for A and B ($50k Ops budget -> 4% discount on $600 = $576)
    expect(fA.effectiveUnitProductionCost.toNumber()).toBe(576);
    expect(fB.effectiveUnitProductionCost.toNumber()).toBe(576);
    expect(fC.effectiveUnitProductionCost.toNumber()).toBe(600);
  });

  it('redistributes 40% of stockout customers to competitors with surplus inventory', () => {
    // Team A produces 100 units (demanded 500 -> 400 stockouts)
    // Team B produces 1,000 units (demanded 200 -> 800 surplus units)
    const decisions: CompanyDecision[] = [
      { teamId: 'A', marketingBudget: 0, rdBudget: 0, operationsBudget: 0, productionUnits: 100, unitPrice: 1200, investmentDecision: 'REJECT_BOTH' },
      { teamId: 'B', marketingBudget: 0, rdBudget: 0, operationsBudget: 0, productionUnits: 1000, unitPrice: 1200, investmentDecision: 'REJECT_BOTH' },
    ];

    const snapshots: CompanySnapshot[] = [
      { teamId: 'A', roundNumber: 0, cash: D(1e6), beginningInventoryUnits: ZERO, inventoryAverageUnitCost: D(600), cumulativeRdStock: ZERO, cumulativeBrandStock: ZERO, retainedEquityPct: D(100), valuation: D(2e5) },
      { teamId: 'B', roundNumber: 0, cash: D(1e6), beginningInventoryUnits: ZERO, inventoryAverageUnitCost: D(600), cumulativeRdStock: ZERO, cumulativeBrandStock: ZERO, retainedEquityPct: D(100), valuation: D(2e5) },
    ];

    const marketShares: MarketShareResult[] = [
      { teamId: 'A', attractivenessScore: D(10), marketSharePct: D(0.50), preliminaryDemandUnits: D(500) },
      { teamId: 'B', attractivenessScore: D(10), marketSharePct: D(0.50), preliminaryDemandUnits: D(200) },
    ];

    const attractivenessResults: AttractivenessResult[] = [
      { teamId: 'A', price: D(1200), priceCompetitiveness: D(1.0), rawAttractiveness: D(10), qualityPenaltyApplied: false },
      { teamId: 'B', price: D(1200), priceCompetitiveness: D(1.0), rawAttractiveness: D(10), qualityPenaltyApplied: false },
    ];

    const shocks = resolveDomainShocks(domain, []);
    const qualityMap = new Map([['A', D(20)], ['B', D(20)]]);

    const results = resolveInventoryFulfillment(
      decisions,
      snapshots,
      marketShares,
      attractivenessResults,
      domain,
      shocks,
      qualityMap
    );

    const fA = results.find(r => r.teamId === 'A')!;
    const fB = results.find(r => r.teamId === 'B')!;

    // Team A had 400 stockouts. 40% recapture = 160 units.
    // Team B has surplus capacity (1,000 - 200 = 800 available), so Team B recaptures all 160 units!
    expect(fA.primaryStockoutUnits.toNumber()).toBe(400);
    expect(fB.recapturedUnitsSold.toNumber()).toBe(160);
    expect(fB.totalUnitsSold.toNumber()).toBe(360); // 200 primary + 160 recaptured
    expect(fB.endingInventoryUnits.toNumber()).toBe(640); // 1,000 - 360 = 640
  });

  it('computes weighted-average inventory cost correctly across rounds', () => {
    // Team has 200 units beginning inventory @ $500/unit
    // Produces 800 new units @ $600/unit
    // Total cost basis: (200 * 500) + (800 * 600) = 100,000 + 480,000 = $580,000
    // Total units: 1,000
    // Weighted avg cost: $580,000 / 1,000 = $580/unit
    const decisions: CompanyDecision[] = [
      { teamId: 'A', marketingBudget: 0, rdBudget: 0, operationsBudget: 0, productionUnits: 800, unitPrice: 1200, investmentDecision: 'REJECT_BOTH' },
    ];

    const snapshots: CompanySnapshot[] = [
      { teamId: 'A', roundNumber: 1, cash: D(1e6), beginningInventoryUnits: D(200), inventoryAverageUnitCost: D(500), cumulativeRdStock: ZERO, cumulativeBrandStock: ZERO, retainedEquityPct: D(100), valuation: D(2e5) },
    ];

    const marketShares: MarketShareResult[] = [
      { teamId: 'A', attractivenessScore: D(10), marketSharePct: D(1.0), preliminaryDemandUnits: D(500) },
    ];

    const attractivenessResults: AttractivenessResult[] = [
      { teamId: 'A', price: D(1200), priceCompetitiveness: D(1.0), rawAttractiveness: D(10), qualityPenaltyApplied: false },
    ];

    const shocks = resolveDomainShocks(domain, []);
    const qualityMap = new Map([['A', D(20)]]);

    const results = resolveInventoryFulfillment(
      decisions,
      snapshots,
      marketShares,
      attractivenessResults,
      domain,
      shocks,
      qualityMap
    );

    expect(results[0].averageInventoryUnitCost.toNumber()).toBe(580);
    expect(results[0].unitsAvailable.toNumber()).toBe(1000);
    expect(results[0].totalUnitsSold.toNumber()).toBe(500);
    expect(results[0].endingInventoryUnits.toNumber()).toBe(500);
  });
});
