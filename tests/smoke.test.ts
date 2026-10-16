/**
 * CAPITAL QUEST — FOUNDATION SMOKE TESTS
 * Verifies Phase 0 test harness, Decimal.js arbitrary precision,
 * Round 0 valuation invariant (F-01), single-exponent brand ratio (P-01),
 * and compounding dilution conservation.
 */

import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';

// Configure standard banking decimal precision
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

describe('Phase 0: Environment & Mathematical Foundation Smoke Tests', () => {
  it('Precision Check: Decimal.js avoids IEEE-754 floating-point drift', () => {
    const floatSum = 0.1 + 0.2;
    expect(floatSum).not.toBe(0.3); // Classic float bug

    const decimalSum = new Decimal('0.1').plus(new Decimal('0.2')).toNumber();
    expect(decimalSum).toBe(0.3); // Exact precision
  });

  it('F-01 REGRESSION TEST: Round 0 Valuation is strictly $200,000.00 with $0 cash contribution', () => {
    const roundNumber = 0;
    const startingCapital = new Decimal('1000000.00'); // $1,000,000.00
    const baseSeedEnterpriseValue = new Decimal('200000.00'); // $200,000.00
    const workingCapitalFloor = new Decimal('250000.00');
    const cashMultiplier = new Decimal('0.25');

    // Piecewise Cash Contribution Formula (F-01 Fix):
    const cashContribution =
      roundNumber === 0
        ? new Decimal(0)
        : Decimal.max(
            new Decimal(0),
            startingCapital.minus(workingCapitalFloor)
          ).times(cashMultiplier);

    const valuation = baseSeedEnterpriseValue.plus(cashContribution);

    expect(cashContribution.toNumber()).toBe(0.0);
    expect(valuation.toNumber()).toBe(200000.0);
  });

  it('P-01 FORMULA TEST: Single Exponentiation on Normalized Brand Ratio', () => {
    // 3 competitors with brand stocks
    const bA = new Decimal('250000');
    const bB = new Decimal('100000');
    const bC = new Decimal('10000');
    const bBar = bA.plus(bB).plus(bC).dividedBy(3); // 120,000
    const floor = new Decimal('1000');

    // Normalized ratio (Step 2 - unweighted)
    const betaA = bA.plus(floor).dividedBy(bBar.plus(floor)); // 251,000 / 121,000 ~ 2.07438

    // Marketing sensitivity (Step 4 - exponent applied exactly once)
    const alphaM = 0.45;
    const weightedBrandFactorA = Math.pow(betaA.toNumber(), alphaM);

    expect(betaA.toNumber()).toBeCloseTo(2.07438, 4);
    expect(weightedBrandFactorA).toBeCloseTo(1.3887, 4);
  });

  it('EQUITY CONSERVATION TEST: Multi-round dilution preserves exactly 100.0000% ownership', () => {
    let teamEquity = new Decimal('100.0000');
    let seedInvestorEquity = new Decimal('0.0000');
    let seriesAInvestorEquity = new Decimal('0.0000');

    // Round 2: Accept Offer A (25.0000% stake)
    const seedOfferStake = new Decimal('25.0000');
    const seedDilutionFactor = new Decimal(1).minus(
      seedOfferStake.dividedBy(100)
    );
    teamEquity = teamEquity.times(seedDilutionFactor);
    seedInvestorEquity = seedOfferStake;

    expect(teamEquity.toNumber()).toBe(75.0);
    expect(teamEquity.plus(seedInvestorEquity).toNumber()).toBe(100.0);

    // Round 4: Accept Offer B (10.0000% stake)
    const seriesAOfferStake = new Decimal('10.0000');
    const seriesADilutionFactor = new Decimal(1).minus(
      seriesAOfferStake.dividedBy(100)
    );
    teamEquity = teamEquity.times(seriesADilutionFactor);
    seedInvestorEquity = seedInvestorEquity.times(seriesADilutionFactor);
    seriesAInvestorEquity = seriesAOfferStake;

    expect(teamEquity.toNumber()).toBe(67.5);
    expect(seedInvestorEquity.toNumber()).toBe(22.5);
    expect(seriesAInvestorEquity.toNumber()).toBe(10.0);

    const totalEquity = teamEquity
      .plus(seedInvestorEquity)
      .plus(seriesAInvestorEquity);
    expect(totalEquity.toNumber()).toBe(100.0);
  });
});
