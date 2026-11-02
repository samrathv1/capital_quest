import { describe, it, expect, vi } from 'vitest';
import { TournamentService } from '@/lib/services/tournament-service';
import { AppError } from '@/lib/errors/app-error';
import { D } from '@/engine/math/precision';
import { simulateDomainRound } from '@/engine/simulation/domain-simulation';
import { DOMAIN_ARCHETYPES } from '@/engine/config/domain-archetypes';
import { DynamicInvestmentOfferProvider } from '@/engine/config/investment-offers';
import { CompanyDecision, CompanySnapshot } from '@/engine/types';

describe('Requirement 2: Dynamic Investor Funding & Equity System Integration', () => {
  const eventId = '11111111-1111-1111-1111-111111111111';
  const round2Id = '22222222-2222-2222-2222-222222222222';
  const round1Id = '00000000-0000-0000-0000-000000000001';
  const teamId = '33333333-3333-3333-3333-333333333333';
  const adminId = '44444444-4444-4444-4444-444444444444';

  it('rejects offer retrieval on non-investment rounds (e.g. Round 1)', async () => {
    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'rounds') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: round1Id, event_id: eventId, round_number: 1, status: 'open' },
              error: null,
            }),
          };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
      }),
    };

    const service = new TournamentService(mockSupabase as unknown as any);
    await expect(
      service.getOrGenerateTeamInvestorOffers(round1Id, teamId)
    ).rejects.toThrowError('Dynamic investor funding is only available in Round 2 (Seed) and Round 4 (Series A)');
  });

  it('strictly hides Investor Confidence Score and breakdown from regular callers', async () => {
    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'rounds') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            lt: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
              data: [{ id: round1Id, round_number: 1 }],
              error: null,
            }),
            single: vi.fn().mockResolvedValue({
              data: { id: round2Id, event_id: eventId, round_number: 2, status: 'open' },
              error: null,
            }),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: round1Id, round_number: 1 },
              error: null,
            }),
          };
        }
        if (table === 'company_snapshots') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { retained_equity_pct: 100 },
              error: null,
            }),
            then: (resolve: any) =>
              resolve({
                data: [
                  {
                    round_id: round1Id,
                    team_id: teamId,
                    ending_cash: 1100000,
                    company_valuation: 450000,
                    gross_revenue: 600000,
                    net_income: 120000,
                    gross_profit: 300000,
                    is_active: true,
                  },
                ],
                error: null,
              }),
          };
        }
        if (table === 'team_investor_offers') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: null, // First time, generate
              error: null,
            }),
            upsert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'offer-record-1' }, error: null }),
              }),
            }),
          };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
      }),
    };

    const service = new TournamentService(mockSupabase as unknown as any);

    // Caller without role or regular participant
    const publicOffers = await service.getOrGenerateTeamInvestorOffers(round2Id, teamId);
    expect(publicOffers.offerA).toBeDefined();
    expect(publicOffers.offerB).toBeDefined();
    expect(publicOffers.confidenceScore).toBeUndefined();
    expect(publicOffers.confidenceTier).toBeUndefined();
    expect(publicOffers.scoringBreakdown).toBeUndefined();

    // Caller with super_admin role
    const adminOffers = await service.getOrGenerateTeamInvestorOffers(round2Id, teamId, 'super_admin');
    expect(adminOffers.confidenceScore).toBeDefined();
    expect(adminOffers.confidenceTier).toBeDefined();
    expect(adminOffers.scoringBreakdown).toBeDefined();
    expect(typeof adminOffers.confidenceScore).toBe('number');
  });

  it('confirms investment choice, locks selection, and blocks subsequent changes', async () => {
    let persistedOffer: any = {
      id: 'offer-record-1',
      round_id: round2Id,
      team_id: teamId,
      round_number: 2,
      confidence_score: 55,
      confidence_tier: 'moderate',
      offer_a_amount: 200000,
      offer_a_equity_pct: 10.0,
      offer_b_amount: 350000,
      offer_b_equity_pct: 20.0,
      selected_choice: 'none',
      is_confirmed: false,
    };

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'rounds') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: round2Id, event_id: eventId, round_number: 2, status: 'open' },
              error: null,
            }),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: round1Id, round_number: 1 },
              error: null,
            }),
          };
        }
        if (table === 'company_snapshots') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { retained_equity_pct: 100 },
              error: null,
            }),
          };
        }
        if (table === 'team_investor_offers') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockImplementation(() => Promise.resolve({ data: persistedOffer, error: null })),
            update: vi.fn().mockImplementation((vals: any) => {
              persistedOffer = { ...persistedOffer, ...vals };
              return { eq: vi.fn().mockReturnThis() };
            }),
          };
        }
        if (table === 'decisions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'decision-1', investment_decision: 'none' },
              error: null,
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
          };
        }
        if (table === 'audit_logs') {
          return {
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
      }),
    };

    const service = new TournamentService(mockSupabase as unknown as any);

    // 1. Confirm Offer A
    const res = await service.confirmTeamInvestmentChoice({
      roundId: round2Id,
      teamId,
      choice: 'offer_a',
      adminId,
    });

    expect(res.success).toBe(true);
    expect(res.selectedChoice).toBe('offer_a');
    expect(res.isConfirmed).toBe(true);
    expect(persistedOffer.is_confirmed).toBe(true);
    expect(persistedOffer.selected_choice).toBe('offer_a');

    // 2. Second confirmation attempt must be rejected (immutable lock)
    await expect(
      service.confirmTeamInvestmentChoice({
        roundId: round2Id,
        teamId,
        choice: 'offer_b',
        adminId,
      })
    ).rejects.toThrowError('Investor offer choice is already confirmed and permanently locked');
  });

  it('rejects confirmation when round is not in open status', async () => {
    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'rounds') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: round2Id, event_id: eventId, round_number: 2, status: 'draft' },
              error: null,
            }),
          };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
      }),
    };

    const service = new TournamentService(mockSupabase as unknown as any);
    await expect(
      service.confirmTeamInvestmentChoice({
        roundId: round2Id,
        teamId,
        choice: 'offer_a',
        adminId,
      })
    ).rejects.toThrowError('Investment choice confirmation is only permitted when round is open');
  });

  it('preserves locked investment choice during adminConfirmDecision while allowing business decisions to update', async () => {
    let verifiedDecision: any = null;

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'rounds') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: round2Id, event_id: eventId, round_number: 2, status: 'open' },
              error: null,
            }),
          };
        }
        if (table === 'teams') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: teamId,
                event_id: eventId,
                domains: { min_allowed_price: 50, max_allowed_price: 300, base_unit_cogs: 40 },
              },
              error: null,
            }),
          };
        }
        if (table === 'team_investor_offers') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { selected_choice: 'offer_b', is_confirmed: true },
              error: null,
            }),
          };
        }
        if (table === 'company_snapshots') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { ending_cash: 800000 }, error: null }),
          };
        }
        if (table === 'decisions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            upsert: vi.fn().mockImplementation((row: any) => {
              verifiedDecision = row;
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: 'dec-1', ...row }, error: null }),
                }),
              };
            }),
          };
        }
        if (table === 'audit_logs') {
          return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
      }),
    };

    const service = new TournamentService(mockSupabase as unknown as any);

    // Attempting to submit different investment choice 'offer_a' must be rejected
    await expect(
      service.adminConfirmDecision(
        {
          roundId: round2Id,
          teamId,
          marketingBudget: 50000,
          rdBudget: 40000,
          productionUnits: 500,
          unitPrice: 120,
          operationsBudget: 20000,
          investmentDecision: 'offer_a',
        },
        adminId
      )
    ).rejects.toThrowError('Investor offer choice is already confirmed and permanently locked');

    // Submitting with locked investment choice 'offer_b' succeeds and updates business fields
    await service.adminConfirmDecision(
      {
        roundId: round2Id,
        teamId,
        marketingBudget: 50000,
        rdBudget: 40000,
        productionUnits: 500,
        unitPrice: 120,
        operationsBudget: 20000,
        investmentDecision: 'offer_b',
      },
      adminId
    );

    expect(verifiedDecision).not.toBeNull();
    expect(verifiedDecision.marketing_budget).toBe(50000);
    expect(verifiedDecision.investment_decision).toBe('offer_b');
  });

  it('correctly executes multi-round simulation with dynamic offers and compounds dilution', () => {
    const domain = DOMAIN_ARCHETYPES.d2c;
    const provider = new DynamicInvestmentOfferProvider();

    // Round 2 Offer A: $200,000 for 10.0%
    const r2OfferA = {
      roundNumber: 2,
      offerType: 'OFFER_A' as const,
      name: 'R2 Offer A',
      cashInjection: D(200000),
      equityStakePct: D(10.0),
      impliedPostMoneyValuation: D(2000000),
      impliedPreMoneyValuation: D(1800000),
    };
    const r2OfferB = {
      roundNumber: 2,
      offerType: 'OFFER_B' as const,
      name: 'R2 Offer B',
      cashInjection: D(350000),
      equityStakePct: D(20.0),
      impliedPostMoneyValuation: D(1750000),
      impliedPreMoneyValuation: D(1400000),
    };
    provider.registerTeamOffers(teamId, r2OfferA, r2OfferB);

    // Initial Round 1 state
    const snapshotR1: CompanySnapshot = {
      teamId,
      roundNumber: 1,
      cash: D(900000),
      beginningInventoryUnits: D(0),
      inventoryAverageUnitCost: D(100),
      cumulativeRdStock: D(25),
      cumulativeBrandStock: D(20),
      retainedEquityPct: D(100),
      valuation: D(300000),
    };

    // Round 2: Accept Offer A (10.0% equity, +$200,000 cash)
    const decisionR2: CompanyDecision = {
      teamId,
      marketingBudget: D(50000),
      rdBudget: D(30000),
      operationsBudget: D(20000),
      productionUnits: D(500),
      unitPrice: D(70),
      investmentDecision: 'OFFER_A',
    };

    const resR2 = simulateDomainRound(domain, 2, [decisionR2], [snapshotR1], { offerProvider: provider });
    const teamResR2 = resR2.companyResults[0];

    // Verify cash injection is financing cash flow
    expect(teamResR2.equity.cashInjected.toNumber()).toBe(200000);
    expect(teamResR2.equity.investorEquityStakePct.toNumber()).toBe(10.0);
    // Founder equity diluted: 100% * (1 - 0.10) = 90.0000%
    expect(teamResR2.equity.postRoundRetainedEquityPct.toNumber()).toBe(90.0);
    expect(teamResR2.financial.financingCashFlow.toNumber()).toBe(200000);

    // Round 4 Series A: High tier Offer A: $250,000 for 8.0%
    const r4OfferA = {
      roundNumber: 4,
      offerType: 'OFFER_A' as const,
      name: 'R4 Offer A',
      cashInjection: D(250000),
      equityStakePct: D(8.0),
      impliedPostMoneyValuation: D(3125000),
      impliedPreMoneyValuation: D(2875000),
    };
    const r4OfferB = {
      roundNumber: 4,
      offerType: 'OFFER_B' as const,
      name: 'R4 Offer B',
      cashInjection: D(450000),
      equityStakePct: D(18.0),
      impliedPostMoneyValuation: D(2500000),
      impliedPreMoneyValuation: D(2050000),
    };
    provider.registerTeamOffers(teamId, r4OfferA, r4OfferB);

    const snapshotR3: CompanySnapshot = {
      ...teamResR2.nextSnapshot,
      roundNumber: 3,
      retainedEquityPct: D(90.0),
    };

    // Round 4: Accept Offer A (8.0% equity, +$250,000 cash)
    const decisionR4: CompanyDecision = {
      teamId,
      marketingBudget: D(60000),
      rdBudget: D(40000),
      operationsBudget: D(25000),
      productionUnits: D(600),
      unitPrice: D(75),
      investmentDecision: 'OFFER_A',
    };

    const resR4 = simulateDomainRound(domain, 4, [decisionR4], [snapshotR3], { offerProvider: provider });
    const teamResR4 = resR4.companyResults[0];

    // Founder equity after R4: 90% * (1 - 0.08) = 82.8000%
    expect(teamResR4.equity.cashInjected.toNumber()).toBe(250000);
    expect(teamResR4.equity.investorEquityStakePct.toNumber()).toBe(8.0);
    expect(teamResR4.equity.postRoundRetainedEquityPct.toNumber()).toBe(82.8);

    // Prior Seed Investor Dilution: 10.0% * (1 - 0.08) = 9.2000%
    const priorInvestorDiluted = D(10.0).mul(teamResR4.equity.dilutionFactor).toNumber();
    expect(priorInvestorDiluted).toBe(9.2);

    // Cap Table Invariant: Founders (82.8%) + Seed (9.2%) + Series A (8.0%) = 100.0000%
    const totalCapTable = teamResR4.equity.postRoundRetainedEquityPct.toNumber() + priorInvestorDiluted + 8.0;
    expect(totalCapTable).toBe(100.0);
  });

  it('enforces immutability lock in submitDecision when investor choice has already been confirmed', async () => {
    let persistedDecision: any = null;

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'rounds') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: round2Id, event_id: eventId, round_number: 2, status: 'open' },
              error: null,
            }),
          };
        }
        if (table === 'teams') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: teamId,
                event_id: eventId,
                domains: { base_unit_cogs: 28 },
              },
              error: null,
            }),
          };
        }
        if (table === 'team_investor_offers') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { selected_choice: 'offer_a', is_confirmed: true },
              error: null,
            }),
          };
        }
        if (table === 'company_snapshots') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { ending_cash: 900000 }, error: null }),
          };
        }
        if (table === 'decisions') {
          return {
            upsert: vi.fn().mockImplementation((row: any) => {
              persistedDecision = row;
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: 'dec-1', ...row }, error: null }),
                }),
              };
            }),
          };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
      }),
    };

    const service = new TournamentService(mockSupabase as unknown as any);

    // Attempting to submit different investment choice 'offer_b' must be rejected with 409
    await expect(
      service.submitDecision(
        {
          roundId: round2Id,
          teamId,
          marketingBudget: 40000,
          rdBudget: 30000,
          productionUnits: 500,
          unitPrice: 70,
          operationsBudget: 20000,
          investmentDecision: 'offer_b',
        },
        'operator-1'
      )
    ).rejects.toThrowError('Investor offer choice is already confirmed and permanently locked');

    // Submitting with matching choice 'offer_a' succeeds and preserves locked choice
    await service.submitDecision(
      {
        roundId: round2Id,
        teamId,
        marketingBudget: 40000,
        rdBudget: 30000,
        productionUnits: 500,
        unitPrice: 70,
        operationsBudget: 20000,
        investmentDecision: 'offer_a',
      },
      'operator-1'
    );

    expect(persistedDecision).not.toBeNull();
    expect(persistedDecision.investment_decision).toBe('offer_a');
  });
});
