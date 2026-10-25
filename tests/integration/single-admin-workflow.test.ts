import { describe, it, expect, vi } from 'vitest';
import { TournamentService } from '@/lib/services/tournament-service';
import { AppError } from '@/lib/errors/app-error';
import { AdminDecisionConfirmInput } from '@/lib/validation/api-schemas';

describe('Single-Admin Simulator Workflow: Decision Entry, Verification, and Round Locking', () => {
  const roundId = '00000000-0000-0000-0000-000000000001';
  const teamId = '00000000-0000-0000-0000-000000000002';
  const adminId = '00000000-0000-0000-0000-000000000099';
  const eventId = '00000000-0000-0000-0000-000000000005';
  const domainId = '00000000-0000-0000-0000-000000000006';

  const mockDomain = {
    id: domainId,
    code: 'TECH',
    name: 'Technology',
    min_allowed_price: 500,
    max_allowed_price: 2000,
    benchmark_price: 1000,
    base_unit_cogs: 100,
  };

  const mockTeam = {
    id: teamId,
    team_code: 'CT-01',
    company_name: 'HelioGrid Tech',
    domain_id: domainId,
    event_id: eventId,
    is_disqualified: false,
    domains: mockDomain,
  };

  const mockRoundR1 = {
    id: roundId,
    event_id: eventId,
    round_number: 1,
    status: 'open',
    type: 'practice',
    events: { starting_capital: 1000000 },
  };

  const mockRoundR2 = {
    id: '00000000-0000-0000-0000-000000000002',
    event_id: eventId,
    round_number: 2,
    status: 'open',
    type: 'practice',
    events: { starting_capital: 1000000 },
  };

  // 1. ADMIN DECISION CONFIRMATION & AUDIT LOGGING
  describe('Admin Decision Entry & Immediate Verification', () => {
    it('directly validates and marks decision as verified with admin attribution and audit logging', async () => {
      let insertedDecision: any = null;
      let insertedAuditLog: any = null;

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'rounds') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockRoundR1, error: null }),
                }),
              }),
            };
          }
          if (table === 'teams') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockTeam, error: null }),
                }),
              }),
            };
          }
          if (table === 'domains') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockDomain, error: null }),
                }),
              }),
            };
          }
          if (table === 'decisions') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              }),
              upsert: vi.fn().mockImplementation((payload: any) => {
                insertedDecision = { ...payload, id: 'dec-100' };
                return {
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: insertedDecision, error: null }),
                  }),
                };
              }),
            };
          }
          if (table === 'audit_logs') {
            return {
              insert: vi.fn().mockImplementation((payload: any) => {
                insertedAuditLog = payload;
                return Promise.resolve({ error: null });
              }),
            };
          }
          return { select: vi.fn().mockReturnThis() };
        }),
      };

      const service = new TournamentService(mockSupabase as unknown as any);

      const input: AdminDecisionConfirmInput = {
        roundId,
        teamId,
        marketingBudget: 150000,
        rdBudget: 120000,
        productionUnits: 1000, // 1000 * $100 = $100,000
        unitPrice: 1200,       // Within [500, 2000]
        operationsBudget: 50000,
        investmentDecision: 'none',
        adminNotes: 'Direct Super Admin transcription from paper sheet #4',
      };

      const result = await service.adminConfirmDecision(input, adminId);

      expect(result.status).toBe('verified');
      expect(result.entered_by).toBe(adminId);
      expect(result.verified_by).toBe(adminId);
      expect(result.verified_at).toBeDefined();
      expect(result.admin_override_notes).toBe('Direct Super Admin transcription from paper sheet #4');

      // Check audit log
      expect(insertedAuditLog).toBeDefined();
      expect(insertedAuditLog.action).toBe('ADMIN_CONFIRM_DECISION');
      expect(insertedAuditLog.actor_id).toBe(adminId);
      expect(insertedAuditLog.entity_id).toBe('dec-100');
    });

    it('updates existing un-locked decision without creating duplicate rows (idempotency)', async () => {
      const existingDecision = {
        id: 'existing-dec-01',
        round_id: roundId,
        team_id: teamId,
        status: 'entered',
        entered_by: 'volunteer-01',
        marketing_budget: 100000,
        rd_budget: 100000,
        production_units: 500,
        unit_price: 1000,
        operations_budget: 50000,
        investment_decision: 'none',
      };

      let upsertPayload: any = null;

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'rounds') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockRoundR1, error: null }),
                }),
              }),
            };
          }
          if (table === 'teams') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockTeam, error: null }),
                }),
              }),
            };
          }
          if (table === 'domains') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockDomain, error: null }),
                }),
              }),
            };
          }
          if (table === 'decisions') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: existingDecision, error: null }),
                  }),
                }),
              }),
              upsert: vi.fn().mockImplementation((payload: any) => {
                upsertPayload = payload;
                return {
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: { ...payload, id: existingDecision.id }, error: null }),
                  }),
                };
              }),
            };
          }
          if (table === 'audit_logs') {
            return { insert: vi.fn().mockResolvedValue({ error: null }) };
          }
          return { select: vi.fn().mockReturnThis() };
        }),
      };

      const service = new TournamentService(mockSupabase as unknown as any);

      const input: AdminDecisionConfirmInput = {
        roundId,
        teamId,
        marketingBudget: 180000,
        rdBudget: 150000,
        productionUnits: 800,
        unitPrice: 1100,
        operationsBudget: 60000,
        investmentDecision: 'none',
        adminNotes: 'Super Admin reviewed and confirmed volunteer slip',
      };

      const result = await service.adminConfirmDecision(input, adminId);

      // Preserves original entered_by attribution while updating verified_by
      expect(upsertPayload.entered_by).toBe('volunteer-01');
      expect(upsertPayload.verified_by).toBe(adminId);
      expect(upsertPayload.status).toBe('verified');
      expect(result.id).toBe('existing-dec-01');
    });
  });

  // 2. SOLVENCY & OVERSPENDING ENFORCEMENT
  describe('Solvency Enforcement', () => {
    it('strictly rejects overspending decisions and returns exact cash deficit', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'rounds') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockRoundR1, error: null }),
                }),
              }),
            };
          }
          if (table === 'teams') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockTeam, error: null }),
                }),
              }),
            };
          }
          if (table === 'domains') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockDomain, error: null }),
                }),
              }),
            };
          }
          if (table === 'decisions') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              }),
            };
          }
          return { select: vi.fn().mockReturnThis() };
        }),
      };

      const service = new TournamentService(mockSupabase as unknown as any);

      // Total available cash is $1,000,000
      // Outflows: 400k + 400k + 200k + (2000 * 100 = 200k) = $1,200,000 (Deficit: $200,000)
      const overspendingInput: AdminDecisionConfirmInput = {
        roundId,
        teamId,
        marketingBudget: 400000,
        rdBudget: 400000,
        productionUnits: 2000,
        unitPrice: 1000,
        operationsBudget: 200000,
        investmentDecision: 'none',
      };

      await expect(service.adminConfirmDecision(overspendingInput, adminId)).rejects.toThrowError(AppError);

      try {
        await service.adminConfirmDecision(overspendingInput, adminId);
      } catch (err: any) {
        expect(err.code).toBe('OVERSPENT_BUDGET');
        expect(err.message).toContain('exceeds available liquid cash');
        expect(err.details.deficit).toBe(200000);
        expect(err.details.totalOutflow).toBe(1200000);
        expect(err.details.availableCash).toBe(1000000);
      }
    });

    it('carries forward reduced treasury into Round 2 and enforces solvency against actual balance', async () => {
      // In Round 2, team has only $350,000 ending cash from Round 1
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'rounds') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockImplementation((col: string, val: any) => {
                  if (col === 'id') {
                    return {
                      single: vi.fn().mockResolvedValue({ data: mockRoundR2, error: null }),
                    };
                  }
                  if (col === 'event_id') {
                    return {
                      eq: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({ data: { id: roundId }, error: null }),
                      }),
                    };
                  }
                  return { single: vi.fn().mockResolvedValue({ data: null, error: null }) };
                }),
              }),
            };
          }
          if (table === 'company_snapshots') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      single: vi.fn().mockResolvedValue({
                        data: { ending_cash: 350000 },
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'teams') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockTeam, error: null }),
                }),
              }),
            };
          }
          if (table === 'domains') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockDomain, error: null }),
                }),
              }),
            };
          }
          if (table === 'decisions') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              }),
            };
          }
          return { select: vi.fn().mockReturnThis() };
        }),
      };

      const service = new TournamentService(mockSupabase as unknown as any);

      // Spend of $400,000 against $350,000 carry-forward cash must fail
      const input: AdminDecisionConfirmInput = {
        roundId: mockRoundR2.id,
        teamId,
        marketingBudget: 150000,
        rdBudget: 150000,
        productionUnits: 500, // 500 * $100 = $50,000
        unitPrice: 1000,
        operationsBudget: 50000, // Total = $400,000
        investmentDecision: 'none',
      };

      await expect(service.adminConfirmDecision(input, adminId)).rejects.toThrowError(AppError);

      try {
        await service.adminConfirmDecision(input, adminId);
      } catch (err: any) {
        expect(err.code).toBe('OVERSPENT_BUDGET');
        expect(err.details.availableCash).toBe(350000);
        expect(err.details.totalOutflow).toBe(400000);
        expect(err.details.deficit).toBe(50000);
      }
    });
  });

  // 3. DOMAIN & INVESTMENT CONSTRAINTS
  describe('Domain Price Bounds & Investment Windows', () => {
    it('rejects unit prices outside domain bounds', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'rounds') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockRoundR1, error: null }),
                }),
              }),
            };
          }
          if (table === 'teams') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockTeam, error: null }),
                }),
              }),
            };
          }
          if (table === 'domains') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockDomain, error: null }),
                }),
              }),
            };
          }
          return { select: vi.fn().mockReturnThis() };
        }),
      };

      const service = new TournamentService(mockSupabase as unknown as any);

      // min_allowed_price is 500, entry is 450
      const belowMin: AdminDecisionConfirmInput = {
        roundId,
        teamId,
        marketingBudget: 50000,
        rdBudget: 50000,
        productionUnits: 100,
        unitPrice: 450,
        operationsBudget: 10000,
        investmentDecision: 'none',
      };

      await expect(service.adminConfirmDecision(belowMin, adminId)).rejects.toThrowError(
        /outside allowed domain bounds/
      );

      // max_allowed_price is 2000, entry is 2500
      const aboveMax: AdminDecisionConfirmInput = {
        roundId,
        teamId,
        marketingBudget: 50000,
        rdBudget: 50000,
        productionUnits: 100,
        unitPrice: 2500,
        operationsBudget: 10000,
        investmentDecision: 'none',
      };

      await expect(service.adminConfirmDecision(aboveMax, adminId)).rejects.toThrowError(
        /outside allowed domain bounds/
      );
    });

    it('rejects investment options in Round 1 and permits them in Round 2', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'rounds') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockImplementation((col: string, val: any) => {
                  if (val === roundId) {
                    return { single: vi.fn().mockResolvedValue({ data: mockRoundR1, error: null }) };
                  }
                  return { single: vi.fn().mockResolvedValue({ data: mockRoundR2, error: null }) };
                }),
              }),
            };
          }
          if (table === 'teams') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockTeam, error: null }),
                }),
              }),
            };
          }
          if (table === 'domains') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockDomain, error: null }),
                }),
              }),
            };
          }
          return { select: vi.fn().mockReturnThis() };
        }),
      };

      const service = new TournamentService(mockSupabase as unknown as any);

      // Round 1 with option_a should fail
      const r1Investment: AdminDecisionConfirmInput = {
        roundId,
        teamId,
        marketingBudget: 50000,
        rdBudget: 50000,
        productionUnits: 100,
        unitPrice: 1000,
        operationsBudget: 10000,
        investmentDecision: 'offer_a',
      };

      await expect(service.adminConfirmDecision(r1Investment, adminId)).rejects.toThrowError(
        /strictly restricted to Seed/
      );
    });

    it('strictly rejects decision confirmation if target round is in DRAFT status', async () => {
      const mockRoundDraft = {
        id: 'draft-round-id',
        event_id: eventId,
        round_number: 1,
        status: 'draft',
        type: 'regular',
        events: { starting_capital: 1000000 },
      };

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'rounds') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockRoundDraft, error: null }),
                }),
              }),
            };
          }
          return { select: vi.fn().mockReturnThis() };
        }),
      };

      const service = new TournamentService(mockSupabase as unknown as any);

      const input: AdminDecisionConfirmInput = {
        roundId: 'draft-round-id',
        teamId,
        marketingBudget: 50000,
        rdBudget: 50000,
        productionUnits: 100,
        unitPrice: 1000,
        operationsBudget: 10000,
        investmentDecision: 'none',
      };

      await expect(service.adminConfirmDecision(input, adminId)).rejects.toThrowError(AppError);

      try {
        await service.adminConfirmDecision(input, adminId);
      } catch (err: any) {
        expect(err.code).toBe('ROUND_NOT_OPEN');
        expect(err.message).toContain('Round is not open for decision entry. Current status: draft');
      }
    });

    it('resolves active round correctly to earliest round ascending when no round is open', () => {
      const roundsInDb = [
        { id: 'r1-id', round_number: 1, status: 'draft', event_id: eventId },
        { id: 'r2-id', round_number: 2, status: 'draft', event_id: eventId },
        { id: 'r3-id', round_number: 3, status: 'draft', event_id: eventId },
        { id: 'r4-id', round_number: 4, status: 'draft', event_id: eventId },
        { id: 'r5-id', round_number: 5, status: 'draft', event_id: eventId },
      ];

      // Verifies that when no round is open, targetRound selects Round 1, not Round 5
      const activeEvent = { id: eventId, active_round_number: 0 };
      const openRound = roundsInDb.find(r => r.status === 'open');
      expect(openRound).toBeUndefined();

      const targetRoundNumber = activeEvent.active_round_number && activeEvent.active_round_number > 0
        ? activeEvent.active_round_number
        : 1;

      const targetRound = roundsInDb.find(r => r.round_number === targetRoundNumber);
      expect(targetRound).toBeDefined();
      expect(targetRound?.round_number).toBe(1);
      expect(targetRound?.id).toBe('r1-id');
    });
  });

  // 4. PRE-FLIGHT LOCK GATE
  describe('Round Locking Gate & Immutability', () => {
    it('blocks round locking when any team decision is unverified', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'rounds') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: roundId, round_number: 1, status: 'open', event_id: eventId },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'teams') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({
                    data: [
                      { id: 'team-1', team_code: 'CT-01' },
                      { id: 'team-2', team_code: 'CT-02' },
                    ],
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'decisions') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [
                    { id: 'dec-1', team_id: 'team-1', status: 'verified' },
                    { id: 'dec-2', team_id: 'team-2', status: 'entered' }, // NOT verified
                  ],
                  error: null,
                }),
              }),
            };
          }
          return { select: vi.fn().mockReturnThis() };
        }),
      };

      const service = new TournamentService(mockSupabase as unknown as any);

      await expect(service.lockRound(roundId, adminId, false)).rejects.toThrowError(AppError);

      try {
        await service.lockRound(roundId, adminId, false);
      } catch (err: any) {
        expect(err.code).toBe('UNVERIFIED_SUBMISSIONS');
        expect(err.details.unverifiedCount).toBe(1);
      }
    });

    it('locks cleanly when 100% of team decisions are verified', async () => {
      let updatedRound: any = null;
      let lockedDecisionsCalled = false;

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'rounds') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: roundId, round_number: 1, status: 'open', event_id: eventId },
                    error: null,
                  }),
                }),
              }),
              update: vi.fn().mockImplementation((payload: any) => {
                updatedRound = payload;
                return {
                  eq: vi.fn().mockReturnValue({
                    select: vi.fn().mockReturnValue({
                      single: vi.fn().mockResolvedValue({
                        data: { id: roundId, round_number: 1, status: 'locked', locked_at: new Date().toISOString() },
                        error: null,
                      }),
                    }),
                  }),
                };
              }),
            };
          }
          if (table === 'teams') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({
                    data: [
                      { id: 'team-1', team_code: 'CT-01' },
                      { id: 'team-2', team_code: 'CT-02' },
                    ],
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'decisions') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [
                    { id: 'dec-1', team_id: 'team-1', status: 'verified' },
                    { id: 'dec-2', team_id: 'team-2', status: 'verified' },
                  ],
                  error: null,
                }),
              }),
              update: vi.fn().mockImplementation(() => {
                lockedDecisionsCalled = true;
                return { eq: vi.fn().mockResolvedValue({ error: null }) };
              }),
            };
          }
          if (table === 'audit_logs') {
            return { insert: vi.fn().mockResolvedValue({ error: null }) };
          }
          return { select: vi.fn().mockReturnThis() };
        }),
      };

      const service = new TournamentService(mockSupabase as unknown as any);

      const locked = await service.lockRound(roundId, adminId, false);
      expect(locked.status).toBe('locked');
      expect(lockedDecisionsCalled).toBe(true);
      expect(updatedRound.status).toBe('locked');
    });

    it('prevents modifying decisions once locked', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'rounds') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { ...mockRoundR1, status: 'locked' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'teams') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockTeam, error: null }),
                }),
              }),
            };
          }
          return { select: vi.fn().mockReturnThis() };
        }),
      };

      const service = new TournamentService(mockSupabase as unknown as any);

      const input: AdminDecisionConfirmInput = {
        roundId,
        teamId,
        marketingBudget: 100000,
        rdBudget: 100000,
        productionUnits: 500,
        unitPrice: 1000,
        operationsBudget: 50000,
        investmentDecision: 'none',
      };

      await expect(service.adminConfirmDecision(input, adminId)).rejects.toThrowError(
        /Round is not open for decision entry/
      );
    });
  });

  // 5. QUERYING ADMIN ROUND DECISIONS & TELEMETRY
  describe('Admin Decision Telemetry & Roster Querying', () => {
    it('aggregates team roster, domain bounds, and verified status for the single admin console', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'rounds') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockRoundR1, error: null }),
                }),
              }),
            };
          }
          if (table === 'teams') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue({
                      data: [
                        {
                          id: 't-1',
                          team_code: 'CT-01',
                          company_name: 'Alpha Energy',
                          table_station: '1',
                          domain_id: domainId,
                          domains: mockDomain,
                        },
                        {
                          id: 't-2',
                          team_code: 'CT-02',
                          company_name: 'Beta Power',
                          table_station: '2',
                          domain_id: domainId,
                          domains: mockDomain,
                        },
                      ],
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'decisions') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'd-1',
                      team_id: 't-1',
                      status: 'verified',
                      marketing_budget: 150000,
                      rd_budget: 100000,
                      production_units: 1000,
                      unit_price: 1100,
                      operations_budget: 50000,
                      investment_decision: 'none',
                    },
                  ],
                  error: null,
                }),
              }),
            };
          }
          return { select: vi.fn().mockReturnThis() };
        }),
      };

      const service = new TournamentService(mockSupabase as unknown as any);
      const data = await service.getAdminRoundDecisions(roundId);

      expect(data.stats.total).toBe(2);
      expect(data.stats.verifiedCount).toBe(1);
      expect(data.stats.missingCount).toBe(1);
      expect(data.stats.isReadyToLock).toBe(false);

      expect(data.teams[0].decision?.status).toBe('verified');
      expect(data.teams[1].decision).toBeNull();
      expect(data.teams[0].minAllowedPrice).toBe(500);
      expect(data.teams[0].maxAllowedPrice).toBe(2000);
      expect(data.teams[0].availableCash).toBe(1000000);
    });
  });
});
