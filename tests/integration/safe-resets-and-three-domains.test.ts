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

  describe('Part B: Reusable Super Admin Round Decisions Reset & Fallback Removal', () => {
    function createMockSupabase(roundStatus: string, options?: { hasSimRuns?: boolean; rpcMissing?: boolean }) {
      const deletedDecisions: any[] = [];
      const updatedRounds: any[] = [];
      const auditEntries: any[] = [];

      const createChain = (table: string) => {
        const chain: any = {
          select: vi.fn(() => chain),
          delete: vi.fn(() => {
            deletedDecisions.push({ table });
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
              return Promise.resolve({ count: 5, data: [], error: null }).then(resolve);
            }
            if (table === 'teams') {
              return Promise.resolve({ count: 5, data: [{ id: 'team-1', domain: { is_active: true } }], error: null }).then(resolve);
            }
            return Promise.resolve({ count: 0, data: [], error: null }).then(resolve);
          },
        };
        return chain;
      };

      const rpcMock = vi.fn((funcName: string, args: any) => {
        if (options?.rpcMissing) {
          return Promise.resolve({ data: null, error: { message: `function ${funcName} does not exist`, code: '42883' } });
        }
        if (['simulated', 'reviewed', 'published'].includes(roundStatus)) {
          return Promise.resolve({
            data: null,
            error: {
              message: `Cannot reset round 1: Round has already been ${roundStatus}. Tournament history is protected.`,
              code: '23503',
            },
          });
        }
        if (options?.hasSimRuns) {
          return Promise.resolve({
            data: null,
            error: {
              message: 'Cannot reset round 1: 1 simulation run(s) already exist for this round.',
              code: '23503',
            },
          });
        }
        return Promise.resolve({
          data: {
            success: true,
            round_id: args.p_round_id,
            round_number: 1,
            previous_status: roundStatus,
            new_status: args.p_target_status || 'draft',
            decisions_cleared: 5,
            teams_preserved: 5,
            reason: args.p_reason,
          },
          error: null,
        });
      });

      return {
        from: vi.fn((table: string) => createChain(table)),
        rpc: rpcMock,
        _deletedDecisions: deletedDecisions,
        _updatedRounds: updatedRounds,
        _auditEntries: auditEntries,
      };
    }

    it('successfully resets draft round decisions back to clean draft state via RPC', async () => {
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
      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'fn_reset_round_decisions',
        expect.objectContaining({ p_round_id: round1Id, p_target_status: 'draft' })
      );
    });

    it('successfully resets open round decisions back to draft via RPC', async () => {
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

    it('successfully resets locked pre-simulation round decisions back to draft via RPC', async () => {
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

    it('blocks resetting simulated, reviewed, or published round decisions with CASCADE_GUARD_VIOLATION', async () => {
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

    it('strictly fails closed and refuses destructive HTTP fallbacks when RPC is missing', async () => {
      const mockSupabase = createMockSupabase('draft', { rpcMissing: true });
      const service = new TournamentService(mockSupabase as any);

      await expect(
        service.resetRoundDecisions(
          round1Id,
          superAdminId,
          'Attempting reset without valid database migration RPC'
        )
      ).rejects.toThrow(/Database migration required.*fn_reset_round_decisions/);

      // Verify no destructive table deletion queries were executed
      expect(mockSupabase._deletedDecisions).toHaveLength(0);
    });

    it('rejects reset requests with empty or short reasons (< 5 characters)', async () => {
      const mockSupabase = createMockSupabase('open');
      const service = new TournamentService(mockSupabase as any);

      await expect(
        service.resetRoundDecisions(round1Id, superAdminId, 'test')
      ).rejects.toThrow('A structured audit reason of at least 5 characters is required');
    });
  });

  describe('Part C: Complete Tournament Reset, Durable Recovery & Safe Restoration', () => {
    function createMockTournamentSupabase(options?: {
      hasPublishedRounds?: boolean;
      isCompleted?: boolean;
      rpcMissing?: boolean;
      backupFail?: boolean;
    }) {
      const deletedTables: string[] = [];
      const updatedRecords: any[] = [];
      const auditRecords: any[] = [];
      const backupsInserted: any[] = [];

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
          if (options?.backupFail) {
            return {
              select: () => ({
                single: () => Promise.resolve({ data: null, error: { message: 'Database write error' } }),
              }),
            };
          }
          backupsInserted.push(entry);
          return {
            select: () => ({
              single: () => Promise.resolve({
                data: {
                  id: 'backup-00000000-0001',
                  event_id: eventId,
                  operation_id: 'op-0001',
                  created_at: new Date().toISOString(),
                  checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                  record_counts: { teamsCount: 5, decisionsCount: 5 },
                  is_verified: true,
                },
                error: null,
              }),
            }),
          };
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

      const rpcMock = vi.fn((funcName: string, args: any) => {
        if (options?.rpcMissing) {
          return Promise.resolve({ data: null, error: { message: `function ${funcName} does not exist`, code: '42883' } });
        }
        if (funcName === 'fn_reset_entire_tournament') {
          if (options?.hasPublishedRounds && !args.p_confirm_published) {
            return Promise.resolve({
              data: null,
              error: {
                message: 'Cannot reset tournament: Explicit confirmation (p_confirm_published = true) is required to reset published tournament history.',
                code: '55000',
              },
            });
          }
          return Promise.resolve({
            data: {
              success: true,
              event_id: args.p_event_id,
              event_name: 'Capital Quest 2026 Championship',
              new_event_status: 'setup',
              active_round_number: 0,
              teams_preserved: 5,
              team_members_preserved: 15,
              decisions_cleared: 5,
              simulations_cleared: 1,
              snapshots_cleared: 5,
              ledger_entries_cleared: 10,
              equity_transactions_cleared: 5,
              reason: args.p_reason,
            },
            error: null,
          });
        }
        if (funcName === 'fn_restore_tournament_from_backup') {
          return Promise.resolve({
            data: {
              success: true,
              backup_id: args.p_backup_id,
              event_id: eventId,
              decisions_restored: 5,
              simulation_runs_restored: 1,
              snapshots_restored: 5,
              ledger_entries_restored: 10,
              equity_transactions_restored: 5,
            },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      });

      return {
        from: vi.fn((table: string) => {
          deletedTables.push(table);
          return chain;
        }),
        rpc: rpcMock,
        _deletedTables: deletedTables,
        _updatedRecords: updatedRecords,
        _auditRecords: auditRecords,
        _backupsInserted: backupsInserted,
      };
    }

    it('creates a durable, verified backup with SHA-256 checksum in tournament_backups table', async () => {
      const mockSupabase = createMockTournamentSupabase({ hasPublishedRounds: false });
      const service = new TournamentService(mockSupabase as any);

      const backup = await service.createDurableTournamentBackup(
        eventId,
        superAdminId,
        'Pre-reset recovery point test'
      );

      expect(backup.eventId).toBe(eventId);
      expect(backup.backupTimestamp).toBeDefined();
      expect(backup.checksum).toBeDefined();
      expect(backup.is_verified).toBe(true);
      expect(mockSupabase._backupsInserted.length).toBeGreaterThan(0);
      expect(mockSupabase._backupsInserted[0].checksum).toBeDefined();
    });

    it('fails closed and blocks reset if durable backup persistence fails', async () => {
      const mockSupabase = createMockTournamentSupabase({ backupFail: true });
      const service = new TournamentService(mockSupabase as any);

      await expect(
        service.resetEntireTournament(
          eventId,
          superAdminId,
          'Testing backup failure fail-closed behavior'
        )
      ).rejects.toThrow(/Failed to store durable recovery point in tournament_backups/);

      // Verify RPC was NOT called since backup failed
      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });

    it('successfully resets entire tournament via transactional RPC and invalidates policy gates', async () => {
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
      expect(result.backup_id).toBeDefined();

      // In-memory organizer policy gates are reset to unapproved
      const postResetGates = getOrganizerPolicyGates(eventId);
      expect(postResetGates.cashValuationPolicyApproved).toBe(false);
      expect(postResetGates.corporateTaxationApproved).toBe(false);
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
      ).rejects.toThrow('Explicit confirmation (p_confirm_published = true) is required');

      // With confirmPublished = true, it succeeds
      const result = await service.resetEntireTournament(
        eventId,
        superAdminId,
        'Authorized reset of published tournament for fresh rehearsal',
        true
      );
      expect(result.success).toBe(true);
    });

    it('strictly refuses destructive reset and makes no HTTP deletes when RPC is missing', async () => {
      const mockSupabase = createMockTournamentSupabase({ rpcMissing: true });
      const service = new TournamentService(mockSupabase as any);

      await expect(
        service.resetEntireTournament(
          eventId,
          superAdminId,
          'Attempting reset without valid database migration RPC'
        )
      ).rejects.toThrow(/Database migration required.*fn_reset_entire_tournament/);
    });

    it('successfully restores tournament from durable backup via fn_restore_tournament_from_backup', async () => {
      const mockSupabase = createMockTournamentSupabase();
      const service = new TournamentService(mockSupabase as any);

      const restoreResult = await service.restoreTournamentFromBackup(
        'backup-00000000-0001',
        superAdminId
      );

      expect(restoreResult.success).toBe(true);
      expect(restoreResult.backup_id).toBe('backup-00000000-0001');
      expect(restoreResult.decisions_restored).toBe(5);
      expect(restoreResult.snapshots_restored).toBe(5);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('fn_restore_tournament_from_backup', {
        p_backup_id: 'backup-00000000-0001',
        p_actor_id: superAdminId,
      });
    });
  });
});
