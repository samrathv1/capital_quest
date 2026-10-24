import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeSimulationRound } from '@/lib/services/simulation-runner';
import {
  recordOrganizerApproval,
  getOrganizerPolicyGates,
} from '@/lib/services/organizer-approvals';
import { AppError } from '@/lib/errors/app-error';

describe('Phase 2: Transactional Simulation Runner & Organizer Policy Gates', () => {
  const eventId = 'test-event-uuid-001';
  const roundId = 'test-round-uuid-001';
  const adminId = 'admin-user-uuid-001';

  beforeEach(() => {
    // Reset organizer approvals
    const gates = getOrganizerPolicyGates(eventId);
    gates.cashValuationPolicyApproved = false;
    gates.corporateTaxationApproved = false;
    gates.standardVCOffersApproved = false;
    gates.proRataScalingApproved = false;
  });

  it('blocks live simulation execution when organizer policies are unapproved', async () => {
    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'rounds') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: roundId,
                event_id: eventId,
                round_number: 1,
                status: 'locked',
              },
              error: null,
            }),
          };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [], error: null }) };
      }),
      rpc: vi.fn(),
    };

    await expect(
      executeSimulationRound({
        roundId,
        adminId,
        requireOrganizerApproval: true,
        supabaseClient: mockSupabase as unknown as any,
      })
    ).rejects.toThrowError(AppError);

    try {
      await executeSimulationRound({
        roundId,
        adminId,
        requireOrganizerApproval: true,
        supabaseClient: mockSupabase as unknown as any,
      });
    } catch (err: any) {
      expect(err.code).toBe('ORGANIZER_APPROVALS_PENDING');
      expect(err.statusCode).toBe(403);
      expect(err.details.pendingPolicies.length).toBeGreaterThan(0);
    }
  });

  it('allows simulation execution once organizer approval is formally recorded', async () => {
    // Formally record organizer sign-off
    recordOrganizerApproval(eventId, {
      cashValuationPolicyApproved: true,
      corporateTaxationApproved: true,
      standardVCOffersApproved: true,
      proRataScalingApproved: true,
      approvedBy: 'Director of Entrepreneurship Tournament',
    });

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'rounds') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: roundId,
                event_id: eventId,
                round_number: 1,
                status: 'locked',
              },
              error: null,
            }),
          };
        }
        if (table === 'teams') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockImplementation((col: string) => {
              if (col === 'event_id') return { eq: vi.fn().mockResolvedValue({
                data: [
                  { id: 'team-1', domain_id: 'domain-1', team_code: 'CT-01', domains: { code: 'CLEANTECH' } },
                ],
                error: null,
              }) };
              return { data: [], error: null };
            }),
          };
        }
        if (table === 'decisions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'dec-1',
                  round_id: roundId,
                  team_id: 'team-1',
                  marketing_budget: 50000,
                  rd_budget: 30000,
                  production_units: 500,
                  unit_price: 450,
                  operations_budget: 20000,
                  investment_decision: 'none',
                },
              ],
              error: null,
            }),
          };
        }
        if (table === 'domains') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  code: 'CLEANTECH',
                  base_demand: 10000,
                  benchmark_price: 500,
                  min_allowed_price: 250,
                  max_allowed_price: 800,
                  base_unit_cogs: 180,
                },
              ],
              error: null,
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
      rpc: vi.fn().mockResolvedValue({
        data: {
          success: true,
          round_id: roundId,
          run_id: 'run-uuid-001',
          run_version: 1,
          status: 'simulated',
          snapshots_count: 1,
          ledger_count: 5,
          equity_count: 0,
        },
        error: null,
      }),
    };

    const output = await executeSimulationRound({
      roundId,
      adminId,
      requireOrganizerApproval: true,
      supabaseClient: mockSupabase as unknown as any,
    });

    expect(output.success).toBe(true);
    expect(output.status).toBe('simulated');
    expect(output.companiesSimulated).toBe(1);
    expect(output.runId).toBe('run-uuid-001');
    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      'fn_commit_simulation_run',
      expect.objectContaining({
        p_round_id: roundId,
        p_admin_id: adminId,
        p_total_companies: 1,
      })
    );
  });

  it('rejects simulation if any team decision is missing without override', async () => {
    // Record approval
    recordOrganizerApproval(eventId, {
      cashValuationPolicyApproved: true,
      corporateTaxationApproved: true,
      standardVCOffersApproved: true,
      proRataScalingApproved: true,
      approvedBy: 'Director',
    });

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'rounds') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: roundId,
                event_id: eventId,
                round_number: 1,
                status: 'locked',
              },
              error: null,
            }),
          };
        }
        if (table === 'teams') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockImplementation((col: string) => {
              if (col === 'event_id') return { eq: vi.fn().mockResolvedValue({
                data: [
                  { id: 'team-1', team_code: 'CT-01', domains: { code: 'CLEANTECH' } },
                  { id: 'team-2', team_code: 'CT-02', domains: { code: 'CLEANTECH' } },
                ],
                error: null,
              }) };
              return { data: [], error: null };
            }),
          };
        }
        if (table === 'decisions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              // Only team-1 submitted, team-2 is missing!
              data: [
                { team_id: 'team-1', marketing_budget: 10000, rd_budget: 10000, production_units: 100, unit_price: 400, operations_budget: 5000, investment_decision: 'none' },
              ],
              error: null,
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
      rpc: vi.fn(),
    };

    await expect(
      executeSimulationRound({
        roundId,
        adminId,
        requireOrganizerApproval: true,
        supabaseClient: mockSupabase as unknown as any,
      })
    ).rejects.toThrowError(AppError);

    try {
      await executeSimulationRound({
        roundId,
        adminId,
        requireOrganizerApproval: true,
        supabaseClient: mockSupabase as unknown as any,
      });
    } catch (err: any) {
      expect(err.code).toBe('MISSING_SUBMISSIONS');
      expect(err.details.missingTeams).toContain('CT-02');
    }
  });
});
