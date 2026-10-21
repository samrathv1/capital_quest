import { describe, it, expect } from 'vitest';
import {
  calculateCompanyValuation,
  BASE_SEED_VALUATION,
  ABSOLUTE_VALUATION_FLOOR,
} from '@/engine/valuation/company-valuation';
import {
  ExcessCashMultiplierPolicy,
  RevenueCappedCashPolicy,
} from '@/engine/valuation/valuation-policy';
import { DOMAIN_ARCHETYPES } from '@/engine/config/domain-archetypes';

describe('Engine Valuation: Multi-Factor Enterprise Value & Cash Contribution Policies', () => {
  const domain = DOMAIN_ARCHETYPES.cleantech; // w_rev: 1.8, w_ebit: 3.5, w_rd: 0.40, w_ms: 0.50

  it('F-01 REGRESSION TEST: Round 0 strictly produces $200,000.00 valuation with $0 cash contribution', () => {
    // Round 0 with $1,000,000 in liquid cash treasury
    const res = calculateCompanyValuation(
      'CT-01',
      0, // Round 0
      0, // $0 Revenue
      0, // $0 EBITDA
      0, // $0 R&D
      0, // 0 Market Share
      1000000, // $1,000,000 Cash
      100, // 100% Equity
      domain,
      new ExcessCashMultiplierPolicy()
    );

    expect(res.cashValuationComponent.toNumber()).toBe(0.0);
    expect(res.enterpriseValue.toNumber()).toBe(200000.0);
    expect(res.finalValuation.toNumber()).toBe(200000.0);
    expect(res.finalScore.toNumber()).toBe(200000);
  });

  it('calculates Round 1 valuations matching worked example specifications', () => {
    // Co A: Rev = $840k, EBITDA = -$113.2k, RdStock = $250k, MS = 0.639, Cash = $886.8k
    // EV = 200k + 1.8*840k + 0 + 0.4*250k + 0.5*0.639*1M = 200k + 1,512k + 0 + 100k + 319.5k = 2,131,500
    // V_cash = 0.25 * (886.8k - 250k) = 0.25 * 636.8k = 159,200
    // Total Valuation = 2,131,500 + 159,200 = $2,290,700 (Worked example line 387)
    const resA = calculateCompanyValuation(
      'Co-A',
      1,
      840000,
      -113200,
      250000,
      0.639,
      886800,
      100,
      domain
    );
    expect(resA.finalValuation.toNumber()).toBe(2290700);

    // Co B: Rev = $650k, EBITDA = $62k, RdStock = $150k, MS = 0.320, Cash = $1,062,000
    // EV = 200k + 1.8*650k + 3.5*62k + 0.4*150k + 0.5*0.320*1M = 200k + 1,170k + 217k + 60k + 160k = 1,807,000
    // V_cash = 0.25 * (1,062k - 250k) = 0.25 * 812k = 203,000
    // Total Valuation = 1,807,000 + 203,000 = $2,010,000 (Worked example line 388)
    const resB = calculateCompanyValuation(
      'Co-B',
      1,
      650000,
      62000,
      150000,
      0.320,
      1062000,
      100,
      domain
    );
    expect(resB.finalValuation.toNumber()).toBe(2010000);

    // Co C: Rev = $120k, EBITDA = $40k, RdStock = $10k, MS = 0.041, Cash = $1,040,000
    // EV = 200k + 1.8*120k + 3.5*40k + 0.4*10k + 0.5*0.041*1M = 200k + 216k + 140k + 4k + 20.5k = 580,500
    // V_cash = 0.25 * (1,040k - 250k) = 0.25 * 790k = 197,500
    // Total Valuation = 580,500 + 197,500 = $778,000 (Worked example line 389)
    const resC = calculateCompanyValuation(
      'Co-C',
      1,
      120000,
      40000,
      10000,
      0.041,
      1040000,
      100,
      domain
    );
    expect(resC.finalValuation.toNumber()).toBe(778000);
  });

  it('demonstrates policy isolation between Excess Cash and Revenue-Capped Cash policies', () => {
    const excessPolicy = new ExcessCashMultiplierPolicy();
    const cappedPolicy = new RevenueCappedCashPolicy();

    // Zero-revenue firm with $1,000,000 in cash at Round 1
    const excessRes = calculateCompanyValuation('ZERO-REV', 1, 0, 0, 0, 0, 1000000, 100, domain, excessPolicy);
    const cappedRes = calculateCompanyValuation('ZERO-REV', 1, 0, 0, 0, 0, 1000000, 100, domain, cappedPolicy);

    // Excess cash policy awards 0.25 * (1M - 250k) = $187,500
    expect(excessRes.cashValuationComponent.toNumber()).toBe(187500);

    // Revenue-capped policy awards min(1M, 2 * 0) * 0.25 = $0.00
    expect(cappedRes.cashValuationComponent.toNumber()).toBe(0.0);
  });

  it('enforces the absolute valuation salvage floor ($50,000.00)', () => {
    expect(ABSOLUTE_VALUATION_FLOOR.toNumber()).toBe(50000);

    const distressedRes = calculateCompanyValuation('DISTRESSED', 1, 0, -500000, 0, 0, 0, 100, domain);
    // Valuation must never drop below the $50,000 salvage floor
    expect(distressedRes.finalValuation.toNumber()).toBeGreaterThanOrEqual(50000);
  });

  it('multiplies final valuation by retained equity percentage for final score', () => {
    // Valuation: $10,000,000, Retained Equity: 67.5% -> Score: 6,750,000
    const res = calculateCompanyValuation('SCORED', 5, 2000000, 500000, 500000, 0.5, 500000, 67.5, domain);
    const expectedScore = Math.round(res.finalValuation.toNumber() * 0.675);
    expect(res.finalScore.toNumber()).toBe(expectedScore);
  });
});
