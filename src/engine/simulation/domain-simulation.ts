import Decimal from 'decimal.js';
import {
  DomainConfig,
  CompanyDecision,
  CompanySnapshot,
  MarketEventShock,
  DomainSimulationResult,
  CompanyRoundResult,
} from '../types';
import { D, ZERO } from '../math/precision';
import { getActiveEvents } from '../config/market-events';
import { resolveDomainShocks } from '../market/events';
import { processCompanyQuality } from '../rd/quality';
import { processDomainBrandResults } from '../marketing/brand';
import { calculateRawAttractiveness } from '../market/attractiveness';
import { calculateTotalDomainDemand, calculateMarketSharesAndDemand } from '../market/market-share';
import { resolveInventoryFulfillment } from '../operations/inventory';
import { calculateRevenueAndCogs } from '../finance/revenue-cogs';
import { calculateIncomeStatement } from '../finance/income-statement';
import { calculateCashFlowAndEndingBalances } from '../finance/cash-flow';
import { resolveEquityAndDilution } from '../equity/cap-table';
import { calculateCompanyValuation } from '../valuation/company-valuation';
import {
  InvestmentOfferProvider,
  UniformInvestmentOfferProvider,
} from '../config/investment-offers';
import {
  CashValuationPolicy,
  DEFAULT_CASH_VALUATION_POLICY,
} from '../valuation/valuation-policy';
import { validateCompanyDecision, createDefaultFallbackDecision } from '../validation/budget-validator';

export interface DomainSimulationOptions {
  readonly offerProvider?: InvestmentOfferProvider;
  readonly cashValuationPolicy?: CashValuationPolicy;
  readonly activeEventsOverride?: readonly MarketEventShock[];
  readonly autoApplyFallbackOnInvalid?: boolean;
  readonly deductTaxFromCash?: boolean;
}

/**
 * Pure simulation function executing a single round for all companies within a domain.
 * Strictly adheres to the 12-stage mathematical pipeline defined in CQ-SPEC-03.
 * Preserves double-entry accounting, order independence, and input immutability.
 */
export function simulateDomainRound(
  domain: DomainConfig,
  roundNumber: number,
  decisions: readonly CompanyDecision[],
  snapshots: readonly CompanySnapshot[],
  options: DomainSimulationOptions = {}
): DomainSimulationResult {
  const offerProvider = options.offerProvider ?? new UniformInvestmentOfferProvider();
  const valuationPolicy = options.cashValuationPolicy ?? DEFAULT_CASH_VALUATION_POLICY;
  const activeEvents = options.activeEventsOverride ?? getActiveEvents(domain.code, roundNumber);
  const autoFallback = options.autoApplyFallbackOnInvalid ?? true;
  const deductTaxFromCash = options.deductTaxFromCash ?? true;

  // Order independence: Deterministically sort inputs by teamId
  const sortedDecisions = [...decisions].sort((a, b) => a.teamId.localeCompare(b.teamId));
  const snapshotMap = new Map(snapshots.map(s => [s.teamId, s]));

  // Resolve domain-wide shocks from market events
  const domainShocks = resolveDomainShocks(domain, activeEvents);

  // 0. Pre-simulation validation and fallback handling
  const validatedDecisions: { decision: CompanyDecision; adminFee: Decimal }[] = sortedDecisions.map(d => {
    const snap = snapshotMap.get(d.teamId) ?? {
      teamId: d.teamId,
      roundNumber: roundNumber - 1,
      cash: D(1000000),
      beginningInventoryUnits: ZERO,
      inventoryAverageUnitCost: D(domain.baseUnitCogs),
      cumulativeRdStock: ZERO,
      cumulativeBrandStock: ZERO,
      retainedEquityPct: D(100),
      valuation: D(200000),
    };

    const validation = validateCompanyDecision(d, domain, snap, domainShocks.cogsMultiplierShock);

    if (!validation.isValid) {
      if (autoFallback) {
        // Apply approved fallback decision + $10,000 administrative penalty
        const fallback = createDefaultFallbackDecision(d.teamId, domain, snap);
        return { decision: fallback, adminFee: D(10000) };
      } else {
        throw new Error(
          `Solvency validation failed for team ${d.teamId}: ${validation.errors.join('; ')}`
        );
      }
    }

    return { decision: d, adminFee: ZERO };
  });

  const cleanDecisions = validatedDecisions.map(v => v.decision);
  const adminFeeMap = new Map(validatedDecisions.map(v => [v.decision.teamId, v.adminFee]));

  // Step 1: R&D & Product Quality Index
  const qualityResults = cleanDecisions.map(d => {
    const snap = snapshotMap.get(d.teamId)!;
    return processCompanyQuality(d.teamId, d.rdBudget, snap, domain);
  });
  const qualityMap = new Map(qualityResults.map(q => [q.teamId, q]));
  const qualityIndexMap = new Map(qualityResults.map(q => [q.teamId, q.qualityIndex]));

  // Step 2: Marketing Expenditure & Cumulative Brand Equity
  const brandResults = processDomainBrandResults(
    cleanDecisions.map(d => ({ teamId: d.teamId, marketingBudget: d.marketingBudget })),
    snapshots,
    domain
  );
  const brandMap = new Map(brandResults.map(b => [b.teamId, b]));

  // Step 3 & 4: Attractiveness Scores & Market Share
  const attractivenessResults = cleanDecisions.map(d => {
    const q = qualityMap.get(d.teamId)!;
    const b = brandMap.get(d.teamId)!;
    return calculateRawAttractiveness(
      q,
      b,
      d.unitPrice,
      domain,
      domainShocks.effectivePriceElasticity,
      domainShocks.effectiveMktElasticity
    );
  });
  const attractivenessMap = new Map(attractivenessResults.map(a => [a.teamId, a]));

  // Step 5: Total Domain Demand & Pro-Rata Allocation
  const prices = cleanDecisions.map(d => d.unitPrice);
  const { totalDemand, averagePrice } = calculateTotalDomainDemand(
    domain,
    prices,
    domainShocks.demandMultiplierDelta
  );

  const marketShareResults = calculateMarketSharesAndDemand(attractivenessResults, totalDemand);
  const marketShareMap = new Map(marketShareResults.map(m => [m.teamId, m]));

  // Step 6: Inventory Fulfillment, Capacity Caps & Stockout Redistribution
  const fulfillmentResults = resolveInventoryFulfillment(
    cleanDecisions,
    snapshots,
    marketShareResults,
    attractivenessResults,
    domain,
    domainShocks,
    qualityIndexMap
  );
  const fulfillmentMap = new Map(fulfillmentResults.map(f => [f.teamId, f]));

  // Step 7 to 12: Financials, Equity, Valuation, and Snapshots per company
  const companyResults: CompanyRoundResult[] = cleanDecisions.map(d => {
    const snap = snapshotMap.get(d.teamId)!;
    const q = qualityMap.get(d.teamId)!;
    const b = brandMap.get(d.teamId)!;
    const a = attractivenessMap.get(d.teamId)!;
    const ms = marketShareMap.get(d.teamId)!;
    const f = fulfillmentMap.get(d.teamId)!;
    const adminFee = adminFeeMap.get(d.teamId) ?? ZERO;

    // 7. Revenue & COGS
    const revAndCogs = calculateRevenueAndCogs(f, d.unitPrice);

    // 8. Operating Expenses & Net Income
    const income = calculateIncomeStatement(
      revAndCogs,
      d,
      f,
      domain,
      snap.taxLossCarryforward ?? ZERO,
      adminFee
    );

    // 9. Equity Dilution & Investment
    const equity = resolveEquityAndDilution(
      d.teamId,
      roundNumber,
      d.investmentDecision,
      snap,
      offerProvider
    );

    // 10. Cash Flow & Ending Liquid Balances
    const financial = calculateCashFlowAndEndingBalances(
      income,
      f,
      snap,
      equity.cashInjected,
      deductTaxFromCash
    );

    // 11. Multi-Factor Valuation & Final Score
    const valuation = calculateCompanyValuation(
      d.teamId,
      roundNumber,
      financial.grossRevenue,
      financial.ebitda,
      q.cumulativeRdStock,
      ms.marketSharePct,
      financial.endingCash,
      equity.postRoundRetainedEquityPct,
      domain,
      valuationPolicy
    );

    // 12. Next Company Snapshot for subsequent round
    const nextSnapshot: CompanySnapshot = {
      teamId: d.teamId,
      roundNumber,
      cash: financial.endingCash,
      beginningInventoryUnits: f.endingInventoryUnits,
      inventoryAverageUnitCost: f.averageInventoryUnitCost,
      cumulativeRdStock: q.cumulativeRdStock,
      cumulativeBrandStock: b.cumulativeBrandStock,
      retainedEquityPct: equity.postRoundRetainedEquityPct,
      valuation: valuation.finalValuation,
      taxLossCarryforward: financial.newTaxLossCarryforward,
    };

    return {
      teamId: d.teamId,
      domainCode: domain.code,
      roundNumber,
      validatedDecision: d,
      quality: q,
      brand: b,
      attractiveness: a,
      marketShare: ms,
      fulfillment: f,
      financial,
      equity,
      valuation,
      nextSnapshot,
    };
  });

  const totalSold = fulfillmentResults.reduce((acc, f) => acc.plus(f.totalUnitsSold), ZERO);
  const totalStockouts = fulfillmentResults.reduce((acc, f) => acc.plus(f.primaryStockoutUnits), ZERO);
  const totalRecaptured = fulfillmentResults.reduce((acc, f) => acc.plus(f.recapturedUnitsSold), ZERO);
  const avgBrand = brandResults.length > 0
    ? brandResults.reduce((acc, b) => acc.plus(b.cumulativeBrandStock), ZERO).dividedBy(brandResults.length)
    : ZERO;

  return {
    domainCode: domain.code,
    roundNumber,
    totalDomainDemand: totalDemand,
    totalUnitsDemanded: marketShareResults.reduce((acc, m) => acc.plus(m.preliminaryDemandUnits), ZERO),
    totalUnitsSold: totalSold,
    totalStockoutUnits: totalStockouts,
    totalRecapturedUnits: totalRecaptured,
    averageMarketPrice: averagePrice,
    averageBrandStock: avgBrand,
    activeEvents,
    companyResults,
  };
}
