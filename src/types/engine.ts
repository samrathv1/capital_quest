/**
 * CAPITAL QUEST — SIMULATION ENGINE TYPES
 * Reference: CQ-SPEC-03 & CQ-SPEC-07
 */

import { InvestmentChoice } from './database';

export interface CompanyDecisionInput {
  teamId: string;
  marketingBudget: number;
  rdBudget: number;
  productionUnits: number;
  unitPrice: number;
  operationsBudget: number;
  investmentDecision: InvestmentChoice;
}

export interface DomainParameters {
  code: string;
  name: string;
  baseDemand: number;
  benchmarkPrice: number;
  minPrice: number;
  maxPrice: number;
  baseUnitCogs: number;
  unitHoldingCost: number;
  rdElasticity: number;
  rdRetentionRate: number;
  mktElasticity: number;
  mktRetentionRate: number;
  priceElasticity: number;
  qualityRegulatoryFloor: number;
}

export interface CompanyState {
  teamId: string;
  roundNumber: number;
  cash: number;
  beginningInventoryUnits: number;
  inventoryAverageUnitCost: number;
  cumulativeRdStock: number;
  cumulativeBrandStock: number;
  retainedEquityPct: number;
  valuation: number;
  domainRank: number;
  tournamentRank: number;
}

export interface MarketAllocationResult {
  teamId: string;
  qualityIndex: number;
  brandEquityScore: number;
  normalizedBrandRatio: number; // Beta (single exponentiation)
  priceCompetitiveness: number;
  rawAttractiveness: number;
  marketSharePct: number;
  potentialDemand: number;
  unitsAvailable: number;
  unitsSold: number;
  unitsStockout: number;
  endingInventory: number;
}

export interface FinancialStatementsResult {
  grossRevenue: number;
  effectiveUnitCost: number;
  cogs: number;
  grossProfit: number;
  operatingExpenses: number;
  inventoryHoldingCost: number;
  ebitda: number;
  taxExpense: number;
  netIncome: number;
  operatingCashFlow: number;
  financingCashFlow: number;
  endingCash: number;
  endingInventoryUnits: number;
  endingInventoryValue: number;
}

export interface ValuationResult {
  baseSeedValuation: number; // Exactly $200,000.00
  enterpriseValue: number;
  cashContribution: number;
  totalValuation: number;
  retainedEquityPct: number;
  finalScore: number;
}
