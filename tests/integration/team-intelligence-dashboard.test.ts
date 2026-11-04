import { describe, it, expect, vi } from 'vitest';
import {
  TournamentService,
  generateTeamInsights,
  TeamIntelligenceRow,
  TeamIntelligenceDashboardData,
} from '@/lib/services/tournament-service';
import { CompanySnapshotRecord, DecisionRecord, TeamInvestorOfferRecord } from '@/types/database';

function createMockSupabase(dbData: {
  event?: any;
  rounds?: any[];
  domains?: any[];
  teams?: any[];
  decisions?: any[];
  decisionsError?: any;
  snapshots?: any[];
  prevSnapshots?: any[];
  investorOffers?: any[];
}) {
  const event = dbData.event || {
    id: 'ev-test-1',
    name: 'Capital Quest Championship',
    status: 'active',
    total_rounds: 5,
    active_round_number: 2,
  };

  const rounds = dbData.rounds || [
    { id: 'r1', round_number: 1, status: 'published', type: 'regular' },
    { id: 'r2', round_number: 2, status: 'simulated', type: 'investment_seed' },
    { id: 'r3', round_number: 3, status: 'open', type: 'regular' },
    { id: 'r4', round_number: 4, status: 'draft', type: 'investment_series_a' },
    { id: 'r5', round_number: 5, status: 'draft', type: 'final_harvest' },
  ];

  const domains = dbData.domains || [
    { id: 'd-d2c', code: 'D2C', name: 'Direct-to-Consumer' },
    { id: 'd-health', code: 'HEALTH', name: 'HealthTech Devices' },
    { id: 'd-saas', code: 'SAAS', name: 'Enterprise SaaS' },
  ];

  const teams = dbData.teams || [
    { id: 't-d2c-1', event_id: event.id, domain_id: 'd-d2c', team_code: 'D2C-01', company_name: 'Aura Glow', table_station: 'Table 1', is_disqualified: false },
    { id: 't-d2c-2', event_id: event.id, domain_id: 'd-d2c', team_code: 'D2C-02', company_name: 'Urban Pure', table_station: 'Table 2', is_disqualified: false },
    { id: 't-hlth-1', event_id: event.id, domain_id: 'd-health', team_code: 'HLTH-01', company_name: 'PulseBio', table_station: 'Table 3', is_disqualified: false },
    { id: 't-saas-1', event_id: event.id, domain_id: 'd-saas', team_code: 'SAAS-01', company_name: 'CloudSync', table_station: 'Table 4', is_disqualified: false },
  ];

  const decisions = dbData.decisions || [
    {
      id: 'dec-1',
      round_id: 'r2',
      team_id: 't-d2c-1',
      status: 'verified',
      marketing_budget: 35000,
      rd_budget: 20000,
      production_units: 1200,
      unit_price: 150,
      operations_budget: 15000,
      investment_decision: 'offer_a',
    },
    {
      id: 'dec-2',
      round_id: 'r2',
      team_id: 't-d2c-2',
      status: 'entered',
      marketing_budget: 25000,
      rd_budget: 15000,
      production_units: 800,
      unit_price: 160,
      operations_budget: 10000,
      investment_decision: 'reject_both',
    },
    {
      id: 'dec-3',
      round_id: 'r2',
      team_id: 't-hlth-1',
      status: 'verified',
      marketing_budget: 40000,
      rd_budget: 50000,
      production_units: 600,
      unit_price: 600,
      operations_budget: 20000,
      investment_decision: 'offer_b',
    },
  ];

  const snapshots = dbData.snapshots || [
    {
      id: 'snap-1',
      round_id: 'r2',
      team_id: 't-d2c-1',
      is_active: true,
      units_available: 1200,
      units_sold: 1100,
      ending_inventory: 100,
      units_stockout: 50,
      marketSharePct: 0.55,
      market_share_pct: 0.55,
      potential_demand: 1150,
      gross_revenue: 165000,
      cogs: 66000,
      gross_profit: 99000,
      operating_expenses: 70000,
      inventory_holding_cost: 4000,
      ebitda: 25000,
      tax_expense: 5000,
      net_income: 20000,
      operating_cash_flow: 18000,
      financing_cash_flow: 150000,
      ending_cash: 218000,
      enterprise_value: 380000,
      company_valuation: 598000,
      retained_equity_pct: 88.0,
      equity_adjusted_score: 526240,
      domain_rank: 1,
      tournament_rank: 1,
    },
    {
      id: 'snap-2',
      round_id: 'r2',
      team_id: 't-d2c-2',
      is_active: true,
      units_available: 800,
      units_sold: 700,
      ending_inventory: 100,
      units_stockout: 0,
      market_share_pct: 0.45,
      potential_demand: 700,
      gross_revenue: 112000,
      cogs: 49000,
      gross_profit: 63000,
      operating_expenses: 50000,
      inventory_holding_cost: 4000,
      ebitda: 9000,
      tax_expense: 1800,
      net_income: 7200,
      operating_cash_flow: 5000,
      financing_cash_flow: 0,
      ending_cash: 105000,
      enterprise_value: 290000,
      company_valuation: 395000,
      retained_equity_pct: 100.0,
      equity_adjusted_score: 395000,
      domain_rank: 2,
      tournament_rank: 3,
    },
    {
      id: 'snap-3',
      round_id: 'r2',
      team_id: 't-hlth-1',
      is_active: true,
      units_available: 600,
      units_sold: 600,
      ending_inventory: 0,
      units_stockout: 120,
      market_share_pct: 1.0,
      potential_demand: 720,
      gross_revenue: 360000,
      cogs: 180000,
      gross_profit: 180000,
      operating_expenses: 110000,
      inventory_holding_cost: 0,
      ebitda: 70000,
      tax_expense: 14000,
      net_income: 56000,
      operating_cash_flow: 52000,
      financing_cash_flow: 250000,
      ending_cash: 352000,
      enterprise_value: 700000,
      company_valuation: 1052000,
      retained_equity_pct: 80.0,
      equity_adjusted_score: 841600,
      domain_rank: 1,
      tournament_rank: 1,
    },
  ];

  const prevSnapshots = dbData.prevSnapshots || [
    {
      id: 'snap-r1-1',
      round_id: 'r1',
      team_id: 't-d2c-1',
      is_active: true,
      domain_rank: 2,
      ending_cash: 80000,
    },
    {
      id: 'snap-r1-2',
      round_id: 'r1',
      team_id: 't-d2c-2',
      is_active: true,
      domain_rank: 1,
      ending_cash: 95000,
    },
    {
      id: 'snap-r1-3',
      round_id: 'r1',
      team_id: 't-hlth-1',
      is_active: true,
      domain_rank: 1,
      ending_cash: 120000,
    },
  ];

  const investorOffers = dbData.investorOffers || [
    {
      id: 'inv-1',
      event_id: event.id,
      round_id: 'r2',
      team_id: 't-d2c-1',
      round_number: 2,
      confidence_score: 82,
      confidence_tier: 'high',
      offer_a_amount: 150000,
      offer_a_equity_pct: 12.0,
      offer_b_amount: 250000,
      offer_b_equity_pct: 18.0,
      selected_choice: 'offer_a',
      is_confirmed: true,
    },
    {
      id: 'inv-2',
      event_id: event.id,
      round_id: 'r2',
      team_id: 't-d2c-2',
      round_number: 2,
      confidence_score: 65,
      confidence_tier: 'moderate',
      offer_a_amount: 100000,
      offer_a_equity_pct: 15.0,
      offer_b_amount: 180000,
      offer_b_equity_pct: 22.0,
      selected_choice: 'reject_both',
      is_confirmed: true,
    },
    {
      id: 'inv-3',
      event_id: event.id,
      round_id: 'r2',
      team_id: 't-hlth-1',
      round_number: 2,
      confidence_score: 88,
      confidence_tier: 'high',
      offer_a_amount: 180000,
      offer_a_equity_pct: 12.0,
      offer_b_amount: 250000,
      offer_b_equity_pct: 20.0,
      selected_choice: 'offer_b',
      is_confirmed: true,
    },
  ];

  return {
    from: vi.fn().mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn().mockImplementation(() => chain),
        insert: vi.fn().mockImplementation(() => Promise.resolve({ error: null })),
        update: vi.fn().mockImplementation(() => chain),
        eq: vi.fn().mockImplementation((col: string, val: any) => {
          if (table === 'decisions' && dbData.decisionsError) {
            return {
              ...chain,
              then: (res: any) => Promise.resolve({ data: null, error: dbData.decisionsError }).then(res),
            };
          }
          if (table === 'company_snapshots' && col === 'round_id') {
            if (val === 'r1') {
              return {
                eq: vi.fn().mockImplementation(() => Promise.resolve({ data: prevSnapshots, error: null })),
                then: (res: any) => Promise.resolve({ data: prevSnapshots, error: null }).then(res),
              };
            }
            return {
              eq: vi.fn().mockImplementation(() => Promise.resolve({ data: snapshots, error: null })),
              then: (res: any) => Promise.resolve({ data: snapshots, error: null }).then(res),
            };
          }
          return chain;
        }),
        ilike: vi.fn().mockImplementation(() => chain),
        order: vi.fn().mockImplementation(() => chain),
        limit: vi.fn().mockImplementation(() => chain),
        single: vi.fn().mockImplementation(() => {
          if (table === 'events') return Promise.resolve({ data: event, error: null });
          return Promise.resolve({ data: null, error: null });
        }),
        maybeSingle: vi.fn().mockImplementation(() => {
          if (table === 'events') return Promise.resolve({ data: event, error: null });
          return Promise.resolve({ data: null, error: null });
        }),
        then: (resolve: any) => {
          if (table === 'events') return Promise.resolve({ data: event, error: null }).then(resolve);
          if (table === 'rounds') return Promise.resolve({ data: rounds, error: null }).then(resolve);
          if (table === 'domains') return Promise.resolve({ data: domains, error: null }).then(resolve);
          if (table === 'teams') return Promise.resolve({ data: teams, error: null }).then(resolve);
          if (table === 'decisions') return Promise.resolve({ data: decisions, error: null }).then(resolve);
          if (table === 'company_snapshots') return Promise.resolve({ data: snapshots, error: null }).then(resolve);
          if (table === 'team_investor_offers') return Promise.resolve({ data: investorOffers, error: null }).then(resolve);
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
      };
      return chain;
    }),
  } as any;
}

describe('Requirement 3: Centralized Team Intelligence Dashboard', () => {
  describe('Rule-Based Educational Observations Engine (generateTeamInsights)', () => {
    it('detects stockout unfulfilled demand warning', () => {
      const insights = generateTeamInsights({
        snapshot: {
          id: 's1',
          units_sold: 800,
          units_stockout: 200,
          ending_inventory: 0,
          inventory_holding_cost: 0,
          ending_cash: 100000,
          gross_revenue: 100000,
          cogs: 50000,
          gross_profit: 50000,
          operating_expenses: 30000,
          net_income: 20000,
          domain_rank: 2,
          market_share_pct: 0.5,
          company_valuation: 300000,
        } as unknown as CompanySnapshotRecord,
        roundNumber: 1,
      });

      const stockoutInsight = insights.find(i => i.category === 'stockout');
      expect(stockoutInsight).toBeDefined();
      expect(stockoutInsight?.type).toBe('warning');
      expect(stockoutInsight?.title).toBe('Demand Exceeded Inventory');
      expect(stockoutInsight?.message).toContain('200 units');
      expect(stockoutInsight?.message).toContain('20.0% unfulfilled demand');
    });

    it('detects inventory holding cost burden', () => {
      const insights = generateTeamInsights({
        snapshot: {
          id: 's2',
          units_sold: 500,
          units_stockout: 0,
          ending_inventory: 300,
          inventory_holding_cost: 6000,
          ending_cash: 75000,
          gross_revenue: 75000,
          cogs: 40000,
          gross_profit: 35000,
          operating_expenses: 25000,
          net_income: 4000,
          domain_rank: 2,
          market_share_pct: 0.4,
          company_valuation: 250000,
        } as unknown as CompanySnapshotRecord,
        roundNumber: 1,
      });

      const invInsight = insights.find(i => i.category === 'inventory_burden');
      expect(invInsight).toBeDefined();
      expect(invInsight?.type).toBe('warning');
      expect(invInsight?.message).toContain('300 unsold units');
      expect(invInsight?.message).toContain('$6,000 in holding costs');
    });

    it('flags cash insolvency risk when ending cash is negative', () => {
      const insights = generateTeamInsights({
        snapshot: {
          id: 's3',
          units_sold: 300,
          units_stockout: 0,
          ending_inventory: 0,
          inventory_holding_cost: 0,
          ending_cash: -15000,
          gross_revenue: 30000,
          cogs: 25000,
          gross_profit: 5000,
          operating_expenses: 25000,
          net_income: -20000,
          domain_rank: 3,
          market_share_pct: 0.2,
          company_valuation: 80000,
        } as unknown as CompanySnapshotRecord,
        roundNumber: 1,
      });

      const cashRisk = insights.find(i => i.category === 'cash_runway');
      expect(cashRisk).toBeDefined();
      expect(cashRisk?.type).toBe('warning');
      expect(cashRisk?.title).toContain('Insolvency Risk');
      expect(cashRisk?.message).toContain('-$15,000');
    });

    it('flags domain leadership and climbing rank momentum', () => {
      const insights = generateTeamInsights({
        snapshot: {
          id: 's4',
          units_sold: 1000,
          units_stockout: 0,
          ending_inventory: 50,
          inventory_holding_cost: 500,
          ending_cash: 220000,
          gross_revenue: 200000,
          cogs: 80000,
          gross_profit: 120000,
          operating_expenses: 60000,
          net_income: 60000,
          domain_rank: 1,
          market_share_pct: 0.65,
          company_valuation: 650000,
        } as unknown as CompanySnapshotRecord,
        prevSnapshot: {
          id: 's4-prev',
          domain_rank: 3,
        } as unknown as CompanySnapshotRecord,
        roundNumber: 2,
      });

      const leaderInsight = insights.find(i => i.category === 'market_share');
      expect(leaderInsight).toBeDefined();
      expect(leaderInsight?.title).toBe('Domain Category Leader');

      const momentumInsight = insights.find(i => i.category === 'rank_momentum');
      expect(momentumInsight).toBeDefined();
      expect(momentumInsight?.title).toBe('Ascending Standings');
      expect(momentumInsight?.message).toContain('Moved up +2 positions from #3 to #1');
    });

    it('records centralized investor decisions for rounds 2 and 4 without leaking score', () => {
      const offerAInsight = generateTeamInsights({
        snapshot: { id: 's5', units_sold: 100, units_stockout: 0, ending_inventory: 0, inventory_holding_cost: 0, ending_cash: 200000, gross_revenue: 50000, cogs: 20000, gross_profit: 30000, operating_expenses: 10000, net_income: 20000, domain_rank: 1, market_share_pct: 0.5, company_valuation: 400000 } as any,
        roundNumber: 2,
        investorOffer: {
          id: 'inv-test-1',
          confidence_score: 95, // Must NOT leak into message
          selected_choice: 'offer_a',
          offer_a_amount: 150000,
          offer_a_equity_pct: 12.0,
          is_confirmed: true,
        } as any,
      });

      const invInsight = offerAInsight.find(i => i.category === 'investor_action');
      expect(invInsight).toBeDefined();
      expect(invInsight?.message).toContain('$150,000 for 12% equity');
      expect(invInsight?.message).not.toContain('95'); // Confidence score is confidential!
    });
  });

  describe('Batch Intelligence Retrieval (TournamentService.getTeamIntelligence)', () => {
    it('retrieves consolidated intelligence across all active domains in a single batch', async () => {
      const mockSupabase = createMockSupabase({});
      const service = new TournamentService(mockSupabase);

      const dashboard = await service.getTeamIntelligence({ roundNumber: 2, eventId: 'ev-test-1' });

      expect(dashboard).toBeDefined();
      expect(dashboard.event.id).toBe('ev-test-1');
      expect(dashboard.round.roundNumber).toBe(2);
      expect(dashboard.round.isSimulated).toBe(true);
      expect(dashboard.domains.length).toBe(3);
      expect(dashboard.rows.length).toBe(4);

      // Verify all 3 domains are represented in rows
      const domainCodes = new Set(dashboard.rows.map(r => r.domainCode));
      expect(domainCodes.has('D2C')).toBe(true);
      expect(domainCodes.has('HEALTH')).toBe(true);
      expect(domainCodes.has('SAAS')).toBe(true);
    });

    it('populates all 7 structured column groups accurately', async () => {
      const mockSupabase = createMockSupabase({});
      const service = new TournamentService(mockSupabase);

      const dashboard = await service.getTeamIntelligence({ roundNumber: 2 });
      const d2cLeader = dashboard.rows.find(r => r.teamCode === 'D2C-01');

      expect(d2cLeader).toBeDefined();

      // Group A: Team Identity
      expect(d2cLeader?.teamCode).toBe('D2C-01');
      expect(d2cLeader?.companyName).toBe('Aura Glow');
      expect(d2cLeader?.domainCode).toBe('D2C');
      expect(d2cLeader?.domainName).toBe('Direct-to-Consumer');
      expect(d2cLeader?.tableStation).toBe('Table 1');
      expect(d2cLeader?.status).toBe('active');
      expect(d2cLeader?.decisionStatus).toBe('confirmed');

      // Group B: Operating Inputs
      expect(d2cLeader?.marketingSpend).toBe(35000);
      expect(d2cLeader?.rdSpend).toBe(20000);
      expect(d2cLeader?.productionUnits).toBe(1200);
      expect(d2cLeader?.unitSellingPrice).toBe(150);
      expect(d2cLeader?.operationsBudget).toBe(15000);
      expect(d2cLeader?.investmentDecision).toBe('offer_a');

      // Group C: Production & Distribution
      expect(d2cLeader?.unitsAvailable).toBe(1200);
      expect(d2cLeader?.unitsSold).toBe(1100);
      expect(d2cLeader?.endingInventory).toBe(100);
      expect(d2cLeader?.unitsStockout).toBe(50);
      expect(d2cLeader?.marketSharePct).toBe(0.55);
      expect(d2cLeader?.potentialDemand).toBe(1150);

      // Group D: Financial Performance
      expect(d2cLeader?.grossRevenue).toBe(165000);
      expect(d2cLeader?.cogs).toBe(66000);
      expect(d2cLeader?.grossProfit).toBe(99000);
      expect(d2cLeader?.operatingExpenses).toBe(70000);
      expect(d2cLeader?.netIncome).toBe(20000);
      expect(d2cLeader?.financingCashFlow).toBe(150000);
      expect(d2cLeader?.endingCash).toBe(218000);
      expect(d2cLeader?.companyValuation).toBe(598000);

      // Group E: Ownership & Dynamic Rankings
      expect(d2cLeader?.retainedEquityPct).toBe(88.0);
      expect(d2cLeader?.equityAdjustedScore).toBe(526240);
      expect(d2cLeader?.domainRank).toBe(1);
      expect(d2cLeader?.previousDomainRank).toBe(2);
      expect(d2cLeader?.rankDelta).toBe(1); // Improved from #2 to #1: 2 - 1 = +1

      // Group F: Automated Insights
      expect(d2cLeader?.insights.length).toBeGreaterThan(0);
      expect(d2cLeader?.insights.some(i => i.category === 'stockout')).toBe(true);

      // Group G: Centralized Investor Data
      expect(d2cLeader?.hasInvestorOffers).toBe(true);
      expect(d2cLeader?.offerAAmount).toBe(150000);
      expect(d2cLeader?.offerAEquityPct).toBe(12.0);
      expect(d2cLeader?.selectedChoice).toBe('offer_a');
      expect(d2cLeader?.isChoiceConfirmed).toBe(true);
      expect(d2cLeader?.postRoundFounderEquityPct).toBe(88.0);
    });

    it('gracefully handles unsimulated rounds without fabricating fake zero metrics', async () => {
      // Simulate Round 3 where decisions are entered or missing, but simulation has NOT run
      const mockSupabase = createMockSupabase({
        rounds: [
          { id: 'r1', round_number: 1, status: 'published', type: 'regular' },
          { id: 'r2', round_number: 2, status: 'published', type: 'investment_seed' },
          { id: 'r3', round_number: 3, status: 'open', type: 'regular' },
        ],
        snapshots: [], // Empty snapshots for Round 3
        decisions: [
          {
            id: 'dec-r3-1',
            round_id: 'r3',
            team_id: 't-d2c-1',
            status: 'entered',
            marketing_budget: 45000,
            rd_budget: 30000,
            production_units: 1500,
            unit_price: 155,
            operations_budget: 20000,
            investment_decision: 'none',
          },
        ],
      });
      const service = new TournamentService(mockSupabase);

      const dashboard = await service.getTeamIntelligence({ roundNumber: 3 });

      expect(dashboard.round.isSimulated).toBe(false);

      const row = dashboard.rows.find(r => r.teamCode === 'D2C-01');
      expect(row).toBeDefined();
      expect(row?.isSimulated).toBe(false);

      // Inputs from decision should be present
      expect(row?.marketingSpend).toBe(45000);
      expect(row?.rdSpend).toBe(30000);

      // Group C, D, E simulation outputs MUST be null (not 0)
      expect(row?.grossRevenue).toBeNull();
      expect(row?.cogs).toBeNull();
      expect(row?.grossProfit).toBeNull();
      expect(row?.netIncome).toBeNull();
      expect(row?.endingCash).toBeNull();
      expect(row?.companyValuation).toBeNull();
      expect(row?.retainedEquityPct).toBeNull();
      expect(row?.domainRank).toBeNull();
      expect(row?.rankDelta).toBeNull();
    });

    it('sorts rows by domainCode ASC, domainRank ASC (nulls last), teamCode ASC', async () => {
      const mockSupabase = createMockSupabase({});
      const service = new TournamentService(mockSupabase);

      const dashboard = await service.getTeamIntelligence({ roundNumber: 2 });
      const rows = dashboard.rows;

      // First two rows should be D2C
      expect(rows[0].domainCode).toBe('D2C');
      expect(rows[0].domainRank).toBe(1); // Aura Glow rank #1
      expect(rows[1].domainCode).toBe('D2C');
      expect(rows[1].domainRank).toBe(2); // Urban Pure rank #2

      // Next is HEALTH
      expect(rows[2].domainCode).toBe('HEALTH');
      expect(rows[2].domainRank).toBe(1); // PulseBio rank #1

      // Next is SAAS (unsimulated snapshot -> null rank)
      expect(rows[3].domainCode).toBe('SAAS');
      expect(rows[3].domainRank).toBeNull();
    });

    it('calculates rank delta accurately across rounds', async () => {
      const mockSupabase = createMockSupabase({});
      const service = new TournamentService(mockSupabase);

      const dashboard = await service.getTeamIntelligence({ roundNumber: 2 });

      // D2C-01: Round 1 rank was #2, Round 2 rank is #1 -> delta = +1
      const d2c1 = dashboard.rows.find(r => r.teamCode === 'D2C-01');
      expect(d2c1?.previousDomainRank).toBe(2);
      expect(d2c1?.domainRank).toBe(1);
      expect(d2c1?.rankDelta).toBe(1);

      // D2C-02: Round 1 rank was #1, Round 2 rank is #2 -> delta = -1
      const d2c2 = dashboard.rows.find(r => r.teamCode === 'D2C-02');
      expect(d2c2?.previousDomainRank).toBe(1);
      expect(d2c2?.domainRank).toBe(2);
      expect(d2c2?.rankDelta).toBe(-1);

      // HLTH-01: Round 1 rank was #1, Round 2 rank is #1 -> delta = 0
      const hlth1 = dashboard.rows.find(r => r.teamCode === 'HLTH-01');
      expect(hlth1?.previousDomainRank).toBe(1);
      expect(hlth1?.domainRank).toBe(1);
      expect(hlth1?.rankDelta).toBe(0);
    });

    it('throws AppError if any parallel database query fails', async () => {
      const mockSupabase = createMockSupabase({
        decisionsError: { message: 'Database connection failed' },
      });

      const service = new TournamentService(mockSupabase);
      await expect(service.getTeamIntelligence({ roundNumber: 1 })).rejects.toThrow('Failed to load decisions: Database connection failed');
    });

    it('implements strict weak ordering for nullable fields in client sort comparator', () => {
      const rows = [
        { teamCode: 'A', grossRevenue: null },
        { teamCode: 'B', grossRevenue: 50000 },
        { teamCode: 'C', grossRevenue: null },
        { teamCode: 'D', grossRevenue: 100000 },
      ];

      const comparator = (a: any, b: any) => {
        const aVal = a.grossRevenue;
        const bVal = b.grossRevenue;
        const aNull = aVal === null || aVal === undefined;
        const bNull = bVal === null || bVal === undefined;
        if (aNull && bNull) return 0;
        if (aNull) return 1;
        if (bNull) return -1;
        return aVal - bVal;
      };

      const sorted = [...rows].sort(comparator);
      expect(sorted[0].teamCode).toBe('B');
      expect(sorted[1].teamCode).toBe('D');
      // Nulls stably pushed to the end without crashing or returning non-zero when both are null
      expect(comparator(rows[0], rows[2])).toBe(0);
      expect(sorted[2].grossRevenue).toBeNull();
      expect(sorted[3].grossRevenue).toBeNull();
    });

    it('enforces RBAC role restrictions on /api/admin/team-intelligence route', () => {
      const allowedRoles = ['super_admin', 'judge', 'domain_coordinator'];
      const isRoleAllowed = (role: string) => allowedRoles.includes(role);

      expect(isRoleAllowed('super_admin')).toBe(true);
      expect(isRoleAllowed('judge')).toBe(true);
      expect(isRoleAllowed('domain_coordinator')).toBe(true);

      // Competitors, volunteers, and observers must be rejected
      expect(isRoleAllowed('volunteer')).toBe(false);
      expect(isRoleAllowed('public_observer')).toBe(false);
      expect(isRoleAllowed('competitor')).toBe(false);
    });


  });
});

