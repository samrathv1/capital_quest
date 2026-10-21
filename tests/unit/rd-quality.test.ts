import { describe, it, expect } from 'vitest';
import {
  calculateCumulativeRdStock,
  calculateQualityIndex,
  processCompanyQuality,
  Q_BASE,
  Q_MAX,
} from '@/engine/rd/quality';
import { DOMAIN_ARCHETYPES } from '@/engine/config/domain-archetypes';
import { CompanySnapshot } from '@/engine/types';
import { D, ZERO } from '@/engine/math/precision';

describe('Engine R&D: Cumulative Stock & Quality Index', () => {
  const domain = DOMAIN_ARCHETYPES.cleantech; // lambda_rd = 0.70, Q_floor = 30.0

  it('accumulates R&D stock across rounds with retention decay', () => {
    // Round 1: $250,000 R&D, $0 prior -> $250,000
    const stock1 = calculateCumulativeRdStock(250000, 0, 0.70);
    expect(stock1.toNumber()).toBe(250000);

    // Round 2: $200,000 R&D, $250k prior -> 200k + (0.70 * 250k) = 200k + 175k = $375,000
    const stock2 = calculateCumulativeRdStock(200000, stock1, 0.70);
    expect(stock2.toNumber()).toBe(375000);
  });

  it('calculates Product Quality Index matching worked example specifications', () => {
    // $0 R&D -> Q_base = 20.00
    expect(calculateQualityIndex(0).toNumber()).toBe(20.0);

    // Co A: $250k R&D -> 45.02 pts (Worked example line 345)
    expect(calculateQualityIndex(250000).toNumber()).toBe(45.02);

    // Co B: $150k R&D -> 36.12 pts (Worked example line 346)
    expect(calculateQualityIndex(150000).toNumber()).toBe(36.12);

    // Co C: $10k R&D -> 21.19 pts (Worked example line 347)
    expect(calculateQualityIndex(10000).toNumber()).toBe(21.19);

    // Extreme investment ($10,000,000) asymptotes smoothly toward Q_max (100.0) without exceeding it
    const extremeQ = calculateQualityIndex(10000000);
    expect(extremeQ.toNumber()).toBeLessThanOrEqual(Q_MAX.toNumber());
    expect(extremeQ.toNumber()).toBeCloseTo(100.0, 1);
  });

  it('flags regulatory floor violation when quality is below domain floor', () => {
    const snapshot: CompanySnapshot = {
      teamId: 'CT-C',
      roundNumber: 0,
      cash: D(1000000),
      beginningInventoryUnits: ZERO,
      inventoryAverageUnitCost: D(600),
      cumulativeRdStock: ZERO,
      cumulativeBrandStock: ZERO,
      retainedEquityPct: D(100),
      valuation: D(200000),
    };

    // Co C spends $10,000 -> Q = 21.19 < 30.0 floor in CleanTech
    const res = processCompanyQuality('CT-C', 10000, snapshot, domain);
    expect(res.qualityIndex.toNumber()).toBe(21.19);
    expect(res.isBelowRegulatoryFloor).toBe(true);

    // Co A spends $250,000 -> Q = 45.02 >= 30.0 floor
    const resA = processCompanyQuality('CT-A', 250000, snapshot, domain);
    expect(resA.qualityIndex.toNumber()).toBe(45.02);
    expect(resA.isBelowRegulatoryFloor).toBe(false);
  });
});
