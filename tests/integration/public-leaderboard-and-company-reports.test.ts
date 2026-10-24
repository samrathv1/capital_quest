import { describe, it, expect, vi } from 'vitest';
import { TournamentService } from '@/lib/services/tournament-service';
import { AppError } from '@/lib/errors/app-error';

/**
 * Creates a fluent chainable mock Supabase client with Thenable support
 */
function createChainable(resolvedValue: any) {
  const chain: any = {
    select: vi.fn().mockImplementation(() => chain),
    insert: vi.fn().mockImplementation(() => Promise.resolve({ error: null })),
    update: vi.fn().mockImplementation(() => chain),
    eq: vi.fn().mockImplementation(() => chain),
    order: vi.fn().mockImplementation(() => chain),
    limit: vi.fn().mockImplementation(() => chain),
    single: vi.fn().mockImplementation(() => Promise.resolve({ data: resolvedValue, error: null })),
    maybeSingle: vi.fn().mockImplementation(() => Promise.resolve({ data: resolvedValue, error: null })),
    then: (resolve: any) => Promise.resolve({ data: resolvedValue, error: null }).then(resolve),
  };
  return chain;
}

describe('Phase 5: Public Leaderboard, Financial Reports & Analytics', () => {
  const eventId = '00000000-0000-0000-0000-000000000001';
  const round1Id = '00000000-0000-0000-0000-000000000010';
  const round2Id = '00000000-0000-0000-0000-000000000020';

  const cleanTechId = '00000000-0000-0000-0000-000000000100';
  const healthTechId = '00000000-0000-0000-0000-000000000200';

  const teamAId = '00000000-0000-0000-0000-00000000000a'; // CleanTech 1
  const teamBId = '00000000-0000-0000-0000-00000000000b'; // CleanTech 2
  const teamCId = '00000000-0000-0000-0000-00000000000c'; // HealthTech 1

  // 1. PUBLIC LEADERBOARD EMPTY STATE
  describe('1. Public Leaderboard Access & Empty State', () => {
    it('returns empty leaderboard and hasPublishedRounds: false when no rounds are published', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'events') {
            return createChainable({ id: eventId, name: 'Capital Quest 2026', status: 'active', active_round_number: 1 });
          }
          if (table === 'rounds') {
            return createChainable([]); // No published rounds
          }
          return createChainable([]);
        }),
      };

      const service = new TournamentService(mockSupabase as unknown as any);
      const result = await service.getPublicLeaderboard({});

      expect(result.hasPublishedRounds).toBe(false);
      expect(result.publishedRounds).toEqual([]);
      expect(result.leaderboard).toEqual([]);
      expect(result.event?.name).toBe('Capital Quest 2026');
    });

    it('rejects query for an unpublished round number with 404', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'events') {
            return createChainable({ id: eventId, name: 'Capital Quest 2026', status: 'active', active_round_number: 2 });
          }
          if (table === 'rounds') {
            return createChainable([{ id: round1Id, round_number: 1, status: 'published', published_at: '2026-10-24T10:00:00Z' }]);
          }
          return createChainable([]);
        }),
      };

      const service = new TournamentService(mockSupabase as unknown as any);
      await expect(service.getPublicLeaderboard({ roundNumber: 2 })).rejects.toThrowError(AppError);
    });
  });

  // 2. DETERMINISTIC TIE-BREAKING & RANKING
  describe('2. Deterministic 5-Level Tie-Breaker & Equity-Adjusted Scoring', () => {
    it('proves a company with lower valuation outranks a higher-valued company when founder equity is preserved', async () => {
      // Company A: Valuation $3,000,000, 100% Equity -> Final Score $3,000,000
      // Company B: Valuation $4,000,000, 60% Equity  -> Final Score $2,400,000
      const snapshots = [
        {
          id: 'snap-b',
          round_id: round1Id,
          team_id: teamBId,
          equity_adjusted_score: 2400000,
          company_valuation: 4000000,
          retained_equity_pct: 60.0,
          gross_revenue: 500000,
          ending_cash: 800000,
          ebitda: 150000,
          cogs: 200000,
          operating_expenses: 150000,
          inventory_holding_cost: 0,
          net_income: 112500,
          market_share_pct: 25.0,
          product_quality_index: 85,
          brand_equity_score: 120,
          tournament_rank: 2,
          domain_rank: 2,
          is_active: true,
          teams: {
            id: teamBId,
            team_code: 'CT-02',
            company_name: 'SolarDyn Inc',
            domain_id: cleanTechId,
            domains: { id: cleanTechId, code: 'CLEANTECH', name: 'CleanTech' },
          },
          rounds: { round_number: 1, status: 'published', published_at: '2026-10-24T10:00:00Z' },
        },
        {
          id: 'snap-a',
          round_id: round1Id,
          team_id: teamAId,
          equity_adjusted_score: 3000000,
          company_valuation: 3000000,
          retained_equity_pct: 100.0,
          gross_revenue: 400000,
          ending_cash: 900000,
          ebitda: 120000,
          cogs: 180000,
          operating_expenses: 100000,
          inventory_holding_cost: 0,
          net_income: 90000,
          market_share_pct: 22.0,
          product_quality_index: 80,
          brand_equity_score: 110,
          tournament_rank: 1,
          domain_rank: 1,
          is_active: true,
          teams: {
            id: teamAId,
            team_code: 'CT-01',
            company_name: 'HelioGrid Tech',
            domain_id: cleanTechId,
            domains: { id: cleanTechId, code: 'CLEANTECH', name: 'CleanTech' },
          },
          rounds: { round_number: 1, status: 'published', published_at: '2026-10-24T10:00:00Z' },
        },
      ];

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'events') {
            return createChainable({ id: eventId, name: 'Capital Quest 2026', status: 'active', active_round_number: 1 });
          }
          if (table === 'rounds') {
            return createChainable([{ id: round1Id, round_number: 1, status: 'published', published_at: '2026-10-24T10:00:00Z' }]);
          }
          if (table === 'company_snapshots') {
            return createChainable(snapshots);
          }
          return createChainable([]);
        }),
      };

      const service = new TournamentService(mockSupabase as unknown as any);
      const result = await service.getPublicLeaderboard({});

      expect(result.leaderboard).toHaveLength(2);
      // HelioGrid Tech ($3M score) MUST outrank SolarDyn Inc ($2.4M score), even though SolarDyn has higher valuation ($4M vs $3M)
      expect(result.leaderboard[0].companyName).toBe('HelioGrid Tech');
      expect(result.leaderboard[0].rank).toBe(1);
      expect(result.leaderboard[0].finalScore).toBe(3000000);

      expect(result.leaderboard[1].companyName).toBe('SolarDyn Inc');
      expect(result.leaderboard[1].rank).toBe(2);
      expect(result.leaderboard[1].finalScore).toBe(2400000);
      expect(result.leaderboard[1].valuation).toBe(4000000);
    });

    it('resolves identical final scores via valuation, gross revenue, ending cash, and team id tie-breaker', async () => {
      // 2 companies with identical final score $2,000,000
      // Team 1: higher valuation $2,500,000
      // Team 2: lower valuation $2,000,000
      const snapshots = [
        {
          id: 's2',
          round_id: round1Id,
          team_id: 'team-z',
          equity_adjusted_score: 2000000,
          company_valuation: 2000000,
          retained_equity_pct: 100,
          gross_revenue: 300000,
          ending_cash: 500000,
          tournament_rank: 2,
          domain_rank: 2,
          is_active: true,
          teams: { team_code: 'Z-01', company_name: 'Zeta Corp', domain_id: cleanTechId, domains: { code: 'CLEANTECH', name: 'CleanTech' } },
          rounds: { round_number: 1, status: 'published', published_at: '2026-10-24T10:00:00Z' },
        },
        {
          id: 's1',
          round_id: round1Id,
          team_id: 'team-a',
          equity_adjusted_score: 2000000,
          company_valuation: 2500000, // Higher valuation resolves tie!
          retained_equity_pct: 80,
          gross_revenue: 250000,
          ending_cash: 400000,
          tournament_rank: 1,
          domain_rank: 1,
          is_active: true,
          teams: { team_code: 'A-01', company_name: 'Alpha Corp', domain_id: cleanTechId, domains: { code: 'CLEANTECH', name: 'CleanTech' } },
          rounds: { round_number: 1, status: 'published', published_at: '2026-10-24T10:00:00Z' },
        },
      ];

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'events') {
            return createChainable({ id: eventId, name: 'Capital Quest 2026', status: 'active', active_round_number: 1 });
          }
          if (table === 'rounds') {
            return createChainable([{ id: round1Id, round_number: 1, status: 'published', published_at: '2026-10-24T10:00:00Z' }]);
          }
          if (table === 'company_snapshots') {
            return createChainable(snapshots);
          }
          return createChainable([]);
        }),
      };

      const service = new TournamentService(mockSupabase as unknown as any);
      const result = await service.getPublicLeaderboard({});

      expect(result.leaderboard[0].companyName).toBe('Alpha Corp');
      expect(result.leaderboard[1].companyName).toBe('Zeta Corp');
    });
  });

  // 3. RANK MOVEMENT (Δrank) BETWEEN PUBLISHED ROUNDS
  describe('3. Rank Movement (Δrank) Computation', () => {
    it('computes positive, negative, and neutral rank movements from previous published round', async () => {
      // In Round 1: Team A was Rank 2, Team B was Rank 1
      // In Round 2: Team A climbed to Rank 1 (movement: +1), Team B fell to Rank 2 (movement: -1)
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'events') {
            return createChainable({ id: eventId, name: 'Capital Quest 2026', status: 'active', active_round_number: 2 });
          }
          if (table === 'rounds') {
            return createChainable([
              { id: round1Id, round_number: 1, status: 'published', published_at: '2026-10-24T10:00:00Z' },
              { id: round2Id, round_number: 2, status: 'published', published_at: '2026-10-24T11:00:00Z' },
            ]);
          }
          if (table === 'company_snapshots') {
            const chain: any = {
              select: vi.fn().mockImplementation(() => chain),
              eq: vi.fn().mockImplementation((col: string, val: any) => {
                if (col === 'round_id' && val === round1Id) {
                  return createChainable([
                    { team_id: teamAId, tournament_rank: 2, domain_rank: 2 },
                    { team_id: teamBId, tournament_rank: 1, domain_rank: 1 },
                  ]);
                }
                return chain;
              }),
              then: (resolve: any) =>
                Promise.resolve({
                  data: [
                    {
                      id: 's-r2-a',
                      round_id: round2Id,
                      team_id: teamAId,
                      equity_adjusted_score: 3500000,
                      company_valuation: 3500000,
                      retained_equity_pct: 100,
                      gross_revenue: 800000,
                      ending_cash: 1200000,
                      tournament_rank: 1,
                      domain_rank: 1,
                      is_active: true,
                      teams: { team_code: 'CT-01', company_name: 'Team A', domain_id: cleanTechId, domains: { code: 'CLEANTECH', name: 'CleanTech' } },
                      rounds: { round_number: 2, status: 'published', published_at: '2026-10-24T11:00:00Z' },
                    },
                    {
                      id: 's-r2-b',
                      round_id: round2Id,
                      team_id: teamBId,
                      equity_adjusted_score: 2800000,
                      company_valuation: 4200000,
                      retained_equity_pct: 66.67,
                      gross_revenue: 700000,
                      ending_cash: 1100000,
                      tournament_rank: 2,
                      domain_rank: 2,
                      is_active: true,
                      teams: { team_code: 'CT-02', company_name: 'Team B', domain_id: cleanTechId, domains: { code: 'CLEANTECH', name: 'CleanTech' } },
                      rounds: { round_number: 2, status: 'published', published_at: '2026-10-24T11:00:00Z' },
                    },
                  ],
                  error: null,
                }).then(resolve),
            };
            return chain;
          }
          return createChainable([]);
        }),
      };

      const service = new TournamentService(mockSupabase as unknown as any);
      const result = await service.getPublicLeaderboard({ roundNumber: 2 });

      expect(result.leaderboard[0].companyName).toBe('Team A');
      expect(result.leaderboard[0].rank).toBe(1);
      expect(result.leaderboard[0].previousRank).toBe(2);
      expect(result.leaderboard[0].rankMovement).toBe(1); // +1 climb!

      expect(result.leaderboard[1].companyName).toBe('Team B');
      expect(result.leaderboard[1].rank).toBe(2);
      expect(result.leaderboard[1].previousRank).toBe(1);
      expect(result.leaderboard[1].rankMovement).toBe(-1); // -1 drop
    });
  });

  // 4. COMPANY PERFORMANCE & FINANCIAL REPORTS
  describe('4. Company Performance & Financial Reports', () => {
    it('returns structured multi-round statements, cap table, and round-over-round comparisons', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'teams') {
            return createChainable({
              id: teamAId,
              team_code: 'CT-01',
              company_name: 'HelioGrid Tech',
              table_station: 'Table 4A',
              domain_id: cleanTechId,
              event_id: eventId,
              events: { id: eventId, name: 'Capital Quest 2026', status: 'active', starting_capital: 1000000, starting_valuation: 200000 },
              domains: { id: cleanTechId, code: 'CLEANTECH', name: 'CleanTech' },
            });
          }
          if (table === 'rounds') {
            return createChainable([
              { id: round1Id, round_number: 1, status: 'published', type: 'regular', published_at: '2026-10-24T10:00:00Z' },
              { id: round2Id, round_number: 2, status: 'published', type: 'investment_seed', published_at: '2026-10-24T11:00:00Z' },
            ]);
          }
          if (table === 'company_snapshots') {
            return createChainable([
              {
                id: 'snap-1',
                round_id: round1Id,
                team_id: teamAId,
                gross_revenue: 400000,
                cogs: 180000,
                gross_profit: 220000,
                operating_expenses: 100000,
                inventory_holding_cost: 0,
                ebitda: 120000,
                tax_expense: 30000,
                net_income: 90000,
                operating_cash_flow: 90000,
                financing_cash_flow: 0,
                ending_cash: 1090000,
                product_quality_index: 80,
                brand_equity_score: 110,
                market_share_pct: 22.0,
                potential_demand: 1000,
                units_available: 900,
                units_sold: 900,
                units_stockout: 100,
                ending_inventory: 0,
                enterprise_value: 1910000,
                cash_valuation_contribution: 1090000,
                company_valuation: 3000000,
                retained_equity_pct: 100,
                equity_adjusted_score: 3000000,
                domain_rank: 1,
                tournament_rank: 1,
                rounds: { id: round1Id, round_number: 1, status: 'published', type: 'regular', published_at: '2026-10-24T10:00:00Z' },
              },
              {
                id: 'snap-2',
                round_id: round2Id,
                team_id: teamAId,
                gross_revenue: 600000,
                cogs: 250000,
                gross_profit: 350000,
                operating_expenses: 120000,
                inventory_holding_cost: 0,
                ebitda: 230000,
                tax_expense: 57500,
                net_income: 172500,
                operating_cash_flow: 172500,
                financing_cash_flow: 500000, // VC Seed injection!
                ending_cash: 1762500,
                product_quality_index: 85,
                brand_equity_score: 130,
                market_share_pct: 26.0,
                potential_demand: 1400,
                units_available: 1300,
                units_sold: 1300,
                units_stockout: 100,
                ending_inventory: 0,
                enterprise_value: 2737500,
                cash_valuation_contribution: 1762500,
                company_valuation: 4500000,
                retained_equity_pct: 88.8889,
                equity_adjusted_score: 4000000,
                domain_rank: 1,
                tournament_rank: 1,
                rounds: { id: round2Id, round_number: 2, status: 'published', type: 'investment_seed', published_at: '2026-10-24T11:00:00Z' },
              },
            ]);
          }
          if (table === 'equity_transactions') {
            return createChainable([
              {
                id: 'eq-1',
                round_id: round2Id,
                team_id: teamAId,
                shareholder_name: 'Founding Team',
                is_founding_team: true,
                pre_round_equity_pct: 100,
                dilution_delta_pct: -11.1111,
                post_round_equity_pct: 88.8889,
                investment_amount: 0,
                rounds: { round_number: 2, status: 'published', type: 'investment_seed' },
              },
              {
                id: 'eq-2',
                round_id: round2Id,
                team_id: teamAId,
                shareholder_name: 'CleanTech Ventures',
                is_founding_team: false,
                pre_round_equity_pct: 0,
                dilution_delta_pct: 11.1111,
                post_round_equity_pct: 11.1111,
                investment_amount: 500000,
                rounds: { round_number: 2, status: 'published', type: 'investment_seed' },
              },
            ]);
          }
          if (table === 'financial_ledger') {
            return createChainable([]);
          }
          return createChainable([]);
        }),
      };

      const service = new TournamentService(mockSupabase as unknown as any);
      const result = await service.getCompanyPerformance(teamAId);

      expect(result.company.companyName).toBe('HelioGrid Tech');
      expect(result.history).toHaveLength(2);

      // Financial statements
      expect(result.financialStatements.incomeStatement).toHaveLength(2);
      expect(result.financialStatements.incomeStatement[0].grossRevenue).toBe(400000);
      expect(result.financialStatements.incomeStatement[1].grossRevenue).toBe(600000);

      // Cash flow clearly distinguishes Operating vs Financing
      expect(result.financialStatements.cashFlow[0].financingCashFlow).toBe(0);
      expect(result.financialStatements.cashFlow[1].financingCashFlow).toBe(500000);

      // Cap table
      expect(result.capTable).toHaveLength(2);
      expect(result.capTable[0].postRoundEquityPct).toBe(88.8889);
      expect(result.capTable[1].investmentAmount).toBe(500000);

      // Round-over-round comparisons
      expect(result.roundComparisons).toHaveLength(2);
      // Round 1 vs Round 0 baseline: baseline was 0, so revenueGrowthPct is null (safe baseline!)
      expect(result.roundComparisons[0].revenueGrowthPct).toBeNull();
      // Round 2 vs Round 1: revenue went from $400k to $600k (+50%)
      expect(result.roundComparisons[1].revenueDelta).toBe(200000);
      expect(result.roundComparisons[1].revenueGrowthPct).toBe(50);
    });

    it('throws 404 AppError when company is not found', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue(createChainable(null)),
      };

      const service = new TournamentService(mockSupabase as unknown as any);
      await expect(service.getCompanyPerformance('non-existent-id')).rejects.toThrowError(AppError);
    });
  });
});
