import { describe, it, expect } from 'vitest';
import { simulateDomainRound } from '@/engine/simulation/domain-simulation';
import { DOMAIN_ARCHETYPES } from '@/engine/config/domain-archetypes';
import { CompanyDecision, CompanySnapshot, DomainConfig, InvestmentChoice } from '@/engine/types';
import { D, ZERO } from '@/engine/math/precision';
import { validateCompanyDecision } from '@/engine/validation/budget-validator';

describe('Phase 7: Full 5-Round Mock Tournament Rehearsal (40 Companies, 4 Domains)', () => {
  const domains = Object.values(DOMAIN_ARCHETYPES);
  expect(domains.length).toBe(4);

  // 40 Companies: 10 per domain
  interface RehearsalTeam {
    id: string;
    teamCode: string;
    companyName: string;
    domainId: string;
    domainCode: string;
    domain: DomainConfig;
    strategyType: 'AGGRESSIVE_MARKETING' | 'BALANCED' | 'RD_HEAVY' | 'CONSERVATIVE_CASH' | 'PREMIUM_QUALITY' | 'LOW_COST' | 'EXPANSIONIST' | 'LEAN_OPS';
  }

  const STRATEGY_TYPES: RehearsalTeam['strategyType'][] = [
    'AGGRESSIVE_MARKETING',
    'BALANCED',
    'RD_HEAVY',
    'CONSERVATIVE_CASH',
    'PREMIUM_QUALITY',
    'LOW_COST',
    'EXPANSIONIST',
    'LEAN_OPS',
    'BALANCED',
    'RD_HEAVY',
  ];

  const TEAMS: RehearsalTeam[] = [];
  domains.forEach(dom => {
    for (let i = 1; i <= 10; i++) {
      const code = `${dom.code.toUpperCase()}-${String(i).padStart(2, '0')}`;
      TEAMS.push({
        id: `team-${code.toLowerCase()}`,
        teamCode: code,
        companyName: `${dom.name} Company ${i}`,
        domainId: dom.code,
        domainCode: dom.code.toUpperCase(),
        domain: dom,
        strategyType: STRATEGY_TYPES[i - 1],
      });
    }
  });

  expect(TEAMS.length).toBe(40);

  function generateDecisionForStrategy(
    strategy: RehearsalTeam['strategyType'],
    roundNumber: number,
    snapshot: CompanySnapshot,
    domain: DomainConfig
  ): CompanyDecision {
    const cash = snapshot.cash.toNumber();
    const unitCost = D(domain.baseUnitCogs).toNumber();
    const benchPrice = D(domain.benchmarkPrice).toNumber();

    // Rigorous financial solvency: Limit total planned cash outflows to at most 70% of liquid cash
    // This preserves a guaranteed 30% cash reserve for taxes and inventory holding costs
    const totalSpendable = Math.max(0, cash * 0.70);
    const ops = Math.min(20000, totalSpendable * 0.10);
    const budgetForStrategy = Math.max(0, totalSpendable - ops);

    let mkt = 0;
    let rd = 0;
    let price = benchPrice;
    let invDecision: InvestmentChoice = 'REJECT_BOTH';

    if (roundNumber === 2 || roundNumber === 4) {
      if (strategy === 'EXPANSIONIST' || strategy === 'AGGRESSIVE_MARKETING') {
        invDecision = 'OFFER_A';
      } else if (strategy === 'RD_HEAVY') {
        invDecision = 'OFFER_B';
      } else {
        invDecision = 'REJECT_BOTH';
      }
    }

    let prodBudget = 0;

    switch (strategy) {
      case 'AGGRESSIVE_MARKETING':
        mkt = budgetForStrategy * 0.40;
        rd = budgetForStrategy * 0.15;
        prodBudget = budgetForStrategy * 0.45;
        price = benchPrice * 1.05;
        break;
      case 'RD_HEAVY':
        mkt = budgetForStrategy * 0.15;
        rd = budgetForStrategy * 0.40;
        prodBudget = budgetForStrategy * 0.45;
        price = benchPrice * 1.15;
        break;
      case 'PREMIUM_QUALITY':
        mkt = budgetForStrategy * 0.20;
        rd = budgetForStrategy * 0.30;
        prodBudget = budgetForStrategy * 0.50;
        price = benchPrice * 1.20;
        break;
      case 'LOW_COST':
        mkt = budgetForStrategy * 0.15;
        rd = budgetForStrategy * 0.10;
        prodBudget = budgetForStrategy * 0.75;
        price = benchPrice * 0.88;
        break;
      case 'CONSERVATIVE_CASH':
        mkt = budgetForStrategy * 0.10;
        rd = budgetForStrategy * 0.10;
        prodBudget = budgetForStrategy * 0.40;
        price = benchPrice;
        break;
      case 'EXPANSIONIST':
        mkt = budgetForStrategy * 0.25;
        rd = budgetForStrategy * 0.20;
        prodBudget = budgetForStrategy * 0.55;
        price = benchPrice * 0.96;
        break;
      case 'LEAN_OPS':
        mkt = budgetForStrategy * 0.18;
        rd = budgetForStrategy * 0.12;
        prodBudget = budgetForStrategy * 0.60;
        price = benchPrice;
        break;
      case 'BALANCED':
      default:
        mkt = budgetForStrategy * 0.20;
        rd = budgetForStrategy * 0.20;
        prodBudget = budgetForStrategy * 0.60;
        price = benchPrice;
        break;
    }

    const prod = Math.floor(prodBudget / unitCost);

    return {
      teamId: snapshot.teamId,
      marketingBudget: mkt,
      rdBudget: rd,
      operationsBudget: ops,
      productionUnits: prod,
      unitPrice: price,
      investmentDecision: invDecision,
    };
  }

  it('successfully executes a full 5-round rehearsal across 40 teams adhering to all financial and security laws', () => {
    // 1. Initialize 40 snapshots with $1,000,000 cash, 100% equity, and $200,000 valuation
    let currentSnapshots: Record<string, CompanySnapshot> = {};

    TEAMS.forEach(team => {
      currentSnapshots[team.id] = {
        teamId: team.id,
        roundNumber: 0,
        cash: D(1000000), // Exactly $1M initial operating capital
        beginningInventoryUnits: ZERO,
        inventoryAverageUnitCost: D(team.domain.baseUnitCogs),
        cumulativeRdStock: ZERO,
        cumulativeBrandStock: ZERO,
        retainedEquityPct: D(100), // Exactly 100% initial retained equity
        valuation: D(200000), // Exactly $200,000 initial valuation
      };
    });

    const roundFinancialHistories: Record<number, Record<string, any>> = {};

    // 2. Execute 5 Rounds
    for (let r = 1; r <= 5; r++) {
      const nextRoundSnapshots: Record<string, CompanySnapshot> = {};
      const roundDetails: Record<string, any> = {};

      for (const domain of domains) {
        const domainTeams = TEAMS.filter(t => t.domainId === domain.code);
        const domainDecisions: CompanyDecision[] = [];

        domainTeams.forEach(team => {
          const snap = currentSnapshots[team.id];
          const dec = generateDecisionForStrategy(
            team.strategyType,
            r,
            snap,
            domain
          );

          // VERIFY STRICT OVERSPENDING REJECTION
          const budgetCheck = validateCompanyDecision(dec, domain, snap);
          expect(budgetCheck.isValid).toBe(true);

          domainDecisions.push(dec);
        });

        // Simulate domain round
        const priorSnapshotsList = domainTeams.map(t => currentSnapshots[t.id]);
        const domainSimResult = simulateDomainRound(
          domain,
          r,
          domainDecisions,
          priorSnapshotsList
        );

        expect(domainSimResult.companyResults.length).toBe(10);

        domainSimResult.companyResults.forEach(res => {
          // FINANCIAL LAW 1: Pre-clamp cash solvency check
          // The pre-clamp cash balance must never be negative when operating within verified budget
          expect(res.financial.endingCash.toNumber()).toBeGreaterThanOrEqual(0);

          // FINANCIAL LAW 2: Exact Financial Statement Reconciliation:
          // Ending Cash = Prior Cash + Operating Cash Flow + Financing Cash Flow
          const priorCash = currentSnapshots[res.teamId].cash;
          const expectedEndingCash = priorCash
            .plus(res.financial.operatingCashFlow)
            .plus(res.financial.financingCashFlow);

          expect(res.financial.endingCash.toNumber()).toBeCloseTo(expectedEndingCash.toNumber(), 2);

          // FINANCIAL LAW 3: Cap Table Conservation
          // Retained equity must be between 0 and 100%
          const retainedEquity = res.equity.postRoundRetainedEquityPct.toNumber();
          const investorEquity = res.equity.investorEquityStakePct.toNumber();
          expect(retainedEquity).toBeGreaterThan(0);
          expect(retainedEquity).toBeLessThanOrEqual(100);

          // In round 2 or 4, if offer accepted, investor stake must be positive and founder equity reduced
          if (res.equity.investmentDecision !== 'REJECT_BOTH') {
            expect(investorEquity).toBeGreaterThan(0);
            expect(res.equity.cashInjected.toNumber()).toBeGreaterThan(0);
          }

          // FINANCIAL LAW 4: Valuation Law
          // Base seed valuation is always $200,000
          expect(res.valuation.baseSeedValuation.toNumber()).toBe(200000);
          expect(res.valuation.finalValuation.toNumber()).toBeGreaterThanOrEqual(50000);

          nextRoundSnapshots[res.teamId] = res.nextSnapshot;
          roundDetails[res.teamId] = res;
        });
      }

      currentSnapshots = nextRoundSnapshots;
      roundFinancialHistories[r] = roundDetails;
    }

    // 3. Final Tournament Scoring & Tie-Breaking across all 40 teams
    const allFinalResults = Object.values(roundFinancialHistories[5]);
    expect(allFinalResults.length).toBe(40);

    // 5-level deterministic tie-breaker sort:
    // 1. finalScore DESC
    // 2. valuation DESC
    // 3. grossRevenue DESC
    // 4. endingCash DESC
    // 5. teamId ASC
    const sortedLeaderboard = [...allFinalResults].sort((a, b) => {
      const scoreDiff = b.valuation.finalScore.minus(a.valuation.finalScore).toNumber();
      if (scoreDiff !== 0) return scoreDiff;

      const valDiff = b.valuation.finalValuation.minus(a.valuation.finalValuation).toNumber();
      if (valDiff !== 0) return valDiff;

      const revDiff = b.financial.grossRevenue.minus(a.financial.grossRevenue).toNumber();
      if (revDiff !== 0) return revDiff;

      const cashDiff = b.financial.endingCash.minus(a.financial.endingCash).toNumber();
      if (cashDiff !== 0) return cashDiff;

      return a.teamId.localeCompare(b.teamId);
    });

    expect(sortedLeaderboard.length).toBe(40);

    // Grand Champion (Rank 1) must have highest equity-adjusted score
    const champion = sortedLeaderboard[0];
    const secondPlace = sortedLeaderboard[1];
    const thirdPlace = sortedLeaderboard[2];

    expect(champion.valuation.finalScore.toNumber()).toBeGreaterThanOrEqual(
      secondPlace.valuation.finalScore.toNumber()
    );
    expect(secondPlace.valuation.finalScore.toNumber()).toBeGreaterThanOrEqual(
      thirdPlace.valuation.finalScore.toNumber()
    );

    // Verify all 4 business domains have representatives in the rehearsal
    const representedDomains = new Set(sortedLeaderboard.map(r => r.domainCode.toUpperCase()));
    expect(representedDomains.size).toBe(4);
    expect(representedDomains).toContain('CLEANTECH');
    expect(representedDomains).toContain('HEALTHTECH');
    expect(representedDomains).toContain('SAAS');
    expect(representedDomains).toContain('D2C');

    // Verify all 40 teams have complete 5-round financial histories
    for (let r = 1; r <= 5; r++) {
      expect(Object.keys(roundFinancialHistories[r]).length).toBe(40);
    }
  });
});
