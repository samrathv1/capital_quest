# CAPITAL QUEST — TESTING & VERIFICATION PLAN

**Document Reference:** `CQ-SPEC-09`  
**Status:** Implementation-Ready Specification  
**Tooling:** Vitest (Unit & Deterministic Math) + Playwright (E2E Integration & Stress)  
**Version:** 1.0.0-PROPOSED  

---

## 1. Testing Philosophy & Automated Mathematical Invariants

In a high-stakes competitive simulation, software bugs or mathematical inconsistencies directly compromise tournament fairness. Our quality strategy is grounded in **Automated Invariant Verification**: tests that verify mathematical laws rather than arbitrary assertions.

```
+----------------------------------------------------------------------------------------------------+
|                               FIVE CORE MATHEMATICAL INVARIANTS                                    |
+----------------------------------------------------------------------------------------------------+
| INVARIANT 1: DEMAND CONSERVATION                                                                   |
|   Sum of all allocated customer demand across competitors in a domain can never exceed the domain |
|   total customer pool:  Sum(d_i) <= D_domain.                                                     |
|                                                                                                    |
| INVARIANT 2: MARKET SHARE NORMALIZATION                                                            |
|   Sum of relative market shares across all companies in a domain must equal exactly 100.0000%:      |
|   Sum(MS_i) == 1.000000.                                                                          |
|                                                                                                    |
| INVARIANT 3: CAP TABLE EQUITY CONSERVATION                                                         |
|   At all times, across all investment dilution events, the sum of all shareholder percentages on   |
|   a team's cap table must equal exactly 100.0000%:  Sum(Equity_Pct) == 100.0000%.                  |
|                                                                                                    |
| INVARIANT 4: DOUBLE-ENTRY CASH BALANCE CONSERVATION                                                |
|   Ending cash must reconcile to the penny against historical ledger entries:                      |
|   Ending Cash == Beginning Cash + Sum(Ledger Inflows) - Sum(Ledger Outflows).                      |
|                                                                                                    |
| INVARIANT 5: ORDER INVARIANCE (PERMUTATION INVARIANCE)                                             |
|   Shuffling the execution order of companies within a domain input array must yield identical      |
|   results for every single company down to the final cent.                                        |
+----------------------------------------------------------------------------------------------------+
```

---

## 2. Invariant & Unit Test Suite (Vitest)

### 2.1 Order Invariance & Market Share Normalization Test

```typescript
// tests/unit/engine/marketShare.test.ts
import { describe, it, expect } from 'vitest';
import { MarketEngine } from '@/engine/marketEngine';
import { CompanyDecision, DomainConfig } from '@/types/engine';

describe('Market Engine Invariant Tests', () => {
  const mockDomain: DomainConfig = {
    code: 'CLEANTECH',
    baseDemand: 20000,
    benchmarkPrice: 1200,
    minPrice: 800,
    maxPrice: 1800,
    priceElasticity: 1.20,
    qualityElasticity: 0.85,
    marketingElasticity: 0.45,
  };

  const mockDecisions: CompanyDecision[] = [
    { teamId: 'team-1', price: 1200, marketing: 250000, rd: 200000, units: 1000 },
    { teamId: 'team-2', price: 1350, marketing: 100000, rd: 150000, units: 800 },
    { teamId: 'team-3', price: 1100, marketing: 300000, rd: 50000, units: 1500 },
    { teamId: 'team-4', price: 1200, marketing: 20000, rd: 10000, units: 200 },
  ];

  it('INVARIANT: Sum of market shares must equal 100.0000%', () => {
    const results = MarketEngine.resolveDomainCompetition(mockDomain, mockDecisions, 1.0);
    const totalShare = results.reduce((acc, curr) => acc + curr.marketSharePct, 0);
    expect(totalShare).toBeCloseTo(100.0000, 4);
  });

  it('INVARIANT: Order Invariance (Permutation Symmetry)', () => {
    // Run with original order
    const runA = MarketEngine.resolveDomainCompetition(mockDomain, mockDecisions, 1.0);
    
    // Reverse array and re-run
    const reversedDecisions = [...mockDecisions].reverse();
    const runB = MarketEngine.resolveDomainCompetition(mockDomain, reversedDecisions, 1.0);
    
    // Sort both runs by teamId and assert identical metrics
    const sortedA = runA.sort((a, b) => a.teamId.localeCompare(b.teamId));
    const sortedB = runB.sort((a, b) => a.teamId.localeCompare(b.teamId));
    
    for (let i = 0; i < sortedA.length; i++) {
      expect(sortedA[i].marketSharePct).toBe(sortedB[i].marketSharePct);
      expect(sortedA[i].potentialDemand).toBe(sortedB[i].potentialDemand);
      expect(sortedA[i].unitsSold).toBe(sortedB[i].unitsSold);
      expect(sortedA[i].revenue).toBe(sortedB[i].revenue);
    }
  });

  it('INVARIANT: Monotonicity of Marketing Spend', () => {
    // Increasing marketing spend holding all else constant must increase or maintain market share
    const baseDecision = { teamId: 'test', price: 1200, marketing: 100000, rd: 100000, units: 1000 };
    const aggressiveDecision = { teamId: 'test', price: 1200, marketing: 250000, rd: 100000, units: 1000 };
    
    const competitors = [mockDecisions[1], mockDecisions[2]];
    
    const resBase = MarketEngine.resolveDomainCompetition(mockDomain, [baseDecision, ...competitors], 1.0);
    const resAggressive = MarketEngine.resolveDomainCompetition(mockDomain, [aggressiveDecision, ...competitors], 1.0);
    
    const shareBase = resBase.find(r => r.teamId === 'test')!.marketSharePct;
    const shareAggressive = resAggressive.find(r => r.teamId === 'test')!.marketSharePct;
    
    expect(shareAggressive).toBeGreaterThan(shareBase);
  });
});
```

---

### 2.2 Compounding Dilution & Cap Table Conservation Test

```typescript
// tests/unit/engine/capTable.test.ts
import { describe, it, expect } from 'vitest';
import { CapTableEngine } from '@/engine/capTableEngine';

describe('Cap Table Dilution Invariant Tests', () => {
  it('INVARIANT: Total Equity Ownership strictly equals 100% across multiple rounds', () => {
    let capTable = CapTableEngine.initializeFounders('team-1', 'Founding Team');
    expect(capTable.totalEquity()).toBe(100.0000);
    expect(capTable.retainedTeamEquity()).toBe(100.0000);

    // Round 2: Accept Offer A (25.0% dilution)
    capTable = CapTableEngine.applyInvestment(capTable, {
      roundNumber: 2,
      investorName: 'Seed VC (Offer A)',
      equityPercentage: 25.0000,
      cashAmount: 400000,
    });

    expect(capTable.totalEquity()).toBe(100.0000);
    expect(capTable.retainedTeamEquity()).toBe(75.0000);
    expect(capTable.getShareholder('Seed VC (Offer A)')?.equityPct).toBe(25.0000);

    // Round 4: Accept Offer B (10.0% dilution)
    capTable = CapTableEngine.applyInvestment(capTable, {
      roundNumber: 4,
      investorName: 'Series A VC (Offer B)',
      equityPercentage: 10.0000,
      cashAmount: 450000,
    });

    expect(capTable.totalEquity()).toBe(100.0000);
    expect(capTable.retainedTeamEquity()).toBe(67.5000); // 75.0 * 0.90
    expect(capTable.getShareholder('Seed VC (Offer A)')?.equityPct).toBe(22.5000); // 25.0 * 0.90
    expect(capTable.getShareholder('Series A VC (Offer B)')?.equityPct).toBe(10.0000);
  });
});
```

---

### 2.3 Double-Entry Cash Flow Reconciliation Test

```typescript
// tests/unit/engine/accounting.test.ts
import { describe, it, expect } from 'vitest';
import { AccountingEngine } from '@/engine/accountingEngine';

describe('Accounting & Cash Reconciliation Tests', () => {
  it('INVARIANT: Cash Movement reconciles to the cent with Net Income and Inventory Delta', () => {
    const beginningCash = 1000000.00;
    const unitsManufactured = 1000;
    const unitCost = 500.00;
    const unitsSold = 700;
    const unitPrice = 1200.00;
    const marketing = 150000.00;
    const rd = 100000.00;

    const result = AccountingEngine.computeFinancialStatements({
      beginningCash,
      beginningInventoryUnits: 0,
      unitsManufactured,
      unitCost,
      unitsSold,
      unitPrice,
      marketing,
      rd,
      operations: 0,
      holdingCostPerUnit: 20.00,
      investorCash: 0,
    });

    // Accounting Identity: Cash Flow = Net Income + Unsold Inventory Adjustment (or Inflows - Outflows)
    const expectedOutflows = (unitsManufactured * unitCost) + marketing + rd + result.holdingCost;
    const expectedInflows = unitsSold * unitPrice;
    const expectedEndingCash = beginningCash + expectedInflows - expectedOutflows;

    expect(result.endingCash).toBe(expectedEndingCash);
    expect(result.endingInventoryUnits).toBe(300);
    expect(result.endingInventoryValue).toBe(150000.00); // 300 * $500
  });
});
```

---

## 3. Comprehensive Test Scenario Matrix

| Test ID | Test Scenario Description | Execution Type | Target Component | Expected Outcome |
|:---:|:---|:---:|:---:|:---|
| `TC-01` | **Initial Capital & Valuation Regression Test (F-01 Fix)** | Unit / Engine | `ValuationEngine` | Company starts with $\$1,000,000.00$ cash; Round 0 cash contribution $V_{\text{cash}, 0} \equiv \$0.00$; Valuation evaluates to exactly $\$200,000.00$. |
| `TC-02` | **Budget Overspending Rejection** | API / UI | `/api/decisions/submit` | Rejects submission if Outflows $>$ Available Cash; returns 422 error. |
| `TC-03` | **Explicit Rejection (No Silent Auto-Scale - P-02 Fix)** | Unit / API | Decision Validator | Overspending slip is blocked with explicit error; no silent background scaling applied. |
| `TC-04` | **Passive Cash Hoarding Strategy** | Simulation | Full Tournament | Hoarding team finishes with low score due to zero enterprise development. |
| `TC-05` | **Shared Market Stockout Redistribution** | Unit | Market Engine | 40% of unfulfilled demand transfers to competitors with stock. |
| `TC-06` | **Negative Profit Tax Carryforward** | Unit | Financial Engine | Operating losses create NOL; zero tax charged in unprofitable rounds. |
| `TC-07` | **Black Swan Supply Chain Shock** | Simulation | Market Events | Unit COGS rises 40%; capacity capped; margins compress. |
| `TC-08` | **Double-Investment Dilution Compounding** | Unit | Cap Table Engine | Retained equity drops to $67.50\%$; total equity sums to $100.00\%$. |
| `TC-09` | **Investment Reject Both** | Unit | Cap Table Engine | Retained equity stays $100.00\%$; $\$0$ investor cash added. |
| `TC-10` | **Simulation Idempotency Test** | Integration | `/api/rounds/simulate` | Triggering simulation twice with identical hash produces identical output without duplicating rows. |
| `TC-11` | **Non-Destructive Voiding & Cascade Guard (F-02 Fix)** | DB / RPC | `fn_void_or_supersede_round` | Snapshots deactivated, ledger marked `is_voided = true` (zero silent deletions); voiding blocked if Round $N+1$ is active. |
| `TC-12` | **Hierarchical Tie-Breaker Execution** | Unit | Leaderboard Engine | Identical scores resolved by Equity %, then Net Profit, then Revenue. |
| `TC-13` | **Missing Paper Slip Default Rule** | Integration | Round Controller | Team with missing slip receives zero discretionary spend and $\$10\text{k}$ penalty. |
| `TC-14` | **Volunteer NumPad Keyboard Ergonomics** | E2E Playwright | `/volunteer/entry` | Full slip transcribed via keyboard in $< 18$ seconds without mouse clicks. |
| `TC-15` | **Presentation Mode Stage Reveal** | E2E Playwright | `/presentation` | Spacebar advances podium reveal smoothly at 60 FPS. |

---

## 4. End-to-End Tournament Benchmark Suite (20 Teams, 5 Rounds)

We specify an automated Playwright/Vitest integration benchmark simulating a full 20-team tournament:
- **Topology:** 4 domains $\times$ 5 teams per domain.
- **Duration:** Rounds 1 through 5 executed sequentially.
- **Execution Target:** The entire 5-round simulation for all 20 teams (including 100 decision submissions, 2 investment windows, 2 market shocks, financial ledgers, and final rankings) must complete in **$< 8.0$ seconds** on standard server hardware.
- **Sanity Assertion:**
  $$\sum \text{Ledger Debits} + \sum \text{Ledger Credits} \equiv \$0.00 \quad (\text{Zero Variance Tournament Balance})$$
