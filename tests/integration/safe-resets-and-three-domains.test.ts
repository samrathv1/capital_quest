import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TournamentService } from '@/lib/services/tournament-service';
import { AppError } from '@/lib/errors/app-error';
import {
  DOMAIN_ARCHETYPES,
  CANONICAL_ACTIVE_DOMAINS,
  ACTIVE_DOMAIN_CODES,
  isActiveDomain,
  normalizeDomainCode,
  getDomainConfig,
} from '@/engine/config/domain-archetypes';
import {
  getOrganizerPolicyGates,
  recordOrganizerApproval,
  resetOrganizerPolicyGates,
  assertOrganizerPoliciesApproved,
} from '@/lib/services/organizer-approvals';

describe('Safe Tournament Resets & Three-Domain Standardization Test Suite', () => {
  const eventId = '00000000-0000-0000-0000-000000000001';
  const round1Id = '00000000-0000-0000-0000-000000000010';
  const superAdminId = '00000000-0000-0000-0000-000000000099';

  beforeEach(() => {
    resetOrganizerPolicyGates(eventId);
  });

  describe('Part A: Three Active Business Domains Standardization', () => {
    it('supports exactly three active business domains: D2C, HealthTech, and Enterprise SaaS & AI', () => {
      expect(ACTIVE_DOMAIN_CODES).toHaveLength(3);
      expect(ACTIVE_DOMAIN_CODES).toContain('d2c');
      expect(ACTIVE_DOMAIN_CODES).toContain('healthtech');
      expect(ACTIVE_DOMAIN_CODES).toContain('saas');
    });

    it('validates canonical approved parameters for Domain 1 — D2C', () => {
      const config = getDomainConfig('D2C');
      expect(Number(config.benchmarkPrice)).toBe(65);
      expect(Number(config.minPrice)).toBe(40);
      expect(Number(config.maxPrice)).toBe(110);
      expect(Number(config.baseUnitCogs)).toBe(28);
      expect(Number(config.baseDemand)).toBe(120000);
      expect(isActiveDomain('D2C')).toBe(true);
      expect(isActiveDomain('d2c')).toBe(true);
    });

    it('validates canonical approved parameters for Domain 2 — HealthTech', () => {
      const config = getDomainConfig('HEALTH');
      expect(Number(config.benchmarkPrice)).toBe(2500);
      expect(Number(config.minPrice)).toBe(1600);
      expect(Number(config.maxPrice)).toBe(3800);
      expect(Number(config.baseUnitCogs)).toBe(1100);
      expect(Number(config.baseDemand)).toBe(12000);
      expect(isActiveDomain('HEALTH')).toBe(true);
      expect(isActiveDomain('healthtech')).toBe(true);
    });

    it('validates canonical approved parameters for Domain 3 — Enterprise SaaS & AI', () => {
      const config = getDomainConfig('SAAS');
      expect(Number(config.benchmarkPrice)).toBe(350);
      expect(Number(config.minPrice)).toBe(200);
      expect(Number(config.maxPrice)).toBe(600);
      expect(Number(config.baseUnitCogs)).toBe(25);
      expect(Number(config.baseDemand)).toBe(60000);
      expect(isActiveDomain('SAAS')).toBe(true);
      expect(isActiveDomain('saas')).toBe(true);
    });

    it('correctly classifies CleanTech as an archived / inactive domain', () => {
      expect(isActiveDomain('CLEAN')).toBe(false);
      expect(isActiveDomain('cleantech')).toBe(false);
      expect(isActiveDomain('CleanTech & Hardware')).toBe(false);
      // Historical config is still resolvable so existing records do not crash
      const historicalConfig = getDomainConfig('cleantech');
      expect(historicalConfig.code).toBe('cleantech');
    });

    it('normalizes various domain code casings and aliases', () => {
      expect(normalizeDomainCode('D2C')).toBe('d2c');
      expect(normalizeDomainCode('HEALTH')).toBe('healthtech');
      expect(normalizeDomainCode('HealthTech')).toBe('healthtech');
      expect(normalizeDomainCode('SAAS')).toBe('saas');
      expect(normalizeDomainCode('Enterprise SaaS & AI')).toBe('saas');
      expect(normalizeDomainCode('CLEAN')).toBe('cleantech');
    });
  });

  describe('Part B: Reusable Super Admin Round Decisions Reset', () => {
    function createMockSupabase(roundStatus: string, options?: { hasSimRuns?: boolean; decisionCount?: number }) {
      const deletedDecisions: any[] = [];
      const updatedRounds: any[] = [];
      const auditEntries: any[] = [];

      const createChain = (table: string) => {
        const chain: any = {
          select: vi.fn(() => chain),
          delete: vi.fn(() => {
            return {
              eq: vi.fn(() => Promise.resolve({ error: null })),
            };
          }),
          update: vi.fn((payload: any) => {
            updatedRounds.push(payload);
            return {
              eq: vi.fn(() => Promise.resolve({ error: null })),
            };
          }),
          insert: vi.fn((entry: any) => {
            auditEntries.push(entry);
            return Promise.resolve({ error: null });
          }),
          eq: vi.fn(() => chain),
          in: vi.fn(() => chain),
          order: vi.fn(() => chain),
          limit: vi.fn(() => chain),
          single: vi.fn(() => Promise.resolve({
            data: {
              id: round1Id,
              event_id: eventId,
              round_number: 1,
              status: roundStatus,
            },
            error: null,
          })),
          maybeSingle: vi.fn(() => Promise.resolve({
            data: {
              id: round1Id,
              event_id: eventId,
              round_number: 1,
              status: roundStatus,
            },
            error: null,
          })),
          then: (resolve: any) => {
            if (table === 'simulation_runs') {
              const count = options?.hasSimRuns ? 1 : 0;
              return Promise.resolve({ count, data: options?.hasSimRuns ? [{ id: 'sim-1' }] : [], error: null }).then(resolve);
            }
            if (table === 'decisions') {
              const count = options?.decisionCount ?? 5;
              return Promise.resolve({ count, data: [], error: null }).then(resolve);
            }
            if (table === 'teams') {
              return Promise.resolve({ count: 5, data: [{ id: 'team-1', domain: { is_active: true } }], error: null }).then(resolve);
            }
            return Promise.resolve({ count: 0, data: [], error: null }).then(resolve);
          },
        };
        return chain;
      };

      return {
        from: vi.fn((table: string) => createChain(table)),
        rpc: vi.fn(() => Promise.resolve({ data: null, error: { message: 'function does not exist' } })), // test JS fallback
        _deletedDecisions: deletedDecisions,
        _updatedRounds: updatedRounds,
        _auditEntries: auditEntries,
      };
    }

    it('successfully resets draft round decisions back to clean draft state', async () => {
      const mockSupabase = createMockSupabase('draft');
      const service = new TournamentService(mockSupabase as any);

      const result = await service.resetRoundDecisions(
        round1Id,
        superAdminId,
        'Clearing rehearsal test decisions from draft round'
      );

      expect(result.success).toBe(true);
      expect(result.previous_status).toBe('draft');
      expect(result.new_status).toBe('draft');
      expect(result.decisions_cleared).toBe(5);
    });

    it('successfully resets open round decisions back to draft by default', async () => {
      const mockSupabase = createMockSupabase('open');
      const service = new TournamentService(mockSupabase as any);

      const result = await service.resetRoundDecisions(
        round1Id,
        superAdminId,
        'Resetting open round decisions back to draft for fresh entry',
        'draft'
      );

      expect(result.success).toBe(true);
      expect(result.previous_status).toBe('open');
      expect(result.new_status).toBe('draft');
    });

    it('successfully resets locked pre-simulation round decisions back to draft', async () => {
      const mockSupabase = createMockSupabase('locked', { hasSimRuns: false });
      const service = new TournamentService(mockSupabase as any);

      const result = await service.resetRoundDecisions(
        round1Id,
        superAdminId,
        'Reopening locked round because test decisions were entered',
        'draft'
      );

      expect(result.success).toBe(true);
      expect(result.previous_status).toBe('locked');
      expect(result.new_status).toBe('draft');
    });

    it('blocks resetting simulated, reviewed, or published round decisions', async () => {
      for (const protectedStatus of ['simulated', 'reviewed', 'published']) {
        const mockSupabase = createMockSupabase(protectedStatus);
        const service = new TournamentService(mockSupabase as any);

        await expect(
          service.resetRoundDecisions(
            round1Id,
            superAdminId,
            'Attempting unauthorized reset of simulated history'
          )
        ).rejects.toThrow(AppError);
      }
    });

    it('rejects reset requests with empty or short reasons (< 5 characters)', async () => {
      const mockSupabase = createMockSupabase('open');
      const service = new TournamentService(mockSupabase as any);

      await expect(
        service.resetRoundDecisions(round1Id, superAdminId, 'test')
      ).rejects.toThrow('A structured audit reason of at least 5 characters is required');
    });
  });

  describe('Part C: Complete Tournament Reset & Rehearsal Restart', () => {
    function createMockTournamentSupabase(options?: { hasPublishedRounds?: boolean; isCompleted?: boolean }) {
      const deletedTables: string[] = [];
      const updatedRecords: any[] = [];
      const auditRecords: any[] = [];

      const chain: any = {
        select: vi.fn(() => chain),
        delete: vi.fn(() => {
          return {
            eq: vi.fn(() => Promise.resolve({ error: null })),
            in: vi.fn(() => Promise.resolve({ error: null })),
          };
        }),
        update: vi.fn((payload: any) => {
          updatedRecords.push(payload);
          return {
            eq: vi.fn(() => Promise.resolve({ error: null })),
          };
        }),
        insert: vi.fn((entry: any) => {
          auditRecords.push(entry);
          return Promise.resolve({ error: null });
        }),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        order: vi.fn(() => chain),
        single: vi.fn(() => Promise.resolve({
          data: {
            id: eventId,
            name: 'Capital Quest 2026 Championship',
            status: options?.isCompleted ? 'completed' : 'in_progress',
            active_round_number: 5,
          },
          error: null,
        })),
        then: (resolve: any) => {
          const roundsData = [
            { id: 'r1', round_number: 1, status: options?.hasPublishedRounds ? 'published' : 'draft' },
            { id: 'r2', round_number: 2, status: 'draft' },
            { id: 'r3', round_number: 3, status: 'draft' },
            { id: 'r4', round_number: 4, status: 'draft' },
            { id: 'r5', round_number: 5, status: 'draft' },
          ];
          return Promise.resolve({ data: roundsData, count: 5, error: null }).then(resolve);
        },
      };

      return {
        from: vi.fn((table: string) => {
          deletedTables.push(table);
          return chain;
        }),
        rpc: vi.fn(() => Promise.resolve({ data: null, error: { message: 'function does not exist' } })), // test JS fallback
        _deletedTables: deletedTables,
        _updatedRecords: updatedRecords,
        _auditRecords: auditRecords,
      };
    }

    it('successfully resets entire tournament back to setup baseline', async () => {
      recordOrganizerApproval(eventId, {
        cashValuationPolicyApproved: true,
        corporateTaxationApproved: true,
        standardVCOffersApproved: true,
        strictSpendingRejectionApproved: true,
      });
      expect(assertOrganizerPoliciesApproved(eventId).approved).toBe(true);

      const mockSupabase = createMockTournamentSupabase({ hasPublishedRounds: false });
      const service = new TournamentService(mockSupabase as any);

      const result = await service.resetEntireTournament(
        eventId,
        superAdminId,
        'Rehearsal 1 complete. Full reset to zero for Rehearsal 2.'
      );

      expect(result.success).toBe(true);
      expect(result.new_event_status).toBe('setup');
      expect(result.active_round_number).toBe(0);

      // Organizer policy gates are reset to unapproved
      const postResetGates = getOrganizerPolicyGates(eventId);
      expect(postResetGates.cashValuationPolicyApproved).toBe(false);
      expect(postResetGates.corporateTaxationApproved).toBe(false);
    });

    it('creates a durable, structured backup before resetting the tournament', async () => {
      const mockSupabase = createMockTournamentSupabase({ hasPublishedRounds: false });
      const service = new TournamentService(mockSupabase as any);

      const backup = await service.createTournamentBackup(eventId);

      expect(backup.eventId).toBe(eventId);
      expect(backup.backupTimestamp).toBeDefined();
      expect(backup.rounds).toBeDefined();
      expect(backup.teams).toBeDefined();
      expect(backup.financialLedger).toBeDefined();
    });

    it('requires explicit confirmation when resetting a tournament with published rounds', async () => {
      const mockSupabase = createMockTournamentSupabase({ hasPublishedRounds: true });
      const service = new TournamentService(mockSupabase as any);

      // Without confirmPublished = true, it must fail with CASCADE_GUARD_VIOLATION
      await expect(
        service.resetEntireTournament(
          eventId,
          superAdminId,
          'Attempting reset without explicit published confirmation',
          false
        )
      ).rejects.toThrow('Explicit confirmation is required to reset published tournament history');

      // With confirmPublished = true, it succeeds
      const result = await service.resetEntireTournament(
        eventId,
        superAdminId,
        'Authorized reset of published tournament for fresh rehearsal',
        true
      );
      expect(result.success).toBe(true);
    });
  });
});
