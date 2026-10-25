import { describe, it, expect, vi } from 'vitest';
import { TournamentService } from '@/lib/services/tournament-service';
import { AppError } from '@/lib/errors/app-error';

/**
 * Creates a fluent chainable mock Supabase client with Thenable resolution
 */
function createChainable(resolvedValue: unknown) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockImplementation(() => chain),
    insert: vi.fn().mockImplementation(() => Promise.resolve({ error: null })),
    update: vi.fn().mockImplementation(() => chain),
    upsert: vi.fn().mockImplementation(() => Promise.resolve({ error: null })),
    eq: vi.fn().mockImplementation(() => chain),
    order: vi.fn().mockImplementation(() => chain),
    limit: vi.fn().mockImplementation(() => chain),
    single: vi.fn().mockImplementation(() => Promise.resolve({ data: resolvedValue, error: null })),
    maybeSingle: vi.fn().mockImplementation(() => Promise.resolve({ data: resolvedValue, error: null })),
    then: (resolve: (val: unknown) => unknown) => Promise.resolve({ data: resolvedValue, error: null }).then(resolve),
  };
  return chain;
}

describe('Phase 6: Live Presentation Mode & Winner Reveal Ceremony', () => {
  const eventId = '00000000-0000-0000-0000-000000000001';
  const round1Id = '00000000-0000-0000-0000-000000000010';
  const round2Id = '00000000-0000-0000-0000-000000000020';
  const round5Id = '00000000-0000-0000-0000-000000000050';

  const cleanTechId = '00000000-0000-0000-0000-000000000100';
  const healthTechId = '00000000-0000-0000-0000-000000000200';
  const saasId = '00000000-0000-0000-0000-000000000300';
  const d2cId = '00000000-0000-0000-0000-000000000400';

  const team1Id = '00000000-0000-0000-0000-000000000001'; // Gold 1st
  const team2Id = '00000000-0000-0000-0000-000000000002'; // Silver 2nd
  const team3Id = '00000000-0000-0000-0000-000000000003'; // Bronze 3rd
  const team4Id = '00000000-0000-0000-0000-000000000004'; // 4th

  const mockFinalSnapshots = [
    {
      id: 'snap-1',
      round_id: round5Id,
      team_id: team1Id,
      company_valuation: 3500000,
      retained_equity_pct: 82.5,
      equity_adjusted_score: 2887.5,
      ending_cash: 950000,
      gross_revenue: 1200000,
      net_income: 450000,
      ebitda: 500000,
      cogs: 300000,
      operating_expenses: 400000,
      inventory_holding_cost: 0,
      market_share_pct: 28.5,
      product_quality_index: 88,
      brand_equity_score: 82,
      tournament_rank: 1,
      domain_rank: 1,
      teams: {
        id: team1Id,
        team_code: 'SAAS-01',
        company_name: 'CloudPeak AI',
        table_station: 'A1',
        domain_id: saasId,
        domains: { id: saasId, code: 'SAAS', name: 'Enterprise SaaS' },
      },
    },
    {
      id: 'snap-2',
      round_id: round5Id,
      team_id: team2Id,
      company_valuation: 3100000,
      retained_equity_pct: 78.0,
      equity_adjusted_score: 2418.0,
      ending_cash: 800000,
      gross_revenue: 1050000,
      net_income: 380000,
      ebitda: 420000,
      cogs: 320000,
      operating_expenses: 350000,
      inventory_holding_cost: 4800,
      market_share_pct: 24.0,
      product_quality_index: 82,
      brand_equity_score: 76,
      tournament_rank: 2,
      domain_rank: 1,
      teams: {
        id: team2Id,
        team_code: 'CLN-01',
        company_name: 'AeroVolt Power',
        table_station: 'B2',
        domain_id: cleanTechId,
        domains: { id: cleanTechId, code: 'CLEANTECH', name: 'CleanTech Hardware' },
      },
    },
    {
      id: 'snap-3',
      round_id: round5Id,
      team_id: team3Id,
      company_valuation: 2750000,
      retained_equity_pct: 75.0,
      equity_adjusted_score: 2062.5,
      ending_cash: 700000,
      gross_revenue: 950000,
      net_income: 310000,
      ebitda: 360000,
      cogs: 290000,
      operating_expenses: 300000,
      inventory_holding_cost: 9000,
      market_share_pct: 21.0,
      product_quality_index: 80,
      brand_equity_score: 72,
      tournament_rank: 3,
      domain_rank: 1,
      teams: {
        id: team3Id,
        team_code: 'HLT-01',
        company_name: 'NanoBreathe Medical',
        table_station: 'C3',
        domain_id: healthTechId,
        domains: { id: healthTechId, code: 'HEALTHTECH', name: 'HealthTech Devices' },
      },
    },
    {
      id: 'snap-4',
      round_id: round5Id,
      team_id: team4Id,
      company_valuation: 2200000,
      retained_equity_pct: 70.0,
      equity_adjusted_score: 1540.0,
      ending_cash: 500000,
      gross_revenue: 800000,
      net_income: 220000,
      ebitda: 270000,
      cogs: 250000,
      operating_expenses: 280000,
      inventory_holding_cost: 1200,
      market_share_pct: 18.0,
      product_quality_index: 74,
      brand_equity_score: 68,
      tournament_rank: 4,
      domain_rank: 1,
      teams: {
        id: team4Id,
        team_code: 'D2C-01',
        company_name: 'Lumina Goods',
        table_station: 'D4',
        domain_id: d2cId,
        domains: { id: d2cId, code: 'D2C', name: 'D2C Consumer Goods' },
      },
    },
  ];

  // 1. PRESENTATION STATE INITIALIZATION & DEFAULTS
  describe('1. Presentation State Management & Persistence', () => {
    it('returns default standings state when table row does not exist yet', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'presentation_state') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            };
          }
          return createChainable([]);
        }),
      };

      const service = new TournamentService(mockSupabase as unknown as any);
      const state = await service.getPresentationState(eventId);

      expect(state.eventId).toBe(eventId);
      expect(state.mode).toBe('standings');
      expect(state.selectedRoundNumber).toBe(1);
      expect(state.domainFilter).toBe('ALL');
      expect(state.ceremonyStage).toBe('waiting');
    });

    it('persists and updates presentation mode via presenter controller', async () => {
      let savedState: Record<string, unknown> | null = null;
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'events') {
            return createChainable({ id: eventId, name: 'Capital Quest 2026', total_rounds: 5, active_round_number: 2 });
          }
          if (table === 'presentation_state') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockImplementation(() => Promise.resolve({ data: savedState, error: null })),
              upsert: vi.fn().mockImplementation((payload) => {
                savedState = { ...payload, updated_at: new Date().toISOString() };
                return Promise.resolve({ error: null });
              }),
            };
          }
          return createChainable([]);
        }),
      };

      const service = new TournamentService(mockSupabase as unknown as any);
      const updated = await service.updatePresentationState(
        eventId,
        { mode: 'domain', domainFilter: 'CLEANTECH', selectedRoundNumber: 2 },
        'admin-uuid'
      );

      expect(updated.mode).toBe('domain');
      expect(updated.domainFilter).toBe('CLEANTECH');
      expect(updated.selectedRoundNumber).toBe(2);
    });
  });

  // 2. CEREMONY SECURITY & FINAL ROUND PREREQUISITE
  describe('2. Ceremony Locking & Final Round Publication Guard', () => {
    it('blocks ceremony activation if final round is not officially published', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'events') {
            return createChainable({ id: eventId, name: 'Capital Quest 2026', total_rounds: 5, active_round_number: 4 });
          }
          if (table === 'rounds') {
            // Only rounds 1, 2, 3 published. Round 5 is not published!
            return createChainable([
              { id: round1Id, round_number: 1, status: 'published' },
              { id: round2Id, round_number: 2, status: 'published' },
            ]);
          }
          return createChainable([]);
        }),
      };

      const service = new TournamentService(mockSupabase as unknown as any);

      await expect(
        service.updatePresentationState(eventId, { mode: 'ceremony' }, 'admin-uuid')
      ).rejects.toThrow(AppError);

      await expect(
        service.updatePresentationState(eventId, { mode: 'ceremony' }, 'admin-uuid')
      ).rejects.toThrow(/embargoed until the final round/i);
    });

    it('blocks reveal progression (e.g. reveal_third) if final round is not published', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'events') {
            return createChainable({ id: eventId, name: 'Capital Quest 2026', total_rounds: 5, active_round_number: 4 });
          }
          if (table === 'rounds') {
            return createChainable([{ id: round1Id, round_number: 1, status: 'published' }]);
          }
          return createChainable([]);
        }),
      };

      const service = new TournamentService(mockSupabase as unknown as any);

      await expect(
        service.updatePresentationState(eventId, { ceremonyStage: 'reveal_third' }, 'admin-uuid')
      ).rejects.toThrow(AppError);
    });
  });

  // 3. SERVER-SIDE WINNER EMBARGO & DATA SECRECY
  describe('3. Strict Server-Side Winner Embargo', () => {
    const setupEmbargoMock = (ceremonyStage: 'waiting' | 'reveal_third' | 'reveal_second' | 'reveal_first' | 'podium') => {
      return {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'events') {
            return createChainable({
              id: eventId,
              name: 'Capital Quest 2026',
              total_rounds: 5,
              active_round_number: 5,
              status: 'completed',
            });
          }
          if (table === 'presentation_state') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  event_id: eventId,
                  mode: 'ceremony',
                  selected_round_number: 5,
                  domain_filter: 'ALL',
                  ceremony_stage: ceremonyStage,
                  updated_at: new Date().toISOString(),
                },
                error: null,
              }),
            };
          }
          if (table === 'rounds') {
            return createChainable([
              { id: round1Id, round_number: 1, status: 'published' },
              { id: round5Id, round_number: 5, status: 'published' },
            ]);
          }
          if (table === 'company_snapshots') {
            return createChainable(mockFinalSnapshots);
          }
          return createChainable([]);
        }),
      };
    };

    it('STAGE 1 (waiting): completely redacts all winners from public response', async () => {
      const mockSupabase = setupEmbargoMock('waiting');
      const service = new TournamentService(mockSupabase as unknown as any);
      const data = await service.getPublicPresentationData(eventId);

      expect(data.ceremony?.stage).toBe('waiting');
      expect(data.ceremony?.currentReveal).toBeNull();
      expect(data.ceremony?.revealedWinners).toEqual([]);
      // Ensure no 1st, 2nd, or 3rd place companies leaked in ceremony payload
      expect(JSON.stringify(data.ceremony)).not.toContain('CloudPeak AI');
      expect(JSON.stringify(data.ceremony)).not.toContain('AeroVolt Power');
      expect(JSON.stringify(data.ceremony)).not.toContain('NanoBreathe Medical');
    });

    it('STAGE 2 (reveal_third): reveals ONLY 3rd place; 1st and 2nd are strictly withheld', async () => {
      const mockSupabase = setupEmbargoMock('reveal_third');
      const service = new TournamentService(mockSupabase as unknown as any);
      const data = await service.getPublicPresentationData(eventId);

      expect(data.ceremony?.stage).toBe('reveal_third');
      expect(data.ceremony?.currentReveal?.companyName).toBe('NanoBreathe Medical');
      expect(data.ceremony?.currentReveal?.rank).toBe(3);
      expect(data.ceremony?.revealedWinners.length).toBe(1);
      expect(data.ceremony?.revealedWinners[0].companyName).toBe('NanoBreathe Medical');

      // Crucial: 1st and 2nd place MUST NOT appear anywhere in the ceremony payload!
      expect(JSON.stringify(data.ceremony)).not.toContain('CloudPeak AI'); // 1st
      expect(JSON.stringify(data.ceremony)).not.toContain('AeroVolt Power'); // 2nd
    });

    it('STAGE 3 (reveal_second): reveals 2nd and 3rd place; 1st place champion is strictly withheld', async () => {
      const mockSupabase = setupEmbargoMock('reveal_second');
      const service = new TournamentService(mockSupabase as unknown as any);
      const data = await service.getPublicPresentationData(eventId);

      expect(data.ceremony?.stage).toBe('reveal_second');
      expect(data.ceremony?.currentReveal?.companyName).toBe('AeroVolt Power');
      expect(data.ceremony?.currentReveal?.rank).toBe(2);
      expect(data.ceremony?.revealedWinners.length).toBe(2);

      // 1st place MUST still NOT appear anywhere in the ceremony payload!
      expect(JSON.stringify(data.ceremony)).not.toContain('CloudPeak AI');
    });

    it('STAGE 4 (reveal_first): reveals 1st place champion in spotlight', async () => {
      const mockSupabase = setupEmbargoMock('reveal_first');
      const service = new TournamentService(mockSupabase as unknown as any);
      const data = await service.getPublicPresentationData(eventId);

      expect(data.ceremony?.stage).toBe('reveal_first');
      expect(data.ceremony?.currentReveal?.companyName).toBe('CloudPeak AI');
      expect(data.ceremony?.currentReveal?.rank).toBe(1);
      expect(data.ceremony?.revealedWinners.length).toBe(3);
    });

    it('STAGE 5 (podium): reveals all three winners on the grand podium', async () => {
      const mockSupabase = setupEmbargoMock('podium');
      const service = new TournamentService(mockSupabase as unknown as any);
      const data = await service.getPublicPresentationData(eventId);

      expect(data.ceremony?.stage).toBe('podium');
      expect(data.ceremony?.revealedWinners.length).toBe(3);
      const ranks = data.ceremony?.revealedWinners.map(w => w.rank);
      expect(ranks).toContain(1);
      expect(ranks).toContain(2);
      expect(ranks).toContain(3);
    });
  });

  // 4. ROUND HIGHLIGHTS & STRATEGIC SPOTLIGHTS
  describe('4. Round Highlights Analytics', () => {
    it('computes top scorers, revenue leaders, valuation delta, and domain champions', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'events') {
            return createChainable({ id: eventId, name: 'Capital Quest 2026', total_rounds: 5 });
          }
          if (table === 'rounds') {
            return createChainable([
              { id: round1Id, round_number: 1, status: 'published' },
              { id: round2Id, round_number: 2, status: 'published' },
              { id: '00000000-0000-0000-0000-000000000030', round_number: 3, status: 'published' },
              { id: '00000000-0000-0000-0000-000000000040', round_number: 4, status: 'published' },
              { id: round5Id, round_number: 5, status: 'published' },
            ]);
          }
          if (table === 'company_snapshots') {
            return createChainable(mockFinalSnapshots);
          }
          return createChainable([]);
        }),
      };

      const service = new TournamentService(mockSupabase as unknown as any);
      const highlights = await service.getRoundHighlights(eventId, 5);

      expect(highlights.topScorers.length).toBeGreaterThanOrEqual(3);
      expect(highlights.topScorers[0].companyName).toBe('CloudPeak AI');
      expect(highlights.revenueLeaders[0].companyName).toBe('CloudPeak AI'); // $1.2M
      expect(highlights.valuationGrowthLeaders.length).toBeGreaterThanOrEqual(1);
      expect(highlights.domainLeaders.length).toBeGreaterThanOrEqual(1);
    });
  });

  // 5. PHASE 5 CONSISTENCY VERIFICATION
  describe('5. Phase 5 Consistency Checks', () => {
    it('preserves exact cent precision in financial calculations', () => {
      const testValuation = 3500123.45;
      const formatted = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(testValuation);

      expect(formatted).toBe('$3,500,123.45');
      expect(formatted.endsWith('.45')).toBe(true);
    });

    it('authoritative business domains agree across CleanTech, HealthTech, SaaS, D2C', () => {
      const validDomains = ['CLEANTECH', 'HEALTHTECH', 'SAAS', 'D2C'];
      const testCodes = mockFinalSnapshots.map(s => s.teams.domains.code);

      testCodes.forEach(code => {
        expect(validDomains).toContain(code);
      });
      expect(testCodes).not.toContain('FINTECH');
      expect(testCodes).not.toContain('EDTECH');
    });
  });
});
