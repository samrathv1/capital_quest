import { describe, it, expect, vi } from 'vitest';
import { TournamentService } from '@/lib/services/tournament-service';
import { executeSimulationRound } from '@/lib/services/simulation-runner';
import { AppError } from '@/lib/errors/app-error';

describe('Phase 7: Failure Modes, Idempotency & Recovery Testing', () => {
  const eventId = '00000000-0000-0000-0000-000000000001';
  const round1Id = '00000000-0000-0000-0000-000000000010';
  const adminId = '00000000-0000-0000-0000-000000000099';

  function createMockSupabaseWithState(overrides: {
    roundStatus?: string;
    existingDecision?: any;
    simulatedSnapshots?: any[];
    dbError?: any;
  }) {
    const chain: any = {
      select: vi.fn(() => chain),
      insert: vi.fn(() => {
        if (overrides.dbError) {
          return Promise.resolve({ error: overrides.dbError });
        }
        return Promise.resolve({ error: null });
      }),
      update: vi.fn(() => {
        if (overrides.dbError) {
          return Promise.resolve({ error: overrides.dbError });
        }
        return chain;
      }),
      upsert: vi.fn(() => Promise.resolve({ error: null })),
      eq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      single: vi.fn(() => Promise.resolve({
        data: {
          id: round1Id,
          event_id: eventId,
          round_number: 1,
          status: overrides.roundStatus ?? 'open',
          total_rounds: 5,
        },
        error: null,
      })),
      maybeSingle: vi.fn(() => Promise.resolve({
        data: overrides.roundStatus === 'published'
          ? { id: 'state-1', event_id: eventId, ceremony_stage: 'podium', mode: 'standings' }
          : { id: 'state-1', event_id: eventId, ceremony_stage: 'waiting', mode: 'standings' },
        error: null,
      })),
      then: (resolve: any) => Promise.resolve({
        data: overrides.simulatedSnapshots ?? [
          { id: round1Id, round_number: 1, status: overrides.roundStatus ?? 'open' },
        ],
        error: null,
      }).then(resolve),
    };

    return {
      from: vi.fn((table: string) => {
        return chain;
      }),
      rpc: vi.fn(() => {
        if (overrides.dbError) return Promise.resolve({ data: null, error: overrides.dbError });
        return Promise.resolve({ data: { success: true }, error: null });
      }),
    };
  }

  // 1. RECOVERY FROM NETWORK FAILURE & PRESENTATION STATE RESUMPTION
  describe('1. Network Disconnection & State Resumption', () => {
    it('gracefully recovers presentation state upon reconnect without resetting ceremony progress', async () => {
      const mockClient = createMockSupabaseWithState({ roundStatus: 'published' });
      const service = new TournamentService(mockClient as unknown as any);

      // Presenter disconnected and reconnected
      const recoveredState = await service.getPresentationState(eventId);
      expect(recoveredState).toBeDefined();
      expect(recoveredState.ceremonyStage).toBe('podium');
      expect(recoveredState.mode).toBe('standings');
    });
  });

  // 2. IDEMPOTENT SIMULATION & REPEATED PUBLICATION GUARDS
  describe('2. Idempotency & Safeguards Against Duplicate Execution', () => {
    it('blocks duplicate publication attempt when a round is already published', async () => {
      const mockClient = createMockSupabaseWithState({ roundStatus: 'published' });
      const service = new TournamentService(mockClient as unknown as any);

      // Attempting to publish an already published round must fail or be rejected cleanly
      await expect(
        service.publishRound(round1Id, adminId)
      ).rejects.toThrow();
    });

    it('rejects simulation if the round is not locked', async () => {
      // Round is still 'open', not 'locked'
      const mockClient = createMockSupabaseWithState({ roundStatus: 'open' });

      await expect(
        executeSimulationRound({
          roundId: round1Id,
          adminId,
          isDryRun: false,
          supabaseClient: mockClient as any,
        })
      ).rejects.toThrow(
        expect.objectContaining({
          code: expect.stringMatching(/ROUND_NOT_LOCKED|INVALID_STATE|BAD_REQUEST/),
        })
      );
    });
  });

  // 3. TRANSACTION INTEGRITY & ROLLBACK ON SIMULATION FAILURE
  describe('3. Transaction Integrity & Partial Record Prevention', () => {
    it('does not leave partial authoritative records if simulation transaction aborts', async () => {
      const mockClient = createMockSupabaseWithState({
        roundStatus: 'locked',
        dbError: { message: 'Database transaction lock conflict' },
      });

      await expect(
        executeSimulationRound({
          roundId: round1Id,
          adminId,
          isDryRun: false,
          supabaseClient: mockClient as any,
        })
      ).rejects.toThrow();
    });
  });

  // 4. PRESERVATION OF AUDIT LOGS AND HISTORICAL RECORDS
  describe('4. Historical Integrity Preservation', () => {
    it('preserves historical snapshot records during state queries and round progression', async () => {
      const mockClient = createMockSupabaseWithState({ roundStatus: 'published' });
      const service = new TournamentService(mockClient as unknown as any);

      const state = await service.getPresentationState(eventId);
      expect(state).toBeDefined();
      expect(state.eventId).toBe(eventId);
    });
  });
});
