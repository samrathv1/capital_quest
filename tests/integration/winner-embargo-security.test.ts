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

describe('Phase 7: Winner Embargo Security & Production Hardening', () => {
  const eventId = '00000000-0000-0000-0000-000000000001';
  const round4Id = '00000000-0000-0000-0000-000000000040';
  const round5Id = '00000000-0000-0000-0000-000000000050';

  const publishedRounds = [
    { id: '00000000-0000-0000-0000-000000000010', round_number: 1, status: 'published', type: 'standard', published_at: '2026-10-25T10:00:00Z' },
    { id: '00000000-0000-0000-0000-000000000020', round_number: 2, status: 'published', type: 'standard', published_at: '2026-10-25T11:00:00Z' },
    { id: '00000000-0000-0000-0000-000000000030', round_number: 3, status: 'published', type: 'standard', published_at: '2026-10-25T12:00:00Z' },
    { id: round4Id, round_number: 4, status: 'published', type: 'standard', published_at: '2026-10-25T13:00:00Z' },
    { id: round5Id, round_number: 5, status: 'published', type: 'standard', published_at: '2026-10-25T14:00:00Z' },
  ];

  const round4Snapshots = [
    {
      id: 'snap-4-a',
      round_id: round4Id,
      team_id: 'team-a',
      equity_adjusted_score: 2800,
      company_valuation: 2200000,
      retained_equity_pct: 85,
      ending_cash: 600000,
      gross_revenue: 800000,
      cogs: 200000,
      gross_profit: 600000,
      operating_expenses: 300000,
      inventory_holding_cost: 0,
      ebitda: 300000,
      net_income: 200000,
      market_share_pct: 35,
      product_quality_index: 80,
      brand_equity_score: 70,
      tournament_rank: 1,
      domain_rank: 1,
      teams: { id: 'team-a', company_name: 'Alpha CleanTech', team_code: 'CT-01', table_station: 'A1', domain_id: 'dom-ct', domains: { id: 'dom-ct', name: 'CleanTech', code: 'CT' } },
      rounds: { id: round4Id, round_number: 4, status: 'published', type: 'standard', published_at: '2026-10-25T13:00:00Z' },
    },
    {
      id: 'snap-4-b',
      round_id: round4Id,
      team_id: 'team-b',
      equity_adjusted_score: 2600,
      company_valuation: 2000000,
      retained_equity_pct: 90,
      ending_cash: 550000,
      gross_revenue: 750000,
      cogs: 200000,
      gross_profit: 550000,
      operating_expenses: 280000,
      inventory_holding_cost: 0,
      ebitda: 270000,
      net_income: 180000,
      market_share_pct: 30,
      product_quality_index: 78,
      brand_equity_score: 65,
      tournament_rank: 2,
      domain_rank: 1,
      teams: { id: 'team-b', company_name: 'Beta HealthTech', team_code: 'HT-01', table_station: 'B1', domain_id: 'dom-ht', domains: { id: 'dom-ht', name: 'HealthTech', code: 'HT' } },
      rounds: { id: round4Id, round_number: 4, status: 'published', type: 'standard', published_at: '2026-10-25T13:00:00Z' },
    },
    {
      id: 'snap-4-c',
      round_id: round4Id,
      team_id: 'team-c',
      equity_adjusted_score: 2400,
      company_valuation: 1800000,
      retained_equity_pct: 95,
      ending_cash: 500000,
      gross_revenue: 700000,
      cogs: 180000,
      gross_profit: 520000,
      operating_expenses: 260000,
      inventory_holding_cost: 0,
      ebitda: 260000,
      net_income: 150000,
      market_share_pct: 25,
      product_quality_index: 75,
      brand_equity_score: 60,
      tournament_rank: 3,
      domain_rank: 1,
      teams: { id: 'team-c', company_name: 'Gamma SaaS', team_code: 'ST-01', table_station: 'C1', domain_id: 'dom-st', domains: { id: 'dom-st', name: 'SaaS', code: 'ST' } },
      rounds: { id: round4Id, round_number: 4, status: 'published', type: 'standard', published_at: '2026-10-25T13:00:00Z' },
    },
  ];

  const round5Snapshots = [
    {
      id: 'snap-5-a',
      round_id: round5Id,
      team_id: 'team-a',
      equity_adjusted_score: 3800,
      company_valuation: 3500000,
      retained_equity_pct: 85,
      ending_cash: 900000,
      gross_revenue: 1400000,
      cogs: 300000,
      gross_profit: 1100000,
      operating_expenses: 450000,
      inventory_holding_cost: 0,
      ebitda: 650000,
      net_income: 450000,
      market_share_pct: 40,
      product_quality_index: 90,
      brand_equity_score: 85,
      tournament_rank: 1,
      domain_rank: 1,
      teams: { id: 'team-a', company_name: 'Alpha CleanTech', team_code: 'CT-01', table_station: 'A1', domain_id: 'dom-ct', domains: { id: 'dom-ct', name: 'CleanTech', code: 'CT' } },
      rounds: { id: round5Id, round_number: 5, status: 'published', type: 'standard', published_at: '2026-10-25T14:00:00Z' },
    },
    {
      id: 'snap-5-b',
      round_id: round5Id,
      team_id: 'team-b',
      equity_adjusted_score: 3400,
      company_valuation: 3100000,
      retained_equity_pct: 90,
      ending_cash: 850000,
      gross_revenue: 1200000,
      cogs: 280000,
      gross_profit: 920000,
      operating_expenses: 400000,
      inventory_holding_cost: 0,
      ebitda: 520000,
      net_income: 380000,
      market_share_pct: 35,
      product_quality_index: 85,
      brand_equity_score: 80,
      tournament_rank: 2,
      domain_rank: 1,
      teams: { id: 'team-b', company_name: 'Beta HealthTech', team_code: 'HT-01', table_station: 'B1', domain_id: 'dom-ht', domains: { id: 'dom-ht', name: 'HealthTech', code: 'HT' } },
      rounds: { id: round5Id, round_number: 5, status: 'published', type: 'standard', published_at: '2026-10-25T14:00:00Z' },
    },
    {
      id: 'snap-5-c',
      round_id: round5Id,
      team_id: 'team-c',
      equity_adjusted_score: 3000,
      company_valuation: 2800000,
      retained_equity_pct: 95,
      ending_cash: 750000,
      gross_revenue: 1100000,
      cogs: 250000,
      gross_profit: 850000,
      operating_expenses: 380000,
      inventory_holding_cost: 0,
      ebitda: 470000,
      net_income: 320000,
      market_share_pct: 30,
      product_quality_index: 82,
      brand_equity_score: 75,
      tournament_rank: 3,
      domain_rank: 1,
      teams: { id: 'team-c', company_name: 'Gamma SaaS', team_code: 'ST-01', table_station: 'C1', domain_id: 'dom-st', domains: { id: 'dom-st', name: 'SaaS', code: 'ST' } },
      rounds: { id: round5Id, round_number: 5, status: 'published', type: 'standard', published_at: '2026-10-25T14:00:00Z' },
    },
  ];

  function createMockSupabase(ceremonyStage: string = 'waiting') {
    return {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'events') {
          return createChainable({
            id: eventId,
            name: 'Capital Quest 2026',
            status: 'active',
            total_rounds: 5,
            starting_capital: 1000000,
            starting_valuation: 200000,
          });
        }
        if (table === 'rounds') {
          return createChainable(publishedRounds);
        }
        if (table === 'presentation_state') {
          return createChainable({
            id: 'state-1',
            event_id: eventId,
            ceremony_stage: ceremonyStage,
            mode: 'ceremony',
          });
        }
        if (table === 'company_snapshots') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockImplementation((col: string, val: any) => {
              if (col === 'round_id') {
                if (val === round5Id) return createChainable(round5Snapshots);
                if (val === round4Id) return createChainable(round4Snapshots);
              }
              if (col === 'team_id') {
                return createChainable([round4Snapshots[0], round5Snapshots[0]]);
              }
              return createChainable([]);
            }),
            order: vi.fn().mockReturnThis(),
            then: (resolve: any) => Promise.resolve({ data: round5Snapshots, error: null }).then(resolve),
          };
        }
        if (table === 'teams') {
          return createChainable({
            id: 'team-a',
            company_name: 'Alpha CleanTech',
            team_code: 'CT-01',
            table_station: 'A1',
            domain_id: 'dom-ct',
            events: { id: eventId, name: 'Capital Quest 2026', status: 'active', starting_capital: 1000000, starting_valuation: 200000, total_rounds: 5 },
            domains: { id: 'dom-ct', name: 'CleanTech', code: 'CT' },
          });
        }
        if (table === 'financial_ledger') {
          return createChainable([
            { round_id: round4Id, round_number: 4, category: 'revenue', amount: 800000, rounds: { id: round4Id, round_number: 4, status: 'published' } },
            { round_id: round5Id, round_number: 5, category: 'revenue', amount: 1400000, rounds: { id: round5Id, round_number: 5, status: 'published' } },
          ]);
        }
        if (table === 'equity_transactions') {
          return createChainable([]);
        }
        return createChainable([]);
      }),
    };
  }

  // 1. PUBLIC LEADERBOARD EMBARGO VERIFICATION
  describe('1. Public Leaderboard Embargo Enforcement', () => {
    it('blocks anonymous access to final round (Round 5) before podium with 403 FORBIDDEN', async () => {
      const mockSupabase = createMockSupabase('waiting');
      const service = new TournamentService(mockSupabase as unknown as any);

      await expect(
        service.getPublicLeaderboard({ eventId, roundNumber: 5 })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'FORBIDDEN',
          message: expect.stringContaining('strictly embargoed'),
        })
      );
    });

    it('blocks anonymous access to final round during reveal_first stage', async () => {
      const mockSupabase = createMockSupabase('reveal_first');
      const service = new TournamentService(mockSupabase as unknown as any);

      await expect(
        service.getPublicLeaderboard({ eventId, roundNumber: 5 })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'FORBIDDEN',
        })
      );
    });

    it('blocks volunteer from accessing final round rankings before podium', async () => {
      const mockSupabase = createMockSupabase('waiting');
      const service = new TournamentService(mockSupabase as unknown as any);

      await expect(
        service.getPublicLeaderboard({ eventId, roundNumber: 5, callerRole: 'volunteer' as any })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'FORBIDDEN',
          message: expect.stringContaining('strictly embargoed'),
        })
      );
    });

    it('blocks domain_coordinator from accessing final round rankings before podium', async () => {
      const mockSupabase = createMockSupabase('waiting');
      const service = new TournamentService(mockSupabase as unknown as any);

      await expect(
        service.getPublicLeaderboard({ eventId, roundNumber: 5, callerRole: 'domain_coordinator' as any })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'FORBIDDEN',
          message: expect.stringContaining('strictly embargoed'),
        })
      );
    });

    it('blocks public_observer (participant) from accessing final round rankings before podium', async () => {
      const mockSupabase = createMockSupabase('waiting');
      const service = new TournamentService(mockSupabase as unknown as any);

      await expect(
        service.getPublicLeaderboard({ eventId, roundNumber: 5, callerRole: 'public_observer' as any })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'FORBIDDEN',
          message: expect.stringContaining('strictly embargoed'),
        })
      );
    });

    it('allows super_admin and judge to access final round rankings before podium', async () => {
      const mockSupabase = createMockSupabase('waiting');
      const service = new TournamentService(mockSupabase as unknown as any);

      const adminResult = await service.getPublicLeaderboard({
        eventId,
        roundNumber: 5,
        callerRole: 'super_admin',
      });

      expect(adminResult.leaderboard.length).toBe(3);
      expect(adminResult.selectedRoundNumber).toBe(5);
      expect(adminResult.isFinalRoundEmbargoed).toBe(false);

      const judgeResult = await service.getPublicLeaderboard({
        eventId,
        roundNumber: 5,
        callerRole: 'judge',
      });
      expect(judgeResult.selectedRoundNumber).toBe(5);
    });

    it('falls back to Round 4 when anonymous user queries leaderboard without specifying roundNumber', async () => {
      const mockSupabase = createMockSupabase('waiting');
      const service = new TournamentService(mockSupabase as unknown as any);

      const publicResult = await service.getPublicLeaderboard({ eventId });

      expect(publicResult.selectedRoundNumber).toBe(4);
      expect(publicResult.isFinalRoundEmbargoed).toBe(true);
      expect(publicResult.leaderboard[0].companyName).toBe('Alpha CleanTech');
      expect(publicResult.leaderboard[0].valuation).toBe(2200000); // Round 4 valuation, not Round 5 ($3.5M)
    });

    it('releases final round rankings to anonymous users once ceremonyStage reaches podium', async () => {
      const mockSupabase = createMockSupabase('podium');
      const service = new TournamentService(mockSupabase as unknown as any);

      const publicResult = await service.getPublicLeaderboard({ eventId, roundNumber: 5 });

      expect(publicResult.selectedRoundNumber).toBe(5);
      expect(publicResult.isFinalRoundEmbargoed).toBe(false);
      expect(publicResult.leaderboard[0].valuation).toBe(3500000); // Full Round 5 valuation released
    });
  });

  // 2. COMPANY PERFORMANCE EMBARGO VERIFICATION
  describe('2. Company Performance & Financial Reports Embargo', () => {
    it('redacts final round snapshot and ledger entries for anonymous viewers before podium', async () => {
      const mockSupabase = createMockSupabase('waiting');
      const service = new TournamentService(mockSupabase as unknown as any);

      const report = await service.getCompanyPerformance('team-a');

      expect(report.isFinalRoundEmbargoed).toBe(true);
      // Historical snapshots in history should only include up to Round 4
      const roundNumbers = report.history.map((s: any) => s.roundNumber);
      expect(roundNumbers).toContain(4);
      expect(roundNumbers).not.toContain(5);

      // Latest snapshot should be from Round 4, not Round 5
      expect(report.latestSnapshot?.roundNumber).toBe(4);
      expect(report.latestSnapshot?.companyValuation).toBe(2200000);

      // Ledger entries should only include Round 4
      const ledgerRounds = report.ledgerEntries.map((l: any) => l.round_number);
      expect(ledgerRounds).not.toContain(5);
    });

    it('allows super_admin to view complete company reports including Round 5 before podium', async () => {
      const mockSupabase = createMockSupabase('waiting');
      const service = new TournamentService(mockSupabase as unknown as any);

      const report = await service.getCompanyPerformance('team-a', 'super_admin');

      expect(report.isFinalRoundEmbargoed).toBe(false);
      const roundNumbers = report.history.map((s: any) => s.roundNumber);
      expect(roundNumbers).toContain(5);
      expect(report.latestSnapshot?.roundNumber).toBe(5);
      expect(report.latestSnapshot?.companyValuation).toBe(3500000);
    });

    it('redacts final round from company reports for volunteer before podium', async () => {
      const mockSupabase = createMockSupabase('waiting');
      const service = new TournamentService(mockSupabase as unknown as any);

      const report = await service.getCompanyPerformance('team-a', 'volunteer');

      expect(report.isFinalRoundEmbargoed).toBe(true);
      const roundNumbers = report.history.map((s: any) => s.roundNumber);
      expect(roundNumbers).not.toContain(5);
      expect(report.latestSnapshot?.roundNumber).toBe(4);
    });

    it('allows judge to view complete company reports including Round 5 before podium', async () => {
      const mockSupabase = createMockSupabase('waiting');
      const service = new TournamentService(mockSupabase as unknown as any);

      const report = await service.getCompanyPerformance('team-a', 'judge');

      expect(report.isFinalRoundEmbargoed).toBe(false);
      const roundNumbers = report.history.map((s: any) => s.roundNumber);
      expect(roundNumbers).toContain(5);
      expect(report.latestSnapshot?.roundNumber).toBe(5);
    });

    it('releases complete Round 5 company reports to public once ceremonyStage reaches podium', async () => {
      const mockSupabase = createMockSupabase('podium');
      const service = new TournamentService(mockSupabase as unknown as any);

      const report = await service.getCompanyPerformance('team-a');

      expect(report.isFinalRoundEmbargoed).toBe(false);
      const roundNumbers = report.history.map((s: any) => s.roundNumber);
      expect(roundNumbers).toContain(5);
      expect(report.latestSnapshot?.roundNumber).toBe(5);
    });
  });

  // 3. PROJECTOR PRESENTATION CONTROL INTEGRITY
  describe('3. Stage Ceremony Incremental Reveal Policy', () => {
    it('redacts all winners in waiting stage', async () => {
      const mockSupabase = createMockSupabase('waiting');
      const service = new TournamentService(mockSupabase as unknown as any);

      const pres = await service.getPublicPresentationData(eventId);
      expect(pres.ceremony?.stage).toBe('waiting');
      expect(pres.ceremony?.winners).toEqual([]);
      expect(pres.ceremony?.currentReveal).toBeNull();
    });

    it('reveals only 3rd place in reveal_third stage', async () => {
      const mockSupabase = createMockSupabase('reveal_third');
      const service = new TournamentService(mockSupabase as unknown as any);

      const pres = await service.getPublicPresentationData(eventId);
      expect(pres.ceremony?.stage).toBe('reveal_third');
      expect(pres.ceremony?.revealedWinners.length).toBe(1);
    });

    it('reveals all 3 winners on podium stage', async () => {
      const mockSupabase = createMockSupabase('podium');
      const service = new TournamentService(mockSupabase as unknown as any);

      const pres = await service.getPublicPresentationData(eventId);
      expect(pres.ceremony?.stage).toBe('podium');
      expect(pres.ceremony?.isPodiumComplete).toBe(true);
      expect(pres.ceremony?.winners.length).toBeGreaterThanOrEqual(2);
    });
  });
});
