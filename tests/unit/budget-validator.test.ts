import { describe, it, expect } from 'vitest';
import {
  validateCompanyDecision,
  createDefaultFallbackDecision,
  calculateEstimatedUnitCost,
} from '@/engine/validation/budget-validator';
import { DOMAIN_ARCHETYPES } from '@/engine/config/domain-archetypes';
import { CompanyDecision, CompanySnapshot } from '@/engine/types';
import { D, ZERO } from '@/engine/math/precision';

describe('Engine Validation: Budget & Solvency Validator', () => {
  const domain = DOMAIN_ARCHETYPES.cleantech; // Bench: 1200, Base COGS: 600, Range: 800-1800

  const baselineSnapshot: CompanySnapshot = {
    teamId: 'CT-01',
    roundNumber: 0,
    cash: D(1000000), // $1,000,000
    beginningInventoryUnits: ZERO,
    inventoryAverageUnitCost: D(600),
    cumulativeRdStock: ZERO,
    cumulativeBrandStock: ZERO,
    retainedEquityPct: D(100),
    valuation: D(200000),
  };

  it('approves a valid, affordable decision slip', () => {
    const decision: CompanyDecision = {
      teamId: 'CT-01',
      marketingBudget: 250000,
      rdBudget: 250000,
      operationsBudget: 50000,
      productionUnits: 700, // 700 * $576 = $403,200
      unitPrice: 1200,
      investmentDecision: 'REJECT_BOTH',
    };

    const res = validateCompanyDecision(decision, domain, baselineSnapshot);
    expect(res.isValid).toBe(true);
    expect(res.errors).toHaveLength(0);
    expect(res.estimatedUnitCost.toNumber()).toBe(576);
    expect(res.totalPlannedOutflow.toNumber()).toBe(953200);
  });

  it('rejects an overspending decision that exceeds liquid cash (P-02 Hard Block)', () => {
    const decision: CompanyDecision = {
      teamId: 'CT-01',
      marketingBudget: 400000,
      rdBudget: 400000,
      operationsBudget: 50000,
      productionUnits: 700, // $403,200 -> Total = $1,253,200 > $1,000,000
      unitPrice: 1200,
      investmentDecision: 'REJECT_BOTH',
    };

    const res = validateCompanyDecision(decision, domain, baselineSnapshot);
    expect(res.isValid).toBe(false);
    expect(res.errors.some(e => e.includes('exceeds available liquid cash'))).toBe(true);
  });

  it('rejects negative budgets or invalid unit counts', () => {
    const decision: CompanyDecision = {
      teamId: 'CT-01',
      marketingBudget: -100,
      rdBudget: 0,
      operationsBudget: 0,
      productionUnits: 10.5, // non-integer
      unitPrice: 1200,
      investmentDecision: 'REJECT_BOTH',
    };

    const res = validateCompanyDecision(decision, domain, baselineSnapshot);
    expect(res.isValid).toBe(false);
    expect(res.errors.some(e => e.includes('Marketing budget cannot be negative'))).toBe(true);
    expect(res.errors.some(e => e.includes('non-negative integer'))).toBe(true);
  });

  it('rejects unit prices outside domain allowed boundaries', () => {
    const lowPriceDecision: CompanyDecision = {
      teamId: 'CT-01',
      marketingBudget: 0,
      rdBudget: 0,
      operationsBudget: 0,
      productionUnits: 100,
      unitPrice: 500, // Below minPrice of 800
      investmentDecision: 'REJECT_BOTH',
    };

    const res = validateCompanyDecision(lowPriceDecision, domain, baselineSnapshot);
    expect(res.isValid).toBe(false);
    expect(res.errors.some(e => e.includes('outside domain allowed range'))).toBe(true);
  });

  it('generates a valid, conservative fallback decision with $10,000 penalty deducted', () => {
    const brokeSnapshot: CompanySnapshot = {
      ...baselineSnapshot,
      cash: D(200000), // $200k cash
    };

    const fallback = createDefaultFallbackDecision('CT-01', domain, brokeSnapshot);
    expect(fallback.marketingBudget).toBe(ZERO);
    expect(fallback.rdBudget).toBe(ZERO);
    expect(fallback.operationsBudget).toBe(ZERO);
    expect(fallback.unitPrice).toEqual(domain.benchmarkPrice);
    expect(fallback.investmentDecision).toBe('REJECT_BOTH');

    // Affordable units with $190,000 cash remaining at base cogs $600: floor(190000 / 600) = 316
    expect(D(fallback.productionUnits).toNumber()).toBe(316);
  });

  it('correctly calculates operations efficiency discounts up to 20% ceiling', () => {
    // $0 -> 0% discount
    expect(calculateEstimatedUnitCost(600, 0).toNumber()).toBe(600);
    // $125k -> 10% discount -> $540
    expect(calculateEstimatedUnitCost(600, 125000).toNumber()).toBe(540);
    // $250k -> 20% discount -> $480
    expect(calculateEstimatedUnitCost(600, 250000).toNumber()).toBe(480);
    // $500k -> capped at 20% discount -> $480
    expect(calculateEstimatedUnitCost(600, 500000).toNumber()).toBe(480);
  });
});
