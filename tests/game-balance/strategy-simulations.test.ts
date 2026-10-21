import { describe, it, expect } from 'vitest';
import { simulateDomainRound } from '@/engine/simulation/domain-simulation';
import { DOMAIN_ARCHETYPES } from '@/engine/config/domain-archetypes';
import { CompanyDecision, CompanySnapshot, DomainConfig } from '@/engine/types';
import { D, ZERO } from '@/engine/math/precision';

interface StrategyProfile {
  name: string;
  generateDecision: (
    roundNumber: number,
    snapshot: CompanySnapshot,
    domain: DomainConfig
  ) => CompanyDecision;
}

export interface SimulationSummary {
  strategyName: string;
  domainCode: string;
  round5Revenue: number;
  round5Ebitda: number;
  round5EndingCash: number;
  finalValuation: number;
  finalRetainedEquityPct: number;
  finalScore: number;
  tournamentRank?: number;
}

describe('Step 7: Tournament Game-Balance Analysis Across 8 Strategies', () => {
  const domains = Object.values(DOMAIN_ARCHETYPES);

  const STRATEGIES: StrategyProfile[] = [
    {
      name: 'A_AggressiveMarketing',
      generateDecision: (round, snap, domain) => {
        const cash = snap.cash.toNumber();
        const mkt = Math.min(cash * 0.45, 300000);
        const rd = Math.min(cash * 0.15, 100000);
        const ops = 20000;
        const remaining = Math.max(0, cash - (mkt + rd + ops));
        const unitCost = D(domain.baseUnitCogs).toNumber();
        const prod = Math.floor(remaining / unitCost);
        return {
          teamId: 'A_AggressiveMarketing',
          marketingBudget: mkt,
          rdBudget: rd,
          operationsBudget: ops,
          productionUnits: prod,
          unitPrice: D(domain.benchmarkPrice).toNumber(),
          investmentDecision: 'REJECT_BOTH',
        };
      },
    },
    {
      name: 'B_HeavyRdInvestment',
      generateDecision: (round, snap, domain) => {
        const cash = snap.cash.toNumber();
        const rd = Math.min(cash * 0.50, 350000);
        const mkt = Math.min(cash * 0.10, 80000);
        const ops = 25000;
        const remaining = Math.max(0, cash - (mkt + rd + ops));
        const unitCost = D(domain.baseUnitCogs).toNumber();
        const prod = Math.floor(remaining / unitCost);
        return {
          teamId: 'B_HeavyRdInvestment',
          marketingBudget: mkt,
          rdBudget: rd,
          operationsBudget: ops,
          productionUnits: prod,
          unitPrice: D(domain.benchmarkPrice).toNumber(),
          investmentDecision: 'REJECT_BOTH',
        };
      },
    },
    {
      name: 'C_ConservativeCashHoarding',
      generateDecision: (round, snap, domain) => {
        return {
          teamId: 'C_ConservativeCashHoarding',
          marketingBudget: 15000,
          rdBudget: 15000,
          operationsBudget: 0,
          productionUnits: 50,
          unitPrice: D(domain.benchmarkPrice).toNumber(),
          investmentDecision: 'REJECT_BOTH',
        };
      },
    },
    {
      name: 'D_BalancedGrowth',
      generateDecision: (round, snap, domain) => {
        const cash = snap.cash.toNumber();
        const mkt = Math.min(cash * 0.25, 200000);
        const rd = Math.min(cash * 0.25, 200000);
        const ops = 30000;
        const remaining = Math.max(0, cash - (mkt + rd + ops));
        const unitCost = D(domain.baseUnitCogs).toNumber();
        const prod = Math.floor(remaining / unitCost);
        return {
          teamId: 'D_BalancedGrowth',
          marketingBudget: mkt,
          rdBudget: rd,
          operationsBudget: ops,
          productionUnits: prod,
          unitPrice: D(domain.benchmarkPrice).toNumber(),
          investmentDecision: 'REJECT_BOTH',
        };
      },
    },
    {
      name: 'E_InventoryHeavyExpansion',
      generateDecision: (round, snap, domain) => {
        const cash = snap.cash.toNumber();
        const mkt = Math.min(cash * 0.15, 100000);
        const rd = Math.min(cash * 0.10, 75000);
        const ops = 50000; // heavy operations efficiency
        const remaining = Math.max(0, cash - (mkt + rd + ops));
        const unitCost = D(domain.baseUnitCogs).toNumber() * 0.85;
        const prod = Math.floor(remaining / unitCost);
        return {
          teamId: 'E_InventoryHeavyExpansion',
          marketingBudget: mkt,
          rdBudget: rd,
          operationsBudget: ops,
          productionUnits: prod,
          // Discount price slightly to accelerate inventory clearing
          unitPrice: D(domain.benchmarkPrice).toNumber() * 0.95,
          investmentDecision: 'REJECT_BOTH',
        };
      },
    },
    {
      name: 'F_InvestmentFundedGrowth',
      generateDecision: (round, snap, domain) => {
        const cash = snap.cash.toNumber();
        const mkt = Math.min(cash * 0.30, 300000);
        const rd = Math.min(cash * 0.25, 250000);
        const ops = 40000;
        const remaining = Math.max(0, cash - (mkt + rd + ops));
        const unitCost = D(domain.baseUnitCogs).toNumber();
        const prod = Math.floor(remaining / unitCost);
        // Accepts outside VC in Round 2 and Round 4
        const invChoice = round === 2 ? 'OFFER_A' : round === 4 ? 'OFFER_A' : 'REJECT_BOTH';
        return {
          teamId: 'F_InvestmentFundedGrowth',
          marketingBudget: mkt,
          rdBudget: rd,
          operationsBudget: ops,
          productionUnits: prod,
          unitPrice: D(domain.benchmarkPrice).toNumber(),
          investmentDecision: invChoice,
        };
      },
    },
    {
      name: 'G_NoExternalInvestmentBootstrapped',
      generateDecision: (round, snap, domain) => {
        const cash = snap.cash.toNumber();
        const mkt = Math.min(cash * 0.28, 250000);
        const rd = Math.min(cash * 0.28, 250000);
        const ops = 35000;
        const remaining = Math.max(0, cash - (mkt + rd + ops));
        const unitCost = D(domain.baseUnitCogs).toNumber();
        const prod = Math.floor(remaining / unitCost);
        return {
          teamId: 'G_NoExternalInvestmentBootstrapped',
          marketingBudget: mkt,
          rdBudget: rd,
          operationsBudget: ops,
          productionUnits: prod,
          unitPrice: D(domain.benchmarkPrice).toNumber(),
          investmentDecision: 'REJECT_BOTH',
        };
      },
    },
    {
      name: 'H_LateRoundAggressiveSpending',
      generateDecision: (round, snap, domain) => {
        const cash = snap.cash.toNumber();
        // Conserve in Rounds 1-3, surge in Rounds 4-5
        const isLateRound = round >= 4;
        const mktRatio = isLateRound ? 0.35 : 0.10;
        const rdRatio = isLateRound ? 0.35 : 0.10;
        const mkt = Math.min(cash * mktRatio, 350000);
        const rd = Math.min(cash * rdRatio, 350000);
        const ops = isLateRound ? 40000 : 10000;
        const remaining = Math.max(0, cash - (mkt + rd + ops));
        const unitCost = D(domain.baseUnitCogs).toNumber();
        const prod = Math.floor(remaining / unitCost);
        return {
          teamId: 'H_LateRoundAggressiveSpending',
          marketingBudget: mkt,
          rdBudget: rd,
          operationsBudget: ops,
          productionUnits: prod,
          unitPrice: D(domain.benchmarkPrice).toNumber(),
          investmentDecision: 'REJECT_BOTH',
        };
      },
    },
  ];

  it('simulates 5 complete rounds across all 4 domains for all 8 strategies', () => {
    const allDomainSummaries: Record<string, SimulationSummary[]> = {};

    for (const domain of domains) {
      let currentSnapshots: CompanySnapshot[] = STRATEGIES.map(s => ({
        teamId: s.name,
        roundNumber: 0,
        cash: D(1000000), // Starting operating capital $1,000,000
        beginningInventoryUnits: ZERO,
        inventoryAverageUnitCost: D(domain.baseUnitCogs),
        cumulativeRdStock: ZERO,
        cumulativeBrandStock: ZERO,
        retainedEquityPct: D(100),
        valuation: D(200000), // Starting valuation $200,000
      }));

      // Simulate 5 Rounds
      for (let round = 1; round <= 5; round++) {
        const snapshotMap = new Map(currentSnapshots.map(s => [s.teamId, s]));
        const decisions: CompanyDecision[] = STRATEGIES.map(s => {
          const snap = snapshotMap.get(s.name)!;
          return s.generateDecision(round, snap, domain);
        });

        const roundResult = simulateDomainRound(domain, round, decisions, currentSnapshots);
        currentSnapshots = roundResult.companyResults.map(r => r.nextSnapshot);

        if (round === 5) {
          const summaries: SimulationSummary[] = roundResult.companyResults.map(r => ({
            strategyName: r.teamId,
            domainCode: domain.code,
            round5Revenue: r.financial.grossRevenue.toNumber(),
            round5Ebitda: r.financial.ebitda.toNumber(),
            round5EndingCash: r.financial.endingCash.toNumber(),
            finalValuation: r.valuation.finalValuation.toNumber(),
            finalRetainedEquityPct: r.valuation.retainedEquityPct.toNumber(),
            finalScore: r.valuation.finalScore.toNumber(),
          }));

          summaries.sort((a, b) => b.finalScore - a.finalScore);
          allDomainSummaries[domain.code] = summaries;
        }
      }
    }

    // Verify Game Balance Insights across all 4 domains:
    for (const domain of domains) {
      const summaries = allDomainSummaries[domain.code];
      expect(summaries).toHaveLength(8);

      // 1. Cash Hoarder strategy (Strategy C) never wins!
      const hoarder = summaries.find(s => s.strategyName === 'C_ConservativeCashHoarding')!;
      const winner = summaries[0];
      expect(winner.strategyName).not.toBe('C_ConservativeCashHoarding');
      expect(winner.finalScore).toBeGreaterThan(hoarder.finalScore * 1.5);

      // 2. Both VC Growth (F) and Bootstrapped Growth (G/D) are viable and competitive
      const vcFunded = summaries.find(s => s.strategyName === 'F_InvestmentFundedGrowth')!;
      const bootstrapped = summaries.find(s => s.strategyName === 'G_NoExternalInvestmentBootstrapped')!;
      expect(vcFunded.finalValuation).toBeGreaterThan(bootstrapped.finalValuation);
      // VC diluted ownership to 60%
      expect(vcFunded.finalRetainedEquityPct).toBe(60.0);
      expect(bootstrapped.finalRetainedEquityPct).toBe(100.0);

      // 3. Final scores are well-behaved numbers in realistic tournament ranges
      for (const s of summaries) {
        expect(s.finalScore).toBeGreaterThan(0);
        expect(Number.isFinite(s.finalScore)).toBe(true);
      }
    }
  });
});
