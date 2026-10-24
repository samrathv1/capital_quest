import { describe, it, expect, vi } from 'vitest';
import { TournamentService } from '@/lib/services/tournament-service';
import { AppError } from '@/lib/errors/app-error';

describe('Phase 2: Backend Operations & Role Permissions', () => {
  const roundId = '00000000-0000-0000-0000-000000000001';
  const teamId = '00000000-0000-0000-0000-000000000002';
  const operatorId = '00000000-0000-0000-0000-000000000003';

  it('rejects decision submission when planned cash outflow exceeds available cash', async () => {
    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'rounds') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: roundId, round_number: 1, status: 'open', event_id: 'event-1' },
              error: null,
            }),
          };
        }
        if (table === 'teams') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: teamId, domain_id: 'domain-1', domains: { base_unit_cogs: 200 } },
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
    };

    const service = new TournamentService(mockSupabase as unknown as any);

    // Initial cash is $1,000,000.
    // Outflow: Marketing $500k + RD $400k + Ops $200k + 1,000 units * $200 COGS ($200k) = $1.3 Million (Exceeds $1M by $300k!)
    const overspentDecision = {
      roundId,
      teamId,
      marketingBudget: 500000,
      rdBudget: 400000,
      productionUnits: 1000,
      unitPrice: 500,
      operationsBudget: 200000,
      investmentDecision: 'none' as const,
    };

    await expect(service.submitDecision(overspentDecision, operatorId)).rejects.toThrowError(AppError);

    try {
      await service.submitDecision(overspentDecision, operatorId);
    } catch (err: any) {
      expect(err.code).toBe('OVERSPENT_BUDGET');
      expect(err.statusCode).toBe(422);
      expect(Number(err.details.deficit)).toBeGreaterThan(0);
    }
  });

  it('verifies decision when second operator input matches exactly', async () => {
    const existingDecision = {
      id: 'dec-1',
      round_id: roundId,
      team_id: teamId,
      status: 'entered',
      marketing_budget: 20000,
      rd_budget: 30000,
      production_units: 400,
      unit_price: 150,
      operations_budget: 10000,
      investment_decision: 'none',
    };

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'decisions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: existingDecision, error: null }),
            })),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { ...existingDecision, status: 'verified', verified_by: operatorId },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      }),
    };

    const service = new TournamentService(mockSupabase as unknown as any);

    const verified = await service.verifyDecision(
      {
        roundId,
        teamId,
        marketingBudget: 20000,
        rdBudget: 30000,
        productionUnits: 400,
        unitPrice: 150,
        operationsBudget: 10000,
        investmentDecision: 'none',
      },
      operatorId
    );

    expect(verified.status).toBe('verified');
  });

  it('flags decision as FLAGGED when verification input differs', async () => {
    const existingDecision = {
      id: 'dec-1',
      round_id: roundId,
      team_id: teamId,
      status: 'entered',
      marketing_budget: 20000,
      rd_budget: 30000,
      production_units: 400,
      unit_price: 150,
      operations_budget: 10000,
      investment_decision: 'none',
    };

    const updateSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) });

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'decisions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: existingDecision, error: null }),
            })),
            update: updateSpy,
          };
        }
        return {};
      }),
    };

    const service = new TournamentService(mockSupabase as unknown as any);

    // Operator 2 enters unitPrice 180 instead of 150 (mismatch!)
    await expect(
      service.verifyDecision(
        {
          roundId,
          teamId,
          marketingBudget: 20000,
          rdBudget: 30000,
          productionUnits: 400,
          unitPrice: 180, // Mismatch!
          operationsBudget: 10000,
          investmentDecision: 'none',
        },
        operatorId
      )
    ).rejects.toThrowError(AppError);

    expect(updateSpy).toHaveBeenCalledWith({ status: 'flagged' });
  });

  it('correctly invokes atomic non-destructive void stored procedure', async () => {
    const rpcSpy = vi.fn().mockResolvedValue({
      data: {
        success: true,
        round_id: roundId,
        previous_status: 'simulated',
        new_status: 'locked',
        voided_simulation_run_id: 'run-1',
        voided_snapshots: 4,
        voided_ledger_entries: 24,
        voided_equity_records: 0,
      },
      error: null,
    });

    const mockSupabase = {
      rpc: rpcSpy,
    };

    const service = new TournamentService(mockSupabase as unknown as any);

    const result = await service.voidRound(roundId, operatorId, {
      adminPasswordConfirm: 'super-admin-pass-123',
      reason: 'Audit correction: Volunteer transcription error on company CT-02 slip.',
    });

    expect(result.success).toBe(true);
    expect(result.new_status).toBe('locked');
    expect(rpcSpy).toHaveBeenCalledWith('fn_void_or_supersede_round', {
      p_round_id: roundId,
      p_admin_id: operatorId,
      p_void_reason: 'Audit correction: Volunteer transcription error on company CT-02 slip.',
    });
  });
});
