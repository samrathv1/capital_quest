import { describe, it, expect, vi } from 'vitest';
import { TournamentService } from '@/lib/services/tournament-service';
import { DecisionSubmitSchema, DecisionVerifySchema } from '@/lib/validation/api-schemas';
import { simulateDomainRound } from '@/engine/simulation/domain-simulation';
import { DOMAIN_ARCHETYPES } from '@/engine/config/domain-archetypes';
import { CompanyDecision, CompanySnapshot } from '@/engine/types';
import { D, ZERO } from '@/engine/math/precision';

/**
 * Creates a fast in-memory mock Supabase client for load testing
 */
function createPerformanceMockSupabase() {
  const eventId = '00000000-0000-0000-0000-000000000001';
  const round1Id = '00000000-0000-0000-0000-000000000010';

  const mockSnapshots = Array.from({ length: 40 }, (_, i) => ({
    id: `snap-${i}`,
    round_id: round1Id,
    team_id: `team-${i}`,
    equity_adjusted_score: 2500 - i * 10,
    company_valuation: 1500000 - i * 10000,
    retained_equity_pct: 100,
    ending_cash: 800000,
    gross_revenue: 500000,
    cogs: 150000,
    gross_profit: 350000,
    operating_expenses: 100000,
    inventory_holding_cost: 0,
    ebitda: 250000,
    net_income: 180000,
    market_share_pct: 2.5,
    product_quality_index: 75,
    brand_equity_score: 70,
    tournament_rank: i + 1,
    domain_rank: (i % 10) + 1,
    teams: {
      id: `team-${i}`,
      team_code: `CT-${String(i + 1).padStart(2, '0')}`,
      company_name: `Company ${i + 1}`,
      table_station: `Table ${i + 1}`,
      domain_id: 'cleantech',
      domains: { id: 'cleantech', code: 'CLEANTECH', name: 'CleanTech' },
    },
    rounds: { id: round1Id, round_number: 1, status: 'published', type: 'standard', published_at: '2026-10-25T10:00:00Z' },
  }));

  const chainable = (data: any) => {
    const chain: any = {
      select: vi.fn(() => chain),
      insert: vi.fn(() => Promise.resolve({ error: null })),
      update: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      single: vi.fn(() => Promise.resolve({ data, error: null })),
      maybeSingle: vi.fn(() => Promise.resolve({ data, error: null })),
      then: (resolve: any) => Promise.resolve({ data, error: null }).then(resolve),
    };
    return chain;
  };

  return {
    from: vi.fn((table: string) => {
      if (table === 'events') {
        return chainable({
          id: eventId,
          name: 'Capital Quest 2026',
          status: 'active',
          total_rounds: 5,
          active_round_number: 1,
        });
      }
      if (table === 'rounds') {
        return chainable([
          { id: round1Id, round_number: 1, status: 'published', type: 'standard', published_at: '2026-10-25T10:00:00Z' },
        ]);
      }
      if (table === 'presentation_state') {
        return chainable({
          id: 'state-1',
          event_id: eventId,
          ceremony_stage: 'podium',
          mode: 'standings',
          selected_round_number: 1,
        });
      }
      if (table === 'company_snapshots') {
        return chainable(mockSnapshots);
      }
      if (table === 'decisions') {
        return chainable({
          id: 'dec-1',
          round_id: round1Id,
          team_id: 'team-1',
          marketing_budget: 100000,
          rd_budget: 100000,
          operations_budget: 20000,
          production_units: 500,
          unit_price: 1200,
          investment_decision: 'REJECT_BOTH',
          verification_status: 'pending_verification',
        });
      }
      return chainable([]);
    }),
  };
}

describe('Phase 7: Performance, Concurrency & Load Testing (40 Teams)', () => {
  const PERFORMANCE_TARGETS = {
    submissionLatencyMs: 50,      // Target < 50ms per decision submission
    verificationLatencyMs: 50,    // Target < 50ms per verification check
    simulationExecutionMs: 500,   // Target < 500ms for 40-team multi-domain simulation under concurrent test runner load
    leaderboardResponseMs: 100,   // Target < 100ms for public leaderboard query
    projectorSyncLatencyMs: 100,  // Target < 100ms for projector polling sync
    maxErrorRatePct: 0.0,         // Target 0.0% error rate
  };

  it('measures decision validation and submission latency under concurrent volunteer load', async () => {
    const rawPayloads = Array.from({ length: 40 }, (_, i) => ({
      roundId: '00000000-0000-0000-0000-000000000010',
      teamId: `00000000-0000-0000-0000-0000000000${String(i).padStart(2, '0')}`,
      marketingBudget: 150000,
      rdBudget: 100000,
      operationsBudget: 25000,
      productionUnits: 600,
      unitPrice: 1200,
      investmentDecision: 'reject_both' as const,
    }));

    const startTime = performance.now();
    // Simulate 40 concurrent volunteer submissions
    const results = await Promise.all(
      rawPayloads.map(async payload => {
        const parsed = DecisionSubmitSchema.parse(payload);
        return parsed;
      })
    );
    const totalDurationMs = performance.now() - startTime;
    const avgLatencyMs = totalDurationMs / rawPayloads.length;

    expect(results.length).toBe(40);
    expect(avgLatencyMs).toBeLessThan(PERFORMANCE_TARGETS.submissionLatencyMs);
  });

  it('measures verification latency under concurrent operator load', async () => {
    const rawVerifications = Array.from({ length: 40 }, (_, i) => ({
      roundId: '00000000-0000-0000-0000-000000000010',
      teamId: `00000000-0000-0000-0000-0000000000${String(i).padStart(2, '0')}`,
      marketingBudget: 150000,
      rdBudget: 100000,
      operationsBudget: 25000,
      productionUnits: 600,
      unitPrice: 1200,
      investmentDecision: 'reject_both' as const,
    }));

    const startTime = performance.now();
    // Simulate 40 concurrent blind verifications
    const results = await Promise.all(
      rawVerifications.map(async payload => {
        const parsed = DecisionVerifySchema.parse(payload);
        return parsed;
      })
    );
    const totalDurationMs = performance.now() - startTime;
    const avgLatencyMs = totalDurationMs / rawVerifications.length;

    expect(results.length).toBe(40);
    expect(avgLatencyMs).toBeLessThan(PERFORMANCE_TARGETS.verificationLatencyMs);
  });

  it('measures 40-company financial simulation execution time across 4 domains', () => {
    const domains = Object.values(DOMAIN_ARCHETYPES);
    const mockDecisions: CompanyDecision[] = Array.from({ length: 10 }, (_, i) => ({
      teamId: `team-${i}`,
      marketingBudget: 150000,
      rdBudget: 100000,
      operationsBudget: 20000,
      productionUnits: 500,
      unitPrice: 1200,
      investmentDecision: 'REJECT_BOTH',
    }));

    const mockSnapshots: CompanySnapshot[] = Array.from({ length: 10 }, (_, i) => ({
      teamId: `team-${i}`,
      roundNumber: 0,
      cash: D(1000000),
      beginningInventoryUnits: ZERO,
      inventoryAverageUnitCost: D(600),
      cumulativeRdStock: ZERO,
      cumulativeBrandStock: ZERO,
      retainedEquityPct: D(100),
      valuation: D(200000),
    }));

    const startTime = performance.now();
    for (const domain of domains) {
      simulateDomainRound(domain, 1, mockDecisions, mockSnapshots);
    }
    const simulationDurationMs = performance.now() - startTime;

    expect(simulationDurationMs).toBeLessThan(PERFORMANCE_TARGETS.simulationExecutionMs);
  });

  it('measures public leaderboard query latency under concurrent audience requests', async () => {
    const mockSupabase = createPerformanceMockSupabase();
    const service = new TournamentService(mockSupabase as unknown as any);

    const concurrentRequests = 25;
    const startTime = performance.now();
    const responses = await Promise.all(
      Array.from({ length: concurrentRequests }, () =>
        service.getPublicLeaderboard({ eventId: '00000000-0000-0000-0000-000000000001', roundNumber: 1 })
      )
    );
    const totalDurationMs = performance.now() - startTime;
    const avgResponseTimeMs = totalDurationMs / concurrentRequests;

    expect(responses.length).toBe(concurrentRequests);
    expect(responses[0].leaderboard.length).toBe(40);
    expect(avgResponseTimeMs).toBeLessThan(PERFORMANCE_TARGETS.leaderboardResponseMs);
  });

  it('measures projector synchronization polling latency (2.5-second interval simulation)', async () => {
    const mockSupabase = createPerformanceMockSupabase();
    const service = new TournamentService(mockSupabase as unknown as any);

    // Simulate 5 consecutive 2.5s polling pulses
    const pollCycles = 5;
    const latencies: number[] = [];

    for (let i = 0; i < pollCycles; i++) {
      const pollStart = performance.now();
      const presData = await service.getPublicPresentationData('00000000-0000-0000-0000-000000000001');
      latencies.push(performance.now() - pollStart);
      expect(presData.hasPublishedRounds).toBe(true);
    }

    const avgSyncDelayMs = latencies.reduce((a, b) => a + b, 0) / pollCycles;
    expect(avgSyncDelayMs).toBeLessThan(PERFORMANCE_TARGETS.projectorSyncLatencyMs);
  });
});
