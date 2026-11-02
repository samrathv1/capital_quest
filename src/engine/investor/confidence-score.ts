import { CompanySnapshotRecord } from '../../types/database';
import {
  InvestorConfidenceTier,
  DynamicInvestorOffer,
  getTierFromConfidenceScore,
  buildTierOffers,
} from './offer-tiers';

export interface CategoryMetricDetail {
  readonly rawValue: number;
  readonly normalizedScore: number; // 0 - 100
  readonly benchmark: string;
  readonly explanation: string;
}

export interface InvestorConfidenceBreakdown {
  readonly financialPerformance: {
    readonly score: number; // 0 - 100 (weighted 30%)
    readonly metrics: {
      readonly netMargin: CategoryMetricDetail;
      readonly liquidityRatio: CategoryMetricDetail;
      readonly grossMargin: CategoryMetricDetail;
    };
  };
  readonly growthPotential: {
    readonly score: number; // 0 - 100 (weighted 25%)
    readonly metrics: {
      readonly productQuality: CategoryMetricDetail;
      readonly brandEquity: CategoryMetricDetail;
      readonly marketShare: CategoryMetricDetail;
    };
  };
  readonly businessStrategy: {
    readonly score: number; // 0 - 100 (weighted 25%)
    readonly metrics: {
      readonly operatingEfficiency: CategoryMetricDetail;
      readonly pricingDiscipline: CategoryMetricDetail;
      readonly valuationTrajectory: CategoryMetricDetail;
    };
  };
  readonly marketAdaptability: {
    readonly score: number; // 0 - 100 (weighted 20%)
    readonly metrics: {
      readonly fulfillmentRate: CategoryMetricDetail;
      readonly inventoryHealth: CategoryMetricDetail;
      readonly cashResilience: CategoryMetricDetail;
    };
  };
}

export interface InvestorConfidenceResult {
  readonly teamId: string;
  readonly targetRoundNumber: number;
  readonly confidenceScore: number; // 0 - 100
  readonly tier: InvestorConfidenceTier;
  readonly breakdown: InvestorConfidenceBreakdown;
  readonly offerA: DynamicInvestorOffer;
  readonly offerB: DynamicInvestorOffer;
}

export type CompanySnapshotInput = Partial<CompanySnapshotRecord> & {
  cash?: number;
  valuation?: number;
  cumulativeRdStock?: number;
  cumulativeBrandStock?: number;
  marketSharePct?: number;
  productQualityIndex?: number;
  brandEquityScore?: number;
};

/**
 * Historical company round performance records input for scoring.
 * Uses only finalized prior rounds.
 */
export interface FinalizedRoundData {
  readonly roundNumber: number;
  readonly snapshot: CompanySnapshotInput;
  readonly grossRevenue?: number;
  readonly netIncome?: number;
  readonly grossProfit?: number;
  readonly ebitda?: number;
  readonly operatingExpenses?: number;
  readonly unitsSold?: number;
  readonly unitsStockout?: number;
  readonly unitsAvailable?: number;
  readonly endingInventory?: number;
  readonly unitPrice?: number;
  readonly benchmarkPrice?: number;
}

function clamp(value: number, min: number = 0, max: number = 100): number {
  if (isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * Computes deterministic Investor Confidence Score from finalized prior round history.
 *
 * Weighting:
 * - A. FINANCIAL PERFORMANCE (30%): Profitability, Liquid Capital, Financial Discipline
 * - B. GROWTH POTENTIAL (25%): Product Quality, Brand Equity, Market Expansion
 * - C. BUSINESS STRATEGY (25%): Resource Allocation, Pricing Discipline, Valuation Trajectory
 * - D. MARKET ADAPTABILITY (20%): Fulfillment, Inventory Health, Shock Absorption
 *
 * For Round 2: Evaluates finalized Round 1 data.
 * For Round 4: Evaluates finalized Rounds 1 to 3 with recency weighting (R3: 50%, R2: 30%, R1: 20%).
 */
export function computeInvestorConfidenceScore(params: {
  teamId: string;
  targetRoundNumber: number; // 2 or 4
  history: readonly FinalizedRoundData[];
}): InvestorConfidenceResult {
  const { teamId, targetRoundNumber, history } = params;

  // Filter strictly to finalized prior rounds (prevent future-round leakage)
  const eligibleRounds = history
    .filter(h => h.roundNumber < targetRoundNumber)
    .sort((a, b) => a.roundNumber - b.roundNumber);

  if (eligibleRounds.length === 0) {
    // If no prior rounds exist (e.g. fresh registration), default to baseline moderate tier
    const baselineScore = 50;
    const tier = getTierFromConfidenceScore(baselineScore);
    const { offerA, offerB } = buildTierOffers(targetRoundNumber, tier);
    return {
      teamId,
      targetRoundNumber,
      confidenceScore: baselineScore,
      tier,
      breakdown: createDefaultBreakdown(baselineScore),
      offerA,
      offerB,
    };
  }

  // Calculate per-round component scores
  const roundScores = eligibleRounds.map(r => evaluateSingleRoundMetrics(r));

  // Weight across eligible rounds (for Round 4: R3 50%, R2 30%, R1 20%)
  const compositeBreakdown = blendRoundBreakdowns(roundScores);

  const financialScore = compositeBreakdown.financialPerformance.score;
  const growthScore = compositeBreakdown.growthPotential.score;
  const strategyScore = compositeBreakdown.businessStrategy.score;
  const adaptabilityScore = compositeBreakdown.marketAdaptability.score;

  // Final 4-category weighted sum (30% / 25% / 25% / 20%)
  const rawComposite =
    0.30 * financialScore +
    0.25 * growthScore +
    0.25 * strategyScore +
    0.20 * adaptabilityScore;

  const confidenceScore = clamp(Math.round(rawComposite), 0, 100);
  const tier = getTierFromConfidenceScore(confidenceScore);
  const { offerA, offerB } = buildTierOffers(targetRoundNumber, tier);

  return {
    teamId,
    targetRoundNumber,
    confidenceScore,
    tier,
    breakdown: compositeBreakdown,
    offerA,
    offerB,
  };
}

/**
 * Evaluates the 4 categories for a single completed round.
 */
function evaluateSingleRoundMetrics(roundData: FinalizedRoundData): InvestorConfidenceBreakdown {
  const { snapshot } = roundData;

  const cash = Number(snapshot.ending_cash ?? snapshot.cash ?? 1000000);
  const valuation = Number(snapshot.company_valuation ?? snapshot.valuation ?? 200000);
  const quality = Number(
    snapshot.product_quality_index ??
    snapshot.productQualityIndex ??
    snapshot.cumulativeRdStock ??
    25
  );
  const brand = Number(
    snapshot.brand_equity_score ??
    snapshot.brandEquityScore ??
    snapshot.cumulativeBrandStock ??
    15
  );
  const rawMarketShare = Number(snapshot.market_share_pct ?? snapshot.marketSharePct ?? 25);
  // Normalize market share: handle decimal fraction (e.g. 0.25 -> 25%) vs percentage (25 -> 25%)
  const marketShare = rawMarketShare > 0 && rawMarketShare <= 1.0 ? rawMarketShare * 100 : rawMarketShare;

  const revenue = roundData.grossRevenue ?? Number(snapshot.gross_revenue ?? 0);
  const netIncome = roundData.netIncome ?? Number(snapshot.net_income ?? 0);
  const grossProfit = roundData.grossProfit ?? Number(snapshot.gross_profit ?? 0);
  const operatingExpenses = roundData.operatingExpenses ?? Number(snapshot.operating_expenses ?? (revenue > 0 ? revenue * 0.4 : 200000));
  const unitsSold = roundData.unitsSold ?? Number(snapshot.units_sold ?? 0);
  const unitsStockout = roundData.unitsStockout ?? Number(snapshot.units_stockout ?? 0);
  const unitsAvailable = roundData.unitsAvailable ?? Number(snapshot.units_available ?? (unitsSold + (roundData.endingInventory ?? Number(snapshot.ending_inventory ?? 0))));
  const endingInventory = roundData.endingInventory ?? Number(snapshot.ending_inventory ?? 0);
  const unitPrice = roundData.unitPrice ?? roundData.benchmarkPrice ?? 100;
  const benchmarkPrice = roundData.benchmarkPrice ?? 100;

  // ---------------------------------------------------------------------------
  // CATEGORY A: FINANCIAL PERFORMANCE (30%)
  // ---------------------------------------------------------------------------
  // 1. Profitability (Net Margin = netIncome / grossRevenue)
  let netMarginVal = 0;
  let netMarginScore = 50;
  if (revenue > 0) {
    netMarginVal = netIncome / revenue;
    // Net Margin: >= +25% => 100, <= -50% => 0. Linear scale in between.
    netMarginScore = clamp(Math.round(((netMarginVal - (-0.50)) / 0.75) * 100));
  } else {
    netMarginScore = netIncome >= 0 ? 50 : 20;
  }

  // 2. Liquid Capital / Runway (endingCash / startingCash $1,000,000)
  const cashRatio = cash / 1000000;
  // Cash ratio: >= 1.20 => 100, <= 0.20 => 0.
  const liquidityScore = clamp(Math.round(((cashRatio - 0.20) / 1.00) * 100));

  // 3. Financial Discipline (Gross Margin = grossProfit / grossRevenue)
  let grossMarginVal = 0;
  let grossMarginScore = 50;
  if (revenue > 0) {
    grossMarginVal = grossProfit / revenue;
    // Gross Margin: >= 50% => 100, <= 0% => 0.
    grossMarginScore = clamp(Math.round((grossMarginVal / 0.50) * 100));
  } else {
    grossMarginScore = 40;
  }

  const financialCategoryScore = clamp(
    Math.round((netMarginScore + liquidityScore + grossMarginScore) / 3)
  );

  // ---------------------------------------------------------------------------
  // CATEGORY B: GROWTH POTENTIAL (25%)
  // ---------------------------------------------------------------------------
  // 1. Product Quality (0 - 100)
  const qualityScore = clamp(Math.round(quality));

  // 2. Brand Equity (normalized against benchmark target of 60.0)
  const brandScore = clamp(Math.round((brand / 60) * 100));

  // 3. Market Share (normalized against strong performer benchmark of 35%)
  const marketShareScore = clamp(Math.round((marketShare / 35) * 100));

  const growthCategoryScore = clamp(
    Math.round((qualityScore + brandScore + marketShareScore) / 3)
  );

  // ---------------------------------------------------------------------------
  // CATEGORY C: BUSINESS STRATEGY (25%)
  // ---------------------------------------------------------------------------
  // 1. Operating Efficiency (Revenue generated per dollar of operating costs)
  let efficiencyRatio = 1.0;
  let efficiencyScore = 50;
  if (operatingExpenses > 0) {
    efficiencyRatio = revenue / operatingExpenses;
    // Ratio >= 1.8 => 100, <= 0.5 => 0.
    efficiencyScore = clamp(Math.round(((efficiencyRatio - 0.5) / 1.3) * 100));
  }

  // 2. Pricing Discipline (Normalized difference from domain benchmark price)
  const priceDiff = Math.abs(unitPrice - benchmarkPrice) / (benchmarkPrice || 1);
  // Diff <= 5% => 100, Diff >= 50% => 20.
  const pricingScore = clamp(Math.round((1 - priceDiff / 0.50) * 80 + 20));

  // 3. Valuation Trajectory (Valuation relative to starting $200,000 baseline)
  const valuationMultiple = valuation / 200000;
  // Multiple >= 6.0 ($1.2M+) => 100, <= 1.0 ($200k) => 25.
  const valuationScore = clamp(Math.round(((valuationMultiple - 1.0) / 5.0) * 75 + 25));

  const strategyCategoryScore = clamp(
    Math.round((efficiencyScore + pricingScore + valuationScore) / 3)
  );

  // ---------------------------------------------------------------------------
  // CATEGORY D: MARKET ADAPTABILITY (20%)
  // ---------------------------------------------------------------------------
  // 1. Demand Fulfillment Rate (avoiding severe stockout)
  const totalDemand = unitsSold + unitsStockout;
  const stockoutRate = totalDemand > 0 ? unitsStockout / totalDemand : 0;
  const fulfillmentScore = clamp(Math.round((1 - stockoutRate) * 100));

  // 2. Inventory Health (avoiding bloated unsold inventory)
  const wasteRate = unitsAvailable > 0 ? endingInventory / unitsAvailable : 0;
  // Waste rate <= 10% => 100, >= 60% => 10.
  const inventoryScore = clamp(Math.round((1 - wasteRate / 0.60) * 90 + 10));

  // 3. Cash Resilience / Burn Discipline (Operating solvency)
  const cashResilienceScore = cash > 500000 ? 100 : cash > 250000 ? 70 : cash > 100000 ? 40 : 15;

  const adaptabilityCategoryScore = clamp(
    Math.round((fulfillmentScore + inventoryScore + cashResilienceScore) / 3)
  );

  return {
    financialPerformance: {
      score: financialCategoryScore,
      metrics: {
        netMargin: {
          rawValue: netMarginVal,
          normalizedScore: netMarginScore,
          benchmark: '>= +25% for 100 pts',
          explanation: 'Net profit percentage on gross revenue',
        },
        liquidityRatio: {
          rawValue: cashRatio,
          normalizedScore: liquidityScore,
          benchmark: '>= 1.20x starting capital for 100 pts',
          explanation: 'Treasury reserves relative to initial funding',
        },
        grossMargin: {
          rawValue: grossMarginVal,
          normalizedScore: grossMarginScore,
          benchmark: '>= 50% for 100 pts',
          explanation: 'Unit economics and gross profit retention',
        },
      },
    },
    growthPotential: {
      score: growthCategoryScore,
      metrics: {
        productQuality: {
          rawValue: quality,
          normalizedScore: qualityScore,
          benchmark: '100 index scale',
          explanation: 'Cumulative product engineering and quality score',
        },
        brandEquity: {
          rawValue: brand,
          normalizedScore: brandScore,
          benchmark: '60.0 brand equity target',
          explanation: 'Accumulated market awareness and brand equity',
        },
        marketShare: {
          rawValue: marketShare,
          normalizedScore: marketShareScore,
          benchmark: '35% target market share',
          explanation: 'Competitive market dominance within domain',
        },
      },
    },
    businessStrategy: {
      score: strategyCategoryScore,
      metrics: {
        operatingEfficiency: {
          rawValue: efficiencyRatio,
          normalizedScore: efficiencyScore,
          benchmark: '>= 1.8x revenue per dollar of OpEx',
          explanation: 'Resource conversion and operational efficiency',
        },
        pricingDiscipline: {
          rawValue: priceDiff,
          normalizedScore: pricingScore,
          benchmark: '<= 5% deviation from benchmark',
          explanation: 'Pricing alignment with domain customer elasticity',
        },
        valuationTrajectory: {
          rawValue: valuationMultiple,
          normalizedScore: valuationScore,
          benchmark: '>= 6.0x initial valuation ($1.2M+)',
          explanation: 'Enterprise value appreciation relative to inception',
        },
      },
    },
    marketAdaptability: {
      score: adaptabilityCategoryScore,
      metrics: {
        fulfillmentRate: {
          rawValue: 1 - stockoutRate,
          normalizedScore: fulfillmentScore,
          benchmark: '100% fulfillment (0 stockouts)',
          explanation: 'Capacity sizing and customer demand satisfaction',
        },
        inventoryHealth: {
          rawValue: 1 - wasteRate,
          normalizedScore: inventoryScore,
          benchmark: '<= 10% unsold inventory ratio',
          explanation: 'Lean inventory management avoiding excessive holding cost',
        },
        cashResilience: {
          rawValue: cash,
          normalizedScore: cashResilienceScore,
          benchmark: '>= $500,000 cash reserve',
          explanation: 'Solvency buffer against unexpected market downturns',
        },
      },
    },
  };
}

/**
 * Blends breakdown scores across multiple rounds with recency weights:
 * For 3 rounds: R3 (50%), R2 (30%), R1 (20%)
 * For 2 rounds: R2 (65%), R1 (35%)
 * For 1 round: R1 (100%)
 */
function blendRoundBreakdowns(
  breakdowns: readonly InvestorConfidenceBreakdown[]
): InvestorConfidenceBreakdown {
  if (breakdowns.length === 1) return breakdowns[0];

  let weights: number[] = [];
  if (breakdowns.length === 2) {
    weights = [0.35, 0.65];
  } else if (breakdowns.length >= 3) {
    weights = [0.20, 0.30, 0.50];
  }

  const latest = breakdowns[breakdowns.length - 1];

  const blendCategoryScore = (catSelector: (b: InvestorConfidenceBreakdown) => number) => {
    let sum = 0;
    breakdowns.slice(-weights.length).forEach((b, i) => {
      sum += catSelector(b) * weights[i];
    });
    return clamp(Math.round(sum));
  };

  return {
    financialPerformance: {
      score: blendCategoryScore(b => b.financialPerformance.score),
      metrics: latest.financialPerformance.metrics,
    },
    growthPotential: {
      score: blendCategoryScore(b => b.growthPotential.score),
      metrics: latest.growthPotential.metrics,
    },
    businessStrategy: {
      score: blendCategoryScore(b => b.businessStrategy.score),
      metrics: latest.businessStrategy.metrics,
    },
    marketAdaptability: {
      score: blendCategoryScore(b => b.marketAdaptability.score),
      metrics: latest.marketAdaptability.metrics,
    },
  };
}

function createDefaultBreakdown(score: number): InvestorConfidenceBreakdown {
  const dummyMetric: CategoryMetricDetail = {
    rawValue: 0,
    normalizedScore: score,
    benchmark: 'Default',
    explanation: 'Baseline initial parameters',
  };
  return {
    financialPerformance: {
      score,
      metrics: {
        netMargin: dummyMetric,
        liquidityRatio: dummyMetric,
        grossMargin: dummyMetric,
      },
    },
    growthPotential: {
      score,
      metrics: {
        productQuality: dummyMetric,
        brandEquity: dummyMetric,
        marketShare: dummyMetric,
      },
    },
    businessStrategy: {
      score,
      metrics: {
        operatingEfficiency: dummyMetric,
        pricingDiscipline: dummyMetric,
        valuationTrajectory: dummyMetric,
      },
    },
    marketAdaptability: {
      score,
      metrics: {
        fulfillmentRate: dummyMetric,
        inventoryHealth: dummyMetric,
        cashResilience: dummyMetric,
      },
    },
  };
}
