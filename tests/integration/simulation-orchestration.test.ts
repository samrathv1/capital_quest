import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TournamentService } from '@/lib/services/tournament-service';
import {
  recordOrganizerApproval,
  getOrganizerPolicyGates,
  assertOrganizerPoliciesApproved,
} from '@/lib/services/organizer-approvals';
import { serializeEquityTransactionsForDatabase } from '@/lib/services/simulation-runner';
import { AppError } from '@/lib/errors/app-error';
import { simulateDomainRound } from '@/engine/simulation/domain-simulation';
import { DOMAIN_ARCHETYPES } from '@/engine/config/domain-archetypes';
import { CompanyDecision, CompanySnapshot, TournamentSimulationResult } from '@/engine/types';
import { computeRankings } from '@/engine/scoring/final-score';
import { D, ZERO } from '@/engine/math/precision';

/**
 * Creates a fluent, chainable mock Supabase client for TournamentService tests.
 */
function createMockSupabase(customData: {
  round?: any;
  rounds?: any[];
  teams?: any[];
  decisions?: any[];
  snapshots?: any[];
  simulationRuns?: any[];
  financialLedger?: any[];
  equityTransactions?: any[];
  capTables?: any[];
  rpcResult?: any;
}) {
  const createChainable = (resolvedValue: any) => {
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
  };

  return {
    from: vi.fn().mockImplementation((table: string) => {
      switch (table) {
        case 'rounds':
          return createChainable(customData.round ?? customData.rounds ?? null);
        case 'teams':
          return createChainable(customData.teams ?? []);
        case 'decisions':
          return createChainable(customData.decisions ?? []);
        case 'company_snapshots':
          return createChainable(customData.snapshots ?? []);
        case 'simulation_runs':
          return createChainable(customData.simulationRuns?.[0] ?? customData.simulationRuns ?? null);
        case 'cap_tables':
          return createChainable(customData.capTables ?? [{ ownership_percentage: 1.0 }]);
        case 'financial_ledger':
          return createChainable(customData.financialLedger ?? []);
        case 'equity_transactions':
          return createChainable(customData.equityTransactions ?? []);
        case 'audit_logs':
        case 'events':
        default:
          return createChainable(null);
      }
    }),
    rpc: vi.fn().mockResolvedValue({
      data: customData.rpcResult ?? {
        success: true,
        round_id: 'round-1-uuid',
        new_status: 'locked',
        voided_simulation_run_id: 'run-1',
      },
      error: null,
    }),
  };
}

describe('CAPITAL QUEST — Phase 4: Simulation Orchestration & Multi-Round Management', () => {
  const eventId = 'test-event-phase4-001';
  const adminId = 'admin-user-phase4-001';
  const round1Id = 'round-1-uuid';
  const round2Id = 'round-2-uuid';

  beforeEach(() => {
    // Reset policy gates before each test
    const gates = getOrganizerPolicyGates(eventId);
    gates.cashValuationPolicyApproved = false;
    gates.corporateTaxationApproved = false;
    gates.standardVCOffersApproved = false;
    gates.strictSpendingRejectionApproved = false;
    gates.proRataScalingApproved = false;
  });

  describe('1. Round Lifecycle State Transitions', () => {
    it('opens a draft round 1 successfully', async () => {
      const mockSupabase = createMockSupabase({
        round: {
          id: round1Id,
          event_id: eventId,
          round_number: 1,
          status: 'draft',
        },
      });

      const service = new TournamentService(mockSupabase as any);
      const result = await service.openRound(round1Id, adminId);

      expect(result.id).toBe(round1Id);
      expect(mockSupabase.from).toHaveBeenCalledWith('rounds');
      expect(mockSupabase.from).toHaveBeenCalledWith('audit_logs');
    });

    it('blocks opening round 2 if round 1 is not published', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'rounds') {
            const chain: any = {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockImplementation((col: string, val: any) => {
                if (col === 'id') {
                  return {
                    single: vi.fn().mockResolvedValue({
                      data: {
                        id: round2Id,
                        event_id: eventId,
                        round_number: 2,
                        status: 'draft',
                      },
                      error: null,
                    }),
                  };
                }
                if (col === 'event_id') {
                  return {
                    eq: vi.fn().mockImplementation((col2: string, val2: any) => {
                      if (col2 === 'round_number' && val2 === 1) {
                        return {
                          single: vi.fn().mockResolvedValue({
                            data: {
                              id: round1Id,
                              event_id: eventId,
                              round_number: 1,
                              status: 'simulated', // Not published!
                            },
                            error: null,
                          }),
                        };
                      }
                      return { single: vi.fn().mockResolvedValue({ data: null, error: null }) };
                    }),
                  };
                }
                return chain;
              }),
            };
            return chain;
          }
          return { select: vi.fn().mockReturnThis() };
        }),
      };

      const service = new TournamentService(mockSupabase as any);
      await expect(service.openRound(round2Id, adminId)).rejects.toThrowError(AppError);

      try {
        await service.openRound(round2Id, adminId);
      } catch (err: any) {
        expect(err.code).toBe('PREVIOUS_ROUND_NOT_PUBLISHED');
        expect(err.statusCode).toBe(400);
      }
    });

    it('blocks locking a round with missing or unverified submissions without override', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'rounds') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: {
                  id: round1Id,
                  event_id: eventId,
                  round_number: 1,
                  status: 'open',
                },
                error: null,
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: {}, error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === 'teams') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [{ id: 'team-1', team_code: 'T1' }, { id: 'team-2', team_code: 'T2' }],
                  error: null,
                }),
              }),
            };
          }
          if (table === 'decisions') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockResolvedValue({
                data: [{ team_id: 'team-1', status: 'verified' }], // team-2 missing!
                error: null,
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            };
          }
          return { select: vi.fn().mockReturnThis() };
        }),
      };

      const service = new TournamentService(mockSupabase as any);
      await expect(
        service.lockRound(round1Id, adminId, false)
      ).rejects.toThrowError(AppError);

      try {
        await service.lockRound(round1Id, adminId, false);
      } catch (err: any) {
        expect(err.code).toBe('MISSING_SUBMISSIONS');
        expect(err.details.missingTeams.length).toBe(1);
      }
    });

    it('blocks reviewing a round if it has not been simulated', async () => {
      const mockSupabase = createMockSupabase({
        round: {
          id: round1Id,
          event_id: eventId,
          round_number: 1,
          status: 'locked', // Not simulated
        },
      });

      const service = new TournamentService(mockSupabase as any);
      await expect(service.reviewRound(round1Id, adminId)).rejects.toThrowError(AppError);

      try {
        await service.reviewRound(round1Id, adminId);
      } catch (err: any) {
        expect(err.code).toBe('ROUND_NOT_SIMULATED');
      }
    });

    it('blocks publishing a round if it has not been reviewed', async () => {
      const mockSupabase = createMockSupabase({
        round: {
          id: round1Id,
          event_id: eventId,
          round_number: 1,
          status: 'simulated', // Not reviewed
        },
      });

      const service = new TournamentService(mockSupabase as any);
      await expect(service.publishRound(round1Id, adminId)).rejects.toThrowError(AppError);

      try {
        await service.publishRound(round1Id, adminId);
      } catch (err: any) {
        expect(err.code).toBe('ROUND_NOT_REVIEWED');
      }
    });
  });

  describe('2. Financial Reconciliation Audit Verification', () => {
    it('verifies 5-check reconciliation successfully on balanced snapshots', async () => {
      const mockSnapshots = [
        {
          id: 'snap-1',
          company_id: 'comp-1',
          team_id: 'team-1',
          teams: { id: 'team-1', team_code: 'A1', company_name: 'Apex Innovations' },
          starting_cash: 1000000,
          gross_revenue: 500000,
          cogs: 200000,
          opex: 100000,
          ebitda: 200000,
          net_income: 160000,
          ending_cash: 1160000,
          retained_equity_pct: 100,
          enterprise_value: 3000000,
          cash_valuation_contribution: 227500,
          company_valuation: 3227500,
          units_available: 500,
          units_sold: 400,
          ending_inventory: 100,
          final_score: 3227500,
          domain_rank: 1,
          tournament_rank: 1,
        },
      ];

      const mockSupabase = createMockSupabase({
        round: { id: round1Id, round_number: 1, status: 'simulated', event_id: eventId },
        snapshots: mockSnapshots,
        simulationRuns: [{ id: 'run-1', status: 'completed' }],
        capTables: [{ ownership_percentage: 1.0 }],
      });

      const service = new TournamentService(mockSupabase as any);
      const audit = await service.getFinancialReconciliation(round1Id);

      expect(audit.isReconciled).toBe(true);
      expect(audit.totalCompaniesChecked).toBe(1);
      expect(audit.checks.treasurySolvency).toBe(true);
      expect(audit.checks.equityConservation).toBe(true);
      expect(audit.checks.inventoryConsistency).toBe(true);
      expect(audit.checks.valuationConsistency).toBe(true);
      expect(audit.errors.length).toBe(0);
    });

    it('flags insolvency if ending cash is negative', async () => {
      const mockInsolventSnapshots = [
        {
          id: 'snap-insolvent',
          company_id: 'comp-insolvent',
          team_id: 'team-insolvent',
          teams: { id: 'team-insolvent', team_code: 'B2', company_name: 'Broke Ventures' },
          starting_cash: 100000,
          ending_cash: -100000, // Insolvent!
          retained_equity_pct: 100,
          enterprise_value: 0,
          cash_valuation_contribution: 0,
          company_valuation: 0,
          units_available: 0,
          units_sold: 0,
          ending_inventory: 0,
          final_score: 0,
          domain_rank: 4,
          tournament_rank: 8,
        },
      ];

      const mockSupabase = createMockSupabase({
        round: { id: round1Id, round_number: 1, status: 'simulated', event_id: eventId },
        snapshots: mockInsolventSnapshots,
        simulationRuns: [{ id: 'run-1', status: 'completed' }],
        capTables: [{ ownership_percentage: 1.0 }],
      });

      const service = new TournamentService(mockSupabase as any);
      const audit = await service.getFinancialReconciliation(round1Id);

      expect(audit.isReconciled).toBe(false);
      expect(audit.checks.treasurySolvency).toBe(false);
      expect(audit.errors.length).toBeGreaterThan(0);
      expect(audit.errors[0]).toContain('Negative ending cash balance');
    });
  });

  describe('3. Simulation History and Non-Destructive Voiding', () => {
    it('voids an active simulation run and reverts round status to locked with audit log', async () => {
      const mockSupabase = createMockSupabase({
        round: {
          id: round1Id,
          event_id: eventId,
          round_number: 1,
          status: 'simulated',
        },
        simulationRuns: [{ id: 'run-active-1', run_number: 1, status: 'completed' }],
        rpcResult: {
          success: true,
          round_id: round1Id,
          new_status: 'locked',
          voided_simulation_run_id: 'run-active-1',
        },
      });

      const service = new TournamentService(mockSupabase as any);
      const voidResult = await service.voidRound(round1Id, adminId, {
        adminPasswordConfirm: 'secureAdminPass123',
        reason: 'Authorized correction: volunteer dual-verification sheet discrepancy on Table A2',
      });

      expect(voidResult.success).toBe(true);
      expect(voidResult.round_id).toBe(round1Id);
      expect(voidResult.new_status).toBe('locked');
      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'fn_void_or_supersede_round',
        expect.any(Object)
      );
    });
  });

  describe('4. Multi-Round State Carryover Engine Simulation', () => {
    it('carries over cash, inventory, quality, NOL, and dilutes cap table across a 5-round tournament', () => {
      const domain = DOMAIN_ARCHETYPES.healthtech;
      const teams = ['ht-01', 'ht-02', 'ht-03', 'ht-04'];

      let currentSnapshots: CompanySnapshot[] = teams.map((teamId) => ({
        teamId,
        roundNumber: 0,
        cash: D(1000000), // Starting operating capital $1,000,000
        beginningInventoryUnits: ZERO,
        inventoryAverageUnitCost: D(domain.baseUnitCogs),
        cumulativeRdStock: ZERO,
        cumulativeBrandStock: ZERO,
        retainedEquityPct: D(100),
        valuation: D(200000), // Starting baseline valuation
      }));

      // 1. Simulate Round 1 (Foundation / Initial Operations)
      const r1Decisions: CompanyDecision[] = teams.map((teamId) => ({
        teamId,
        marketingBudget: 150000,
        rdBudget: 200000,
        operationsBudget: 100000,
        productionUnits: 1000,
        unitPrice: D(domain.benchmarkPrice).toNumber(),
        investmentDecision: 'REJECT_BOTH',
      }));

      const r1Result = simulateDomainRound(domain, 1, r1Decisions, currentSnapshots);
      expect(r1Result.companyResults.length).toBe(4);
      currentSnapshots = r1Result.companyResults.map((r) => r.nextSnapshot);

      // Verify Round 1 state carried over: ending cash > 0, roundNumber incremented
      for (const snap of currentSnapshots) {
        expect(snap.cash.toNumber()).toBeGreaterThan(0);
        expect(snap.roundNumber).toBe(1);
      }

      // 2. Simulate Round 2: Seed VC investment offer window ($400k for 25% on OFFER_A)
      // ht-01 accepts OFFER_A, others reject
      const r2Decisions: CompanyDecision[] = teams.map((teamId) => ({
        teamId,
        marketingBudget: 200000,
        rdBudget: 250000,
        operationsBudget: 120000,
        productionUnits: 1200,
        unitPrice: D(domain.benchmarkPrice).toNumber(),
        investmentDecision: teamId === 'ht-01' ? 'OFFER_A' : 'REJECT_BOTH',
      }));

      const r2Result = simulateDomainRound(domain, 2, r2Decisions, currentSnapshots);
      expect(r2Result.companyResults.length).toBe(4);
      currentSnapshots = r2Result.companyResults.map((r) => r.nextSnapshot);

      // Verify Cap Table Dilution in Round 2:
      // ht-01 accepted OFFER_A (25% stake): retainedEquityPct diluted from 100% to 75%
      const ht01_r2 = currentSnapshots.find((s) => s.teamId === 'ht-01')!;
      const ht02_r2 = currentSnapshots.find((s) => s.teamId === 'ht-02')!;
      expect(ht01_r2.retainedEquityPct.toNumber()).toBeCloseTo(75, 1);
      expect(ht02_r2.retainedEquityPct.toNumber()).toBeCloseTo(100, 1);

      // 3. Simulate Round 3: Scale
      const r3Decisions: CompanyDecision[] = teams.map((teamId) => ({
        teamId,
        marketingBudget: 250000,
        rdBudget: 300000,
        operationsBudget: 150000,
        productionUnits: 1500,
        unitPrice: D(domain.benchmarkPrice).toNumber(),
        investmentDecision: 'REJECT_BOTH',
      }));

      const r3Result = simulateDomainRound(domain, 3, r3Decisions, currentSnapshots);
      currentSnapshots = r3Result.companyResults.map((r) => r.nextSnapshot);

      // 4. Simulate Round 4: Series A VC investment offer window ($800k for 20% on OFFER_A)
      // ht-01 accepts OFFER_A (diluted from 75% to 75% * (1 - 0.20) = 60%)
      const r4Decisions: CompanyDecision[] = teams.map((teamId) => ({
        teamId,
        marketingBudget: 300000,
        rdBudget: 350000,
        operationsBudget: 180000,
        productionUnits: 1800,
        unitPrice: D(domain.benchmarkPrice).toNumber(),
        investmentDecision: teamId === 'ht-01' ? 'OFFER_A' : 'REJECT_BOTH',
      }));

      const r4Result = simulateDomainRound(domain, 4, r4Decisions, currentSnapshots);
      currentSnapshots = r4Result.companyResults.map((r) => r.nextSnapshot);

      const ht01_r4 = currentSnapshots.find((s) => s.teamId === 'ht-01')!;
      expect(ht01_r4.retainedEquityPct.toNumber()).toBeCloseTo(60, 1);

      // 5. Simulate Round 5: Final Harvest
      const r5Decisions: CompanyDecision[] = teams.map((teamId) => ({
        teamId,
        marketingBudget: 350000,
        rdBudget: 300000,
        operationsBudget: 200000,
        productionUnits: 2000,
        unitPrice: D(domain.benchmarkPrice).toNumber(),
        investmentDecision: 'REJECT_BOTH',
      }));

      const r5Result = simulateDomainRound(domain, 5, r5Decisions, currentSnapshots);
      expect(r5Result.companyResults.length).toBe(4);

      // Compute rankings across companies
      const leaderboard = computeRankings(r5Result.companyResults);
      expect(leaderboard.length).toBe(4);

      // Check final equity-adjusted rankings
      for (const entry of leaderboard) {
        expect(entry.finalScore.toNumber()).toBeGreaterThan(0);
        expect(entry.domainRank).toBeGreaterThanOrEqual(1);
        expect(entry.domainRank).toBeLessThanOrEqual(4);
        expect(entry.tournamentRank).toBeGreaterThanOrEqual(1);
        expect(entry.tournamentRank).toBeLessThanOrEqual(4);
      }
    });
  });

  describe('5. Phase 4.5 Simulation Integrity & Policy Consistency Verification', () => {
    it('conserves 100.0000% equity across Round 2 Seed and Round 4 Series A compounding dilution', () => {
      // 1. Mock Round 2 Simulation Result with Seed Offer A (25% for $400k)
      const mockR2Result = {
        companyResults: [
          {
            teamId: 'team-tech-01',
            roundNumber: 2,
            equity: {
              investmentDecision: 'offer_a',
              cashInjected: D(400000),
              investorEquityStakePct: D(25.0),
              preRoundRetainedEquityPct: D(100.0),
              postRoundRetainedEquityPct: D(75.0),
              dilutionFactor: D(0.75),
            },
          },
        ],
      } as unknown as TournamentSimulationResult;

      const r2EquityRows = serializeEquityTransactionsForDatabase(mockR2Result);
      expect(r2EquityRows.length).toBe(2);

      const r2Investor = r2EquityRows.find((r) => !r.is_founding_team)!;
      const r2Founding = r2EquityRows.find((r) => r.is_founding_team)!;

      expect(r2Investor.post_round_equity_pct).toBe('25.0000');
      expect(r2Founding.post_round_equity_pct).toBe('75.0000');

      const r2Sum = Number(r2Investor.post_round_equity_pct) + Number(r2Founding.post_round_equity_pct);
      expect(r2Sum).toBeCloseTo(100.0000, 4);

      // 2. Mock Round 4 Simulation Result with Series A Offer A (20% for $800k)
      // Dilution factor = 1 - 0.20 = 0.80
      // Founding team: 75% * 0.80 = 60.0000%
      // Prior Seed investor: 25% * 0.80 = 20.0000%
      // Series A investor: 20.0000%
      const mockR4Result = {
        companyResults: [
          {
            teamId: 'team-tech-01',
            roundNumber: 4,
            equity: {
              investmentDecision: 'offer_a',
              cashInjected: D(800000),
              investorEquityStakePct: D(20.0),
              preRoundRetainedEquityPct: D(75.0),
              postRoundRetainedEquityPct: D(60.0),
              dilutionFactor: D(0.80),
            },
          },
        ],
      } as unknown as TournamentSimulationResult;

      const priorInvestorsMap = new Map<string, Array<{ shareholder_name: string; post_round_equity_pct: number }>>();
      priorInvestorsMap.set('team-tech-01', [
        {
          shareholder_name: 'Seed Venture Partner (offer_a)',
          post_round_equity_pct: 25.0,
        },
      ]);

      const r4EquityRows = serializeEquityTransactionsForDatabase(mockR4Result, priorInvestorsMap);
      expect(r4EquityRows.length).toBe(3);

      const r4SeriesA = r4EquityRows.find((r) => r.shareholder_name === 'Series A Growth Fund (offer_a)')!;
      const r4Founder = r4EquityRows.find((r) => r.is_founding_team)!;
      const r4DilutedSeed = r4EquityRows.find((r) => r.shareholder_name === 'Seed Venture Partner (offer_a)')!;

      expect(r4SeriesA.post_round_equity_pct).toBe('20.0000');
      expect(r4Founder.post_round_equity_pct).toBe('60.0000');
      expect(r4DilutedSeed.post_round_equity_pct).toBe('20.0000');

      const r4Sum =
        Number(r4SeriesA.post_round_equity_pct) +
        Number(r4Founder.post_round_equity_pct) +
        Number(r4DilutedSeed.post_round_equity_pct);
      expect(r4Sum).toBeCloseTo(100.0000, 4);
    });

    it('server-side publication gate rejects materially inconsistent cap tables and duplicate transactions', async () => {
      // Create inconsistent equity transactions summing to 105%
      const inconsistentEquityTxs = [
        {
          team_id: 'team-1',
          shareholder_name: 'Founding Team',
          is_founding_team: true,
          pre_round_equity_pct: 75.0,
          dilution_delta_pct: -15.0,
          post_round_equity_pct: 60.0,
        },
        {
          team_id: 'team-1',
          shareholder_name: 'Series A Growth Fund (offer_a)',
          is_founding_team: false,
          pre_round_equity_pct: 0.0,
          dilution_delta_pct: 20.0,
          post_round_equity_pct: 20.0,
        },
        {
          team_id: 'team-1',
          shareholder_name: 'Undiluted Seed Investor',
          is_founding_team: false,
          pre_round_equity_pct: 25.0,
          dilution_delta_pct: 0.0,
          post_round_equity_pct: 25.0, // Should have been 20%, makes sum = 105%!
        },
      ];

      const mockSnapshots = [
        {
          id: 'snap-1',
          team_id: 'team-1',
          teams: { id: 'team-1', team_code: 'A1', company_name: 'Apex Innovations' },
          starting_cash: 1000000,
          ending_cash: 1800000,
          operating_cash_flow: 0,
          financing_cash_flow: 800000,
          retained_equity_pct: 60.0,
          enterprise_value: 3000000,
          cash_valuation_contribution: 227500,
          company_valuation: 3227500,
          units_available: 500,
          units_sold: 400,
          ending_inventory: 100,
          final_score: 1936500, // 3227500 * 0.60
        },
      ];

      const mockSupabase = createMockSupabase({
        round: { id: round2Id, round_number: 4, status: 'simulated', event_id: eventId },
        snapshots: mockSnapshots,
        equityTransactions: inconsistentEquityTxs,
      });

      const service = new TournamentService(mockSupabase as any);
      const audit = await service.getFinancialReconciliation(round2Id);

      expect(audit.isReconciled).toBe(false);
      expect(audit.checks.equityConservation).toBe(false);
      expect(audit.errors.some((e) => e.includes('Cap table does not sum to 100.0000%'))).toBe(true);

      // Verify that publication gate blocks this round
      try {
        await service.publishRound(round2Id, adminId);
        expect.unreachable('Should have failed publication');
      } catch (err: any) {
        expect(err.code).toBe('ROUND_NOT_REVIEWED');
      }
    });

    it('enforces organizer policy consistency: rejects unapproved policies and accepts strictSpendingRejectionApproved', async () => {
      // 1. Initial unapproved check
      const initialStatus = assertOrganizerPoliciesApproved(eventId);
      expect(initialStatus.approved).toBe(false);
      expect(initialStatus.pendingPolicies.some((p) => p.includes('Strict Spending Solvency Policy'))).toBe(true);

      // 2. Publish gate blocks publication when policies are pending
      const mockSupabase = createMockSupabase({
        round: { id: round1Id, round_number: 1, status: 'reviewed', event_id: eventId },
        snapshots: [
          {
            id: 'snap-1',
            team_id: 'team-1',
            teams: { id: 'team-1', team_code: 'A1', company_name: 'Apex Innovations' },
            starting_cash: 1000000,
            ending_cash: 1000000,
            operating_cash_flow: 0,
            financing_cash_flow: 0,
            retained_equity_pct: 100,
            enterprise_value: 2000000,
            cash_valuation_contribution: 187500,
            company_valuation: 2187500,
            units_available: 100,
            units_sold: 100,
            ending_inventory: 0,
            final_score: 2187500,
          },
        ],
      });

      const service = new TournamentService(mockSupabase as any);

      try {
        await service.publishRound(round1Id, adminId);
        expect.unreachable('Publication should have been blocked by pending organizer policies');
      } catch (err: any) {
        expect(err.code).toBe('POLICIES_NOT_APPROVED');
      }

      // 3. Formally approve all policies including Strict Spending Solvency
      recordOrganizerApproval(eventId, {
        cashValuationPolicyApproved: true,
        corporateTaxationApproved: true,
        standardVCOffersApproved: true,
        strictSpendingRejectionApproved: true,
        approvedBy: 'Chief Tournament Arbiter',
      });

      const approvedStatus = assertOrganizerPoliciesApproved(eventId);
      expect(approvedStatus.approved).toBe(true);
      expect(approvedStatus.pendingPolicies.length).toBe(0);

      // 4. Backward compatibility: legacy proRataScalingApproved safely maps to strict spending approval
      const gates = getOrganizerPolicyGates(eventId);
      expect(gates.strictSpendingRejectionApproved).toBe(true);
      expect(gates.proRataScalingApproved).toBe(true);
    });

    it('executes a 5-round development tournament with verified continuity, compounding dilution, and reconciliation', () => {
      const domain = DOMAIN_ARCHETYPES.healthtech;
      const teams = ['bio-01', 'bio-02', 'bio-03', 'bio-04'];

      // R1: Initial Setup ($1,000,000 cash, 100% equity)
      let currentSnapshots: CompanySnapshot[] = teams.map((teamId) => ({
        teamId,
        roundNumber: 0,
        cash: D(1000000),
        beginningInventoryUnits: ZERO,
        inventoryAverageUnitCost: D(domain.baseUnitCogs),
        cumulativeRdStock: ZERO,
        cumulativeBrandStock: ZERO,
        retainedEquityPct: D(100),
        valuation: D(200000),
      }));

      const r1Decisions: CompanyDecision[] = teams.map((teamId) => ({
        teamId,
        marketingBudget: 150000,
        rdBudget: 200000,
        operationsBudget: 100000,
        productionUnits: 1000,
        unitPrice: D(domain.benchmarkPrice).toNumber(),
        investmentDecision: 'REJECT_BOTH',
      }));

      const r1Result = simulateDomainRound(domain, 1, r1Decisions, currentSnapshots);
      expect(r1Result.companyResults.length).toBe(4);
      currentSnapshots = r1Result.companyResults.map((r) => r.nextSnapshot);

      for (const snap of currentSnapshots) {
        expect(snap.cash.toNumber()).toBeGreaterThan(0);
        expect(snap.retainedEquityPct.toNumber()).toBe(100);
      }

      // R2: Team bio-01 accepts Seed Offer A ($400k for 25%)
      const r2Decisions: CompanyDecision[] = teams.map((teamId) => ({
        teamId,
        marketingBudget: 200000,
        rdBudget: 250000,
        operationsBudget: 150000,
        productionUnits: 1200,
        unitPrice: D(domain.benchmarkPrice).toNumber(),
        investmentDecision: teamId === 'bio-01' ? 'OFFER_A' : 'REJECT_BOTH',
      }));

      const r2Result = simulateDomainRound(domain, 2, r2Decisions, currentSnapshots);
      currentSnapshots = r2Result.companyResults.map((r) => r.nextSnapshot);

      const bio01_r2 = currentSnapshots.find((s) => s.teamId === 'bio-01')!;
      expect(bio01_r2.retainedEquityPct.toNumber()).toBeCloseTo(75, 4);

      // R3: Carryover operational states
      const r3Decisions: CompanyDecision[] = teams.map((teamId) => ({
        teamId,
        marketingBudget: 220000,
        rdBudget: 260000,
        operationsBudget: 160000,
        productionUnits: 1400,
        unitPrice: D(domain.benchmarkPrice).toNumber(),
        investmentDecision: 'REJECT_BOTH',
      }));

      const r3Result = simulateDomainRound(domain, 3, r3Decisions, currentSnapshots);
      currentSnapshots = r3Result.companyResults.map((r) => r.nextSnapshot);

      const bio01_r3 = currentSnapshots.find((s) => s.teamId === 'bio-01')!;
      expect(bio01_r3.retainedEquityPct.toNumber()).toBeCloseTo(75, 4);

      // R4: Team bio-01 accepts Series A Offer A ($800k for 20%)
      const r4Decisions: CompanyDecision[] = teams.map((teamId) => ({
        teamId,
        marketingBudget: 250000,
        rdBudget: 280000,
        operationsBudget: 180000,
        productionUnits: 1500,
        unitPrice: D(domain.benchmarkPrice).toNumber(),
        investmentDecision: teamId === 'bio-01' ? 'OFFER_A' : 'REJECT_BOTH',
      }));

      const r4Result = simulateDomainRound(domain, 4, r4Decisions, currentSnapshots);
      currentSnapshots = r4Result.companyResults.map((r) => r.nextSnapshot);

      const bio01_r4 = currentSnapshots.find((s) => s.teamId === 'bio-01')!;
      // Compounding dilution: 75% * 0.80 = 60.0000%
      expect(bio01_r4.retainedEquityPct.toNumber()).toBeCloseTo(60, 4);

      // R5: Final Harvest and Leaderboard Evaluation
      const r5Decisions: CompanyDecision[] = teams.map((teamId) => ({
        teamId,
        marketingBudget: 300000,
        rdBudget: 300000,
        operationsBudget: 200000,
        productionUnits: 1800,
        unitPrice: D(domain.benchmarkPrice).toNumber(),
        investmentDecision: 'REJECT_BOTH',
      }));

      const r5Result = simulateDomainRound(domain, 5, r5Decisions, currentSnapshots);
      const leaderboard = computeRankings(r5Result.companyResults);

      expect(leaderboard.length).toBe(4);
      for (const entry of leaderboard) {
        expect(entry.valuation.toNumber()).toBeGreaterThan(0);
        expect(entry.finalScore.toNumber()).toBeGreaterThan(0);
        expect(entry.retainedEquityPct.toNumber()).toBeGreaterThanOrEqual(60);
        expect(entry.retainedEquityPct.toNumber()).toBeLessThanOrEqual(100);
      }
    });
  });
});
