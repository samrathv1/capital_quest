import { describe, it, expect, vi } from 'vitest';
import {
  computeRankings,
  computeSingleDomainRankings,
  computeDomainRankings,
  getDomainChampions,
  compareCompanyResults,
  FinalScoreInput,
} from '@/engine/scoring/final-score';
import { TournamentService } from '@/lib/services/tournament-service';
import { AppError } from '@/lib/errors/app-error';

function createChainable(resolvedValue: any) {
  const chain: any = {
    select: vi.fn().mockImplementation(() => chain),
    insert: vi.fn().mockImplementation(() => Promise.resolve({ error: null })),
    update: vi.fn().mockImplementation(() => chain),
    eq: vi.fn().mockImplementation(() => chain),
    ilike: vi.fn().mockImplementation(() => chain),
    order: vi.fn().mockImplementation(() => chain),
    limit: vi.fn().mockImplementation(() => chain),
    single: vi.fn().mockImplementation(() => Promise.resolve({ data: resolvedValue, error: null })),
    maybeSingle: vi.fn().mockImplementation(() => Promise.resolve({ data: resolvedValue, error: null })),
    then: (resolve: any) => Promise.resolve({ data: resolvedValue, error: null }).then(resolve),
  };
  return chain;
}

describe('Requirement 1: Independent Domain Rankings & Round-Specific Leaderboards', () => {
  const eventId = '00000000-0000-0000-0000-000000000001';
  const round1Id = '00000000-0000-0000-0000-000000000010';
  const round2Id = '00000000-0000-0000-0000-000000000020';
  const round3Id = '00000000-0000-0000-0000-000000000030';
  const round4Id = '00000000-0000-0000-0000-000000000040';
  const round5Id = '00000000-0000-0000-0000-000000000050';

  const d2cDomainId = 'domain-d2c-id';
  const healthDomainId = 'domain-health-id';
  const saasDomainId = 'domain-saas-id';

  // ---------------------------------------------------------------------------
  // 1. ENGINE SCORING: INDEPENDENT DOMAIN RANKINGS & 5-LEVEL TIE-BREAKERS
  // ---------------------------------------------------------------------------
  describe('1. Engine Scoring: Independent Domain Rankings & Deterministic Tie-Breakers', () => {
    it('ranks teams strictly against intra-domain peers and does not cross-rank', () => {
      const companies: FinalScoreInput[] = [
        { teamId: 'd2c-1', domainId: 'D2C', finalScore: 1200, valuation: 2000000, founderEquityPercent: 80, grossRevenue: 500000, endingCash: 300000 },
        { teamId: 'd2c-2', domainId: 'D2C', finalScore: 1500, valuation: 2500000, founderEquityPercent: 75, grossRevenue: 600000, endingCash: 400000 },
        { teamId: 'health-1', domainId: 'HEALTH', finalScore: 3000, valuation: 4000000, founderEquityPercent: 70, grossRevenue: 900000, endingCash: 500000 },
        { teamId: 'saas-1', domainId: 'SAAS', finalScore: 800, valuation: 1500000, founderEquityPercent: 85, grossRevenue: 400000, endingCash: 200000 },
      ];

      const domainRankings = computeDomainRankings(companies);

      expect(domainRankings.has('D2C')).toBe(true);
      expect(domainRankings.has('HEALTH')).toBe(true);
      expect(domainRankings.has('SAAS')).toBe(true);

      // In D2C: d2c-2 is #1, d2c-1 is #2
      const d2cGroup = domainRankings.get('D2C')!;
      expect(d2cGroup[0].teamId).toBe('d2c-2');
      expect(d2cGroup[0].rank).toBe(1);
      expect(d2cGroup[1].teamId).toBe('d2c-1');
      expect(d2cGroup[1].rank).toBe(2);

      // In SAAS: saas-1 is #1 even though its score (800) is lower than D2C and Health
      const saasGroup = domainRankings.get('SAAS')!;
      expect(saasGroup[0].teamId).toBe('saas-1');
      expect(saasGroup[0].rank).toBe(1);

      // In Health: health-1 is #1
      const healthGroup = domainRankings.get('HEALTH')!;
      expect(healthGroup[0].teamId).toBe('health-1');
      expect(healthGroup[0].rank).toBe(1);
    });

    it('correctly executes all 5 levels of the tie-breaker', () => {
      // Level 1: Final Score
      const pair1: [FinalScoreInput, FinalScoreInput] = [
        { teamId: 'a', finalScore: 1600, valuation: 2000000, founderEquityPercent: 80, grossRevenue: 500000, endingCash: 300000 },
        { teamId: 'b', finalScore: 1500, valuation: 3000000, founderEquityPercent: 80, grossRevenue: 500000, endingCash: 300000 },
      ];
      expect(compareCompanyResults(pair1[0], pair1[1])).toBeLessThan(0); // 'a' wins

      // Level 2: Valuation
      const pair2: [FinalScoreInput, FinalScoreInput] = [
        { teamId: 'a', finalScore: 1500, valuation: 3000000, founderEquityPercent: 80, grossRevenue: 500000, endingCash: 300000 },
        { teamId: 'b', finalScore: 1500, valuation: 2500000, founderEquityPercent: 80, grossRevenue: 700000, endingCash: 400000 },
      ];
      expect(compareCompanyResults(pair2[0], pair2[1])).toBeLessThan(0); // 'a' wins by valuation

      // Level 3: Gross Revenue
      const pair3: [FinalScoreInput, FinalScoreInput] = [
        { teamId: 'a', finalScore: 1500, valuation: 2500000, founderEquityPercent: 80, grossRevenue: 800000, endingCash: 200000 },
        { teamId: 'b', finalScore: 1500, valuation: 2500000, founderEquityPercent: 80, grossRevenue: 700000, endingCash: 500000 },
      ];
      expect(compareCompanyResults(pair3[0], pair3[1])).toBeLessThan(0); // 'a' wins by revenue

      // Level 4: Ending Cash
      const pair4: [FinalScoreInput, FinalScoreInput] = [
        { teamId: 'a', finalScore: 1500, valuation: 2500000, founderEquityPercent: 80, grossRevenue: 700000, endingCash: 450000 },
        { teamId: 'b', finalScore: 1500, valuation: 2500000, founderEquityPercent: 80, grossRevenue: 700000, endingCash: 300000 },
      ];
      expect(compareCompanyResults(pair4[0], pair4[1])).toBeLessThan(0); // 'a' wins by cash

      // Level 5: Team ID lexicographical ascending
      const pair5: [FinalScoreInput, FinalScoreInput] = [
        { teamId: 'team-alpha', finalScore: 1500, valuation: 2500000, founderEquityPercent: 80, grossRevenue: 700000, endingCash: 300000 },
        { teamId: 'team-beta', finalScore: 1500, valuation: 2500000, founderEquityPercent: 80, grossRevenue: 700000, endingCash: 300000 },
      ];
      expect(compareCompanyResults(pair5[0], pair5[1])).toBeLessThan(0); // 'team-alpha' wins
    });

    it('getDomainChampions selects independent champions for each domain without cross-comparison', () => {
      const companies: FinalScoreInput[] = [
        // D2C
        { teamId: 'd2c-1', domainId: 'D2C', finalScore: 1800, valuation: 2200000, founderEquityPercent: 78, grossRevenue: 600000, endingCash: 400000 },
        { teamId: 'd2c-2', domainId: 'D2C', finalScore: 1400, valuation: 1900000, founderEquityPercent: 75, grossRevenue: 500000, endingCash: 300000 },
        // HEALTH
        { teamId: 'health-1', domainId: 'HEALTH', finalScore: 2800, valuation: 3500000, founderEquityPercent: 80, grossRevenue: 950000, endingCash: 600000 },
        { teamId: 'health-2', domainId: 'HEALTH', finalScore: 3100, valuation: 3800000, founderEquityPercent: 82, grossRevenue: 1000000, endingCash: 700000 },
        // SAAS
        { teamId: 'saas-1', domainId: 'SAAS', finalScore: 950, valuation: 1600000, founderEquityPercent: 85, grossRevenue: 420000, endingCash: 250000 },
        { teamId: 'saas-2', domainId: 'SAAS', finalScore: 1100, valuation: 1750000, founderEquityPercent: 84, grossRevenue: 460000, endingCash: 280000 },
      ];

      const champions = getDomainChampions(companies);

      expect(champions.size).toBe(3);
      expect(champions.get('D2C')?.teamId).toBe('d2c-1');
      expect(champions.get('HEALTH')?.teamId).toBe('health-2');
      expect(champions.get('SAAS')?.teamId).toBe('saas-2');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. ROUNDS 1–4: PUBLIC LEADERBOARD ORGANIZATION & REPLACEMENT
  // ---------------------------------------------------------------------------
  describe('2. Rounds 1–4: Latest Published Round Display & Replacement Progression', () => {
    const buildMockSnapshots = (roundId: string) => [
      // D2C
      {
        id: `snap-${roundId}-d2c-1`,
        round_id: roundId,
        team_id: 'team-d2c-1',
        company_valuation: 2200000,
        retained_equity_pct: 80,
        equity_adjusted_score: 1760,
        ending_cash: 500000,
        gross_revenue: 800000,
        domain_rank: 1,
        tournament_rank: 2,
        teams: {
          id: 'team-d2c-1',
          team_code: 'D2C-01',
          company_name: 'D2C Frontier',
          table_station: 'A1',
          domain_id: d2cDomainId,
          domains: { id: d2cDomainId, code: 'D2C', name: 'Direct-to-Consumer (D2C)' },
        },
      },
      {
        id: `snap-${roundId}-d2c-2`,
        round_id: roundId,
        team_id: 'team-d2c-2',
        company_valuation: 2000000,
        retained_equity_pct: 75,
        equity_adjusted_score: 1500,
        ending_cash: 400000,
        gross_revenue: 700000,
        domain_rank: 2,
        tournament_rank: 3,
        teams: {
          id: 'team-d2c-2',
          team_code: 'D2C-02',
          company_name: 'Urban Pure D2C',
          table_station: 'A2',
          domain_id: d2cDomainId,
          domains: { id: d2cDomainId, code: 'D2C', name: 'Direct-to-Consumer (D2C)' },
        },
      },
      // HEALTH
      {
        id: `snap-${roundId}-hlt-1`,
        round_id: roundId,
        team_id: 'team-hlt-1',
        company_valuation: 3200000,
        retained_equity_pct: 85,
        equity_adjusted_score: 2720,
        ending_cash: 600000,
        gross_revenue: 1100000,
        domain_rank: 1,
        tournament_rank: 1,
        teams: {
          id: 'team-hlt-1',
          team_code: 'HLT-01',
          company_name: 'NanoBio Med',
          table_station: 'B1',
          domain_id: healthDomainId,
          domains: { id: healthDomainId, code: 'HEALTH', name: 'HealthTech & Bio' },
        },
      },
      // SAAS
      {
        id: `snap-${roundId}-sas-1`,
        round_id: roundId,
        team_id: 'team-sas-1',
        company_valuation: 1600000,
        retained_equity_pct: 90,
        equity_adjusted_score: 1440,
        ending_cash: 350000,
        gross_revenue: 550000,
        domain_rank: 1,
        tournament_rank: 4,
        teams: {
          id: 'team-sas-1',
          team_code: 'SAS-01',
          company_name: 'CloudCore AI',
          table_station: 'C1',
          domain_id: saasDomainId,
          domains: { id: saasDomainId, code: 'SAAS', name: 'Enterprise SaaS & AI' },
        },
      },
    ];

    it('displays results organized in 3 domain sections with intra-domain ranks', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'events') {
            return createChainable({ id: eventId, name: 'Capital Quest 2026', total_rounds: 5, active_round_number: 2 });
          }
          if (table === 'rounds') {
            return createChainable([{ id: round1Id, round_number: 1, status: 'published' }]);
          }
          if (table === 'company_snapshots') {
            return createChainable(buildMockSnapshots(round1Id));
          }
          return createChainable([]);
        }),
      };

      const service = new TournamentService(mockSupabase as unknown as any);
      const res = await service.getPublicLeaderboard({});

      expect(res.roundNumber).toBe(1);
      expect(res.domains).toBeDefined();
      expect(res.domains?.length).toBe(3);

      const d2cSection = res.domains?.find(d => d.domainCode === 'D2C');
      const healthSection = res.domains?.find(d => d.domainCode === 'HEALTH');
      const saasSection = res.domains?.find(d => d.domainCode === 'SAAS');

      expect(d2cSection?.teams.length).toBe(2);
      expect(d2cSection?.teams[0].companyName).toBe('D2C Frontier');
      expect(d2cSection?.teams[0].rank).toBe(1);
      expect(d2cSection?.teams[1].companyName).toBe('Urban Pure D2C');
      expect(d2cSection?.teams[1].rank).toBe(2);

      expect(healthSection?.teams.length).toBe(1);
      expect(healthSection?.teams[0].companyName).toBe('NanoBio Med');
      expect(healthSection?.teams[0].rank).toBe(1);

      expect(saasSection?.teams.length).toBe(1);
      expect(saasSection?.teams[0].companyName).toBe('CloudCore AI');
      expect(saasSection?.teams[0].rank).toBe(1);
    });

    it('publishing Round 2 replaces Round 1 view with Round 2 standings as latest published round', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'events') {
            return createChainable({ id: eventId, name: 'Capital Quest 2026', total_rounds: 5, active_round_number: 3 });
          }
          if (table === 'rounds') {
            return createChainable([
              { id: round1Id, round_number: 1, status: 'published' },
              { id: round2Id, round_number: 2, status: 'published' },
            ]);
          }
          if (table === 'company_snapshots') {
            return createChainable(buildMockSnapshots(round2Id));
          }
          return createChainable([]);
        }),
      };

      const service = new TournamentService(mockSupabase as unknown as any);
      const res = await service.getPublicLeaderboard({});

      // Should automatically default to latest published round (Round 2)
      expect(res.roundNumber).toBe(2);
      expect(res.publishedRounds.map(r => r.roundNumber)).toEqual([1, 2]);
    });

    it('transitions smoothly through Rounds 3 and 4 without overwriting historical records', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'events') {
            return createChainable({ id: eventId, name: 'Capital Quest 2026', total_rounds: 5, active_round_number: 5 });
          }
          if (table === 'rounds') {
            return createChainable([
              { id: round1Id, round_number: 1, status: 'published' },
              { id: round2Id, round_number: 2, status: 'published' },
              { id: round3Id, round_number: 3, status: 'published' },
              { id: round4Id, round_number: 4, status: 'published' },
            ]);
          }
          if (table === 'company_snapshots') {
            return createChainable(buildMockSnapshots(round4Id));
          }
          return createChainable([]);
        }),
      };

      const service = new TournamentService(mockSupabase as unknown as any);
      const res = await service.getPublicLeaderboard({});

      expect(res.roundNumber).toBe(4);
      expect(res.publishedRounds.length).toBe(4);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. ROUND 5: THREE DOMAIN CHAMPIONS & EMBARGO INTEGRITY
  // ---------------------------------------------------------------------------
  describe('3. Round 5: Three Independent Domain Champions & Embargo Protocol', () => {
    const mockFinalSnapshots = [
      // D2C
      {
        id: 'snap-r5-d2c-1',
        round_id: round5Id,
        team_id: 'team-d2c-1',
        company_valuation: 3500000,
        retained_equity_pct: 78,
        equity_adjusted_score: 2730,
        ending_cash: 800000,
        gross_revenue: 1200000,
        domain_rank: 1,
        tournament_rank: 2,
        teams: {
          id: 'team-d2c-1',
          team_code: 'D2C-01',
          company_name: 'D2C Grand Victor',
          table_station: 'A1',
          domain_id: d2cDomainId,
          domains: { id: d2cDomainId, code: 'D2C', name: 'Direct-to-Consumer (D2C)' },
        },
      },
      {
        id: 'snap-r5-d2c-2',
        round_id: round5Id,
        team_id: 'team-d2c-2',
        company_valuation: 2800000,
        retained_equity_pct: 72,
        equity_adjusted_score: 2016,
        ending_cash: 600000,
        gross_revenue: 950000,
        domain_rank: 2,
        tournament_rank: 4,
        teams: {
          id: 'team-d2c-2',
          team_code: 'D2C-02',
          company_name: 'D2C Runner-Up',
          table_station: 'A2',
          domain_id: d2cDomainId,
          domains: { id: d2cDomainId, code: 'D2C', name: 'Direct-to-Consumer (D2C)' },
        },
      },
      // HEALTH
      {
        id: 'snap-r5-hlt-1',
        round_id: round5Id,
        team_id: 'team-hlt-1',
        company_valuation: 4200000,
        retained_equity_pct: 82,
        equity_adjusted_score: 3444,
        ending_cash: 1100000,
        gross_revenue: 1600000,
        domain_rank: 1,
        tournament_rank: 1,
        teams: {
          id: 'team-hlt-1',
          team_code: 'HLT-01',
          company_name: 'BioGene Health Champion',
          table_station: 'B1',
          domain_id: healthDomainId,
          domains: { id: healthDomainId, code: 'HEALTH', name: 'HealthTech & Bio' },
        },
      },
      // SAAS
      {
        id: 'snap-r5-sas-1',
        round_id: round5Id,
        team_id: 'team-sas-1',
        company_valuation: 2600000,
        retained_equity_pct: 88,
        equity_adjusted_score: 2288,
        ending_cash: 700000,
        gross_revenue: 850000,
        domain_rank: 1,
        tournament_rank: 3,
        teams: {
          id: 'team-sas-1',
          team_code: 'SAS-01',
          company_name: 'Apex AI SaaS Champion',
          table_station: 'C1',
          domain_id: saasDomainId,
          domains: { id: saasDomainId, code: 'SAAS', name: 'Enterprise SaaS & AI' },
        },
      },
    ];

    it('strictly enforces winner embargo when ceremony stage is not podium', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'events') {
            return createChainable({ id: eventId, name: 'Capital Quest 2026', total_rounds: 5, active_round_number: 5, status: 'completed' });
          }
          if (table === 'presentation_state') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { ceremony_stage: 'waiting' },
                error: null,
              }),
            };
          }
          if (table === 'rounds') {
            return createChainable([
              { id: round1Id, round_number: 1, status: 'published' },
              { id: round2Id, round_number: 2, status: 'published' },
              { id: round3Id, round_number: 3, status: 'published' },
              { id: round4Id, round_number: 4, status: 'published' },
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

      // Public call with no round specified: should fall back to round 4 under embargo
      const publicLb = await service.getPublicLeaderboard({});
      expect(publicLb.isFinalRoundEmbargoed).toBe(true);

      // Public call explicitly requesting round 5 while embargoed must throw 403
      await expect(
        service.getPublicLeaderboard({ roundNumber: 5 })
      ).rejects.toThrow(AppError);
    });

    it('after authorized reveal (podium), displays exactly three domain champions with no runners-up', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'events') {
            return createChainable({ id: eventId, name: 'Capital Quest 2026', total_rounds: 5, active_round_number: 5, status: 'completed' });
          }
          if (table === 'presentation_state') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { ceremony_stage: 'podium' },
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

      const service = new TournamentService(mockSupabase as unknown as any);
      const res = await service.getPublicLeaderboard({ roundNumber: 5 });

      expect(res.isFinalRoundEmbargoed).toBe(false);
      expect(res.roundNumber).toBe(5);

      // CRITICAL: Public leaderboard must contain ONLY the 3 domain champions!
      // No runners-up allowed in public champions view.
      expect(res.leaderboard.length).toBe(3);

      const champNames = res.leaderboard.map(c => c.companyName);
      expect(champNames).toContain('D2C Grand Victor');
      expect(champNames).toContain('BioGene Health Champion');
      expect(champNames).toContain('Apex AI SaaS Champion');
      expect(champNames).not.toContain('D2C Runner-Up');

      // Every champion must have domainRank: 1
      for (const champ of res.leaderboard) {
        expect(champ.domainRank).toBe(1);
        expect(champ.rank).toBe(1);
      }
    });

    it('handles domains with zero eligible teams by displaying an empty state without fabricating winners', async () => {
      // Mock with NO SaaS teams at all
      const snapshotsWithoutSaaS = mockFinalSnapshots.filter(s => s.teams.domain_id !== saasDomainId);

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'events') {
            return createChainable({ id: eventId, name: 'Capital Quest 2026', total_rounds: 5, active_round_number: 5, status: 'completed' });
          }
          if (table === 'presentation_state') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { ceremony_stage: 'podium' },
                error: null,
              }),
            };
          }
          if (table === 'rounds') {
            return createChainable([{ id: round5Id, round_number: 5, status: 'published' }]);
          }
          if (table === 'company_snapshots') {
            return createChainable(snapshotsWithoutSaaS);
          }
          return createChainable([]);
        }),
      };

      const service = new TournamentService(mockSupabase as unknown as any);
      const res = await service.getPublicLeaderboard({ roundNumber: 5 });

      // Exactly 2 champions returned for the 2 active domains
      expect(res.leaderboard.length).toBe(2);

      const saasSection = res.domains?.find(d => d.domainCode === 'SAAS');
      expect(saasSection).toBeDefined();
      expect(saasSection?.teams.length).toBe(0);
      expect(saasSection?.champion).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 4. PRESENTATION & ADMIN REPORT CONSISTENCY
  // ---------------------------------------------------------------------------
  describe('4. Presentation & Admin Controller Consistency', () => {
    it('provides domainChampions and top candidates to admin presentation controller', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'events') {
            return createChainable({ id: eventId, name: 'Capital Quest 2026', total_rounds: 5, active_round_number: 5 });
          }
          if (table === 'presentation_state') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  event_id: eventId,
                  mode: 'ceremony',
                  ceremony_stage: 'podium',
                  selected_round_number: 5,
                  domain_filter: 'ALL',
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
            return createChainable([
              {
                id: 'snap-1',
                round_id: round5Id,
                team_id: 't-d2c',
                company_valuation: 3000000,
                retained_equity_pct: 80,
                equity_adjusted_score: 2400,
                ending_cash: 500000,
                gross_revenue: 800000,
                domain_rank: 1,
                tournament_rank: 1,
                teams: {
                  id: 't-d2c',
                  team_code: 'D2C-01',
                  company_name: 'D2C Star',
                  table_station: 'A1',
                  domain_id: d2cDomainId,
                  domains: { id: d2cDomainId, code: 'D2C', name: 'Direct-to-Consumer (D2C)' },
                },
              },
            ]);
          }
          return createChainable([]);
        }),
      };

      const service = new TournamentService(mockSupabase as unknown as any);
      const adminData = await service.getAdminPresentationData(eventId);

      expect(adminData.isFinalRoundPublished).toBe(true);
      expect(adminData.domainChampions).toBeDefined();
      expect(adminData.topThreeCandidatePreview).toBeDefined();

      // Ensure properties needed by Admin Presentation Controller are present and safe for .toFixed(2)
      for (const item of adminData.domainChampions) {
        if (item.champion) {
          const score = item.champion.score ?? item.champion.finalScore;
          expect(typeof score).toBe('number');
          expect(() => (score as number).toFixed(2)).not.toThrow();
        }
      }

      for (const winner of adminData.topThreeCandidatePreview) {
        const score = winner.score ?? (winner as any).finalScore;
        expect(typeof score).toBe('number');
        expect(() => (score as number).toFixed(2)).not.toThrow();
      }
    });

    it('ensures public leaderboard rows provide all schema compatibility aliases', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'events') {
            return createChainable({ id: eventId, name: 'Capital Quest 2026', total_rounds: 5, active_round_number: 2 });
          }
          if (table === 'rounds') {
            return createChainable([{ id: round1Id, round_number: 1, status: 'published' }]);
          }
          if (table === 'company_snapshots') {
            return createChainable([
              {
                id: 'snap-1',
                round_id: round1Id,
                team_id: 't-1',
                company_valuation: 2500000,
                retained_equity_pct: 85,
                equity_adjusted_score: 2125,
                ending_cash: 650000,
                gross_revenue: 900000,
                domain_rank: 1,
                tournament_rank: 1,
                teams: {
                  id: 't-1',
                  team_code: 'D2C-01',
                  company_name: 'D2C Enterprise',
                  domain_id: d2cDomainId,
                  domains: { id: d2cDomainId, code: 'D2C', name: 'D2C Consumer Goods' },
                },
              },
            ]);
          }
          return createChainable([]);
        }),
      };

      const service = new TournamentService(mockSupabase as unknown as any);
      const res = await service.getPublicLeaderboard({ roundNumber: 1 });

      const row = res.leaderboard[0];
      expect(row.score).toBe(2125);
      expect(row.finalScore).toBe(2125);
      expect(row.founderEquityPercent).toBe(85);
      expect(row.retainedEquityPct).toBe(85);
      expect(row.cashOnHand).toBe(650000);
      expect(row.revenue).toBe(900000);

      // Verify .toFixed operations don't throw
      expect(() => row.score!.toFixed(2)).not.toThrow();
      expect(() => row.founderEquityPercent!.toFixed(1)).not.toThrow();
    });
  });
});

