import Decimal from 'decimal.js';

export type InvestmentChoice = 'OFFER_A' | 'OFFER_B' | 'REJECT_BOTH';

export interface CompanyDecision {
  readonly teamId: string;
  readonly marketingBudget: number | Decimal;
  readonly rdBudget: number | Decimal;
  readonly productionUnits: number | Decimal;
  readonly unitPrice: number | Decimal;
  readonly operationsBudget: number | Decimal;
  readonly investmentDecision: InvestmentChoice;
}

export interface DomainConfig {
  readonly code: string;
  readonly name: string;
  readonly baseDemand: number | Decimal;
  readonly benchmarkPrice: number | Decimal;
  readonly minPrice: number | Decimal;
  readonly maxPrice: number | Decimal;
  readonly baseUnitCogs: number | Decimal;
  readonly unitHoldingCost: number | Decimal;
  readonly rdElasticity: number | Decimal; // alpha_rd (e.g. 0.85)
  readonly rdRetentionRate: number | Decimal; // lambda_rd (e.g. 0.70)
  readonly mktElasticity: number | Decimal; // alpha_mkt (e.g. 0.45)
  readonly mktRetentionRate: number | Decimal; // lambda_mkt (e.g. 0.40)
  readonly priceElasticity: number | Decimal; // epsilon_p (e.g. 1.20)
  readonly qualityRegulatoryFloor: number | Decimal; // Q_floor (e.g. 30.0)
  readonly revenueMultiple: number | Decimal; // w_rev (e.g. 1.8)
  readonly ebitdaMultiple?: number | Decimal; // w_ebit (default: 3.5)
  readonly rdMultiple?: number | Decimal; // w_rd (default: 0.40)
  readonly marketShareMultiple?: number | Decimal; // w_ms (default: 0.50)
}

export interface MarketEventShock {
  readonly id: string;
  readonly name: string;
  readonly targetDomainCode: string; // Specific domain code or 'ALL'
  readonly triggerRound: number;
  readonly demandMultiplierDelta?: number | Decimal; // e.g. +0.30 for +30%
  readonly customerQualitySensitivityDelta?: number | Decimal; // e.g. +0.20
  readonly cogsMultiplierShock?: number | Decimal; // e.g. 1.40 for +40%
  readonly maxCapacityCapPct?: number | Decimal; // e.g. 0.65 for 65% capacity cap
  readonly marketingSensitivityMultiplier?: number | Decimal; // e.g. 1.35
  readonly priceElasticityMultiplier?: number | Decimal; // e.g. 1.30
  readonly minQualitySalesThreshold?: number | Decimal; // e.g. 40.0 quality floor
  readonly minQualitySalesPenaltyPct?: number | Decimal; // e.g. 0.50 (lose 50% sales)
  readonly description: string;
}

export interface InvestmentOffer {
  readonly roundNumber: number;
  readonly offerType: 'OFFER_A' | 'OFFER_B';
  readonly name: string;
  readonly cashInjection: Decimal;
  readonly equityStakePct: Decimal; // e.g. 25.0 for 25%
  readonly impliedPostMoneyValuation: Decimal;
  readonly impliedPreMoneyValuation: Decimal;
}

export interface CompanySnapshot {
  readonly teamId: string;
  readonly roundNumber: number;
  readonly cash: Decimal;
  readonly beginningInventoryUnits: Decimal;
  readonly inventoryAverageUnitCost: Decimal;
  readonly cumulativeRdStock: Decimal;
  readonly cumulativeBrandStock: Decimal;
  readonly retainedEquityPct: Decimal; // e.g. 100.0 or Decimal(100)
  readonly valuation: Decimal;
  readonly domainRank?: number;
  readonly tournamentRank?: number;
  readonly taxLossCarryforward?: Decimal;
}

export interface QualityResult {
  readonly teamId: string;
  readonly rdExpenditure: Decimal;
  readonly cumulativeRdStock: Decimal;
  readonly qualityIndex: Decimal;
  readonly isBelowRegulatoryFloor: boolean;
}

export interface BrandResult {
  readonly teamId: string;
  readonly marketingExpenditure: Decimal;
  readonly cumulativeBrandStock: Decimal;
  readonly normalizedBrandRatio: Decimal; // beta (linear, unweighted)
}

export interface AttractivenessResult {
  readonly teamId: string;
  readonly price: Decimal;
  readonly priceCompetitiveness: Decimal; // pi
  readonly rawAttractiveness: Decimal; // A
  readonly qualityPenaltyApplied: boolean;
}

export interface MarketShareResult {
  readonly teamId: string;
  readonly attractivenessScore: Decimal;
  readonly marketSharePct: Decimal; // e.g. 0.639 for 63.9%
  readonly preliminaryDemandUnits: Decimal;
}

export interface FulfillmentResult {
  readonly teamId: string;
  readonly preliminaryDemandUnits: Decimal;
  readonly beginningInventoryUnits: Decimal;
  readonly productionUnitsOrdered: Decimal;
  readonly actualProductionUnits: Decimal; // Subject to event capacity caps
  readonly unitsAvailable: Decimal;
  readonly primaryUnitsSold: Decimal;
  readonly primaryStockoutUnits: Decimal;
  readonly recapturedUnitsSold: Decimal;
  readonly totalUnitsSold: Decimal;
  readonly endingInventoryUnits: Decimal;
  readonly effectiveUnitProductionCost: Decimal;
  readonly averageInventoryUnitCost: Decimal;
}

export interface FinancialResult {
  readonly teamId: string;
  readonly grossRevenue: Decimal;
  readonly cogs: Decimal;
  readonly grossProfit: Decimal;
  readonly inventoryHoldingCost: Decimal;
  readonly totalOpEx: Decimal;
  readonly ebitda: Decimal;
  readonly taxExpense: Decimal;
  readonly netIncome: Decimal;
  readonly newTaxLossCarryforward: Decimal;
  readonly operatingCashFlow: Decimal;
  readonly financingCashFlow: Decimal;
  readonly endingCash: Decimal;
  readonly endingInventoryValue: Decimal;
}

export interface EquityResult {
  readonly teamId: string;
  readonly investmentDecision: InvestmentChoice;
  readonly cashInjected: Decimal;
  readonly investorEquityStakePct: Decimal;
  readonly preRoundRetainedEquityPct: Decimal;
  readonly postRoundRetainedEquityPct: Decimal;
  readonly dilutionFactor: Decimal;
}

export interface ValuationResult {
  readonly teamId: string;
  readonly baseSeedValuation: Decimal; // Exactly $200,000.00
  readonly revenueValuationComponent: Decimal;
  readonly ebitdaValuationComponent: Decimal;
  readonly rdValuationComponent: Decimal;
  readonly marketShareValuationComponent: Decimal;
  readonly enterpriseValue: Decimal;
  readonly cashValuationComponent: Decimal;
  readonly unconstrainedValuation: Decimal;
  readonly finalValuation: Decimal; // Clamped to floor $50k
  readonly retainedEquityPct: Decimal;
  readonly finalScore: Decimal; // Valuation * (RetainedEquity / 100), rounded to integer
}

export interface CompanyRoundResult {
  readonly teamId: string;
  readonly domainCode: string;
  readonly roundNumber: number;
  readonly validatedDecision: CompanyDecision;
  readonly quality: QualityResult;
  readonly brand: BrandResult;
  readonly attractiveness: AttractivenessResult;
  readonly marketShare: MarketShareResult;
  readonly fulfillment: FulfillmentResult;
  readonly financial: FinancialResult;
  readonly equity: EquityResult;
  readonly valuation: ValuationResult;
  readonly nextSnapshot: CompanySnapshot;
}

export interface DomainSimulationResult {
  readonly domainCode: string;
  readonly roundNumber: number;
  readonly totalDomainDemand: Decimal;
  readonly totalUnitsDemanded: Decimal;
  readonly totalUnitsSold: Decimal;
  readonly totalStockoutUnits: Decimal;
  readonly totalRecapturedUnits: Decimal;
  readonly averageMarketPrice: Decimal;
  readonly averageBrandStock: Decimal;
  readonly activeEvents: readonly MarketEventShock[];
  readonly companyResults: readonly CompanyRoundResult[];
}

export interface TournamentSimulationResult {
  readonly roundNumber: number;
  readonly domainResults: readonly DomainSimulationResult[];
  readonly companyResults: readonly CompanyRoundResult[];
  readonly leaderboard: readonly {
    readonly tournamentRank: number;
    readonly domainRank: number;
    readonly teamId: string;
    readonly domainCode: string;
    readonly valuation: Decimal;
    readonly retainedEquityPct: Decimal;
    readonly finalScore: Decimal;
  }[];
}
