import { describe, it, expect } from 'vitest';
import { simulateTournamentRound } from '@/engine/simulation/tournament-simulation';
import { DOMAIN_ARCHETYPES } from '@/engine/config/domain-archetypes';
import { CompanyDecision, CompanySnapshot } from '@/engine/types';
import { D, ZERO } from '@/engine/math/precision';

describe('Integration Test: Multi-Domain Tournament Simulation (All 4 Domains)', () => {
  // 8 teams (2 teams in each of the 4 domains)
  const teams = [
    { id: 'CT-1', domain: 'cleantech', price: 1200, prod: 600, mkt: 200000, rd: 200000 },
    { id: 'CT-2', domain: 'cleantech', price: 1300, prod: 400, mkt: 100000, rd: 150000 },
    { id: 'HT-1', domain: 'healthtech', price: 2500, prod: 300, mkt: 150000, rd: 300000 },
    { id: 'HT-2', domain: 'healthtech', price: 2800, prod: 200, mkt: 80000, rd: 200000 },
    { id: 'SaaS-1', domain: 'saas', price: 350, prod: 5000, mkt: 300000, rd: 150000 },
    { id: 'SaaS-2', domain: 'saas', price: 300, prod: 6000, mkt: 200000, rd: 100000 },
    { id: 'D2C-1', domain: 'd2c', price: 65, prod: 10000, mkt: 250000, rd: 50000 },
    { id: 'D2C-2', domain: 'd2c', price: 75, prod: 8000, mkt: 150000, rd: 40000 },
  ];

  const teamDomainMap = new Map(teams.map(t => [t.id, t.domain]));

  const decisions: CompanyDecision[] = teams.map(t => ({
    teamId: t.id,
    marketingBudget: t.mkt,
    rdBudget: t.rd,
    operationsBudget: 30000,
    productionUnits: t.prod,
    unitPrice: t.price,
    investmentDecision: 'REJECT_BOTH',
  }));

  const snapshots: CompanySnapshot[] = teams.map(t => ({
    teamId: t.id,
    roundNumber: 0,
    cash: D(1000000),
    beginningInventoryUnits: ZERO,
    inventoryAverageUnitCost: D(DOMAIN_ARCHETYPES[t.domain].baseUnitCogs),
    cumulativeRdStock: ZERO,
    cumulativeBrandStock: ZERO,
    retainedEquityPct: D(100),
    valuation: D(200000),
  }));

  it('successfully simulates an 8-team 4-domain tournament round and builds leaderboard', () => {
    const tournamentResult = simulateTournamentRound({
      roundNumber: 1,
      teamDomainMap,
      decisions,
      snapshots,
    });

    expect(tournamentResult.domainResults).toHaveLength(4);
    expect(tournamentResult.companyResults).toHaveLength(8);
    expect(tournamentResult.leaderboard).toHaveLength(8);

    // Leaderboard ranks should be 1 to 8 without duplicates or gaps
    const ranks = tournamentResult.leaderboard.map(e => e.tournamentRank);
    expect(ranks).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    // First place score should be >= second place score
    for (let i = 0; i < tournamentResult.leaderboard.length - 1; i++) {
      const current = tournamentResult.leaderboard[i].finalScore;
      const next = tournamentResult.leaderboard[i + 1].finalScore;
      expect(current.gte(next)).toBe(true);
    }

    // SaaS companies must have zero physical inventory holding cost
    const saasResults = tournamentResult.companyResults.filter(r => r.domainCode === 'saas');
    for (const r of saasResults) {
      expect(r.financial.inventoryHoldingCost.toNumber()).toBe(0);
    }
  });
});
