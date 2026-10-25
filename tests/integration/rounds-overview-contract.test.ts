import { describe, it, expect, vi } from 'vitest';
import { TournamentService } from '@/lib/services/tournament-service';

describe('Rounds Overview API Contract & Admin Rounds Page Alignment', () => {
  it('returns the data structure expected by /admin/rounds page without crashing', async () => {
    const eventId = '00000000-0000-0000-0000-000000000001';
    const mockRounds = [
      { id: 'r1', round_number: 1, type: 'regular', status: 'draft', opened_at: null, locked_at: null, simulated_at: null, published_at: null, event_id: eventId },
      { id: 'r2', round_number: 2, type: 'investment_seed', status: 'draft', opened_at: null, locked_at: null, simulated_at: null, published_at: null, event_id: eventId },
      { id: 'r3', round_number: 3, type: 'regular', status: 'draft', opened_at: null, locked_at: null, simulated_at: null, published_at: null, event_id: eventId },
      { id: 'r4', round_number: 4, type: 'investment_series_a', status: 'draft', opened_at: null, locked_at: null, simulated_at: null, published_at: null, event_id: eventId },
      { id: 'r5', round_number: 5, type: 'final_harvest', status: 'draft', opened_at: null, locked_at: null, simulated_at: null, published_at: null, event_id: eventId },
    ];

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'events') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { active_round_number: 1 }, error: null }),
              }),
            }),
          };
        }
        if (table === 'rounds') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: mockRounds, error: null }),
              }),
            }),
          };
        }
        if (table === 'teams') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [{ id: 't1', team_code: '001', is_disqualified: false }], error: null }),
              }),
            }),
          };
        }
        if (table === 'decisions') {
          return {
            select: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        if (table === 'market_events') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        if (table === 'simulation_runs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        return { select: vi.fn().mockReturnThis() };
      }),
    };

    const service = new TournamentService(mockSupabase as unknown as any);
    const overview = await service.getRoundsOverview(eventId);

    console.log('ACTUAL OVERVIEW RETURNED:', JSON.stringify(overview, null, 2));

    // Verify organizerPolicies exists
    expect((overview as any).organizerPolicies).toBeDefined();
    expect((overview as any).organizerPolicies?.allApproved).toBeDefined();
    expect((overview as any).organizerPolicies?.pendingPolicies).toBeDefined();

    // Verify activeRoundNumber exists
    expect((overview as any).activeRoundNumber).toBeDefined();

    // Verify round items have fields expected by admin/rounds/page.tsx
    const r1 = overview.rounds[0] as any;
    expect(r1.round_number).toBe(1);
    expect(r1.decisionStats.totalEligible).toBeDefined();
    expect(r1.marketEvents).toBeInstanceOf(Array);
    expect(r1.allowedTransitions).toBeInstanceOf(Array);
  });
});
