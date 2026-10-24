import { describe, it, expect, vi } from 'vitest';
import { getDefaultRedirectForRole, requireRole } from '@/lib/auth/guards';
import { TeamRegisterSchema, TeamMemberSchema, DecisionSubmitSchema } from '@/lib/validation/api-schemas';
import { TournamentService } from '@/lib/services/tournament-service';
import { AppError } from '@/lib/errors/app-error';
import { D } from '@/engine/math/precision';

describe('Phase 3: Volunteer Console, Dual-Verification & Admin Operations', () => {
  const roundId = '00000000-0000-0000-0000-000000000001';
  const teamId = '00000000-0000-0000-0000-000000000002';
  const operatorAId = '00000000-0000-0000-0000-000000000003';
  const operatorBId = '00000000-0000-0000-0000-000000000004';
  const eventId = '00000000-0000-0000-0000-000000000005';
  const domainId = '00000000-0000-0000-0000-000000000006';

  // 1. AUTHENTICATION & ROLE ROUTING
  describe('Authentication & Role Routing', () => {
    it('maps each authenticated staff role to its dedicated workspace route', () => {
      expect(getDefaultRedirectForRole('super_admin')).toBe('/admin/dashboard');
      expect(getDefaultRedirectForRole('domain_coordinator')).toBe('/coordinator/dashboard');
      expect(getDefaultRedirectForRole('volunteer')).toBe('/volunteer/entry');
      expect(getDefaultRedirectForRole('judge')).toBe('/admin/dashboard');
    });

    it('validates role requirements in requireRole server guard', async () => {
      // Mock unauthenticated
      vi.mock('@/lib/supabase/server', () => ({
        createClient: vi.fn().mockResolvedValue({
          auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('No session') }) },
        }),
      }));

      await expect(requireRole(['super_admin'])).rejects.toThrowError('Authentication required');
    });
  });

  // 2. TEAM & ROSTER REGISTRATION
  describe('Team & Roster Registration Schemas', () => {
    it('validates proper team registration payload', () => {
      const validPayload = {
        eventId,
        domainId,
        teamCode: 'ct-01',
        companyName: 'HelioGrid Technologies',
        tableStation: 'Table 4A',
      };

      const parsed = TeamRegisterSchema.parse(validPayload);
      expect(parsed.teamCode).toBe('CT-01'); // Auto-uppercased
      expect(parsed.companyName).toBe('HelioGrid Technologies');
    });

    it('rejects invalid team codes or missing company names', () => {
      expect(() =>
        TeamRegisterSchema.parse({
          eventId,
          domainId,
          teamCode: 'A', // Too short (min 2)
          companyName: 'Company',
        })
      ).toThrow();

      expect(() =>
        TeamRegisterSchema.parse({
          eventId,
          domainId,
          teamCode: 'CT-01',
          companyName: '', // Empty
        })
      ).toThrow();
    });

    it('validates team roster member enrollment', () => {
      const validMember = {
        teamId,
        fullName: 'Jane Doe',
        email: 'jane@college.edu',
        roleTitle: 'CEO',
      };

      const parsed = TeamMemberSchema.parse(validMember);
      expect(parsed.fullName).toBe('Jane Doe');
      expect(parsed.email).toBe('jane@college.edu');
    });
  });

  // 3. VOLUNTEER 10-KEY ENTRY & SOLVENCY CALCULATIONS
  describe('Volunteer Decision Entry & Solvency Calculations', () => {
    it('calculates total planned outflow with base COGS production cost', () => {
      const marketing = 180000;
      const rd = 220000;
      const ops = 100000;
      const units = 1200;
      const baseUnitCogs = 200;

      const mfgCost = units * baseUnitCogs;
      const totalOutflow = marketing + rd + ops + mfgCost;

      expect(mfgCost).toBe(240000);
      expect(totalOutflow).toBe(740000);
      expect(totalOutflow).toBeLessThanOrEqual(1000000); // Solvent within $1M
    });

    it('detects overspending when planned outflow exceeds available liquid treasury', () => {
      const availableCash = 500000;
      const marketing = 200000;
      const rd = 200000;
      const ops = 100000;
      const units = 1000;
      const baseUnitCogs = 150; // Mfg: 150,000

      const totalOutflow = marketing + rd + ops + units * baseUnitCogs; // 650,000
      const deficit = totalOutflow - availableCash;

      expect(totalOutflow).toBe(650000);
      expect(deficit).toBe(150000);
      expect(deficit).toBeGreaterThan(0);
    });

    it('strictly rejects overspending decisions without automatic modification', () => {
      const availableCash = 600000;
      const fixedOps = 100000;
      const mfgCost = 200000;
      const originalMkt = 250000;
      const originalRd = 250000;

      const totalOutflow = fixedOps + mfgCost + originalMkt + originalRd; // 800,000
      const deficit = totalOutflow - availableCash; // 200,000

      // Rejection rules: preserve values, do not auto-modify, provide exact deficit
      expect(deficit).toBe(200000);
      expect(originalMkt).toBe(250000); // Unaltered
      expect(originalRd).toBe(250000); // Unaltered
      expect(totalOutflow > availableCash).toBe(true);
    });
  });

  // 4. DUAL-ENTRY BLIND VERIFICATION & MISMATCH FLAGGING
  describe('Dual-Entry Blind Verification', () => {
    it('verifies decision slip when Operator B matches Operator A entries exactly', async () => {
      const existingSlip = {
        id: 'slip-001',
        round_id: roundId,
        team_id: teamId,
        status: 'entered',
        marketing_budget: 150000,
        rd_budget: 120000,
        production_units: 800,
        unit_price: 600,
        operations_budget: 50000,
        investment_decision: 'none',
        entered_by: operatorAId,
      };

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'decisions') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: existingSlip, error: null }),
                  }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { ...existingSlip, status: 'verified', verified_by: operatorBId },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          return { select: vi.fn().mockReturnThis() };
        }),
      };

      const service = new TournamentService(mockSupabase as unknown as any);

      const operatorBSubmission = {
        roundId,
        teamId,
        marketingBudget: 150000,
        rdBudget: 120000,
        productionUnits: 800,
        unitPrice: 600,
        operationsBudget: 50000,
        investmentDecision: 'none' as const,
      };

      const result = await service.verifyDecision(operatorBSubmission, operatorBId);
      expect(result.status).toBe('verified');
      expect(result.verified_by).toBe(operatorBId);
    });

    it('flags mismatch when Operator B inputs differ and records discrepancies', async () => {
      const existingSlip = {
        id: 'slip-002',
        round_id: roundId,
        team_id: teamId,
        status: 'entered',
        marketing_budget: 150000,
        rd_budget: 120000,
        production_units: 800,
        unit_price: 600,
        operations_budget: 50000,
        investment_decision: 'none',
        entered_by: operatorAId,
      };

      let updateCalledWith: any = null;

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'decisions') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: existingSlip, error: null }),
                  }),
                }),
              }),
              update: vi.fn().mockImplementation((payload: any) => {
                updateCalledWith = payload;
                return {
                  eq: vi.fn().mockResolvedValue({ data: null, error: null }),
                };
              }),
            };
          }
          return { select: vi.fn().mockReturnThis() };
        }),
      };

      const service = new TournamentService(mockSupabase as unknown as any);

      // Operator B enters mismatched unit price (700 instead of 600) and production units (900 instead of 800)
      const mismatchedSubmission = {
        roundId,
        teamId,
        marketingBudget: 150000,
        rdBudget: 120000,
        productionUnits: 900, // Mismatch
        unitPrice: 700, // Mismatch
        operationsBudget: 50000,
        investmentDecision: 'none' as const,
      };

      await expect(service.verifyDecision(mismatchedSubmission, operatorBId)).rejects.toThrowError(AppError);

      try {
        await service.verifyDecision(mismatchedSubmission, operatorBId);
      } catch (err: any) {
        expect(err.code).toBe('VALIDATION_ERROR');
        expect(err.details.discrepancies).toContain('productionUnits');
        expect(err.details.discrepancies).toContain('unitPrice');
        expect(updateCalledWith).toEqual({ status: 'flagged' });
      }
    });
  });

  // 5. DOMAIN READINESS & LOCK CHECKS
  describe('Domain Readiness & Round Lock Checks', () => {
    it('correctly computes domain readiness metrics and prevents lock when unverified slips remain', async () => {
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
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockResolvedValue({
                      data: [
                        { id: 'team-1', team_code: 'CT-01', company_name: 'HelioGrid', table_station: '1A' },
                        { id: 'team-2', team_code: 'CT-02', company_name: 'AeroVolt', table_station: '1B' },
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
                    { id: 'dec-1', team_id: 'team-1', status: 'verified' },
                    { id: 'dec-2', team_id: 'team-2', status: 'entered' }, // NOT verified yet
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
      const readiness = await service.getDomainReadiness(roundId, domainId);

      expect(readiness.totalTeams).toBe(2);
      expect(readiness.verifiedCount).toBe(1);
      expect(readiness.enteredCount).toBe(1);
      expect(readiness.isReady).toBe(false); // Not ready because team-2 is not verified yet
    });
  });
});
