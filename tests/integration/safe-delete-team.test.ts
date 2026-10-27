import { describe, it, expect, vi } from 'vitest';
import { TournamentService } from '@/lib/services/tournament-service';
import { AppError } from '@/lib/errors/app-error';

describe('Safe Team Deletion: Integrity & Dependency Rules', () => {
  const eventId = '11111111-1111-1111-1111-111111111111';
  const teamId = '22222222-2222-2222-2222-222222222222';
  const otherTeamId = '33333333-3333-3333-3333-333333333333';
  const adminId = '99999999-9999-9999-9999-999999999999';

  const mockTeam = {
    id: teamId,
    event_id: eventId,
    domain_id: 'domain-1',
    team_code: 'TEST-01',
    company_name: 'Test Venture Corp',
    table_station: 'Table 1A',
  };

  it('allows Super Admin to delete an eligible team with no decisions or simulation history', async () => {
    let teamDeleted = false;
    let membersDeleted = false;
    let auditLogged = false;

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'teams') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: mockTeam, error: null }),
            delete: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation(() => {
                teamDeleted = true;
                return Promise.resolve({ error: null });
              }),
            })),
          };
        }
        if (table === 'rounds') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: [], error: null }), // No simulated rounds
          };
        }
        if (table === 'decisions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [], error: null }), // No decisions
            delete: vi.fn().mockReturnThis(),
          };
        }
        if (table === 'company_snapshots') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ count: 0, error: null }), // No snapshots
          };
        }
        if (table === 'financial_ledger') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ count: 0, error: null }), // No ledger
          };
        }
        if (table === 'equity_transactions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ count: 0, error: null }), // No equity
          };
        }
        if (table === 'team_members') {
          return {
            delete: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation(() => {
                membersDeleted = true;
                return Promise.resolve({ error: null });
              }),
            })),
          };
        }
        if (table === 'audit_logs') {
          return {
            insert: vi.fn().mockImplementation((payload: any) => {
              if (payload.action === 'team.delete' && payload.entity_id === teamId) {
                auditLogged = true;
              }
              return Promise.resolve({ error: null });
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    };

    const service = new TournamentService(mockSupabase as any);
    const result = await service.deleteTeam(teamId, adminId);

    expect(result.success).toBe(true);
    expect(result.deletedTeam.teamCode).toBe('TEST-01');
    expect(teamDeleted).toBe(true);
    expect(membersDeleted).toBe(true);
    expect(auditLogged).toBe(true);
  });

  it('safely cleans up dependent team members and unsubmitted decision placeholders', async () => {
    let unsubmittedDecisionsDeleted = false;
    let membersDeleted = false;

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'teams') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: mockTeam, error: null }),
            delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === 'rounds') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        if (table === 'decisions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: [{ id: 'dec-1', round_id: 'r1', status: 'unsubmitted' }],
              error: null,
            }),
            delete: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation(() => ({
                in: vi.fn().mockImplementation(() => {
                  unsubmittedDecisionsDeleted = true;
                  return Promise.resolve({ error: null });
                }),
              })),
            })),
          };
        }
        if (table === 'team_members') {
          return {
            delete: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation(() => {
                membersDeleted = true;
                return Promise.resolve({ error: null });
              }),
            })),
          };
        }
        if (table === 'company_snapshots' || table === 'financial_ledger' || table === 'equity_transactions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
          };
        }
        if (table === 'audit_logs') {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
      }),
    };

    const service = new TournamentService(mockSupabase as any);
    await service.deleteTeam(teamId, adminId);

    expect(unsubmittedDecisionsDeleted).toBe(true);
    expect(membersDeleted).toBe(true);
  });

  it('blocks deletion if tournament round has already been simulated', async () => {
    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'teams') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: mockTeam, error: null }),
          };
        }
        if (table === 'rounds') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({
              data: [{ id: 'r1', round_number: 1, status: 'simulated' }],
              error: null,
            }),
          };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
      }),
    };

    const service = new TournamentService(mockSupabase as any);

    await expect(service.deleteTeam(teamId, adminId)).rejects.toThrowError(AppError);

    try {
      await service.deleteTeam(teamId, adminId);
    } catch (err: any) {
      expect(err.code).toBe('CASCADE_GUARD_VIOLATION');
      expect(err.message).toContain('Tournament Round(s) [1] have already been simulated');
    }
  });

  it('blocks deletion if team has verified or locked decisions', async () => {
    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'teams') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: mockTeam, error: null }),
          };
        }
        if (table === 'rounds') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        if (table === 'decisions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: [{ id: 'dec-1', round_id: 'r1', status: 'verified' }],
              error: null,
            }),
          };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
      }),
    };

    const service = new TournamentService(mockSupabase as any);

    await expect(service.deleteTeam(teamId, adminId)).rejects.toThrowError(AppError);

    try {
      await service.deleteTeam(teamId, adminId);
    } catch (err: any) {
      expect(err.code).toBe('CASCADE_GUARD_VIOLATION');
      expect(err.message).toContain('verified or locked decision(s)');
    }
  });

  it('allows Super Admin to delete a team with an ENTERED (unverified) decision, safely cleaning it up', async () => {
    let enteredDecisionsCleaned = false;
    let teamDeleted = false;
    let membersDeleted = false;

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'teams') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: mockTeam, error: null }),
            delete: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation(() => {
                teamDeleted = true;
                return Promise.resolve({ error: null });
              }),
            })),
          };
        }
        if (table === 'rounds') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        if (table === 'decisions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: [{ id: 'dec-entered-1', round_id: 'r1', status: 'entered' }],
              error: null,
            }),
            delete: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation(() => ({
                in: vi.fn().mockImplementation(() => {
                  enteredDecisionsCleaned = true;
                  return Promise.resolve({ error: null });
                }),
              })),
            })),
          };
        }
        if (table === 'team_members') {
          return {
            delete: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation(() => {
                membersDeleted = true;
                return Promise.resolve({ error: null });
              }),
            })),
          };
        }
        if (table === 'company_snapshots' || table === 'financial_ledger' || table === 'equity_transactions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
          };
        }
        if (table === 'audit_logs') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
      }),
    };

    const service = new TournamentService(mockSupabase as any);
    const result = await service.deleteTeam(teamId, adminId);

    expect(result.success).toBe(true);
    expect(teamDeleted).toBe(true);
    expect(membersDeleted).toBe(true);
    expect(enteredDecisionsCleaned).toBe(true);
  });

  it('blocks deletion if team has simulation snapshots recorded', async () => {
    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'teams') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: mockTeam, error: null }),
          };
        }
        if (table === 'rounds') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        if (table === 'decisions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        if (table === 'company_snapshots') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ count: 1, error: null }),
          };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
      }),
    };

    const service = new TournamentService(mockSupabase as any);

    try {
      await service.deleteTeam(teamId, adminId);
      expect.fail('Should have thrown AppError');
    } catch (err: any) {
      expect(err.code).toBe('CASCADE_GUARD_VIOLATION');
      expect(err.message).toContain('simulation result snapshot(s)');
    }
  });

  it('blocks deletion if team has financial ledger history', async () => {
    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'teams') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: mockTeam, error: null }),
          };
        }
        if (table === 'rounds') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        if (table === 'decisions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        if (table === 'company_snapshots') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
          };
        }
        if (table === 'financial_ledger') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ count: 3, error: null }),
          };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
      }),
    };

    const service = new TournamentService(mockSupabase as any);

    try {
      await service.deleteTeam(teamId, adminId);
      expect.fail('Should have thrown AppError');
    } catch (err: any) {
      expect(err.code).toBe('CASCADE_GUARD_VIOLATION');
      expect(err.message).toContain('Financial ledger records exist');
    }
  });

  it('blocks deletion if team has equity transactions recorded', async () => {
    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'teams') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: mockTeam, error: null }),
          };
        }
        if (table === 'rounds') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        if (table === 'decisions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        if (table === 'company_snapshots') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
          };
        }
        if (table === 'financial_ledger') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
          };
        }
        if (table === 'equity_transactions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ count: 2, error: null }),
          };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
      }),
    };

    const service = new TournamentService(mockSupabase as any);

    try {
      await service.deleteTeam(teamId, adminId);
      expect.fail('Should have thrown AppError');
    } catch (err: any) {
      expect(err.code).toBe('CASCADE_GUARD_VIOLATION');
      expect(err.message).toContain('Cap table or equity transactions exist');
    }
  });

  it('handles repeated deletion gracefully when team is already deleted (404 NOT_FOUND)', async () => {
    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'teams') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }), // Already deleted
          };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
      }),
    };

    const service = new TournamentService(mockSupabase as any);

    try {
      await service.deleteTeam(teamId, adminId);
      expect.fail('Should have thrown 404 AppError');
    } catch (err: any) {
      expect(err.code).toBe('NOT_FOUND');
      expect(err.statusCode).toBe(404);
      expect(err.message).toContain('Team not found or already deleted');
    }
  });

  it('leaves other teams completely unaffected', async () => {
    const deletedIds: string[] = [];

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'teams') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: mockTeam, error: null }),
            delete: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation((field: string, id: string) => {
                deletedIds.push(id);
                return Promise.resolve({ error: null });
              }),
            })),
          };
        }
        if (table === 'rounds') {
          return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: [] }) };
        }
        if (table === 'decisions') {
          return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [] }) };
        }
        if (table === 'company_snapshots' || table === 'financial_ledger' || table === 'equity_transactions') {
          return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ count: 0 }) };
        }
        if (table === 'team_members') {
          return { delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) };
        }
        if (table === 'audit_logs') {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
      }),
    };

    const service = new TournamentService(mockSupabase as any);
    await service.deleteTeam(teamId, adminId);

    expect(deletedIds).toContain(teamId);
    expect(deletedIds).not.toContain(otherTeamId);
  });

  it('invokes fn_safe_delete_team atomic RPC when available in Supabase', async () => {
    let rpcCalledWith: any = null;

    const mockSupabase = {
      rpc: vi.fn().mockImplementation((fnName: string, params: any) => {
        if (fnName === 'fn_safe_delete_team') {
          rpcCalledWith = params;
          return Promise.resolve({
            data: {
              success: true,
              deletedTeam: {
                id: teamId,
                teamCode: 'TEST-01',
                companyName: 'Test Venture Corp',
              },
            },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: { message: 'function not found' } });
      }),
      from: vi.fn(),
    };

    const service = new TournamentService(mockSupabase as any);
    const result = await service.deleteTeam(teamId, adminId);

    expect(result.success).toBe(true);
    expect(result.deletedTeam.teamCode).toBe('TEST-01');
    expect(rpcCalledWith).toEqual({
      p_team_id: teamId,
      p_actor_id: adminId,
    });
    // Verifies that when RPC succeeds, no separate fallback from() calls were needed
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('translates RPC database constraint violations into AppError CASCADE_GUARD_VIOLATION', async () => {
    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: '23503',
          message: "Cannot delete team 'TEST-01': Team has 1 submitted or verified decision(s) in active rounds.",
        },
      }),
      from: vi.fn(),
    };

    const service = new TournamentService(mockSupabase as any);

    try {
      await service.deleteTeam(teamId, adminId);
      expect.fail('Should have thrown AppError');
    } catch (err: any) {
      expect(err.code).toBe('CASCADE_GUARD_VIOLATION');
      expect(err.statusCode).toBe(409);
      expect(err.message).toContain('submitted or verified decision(s)');
    }
  });
});
