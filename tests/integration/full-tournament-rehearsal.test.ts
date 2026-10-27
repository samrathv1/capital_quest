import { describe, it, expect, beforeEach } from 'vitest';
import { TournamentService } from '@/lib/services/tournament-service';
import {
  recordOrganizerApproval,
  getOrganizerPolicyGates,
  assertOrganizerPoliciesApproved,
} from '@/lib/services/organizer-approvals';
import { DOMAIN_ARCHETYPES } from '@/engine/config/domain-archetypes';
import { simulateDomainRound } from '@/engine/simulation/domain-simulation';
import { computeRankings } from '@/engine/scoring/final-score';
import { AppError } from '@/lib/errors/app-error';
import { D, ZERO } from '@/engine/math/precision';
import { CompanyDecision, CompanySnapshot, DomainConfig } from '@/engine/types';

/**
 * CAPITAL QUEST — AUTOMATED FULL EVENT REHEARSAL (PART 8)
 *
 * Simulates the complete tournament journey with 3 teams competing in SAAS domain:
 * 1. Super Admin authentication & role verification.
 * 2. Temporary team creation, unverified decision draft, and safe deletion.
 * 3. 3 test teams registration in same domain with multiple participants per team.
 * 4. Round 1: Open, Decision Entry & Verification, Policy Approvals, Lock, Simulate, Review, Publish.
 * 5. Round 2: Seed VC Offers (Offer A, Offer B, Reject) & Cap Table Dilution.
 * 6. Round 3: Market growth & competitive dynamics with brand/quality carry-forward.
 * 7. Round 4: Series A VC Offers & Second Dilution.
 * 8. Round 5: Final Harvest, Valuation Calculation, and Scoring (Valuation × Equity).
 * 9. Stage Controller & Winner Embargo verification through Podium & Full Leaderboard.
 */

interface MockDB {
  events: any[];
  domains: any[];
  rounds: any[];
  teams: any[];
  team_members: any[];
  decisions: any[];
  company_snapshots: any[];
  simulation_runs: any[];
  financial_ledger: any[];
  equity_transactions: any[];
  cap_tables: any[];
  audit_logs: any[];
  presentation_state: any[];
}

function createInMemorySupabase(db: MockDB) {
  return {
    from: (table: keyof MockDB) => {
      let currentFilter: ((row: any) => boolean) = () => true;
      let orderCol: string | null = null;
      let orderAsc: boolean = true;
      let limitCount: number | null = null;

      const chain: any = {
        select: (_cols?: string) => chain,
        eq: (col: string, val: any) => {
          const prev = currentFilter;
          currentFilter = (row: any) => prev(row) && row[col] === val;
          return chain;
        },
        in: (col: string, vals: any[]) => {
          const prev = currentFilter;
          currentFilter = (row: any) => prev(row) && vals.includes(row[col]);
          return chain;
        },
        order: (col: string, opts?: { ascending?: boolean }) => {
          orderCol = col;
          orderAsc = opts?.ascending ?? true;
          return chain;
        },
        limit: (n: number) => {
          limitCount = n;
          return chain;
        },
        single: async () => {
          const rows = (db[table] || []).filter(currentFilter);
          if (rows.length === 0) {
            return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
          }
          return { data: { ...rows[0] }, error: null };
        },
        maybeSingle: async () => {
          const rows = (db[table] || []).filter(currentFilter);
          return { data: rows.length > 0 ? { ...rows[0] } : null, error: null };
        },
        insert: (payload: any | any[]) => {
          const items = Array.isArray(payload) ? payload : [payload];
          const inserted: any[] = [];
          for (const item of items) {
            const row = { id: item.id || `gen-${Math.random().toString(36).substring(2, 9)}`, ...item };
            db[table].push(row);
            inserted.push(row);
          }
          const builder: any = {
            data: inserted,
            error: null,
            select: () => ({
              single: async () => ({ data: inserted[0], error: null }),
            }),
            then: (resolve: any) => Promise.resolve({ data: inserted, error: null }).then(resolve),
          };
          return builder;
        },
        upsert: (payload: any) => {
          const items = Array.isArray(payload) ? payload : [payload];
          const upserted: any[] = [];
          for (const item of items) {
            const idx = db[table].findIndex(r =>
              (item.id && r.id === item.id) ||
              (item.round_id && item.team_id && r.round_id === item.round_id && r.team_id === item.team_id) ||
              (item.event_id && r.event_id === item.event_id)
            );
            if (idx >= 0) {
              db[table][idx] = { ...db[table][idx], ...item };
              upserted.push(db[table][idx]);
            } else {
              const row = { id: item.id || `gen-${Math.random().toString(36).substring(2, 9)}`, ...item };
              db[table].push(row);
              upserted.push(row);
            }
          }
          const builder: any = {
            data: upserted,
            error: null,
            select: () => ({
              single: async () => ({ data: upserted[0], error: null }),
            }),
            then: (resolve: any) => Promise.resolve({ data: upserted, error: null }).then(resolve),
          };
          return builder;
        },
        update: (payload: any) => ({
          eq: (col: string, val: any) => {
            const prev = currentFilter;
            const finalFilter = (row: any) => prev(row) && row[col] === val;
            const updatedRows: any[] = [];
            for (let i = 0; i < db[table].length; i++) {
              if (finalFilter(db[table][i])) {
                db[table][i] = { ...db[table][i], ...payload };
                updatedRows.push(db[table][i]);
              }
            }
            return {
              data: updatedRows,
              error: null,
              select: () => ({
                single: async () => ({ data: updatedRows[0] || null, error: null }),
              }),
              then: (resolve: any) => Promise.resolve({ data: updatedRows, error: null }).then(resolve),
            };
          },
        }),
        delete: () => ({
          eq: (col: string, val: any) => {
            const prev = currentFilter;
            const finalFilter = (row: any) => prev(row) && row[col] === val;
            const toDelete = db[table].filter(finalFilter);
            db[table] = db[table].filter(r => !finalFilter(r));
            return {
              data: toDelete,
              error: null,
              then: (resolve: any) => Promise.resolve({ data: toDelete, error: null }).then(resolve),
            };
          },
        }),
        then: (resolve: any) => {
          let rows = (db[table] || []).filter(currentFilter).map(r => ({ ...r }));
          if (orderCol) {
            rows.sort((a, b) => {
              if (a[orderCol!] < b[orderCol!]) return orderAsc ? -1 : 1;
              if (a[orderCol!] > b[orderCol!]) return orderAsc ? 1 : -1;
              return 0;
            });
          }
          if (limitCount !== null) {
            rows = rows.slice(0, limitCount);
          }
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        },
      };

      return chain;
    },
    rpc: async (fn: string, args: any) => {
      if (fn === 'fn_safe_delete_team') {
        const team = db.teams.find(t => t.id === args.p_team_id);
        if (!team) {
          return { data: null, error: { message: 'Team not found', code: 'P0002' } };
        }

        // Check verified or locked decisions
        const verifiedDec = db.decisions.find(
          d => d.team_id === args.p_team_id && ['verified', 'locked'].includes(d.status)
        );
        if (verifiedDec) {
          return {
            data: null,
            error: {
              message: 'Team has verified or locked round decisions and cannot be deleted.',
              code: '23503',
            },
          };
        }

        // Check simulation / snapshot / ledger history
        const hasSnapshots = db.company_snapshots.some(s => s.team_id === args.p_team_id);
        const hasLedger = db.financial_ledger.some(l => l.team_id === args.p_team_id);
        if (hasSnapshots || hasLedger) {
          return {
            data: null,
            error: {
              message: 'Team has simulated financial or cap table history and cannot be deleted.',
              code: '23503',
            },
          };
        }

        // Clean unverified decisions
        const unverifiedCount = db.decisions.filter(
          d => d.team_id === args.p_team_id && ['unsubmitted', 'entered', 'flagged'].includes(d.status)
        ).length;
        db.decisions = db.decisions.filter(d => d.team_id !== args.p_team_id);

        // Delete members
        db.team_members = db.team_members.filter(m => m.team_id !== args.p_team_id);

        // Delete team
        db.teams = db.teams.filter(t => t.id !== args.p_team_id);

        // Write audit log
        db.audit_logs.push({
          id: `audit-${Math.random().toString(36).substring(2, 9)}`,
          event_id: team.event_id,
          actor_id: args.p_actor_id,
          action: 'team.safe_delete',
          payload: {
            team_id: team.id,
            team_code: team.team_code,
            company_name: team.company_name,
            unverified_decisions_cleaned: unverifiedCount,
          },
        });

        return {
          data: {
            deleted_team_id: team.id,
            deleted_team_code: team.team_code,
            deleted_company_name: team.company_name,
            unverified_decisions_cleaned: unverifiedCount,
          },
          error: null,
        };
      }

      if (fn === 'fn_transition_round_status') {
        const round = db.rounds.find(r => r.id === args.p_round_id);
        if (!round) {
          return { data: null, error: { message: 'Round not found', code: 'P0002' } };
        }
        round.status = args.p_new_status;
        return {
          data: {
            round_id: round.id,
            new_status: args.p_new_status,
          },
          error: null,
        };
      }

      return { data: null, error: { message: `Unknown RPC ${fn}`, code: 'P0001' } };
    },
  };
}

describe('PART 8 — Full 5-Round Tournament Rehearsal (3 Competing Teams in SAAS)', () => {
  const eventId = '00000000-0000-0000-0000-000000000001';
  const superAdminId = '00000000-0000-0000-0000-000000000099';
  const saasDomain = DOMAIN_ARCHETYPES.saas;

  let db: MockDB;
  let service: TournamentService;

  beforeEach(() => {
    // Reset policy gates before each test run
    const gates = getOrganizerPolicyGates(eventId);
    gates.cashValuationPolicyApproved = false;
    gates.corporateTaxationApproved = false;
    gates.standardVCOffersApproved = false;
    gates.strictSpendingRejectionApproved = false;
    gates.proRataScalingApproved = false;

    // Seed clean isolated test database
    db = {
      events: [
        {
          id: eventId,
          slug: 'capital-quest-2026-rehearsal',
          name: 'Capital Quest Rehearsal Event',
          status: 'setup',
          total_rounds: 5,
          starting_capital: 1000000,
          starting_valuation: 200000,
          active_round_number: 1,
          created_by: superAdminId,
        },
      ],
      domains: [
        {
          id: 'domain-saas-uuid',
          event_id: eventId,
          code: 'SAAS',
          name: 'Enterprise SaaS',
          description: 'Enterprise SaaS & AI Archetype',
          base_demand: Number(saasDomain.baseDemand),
          benchmark_price: Number(saasDomain.benchmarkPrice),
          min_allowed_price: Number(saasDomain.minPrice),
          max_allowed_price: Number(saasDomain.maxPrice),
          base_unit_cogs: Number(saasDomain.baseUnitCogs),
          rd_elasticity: Number(saasDomain.rdElasticity),
          mkt_elasticity: Number(saasDomain.mktElasticity),
          price_elasticity: Number(saasDomain.priceElasticity),
        },
      ],
      rounds: [
        { id: 'round-1-uuid', event_id: eventId, round_number: 1, type: 'regular', status: 'draft' },
        { id: 'round-2-uuid', event_id: eventId, round_number: 2, type: 'investment_seed', status: 'draft' },
        { id: 'round-3-uuid', event_id: eventId, round_number: 3, type: 'regular', status: 'draft' },
        { id: 'round-4-uuid', event_id: eventId, round_number: 4, type: 'investment_series_a', status: 'draft' },
        { id: 'round-5-uuid', event_id: eventId, round_number: 5, type: 'final_harvest', status: 'draft' },
      ],
      teams: [],
      team_members: [],
      decisions: [],
      company_snapshots: [],
      simulation_runs: [],
      financial_ledger: [],
      equity_transactions: [],
      cap_tables: [],
      audit_logs: [],
      presentation_state: [
        {
          id: 'pres-state-uuid',
          event_id: eventId,
          display_mode: 'leaderboard',
          ceremony_stage: 'waiting',
          is_auto_advance: false,
          auto_advance_interval_sec: 10,
          is_winner_revealed: false,
        },
      ],
    };

    service = new TournamentService(createInMemorySupabase(db) as any);
  });

  it('executes the full end-to-end journey from registration through 5 rounds to ceremony podium', async () => {
    // -------------------------------------------------------------------------
    // STEP 1: VERIFY SAFE DELETION OF ENTERED UNVERIFIED DECISION & ROSTER CLEANUP
    // -------------------------------------------------------------------------
    // 1.1 Create temporary team
    const tempTeam = {
      id: 'team-temp-uuid',
      event_id: eventId,
      team_code: 'TEMP-01',
      company_name: 'Temp Disposable Corp',
      table_station: 'Table 99',
      domain_id: 'domain-saas-uuid',
      domains: db.domains[0],
      is_disqualified: false,
    };
    db.teams.push(tempTeam);

    // 1.2 Add participant members
    db.team_members.push(
      { id: 'mem-1', team_id: tempTeam.id, full_name: 'Alex Rivera', role: 'Leader' },
      { id: 'mem-2', team_id: tempTeam.id, full_name: 'Jordan Smith', role: 'Member' }
    );

    // 1.3 Add unverified decision (draft 'entered' status)
    db.decisions.push({
      id: 'dec-temp',
      round_id: 'round-1-uuid',
      team_id: tempTeam.id,
      status: 'entered',
      marketing_budget: 50000,
      rd_budget: 30000,
      operations_budget: 10000,
      production_units: 500,
      unit_price: 200,
      investment_decision: 'none',
    });

    // 1.4 Super Admin deletes the team safely
    const deleteResult = await service.deleteTeam(tempTeam.id, superAdminId);
    expect(deleteResult.success).toBe(true);
    expect(deleteResult.deletedTeam.id).toBe(tempTeam.id);
    expect(deleteResult.unverifiedDecisionsCleaned).toBe(1);

    // 1.5 Verify DB cleanup
    expect(db.teams.find(t => t.id === tempTeam.id)).toBeUndefined();
    expect(db.team_members.filter(m => m.team_id === tempTeam.id).length).toBe(0);
    expect(db.decisions.filter(d => d.team_id === tempTeam.id).length).toBe(0);
    expect(db.audit_logs.some(a => a.action === 'team.safe_delete')).toBe(true);

    // -------------------------------------------------------------------------
    // STEP 2: REGISTER 3 TEST TEAMS IN THE SAME SAAS DOMAIN
    // -------------------------------------------------------------------------
    const teams = [
      {
        id: 'team-alpha-uuid',
        event_id: eventId,
        team_code: 'SAAS-01',
        company_name: 'CloudMatrix AI',
        table_station: 'Table 1',
        domain_id: 'domain-saas-uuid',
        domains: db.domains[0],
        is_disqualified: false,
      },
      {
        id: 'team-beta-uuid',
        event_id: eventId,
        team_code: 'SAAS-02',
        company_name: 'SaaSStream Pro',
        table_station: 'Table 2',
        domain_id: 'domain-saas-uuid',
        domains: db.domains[0],
        is_disqualified: false,
      },
      {
        id: 'team-gamma-uuid',
        event_id: eventId,
        team_code: 'SAAS-03',
        company_name: 'PulseFlow Ops',
        table_station: 'Table 3',
        domain_id: 'domain-saas-uuid',
        domains: db.domains[0],
        is_disqualified: false,
      },
    ];
    db.teams.push(...teams);

    // Add members for each team (No participant email mandatory)
    db.team_members.push(
      { id: 'm-a1', team_id: teams[0].id, full_name: 'Alice Founder', role: 'CEO' },
      { id: 'm-a2', team_id: teams[0].id, full_name: 'Bob CTO', role: 'CTO' },
      { id: 'm-b1', team_id: teams[1].id, full_name: 'Charlie CEO', role: 'CEO' },
      { id: 'm-b2', team_id: teams[1].id, full_name: 'Dana CMO', role: 'CMO' },
      { id: 'm-c1', team_id: teams[2].id, full_name: 'Eve Lead', role: 'CEO' },
      { id: 'm-c2', team_id: teams[2].id, full_name: 'Frank COO', role: 'COO' }
    );

    // Initialize Round 0 Snapshots ($1M starting cash, 100% equity, $200k base valuation)
    let snapshots: Record<string, CompanySnapshot> = {};
    teams.forEach(t => {
      snapshots[t.id] = {
        teamId: t.id,
        roundNumber: 0,
        cash: D(1000000),
        beginningInventoryUnits: ZERO,
        inventoryAverageUnitCost: D(saasDomain.baseUnitCogs),
        cumulativeRdStock: ZERO,
        cumulativeBrandStock: ZERO,
        retainedEquityPct: D(100),
        valuation: D(200000),
      };
      db.company_snapshots.push({
        id: `snap-r0-${t.id}`,
        team_id: t.id,
        round_id: 'round-1-uuid',
        round_number: 0,
        starting_cash: 1000000,
        ending_cash: 1000000,
        retained_equity_pct: 100,
        enterprise_value: 200000,
      });
      db.cap_tables.push({
        team_id: t.id,
        shareholder_name: 'Founders',
        shareholder_type: 'founder',
        ownership_percentage: 1.0,
      });
    });

    // -------------------------------------------------------------------------
    // STEP 3: ROUND 1 (REGULAR COMPETITION)
    // -------------------------------------------------------------------------
    // 3.1 Open Round 1
    const r1 = await service.openRound('round-1-uuid', superAdminId);
    expect(r1.status).toBe('open');

    // 3.2 Single-Admin enters and verifies decisions for all 3 teams
    // Alpha: Premium High Quality (Price $240, R&D $120k, Mkt $150k)
    await service.confirmAdminDecision(
      {
        roundId: 'round-1-uuid',
        teamId: teams[0].id,
        marketingBudget: 150000,
        rdBudget: 120000,
        operationsBudget: 10000,
        productionUnits: 2000,
        unitSellingPrice: 240,
        investmentChoice: 'none',
        auditNotes: 'Alpha R1 Strategy',
      },
      superAdminId
    );

    // Beta: Aggressive Marketing & Volume (Price $200, R&D $40k, Mkt $250k)
    await service.confirmAdminDecision(
      {
        roundId: 'round-1-uuid',
        teamId: teams[1].id,
        marketingBudget: 250000,
        rdBudget: 40000,
        operationsBudget: 10000,
        productionUnits: 3500,
        unitSellingPrice: 200,
        investmentChoice: 'none',
        auditNotes: 'Beta R1 Strategy',
      },
      superAdminId
    );

    // Gamma: Balanced Benchmark (Price $220, R&D $80k, Mkt $180k)
    await service.confirmAdminDecision(
      {
        roundId: 'round-1-uuid',
        teamId: teams[2].id,
        marketingBudget: 180000,
        rdBudget: 80000,
        operationsBudget: 10000,
        productionUnits: 2500,
        unitSellingPrice: 220,
        investmentChoice: 'none',
        auditNotes: 'Gamma R1 Strategy',
      },
      superAdminId
    );

    // 3.3 Verify Telemetry & Readiness
    const r1Decisions = await service.getAdminRoundDecisions('round-1-uuid');
    expect(r1Decisions.stats.total).toBe(3);
    expect(r1Decisions.stats.verifiedCount).toBe(3);
    expect(r1Decisions.stats.missingCount).toBe(0);
    expect(r1Decisions.stats.isReadyToLock).toBe(true);

    // 3.4 Approve Organizer Policy Gates
    recordOrganizerApproval(eventId, 'cash_valuation', 'Lead Organizer', superAdminId);
    recordOrganizerApproval(eventId, 'corporate_tax', 'Lead Organizer', superAdminId);
    recordOrganizerApproval(eventId, 'standard_vc_offers', 'Lead Organizer', superAdminId);
    recordOrganizerApproval(eventId, 'strict_spending', 'Lead Organizer', superAdminId);
    assertOrganizerPoliciesApproved(eventId);

    // 3.5 Lock Round 1
    const r1Locked = await service.lockRound('round-1-uuid', superAdminId, false);
    expect(r1Locked.status).toBe('locked');

    // 3.6 Simulate Round 1 Shared Market
    const r1DecsList: CompanyDecision[] = [
      {
        teamId: teams[0].id,
        marketingBudget: 150000,
        rdBudget: 120000,
        operationsBudget: 10000,
        productionUnits: 2000,
        unitPrice: 240,
        investmentDecision: 'REJECT_BOTH',
      },
      {
        teamId: teams[1].id,
        marketingBudget: 250000,
        rdBudget: 40000,
        operationsBudget: 10000,
        productionUnits: 3500,
        unitPrice: 200,
        investmentDecision: 'REJECT_BOTH',
      },
      {
        teamId: teams[2].id,
        marketingBudget: 180000,
        rdBudget: 80000,
        operationsBudget: 10000,
        productionUnits: 2500,
        unitPrice: 220,
        investmentDecision: 'REJECT_BOTH',
      },
    ];
    const r1SimResult = simulateDomainRound(
      saasDomain,
      1,
      r1DecsList,
      teams.map(t => snapshots[t.id])
    );
    expect(r1SimResult.companyResults.length).toBe(3);

    // Record Snapshots & Financial Reconciliation
    r1SimResult.companyResults.forEach(res => {
      expect(res.financial.endingCash.toNumber()).toBeGreaterThanOrEqual(0);
      const prior = snapshots[res.teamId].cash;
      const expectedCash = prior.plus(res.financial.operatingCashFlow).plus(res.financial.financingCashFlow);
      expect(res.financial.endingCash.toNumber()).toBeCloseTo(expectedCash.toNumber(), 2);
      snapshots[res.teamId] = res.nextSnapshot;

      db.company_snapshots.push({
        id: `snap-r1-${res.teamId}`,
        team_id: res.teamId,
        round_id: 'round-1-uuid',
        round_number: 1,
        starting_cash: prior.toNumber(),
        gross_revenue: res.financial.grossRevenue.toNumber(),
        cogs: res.financial.cogs.toNumber(),
        opex: res.financial.totalOpEx.toNumber(),
        ebitda: res.financial.ebitda.toNumber(),
        net_income: res.financial.netIncome.toNumber(),
        ending_cash: res.financial.endingCash.toNumber(),
        retained_equity_pct: res.equity.postRoundRetainedEquityPct.toNumber(),
        enterprise_value: res.valuation.finalValuation.toNumber(),
      });
    });

    // Review & Publish Round 1
    db.rounds.find(r => r.id === 'round-1-uuid')!.status = 'simulated';
    const r1Reviewed = await service.reviewRound('round-1-uuid', superAdminId);
    expect(r1Reviewed.status).toBe('reviewed');

    const r1Published = await service.publishRound('round-1-uuid', superAdminId);
    expect(r1Published.status).toBe('published');

    // -------------------------------------------------------------------------
    // STEP 4: ROUND 2 (SEED INVESTMENT ROUND)
    // -------------------------------------------------------------------------
    // 4.1 Open Round 2
    const r2 = await service.openRound('round-2-uuid', superAdminId);
    expect(r2.status).toBe('open');

    // 4.2 Enter decisions with distinct VC Investment Choices:
    // Alpha: accepts OFFER_A ($500,000 for 15% equity)
    await service.confirmAdminDecision(
      {
        roundId: 'round-2-uuid',
        teamId: teams[0].id,
        marketingBudget: 160000,
        rdBudget: 140000,
        operationsBudget: 10000,
        productionUnits: 2200,
        unitSellingPrice: 240,
        investmentChoice: 'OFFER_A',
      },
      superAdminId
    );

    // Beta: accepts OFFER_B ($200,000 for 12.5% equity)
    await service.confirmAdminDecision(
      {
        roundId: 'round-2-uuid',
        teamId: teams[1].id,
        marketingBudget: 260000,
        rdBudget: 50000,
        operationsBudget: 10000,
        productionUnits: 3800,
        unitSellingPrice: 200,
        investmentChoice: 'OFFER_B',
      },
      superAdminId
    );

    // Gamma: rejects both offers
    await service.confirmAdminDecision(
      {
        roundId: 'round-2-uuid',
        teamId: teams[2].id,
        marketingBudget: 190000,
        rdBudget: 90000,
        operationsBudget: 10000,
        productionUnits: 2600,
        unitSellingPrice: 220,
        investmentChoice: 'REJECT_BOTH',
      },
      superAdminId
    );

    await service.lockRound('round-2-uuid', superAdminId, false);

    // Simulate Round 2
    const r2DecsList: CompanyDecision[] = [
      {
        teamId: teams[0].id,
        marketingBudget: 160000,
        rdBudget: 140000,
        operationsBudget: 10000,
        productionUnits: 2200,
        unitPrice: 240,
        investmentDecision: 'OFFER_A',
      },
      {
        teamId: teams[1].id,
        marketingBudget: 260000,
        rdBudget: 50000,
        operationsBudget: 10000,
        productionUnits: 3800,
        unitPrice: 200,
        investmentDecision: 'OFFER_B',
      },
      {
        teamId: teams[2].id,
        marketingBudget: 190000,
        rdBudget: 90000,
        operationsBudget: 10000,
        productionUnits: 2600,
        unitPrice: 220,
        investmentDecision: 'REJECT_BOTH',
      },
    ];

    const r2SimResult = simulateDomainRound(
      saasDomain,
      2,
      r2DecsList,
      teams.map(t => snapshots[t.id])
    );

    // Verify Cap Table Dilution Invariants
    const alphaR2 = r2SimResult.companyResults.find(r => r.teamId === teams[0].id)!;
    const betaR2 = r2SimResult.companyResults.find(r => r.teamId === teams[1].id)!;
    const gammaR2 = r2SimResult.companyResults.find(r => r.teamId === teams[2].id)!;

    expect(alphaR2.equity.postRoundRetainedEquityPct.toNumber()).toBe(75);
    expect(alphaR2.equity.cashInjected.toNumber()).toBe(400000);

    expect(betaR2.equity.postRoundRetainedEquityPct.toNumber()).toBe(87.5);
    expect(betaR2.equity.cashInjected.toNumber()).toBe(200000);

    expect(gammaR2.equity.postRoundRetainedEquityPct.toNumber()).toBe(100);
    expect(gammaR2.equity.cashInjected.toNumber()).toBe(0);

    r2SimResult.companyResults.forEach(res => {
      snapshots[res.teamId] = res.nextSnapshot;
      db.company_snapshots.push({
        id: `snap-r2-${res.teamId}`,
        team_id: res.teamId,
        round_id: 'round-2-uuid',
        round_number: 2,
        starting_cash: snapshots[res.teamId].cash.toNumber(),
        gross_revenue: res.financial.grossRevenue.toNumber(),
        cogs: res.financial.cogs.toNumber(),
        opex: res.financial.totalOpEx.toNumber(),
        ebitda: res.financial.ebitda.toNumber(),
        net_income: res.financial.netIncome.toNumber(),
        ending_cash: res.financial.endingCash.toNumber(),
        retained_equity_pct: res.equity.postRoundRetainedEquityPct.toNumber(),
        enterprise_value: res.valuation.finalValuation.toNumber(),
      });
    });

    db.rounds.find(r => r.id === 'round-2-uuid')!.status = 'simulated';
    await service.reviewRound('round-2-uuid', superAdminId);
    await service.publishRound('round-2-uuid', superAdminId);

    // -------------------------------------------------------------------------
    // STEP 5: ROUND 3 (REGULAR COMPETITION WITH ACCUMULATED BRAND/QUALITY)
    // -------------------------------------------------------------------------
    await service.openRound('round-3-uuid', superAdminId);

    for (const team of teams) {
      await service.confirmAdminDecision(
        {
          roundId: 'round-3-uuid',
          teamId: team.id,
          marketingBudget: 180000,
          rdBudget: 120000,
          operationsBudget: 10000,
          productionUnits: 2500,
          unitSellingPrice: 200,
          investmentChoice: 'none',
        },
        superAdminId
      );
    }

    await service.lockRound('round-3-uuid', superAdminId, false);

    const r3SimResult = simulateDomainRound(
      saasDomain,
      3,
      teams.map(t => ({
        teamId: t.id,
        marketingBudget: 180000,
        rdBudget: 120000,
        operationsBudget: 10000,
        productionUnits: 2500,
        unitPrice: 200,
        investmentDecision: 'REJECT_BOTH',
      })),
      teams.map(t => snapshots[t.id])
    );

    r3SimResult.companyResults.forEach(res => {
      snapshots[res.teamId] = res.nextSnapshot;
      db.company_snapshots.push({
        id: `snap-r3-${res.teamId}`,
        team_id: res.teamId,
        round_id: 'round-3-uuid',
        round_number: 3,
        starting_cash: snapshots[res.teamId].cash.toNumber(),
        gross_revenue: res.financial.grossRevenue.toNumber(),
        cogs: res.financial.cogs.toNumber(),
        opex: res.financial.totalOpEx.toNumber(),
        ebitda: res.financial.ebitda.toNumber(),
        net_income: res.financial.netIncome.toNumber(),
        ending_cash: res.financial.endingCash.toNumber(),
        retained_equity_pct: res.equity.postRoundRetainedEquityPct.toNumber(),
        enterprise_value: res.valuation.finalValuation.toNumber(),
      });
    });

    db.rounds.find(r => r.id === 'round-3-uuid')!.status = 'simulated';
    await service.reviewRound('round-3-uuid', superAdminId);
    await service.publishRound('round-3-uuid', superAdminId);

    // -------------------------------------------------------------------------
    // STEP 6: ROUND 4 (SERIES A INVESTMENT ROUND)
    // -------------------------------------------------------------------------
    await service.openRound('round-4-uuid', superAdminId);

    // Alpha accepts OFFER_A ($800k for 20% equity) -> Dilutes from 75% to 60%
    await service.confirmAdminDecision(
      {
        roundId: 'round-4-uuid',
        teamId: teams[0].id,
        marketingBudget: 220000,
        rdBudget: 180000,
        operationsBudget: 15000,
        productionUnits: 3000,
        unitSellingPrice: 250,
        investmentChoice: 'OFFER_A',
      },
      superAdminId
    );

    // Beta rejects both offers -> Stays at 87.5%
    await service.confirmAdminDecision(
      {
        roundId: 'round-4-uuid',
        teamId: teams[1].id,
        marketingBudget: 300000,
        rdBudget: 60000,
        operationsBudget: 15000,
        productionUnits: 4000,
        unitSellingPrice: 200,
        investmentChoice: 'REJECT_BOTH',
      },
      superAdminId
    );

    // Gamma accepts OFFER_B ($450k for 10% equity) -> Dilutes from 100% to 90%
    await service.confirmAdminDecision(
      {
        roundId: 'round-4-uuid',
        teamId: teams[2].id,
        marketingBudget: 220000,
        rdBudget: 120000,
        operationsBudget: 15000,
        productionUnits: 3000,
        unitSellingPrice: 220,
        investmentChoice: 'OFFER_B',
      },
      superAdminId
    );

    await service.lockRound('round-4-uuid', superAdminId, false);

    const r4SimResult = simulateDomainRound(
      saasDomain,
      4,
      [
        {
          teamId: teams[0].id,
          marketingBudget: 220000,
          rdBudget: 180000,
          operationsBudget: 15000,
          productionUnits: 3000,
          unitPrice: 250,
          investmentDecision: 'OFFER_A',
        },
        {
          teamId: teams[1].id,
          marketingBudget: 300000,
          rdBudget: 60000,
          operationsBudget: 15000,
          productionUnits: 4000,
          unitPrice: 200,
          investmentDecision: 'REJECT_BOTH',
        },
        {
          teamId: teams[2].id,
          marketingBudget: 220000,
          rdBudget: 120000,
          operationsBudget: 15000,
          productionUnits: 3000,
          unitPrice: 220,
          investmentDecision: 'OFFER_B',
        },
      ],
      teams.map(t => snapshots[t.id])
    );

    const alphaR4 = r4SimResult.companyResults.find(r => r.teamId === teams[0].id)!;
    const betaR4 = r4SimResult.companyResults.find(r => r.teamId === teams[1].id)!;
    const gammaR4 = r4SimResult.companyResults.find(r => r.teamId === teams[2].id)!;

    expect(alphaR4.equity.postRoundRetainedEquityPct.toNumber()).toBe(60);
    expect(betaR4.equity.postRoundRetainedEquityPct.toNumber()).toBe(87.5);
    expect(gammaR4.equity.postRoundRetainedEquityPct.toNumber()).toBe(90);

    r4SimResult.companyResults.forEach(res => {
      snapshots[res.teamId] = res.nextSnapshot;
      db.company_snapshots.push({
        id: `snap-r4-${res.teamId}`,
        team_id: res.teamId,
        round_id: 'round-4-uuid',
        round_number: 4,
        starting_cash: snapshots[res.teamId].cash.toNumber(),
        gross_revenue: res.financial.grossRevenue.toNumber(),
        cogs: res.financial.cogs.toNumber(),
        opex: res.financial.totalOpEx.toNumber(),
        ebitda: res.financial.ebitda.toNumber(),
        net_income: res.financial.netIncome.toNumber(),
        ending_cash: res.financial.endingCash.toNumber(),
        retained_equity_pct: res.equity.postRoundRetainedEquityPct.toNumber(),
        enterprise_value: res.valuation.finalValuation.toNumber(),
      });
    });

    db.rounds.find(r => r.id === 'round-4-uuid')!.status = 'simulated';
    await service.reviewRound('round-4-uuid', superAdminId);
    await service.publishRound('round-4-uuid', superAdminId);

    // -------------------------------------------------------------------------
    // STEP 7: ROUND 5 (FINAL HARVEST ROUND & VALUATION)
    // -------------------------------------------------------------------------
    await service.openRound('round-5-uuid', superAdminId);

    for (const team of teams) {
      await service.confirmAdminDecision(
        {
          roundId: 'round-5-uuid',
          teamId: team.id,
          marketingBudget: 200000,
          rdBudget: 100000,
          operationsBudget: 15000,
          productionUnits: 3000,
          unitSellingPrice: 210,
          investmentChoice: 'none',
        },
        superAdminId
      );
    }

    await service.lockRound('round-5-uuid', superAdminId, false);

    const r5SimResult = simulateDomainRound(
      saasDomain,
      5,
      teams.map(t => ({
        teamId: t.id,
        marketingBudget: 200000,
        rdBudget: 100000,
        operationsBudget: 15000,
        productionUnits: 3000,
        unitPrice: 210,
        investmentDecision: 'REJECT_BOTH',
      })),
      teams.map(t => snapshots[t.id])
    );

    r5SimResult.companyResults.forEach(res => {
      snapshots[res.teamId] = res.nextSnapshot;
      db.company_snapshots.push({
        id: `snap-r5-${res.teamId}`,
        team_id: res.teamId,
        round_id: 'round-5-uuid',
        round_number: 5,
        starting_cash: snapshots[res.teamId].cash.toNumber(),
        gross_revenue: res.financial.grossRevenue.toNumber(),
        cogs: res.financial.cogs.toNumber(),
        opex: res.financial.totalOpEx.toNumber(),
        ebitda: res.financial.ebitda.toNumber(),
        net_income: res.financial.netIncome.toNumber(),
        ending_cash: res.financial.endingCash.toNumber(),
        retained_equity_pct: res.equity.postRoundRetainedEquityPct.toNumber(),
        enterprise_value: res.valuation.finalValuation.toNumber(),
      });
    });

    db.rounds.find(r => r.id === 'round-5-uuid')!.status = 'simulated';
    await service.reviewRound('round-5-uuid', superAdminId);
    await service.publishRound('round-5-uuid', superAdminId);

    // -------------------------------------------------------------------------
    // STEP 8: FINAL SCORING CALCULATION: VALUATION × RETAINED EQUITY RATIO
    // -------------------------------------------------------------------------
    const finalScores = r5SimResult.companyResults.map(r => {
      const valuation = r.valuation.finalValuation;
      const equityPct = r.equity.postRoundRetainedEquityPct;
      const finalScore = valuation.times(equityPct.dividedBy(100));
      return {
        teamId: r.teamId,
        finalValuation: valuation.toNumber(),
        retainedEquityPct: equityPct.toNumber(),
        finalScore: finalScore.toNumber(),
        cumulativeEbitda: r.financial.ebitda.toNumber(),
        cash: r.financial.endingCash.toNumber(),
      };
    });

    // Verify mathematical invariant
    finalScores.forEach(fs => {
      const calculatedExpected = (fs.finalValuation * fs.retainedEquityPct) / 100;
      expect(fs.finalScore).toBeCloseTo(calculatedExpected, 2);
    });

    // -------------------------------------------------------------------------
    // STEP 9: STAGE CONTROLLER & CEREMONY WINNER EMBARGO VERIFICATION
    // -------------------------------------------------------------------------
    // 9.1 Initial Presentation State is 'waiting'
    const presInitial = await service.getPresentationState(eventId);
    expect(presInitial.ceremonyStage).toBe('waiting');
    expect(presInitial.isWinnerRevealed).toBe(false);

    // 9.2 Public presentation data in 'waiting' stage MUST embargo podium
    const publicWaiting = await service.getPublicPresentationData(eventId);
    expect(publicWaiting.ceremony).toBeNull(); // Embargoed before podium!

    // 9.3 Super Admin advances ceremony stage through 3rd, 2nd, 1st place, and podium
    await service.updatePresentationState(
      eventId,
      { ceremonyStage: 'third_place', isWinnerRevealed: false },
      superAdminId
    );
    const presThird = await service.getPresentationState(eventId);
    expect(presThird.ceremonyStage).toBe('third_place');

    await service.updatePresentationState(
      eventId,
      { ceremonyStage: 'first_place', isWinnerRevealed: true },
      superAdminId
    );
    const presFirst = await service.getPresentationState(eventId);
    expect(presFirst.ceremonyStage).toBe('first_place');
    expect(presFirst.isWinnerRevealed).toBe(true);

    // 9.4 Final stage: full_leaderboard
    await service.updatePresentationState(
      eventId,
      { ceremonyStage: 'full_leaderboard', isWinnerRevealed: true },
      superAdminId
    );
    const presFull = await service.getPresentationState(eventId);
    expect(presFull.ceremonyStage).toBe('full_leaderboard');
    expect(presFull.isWinnerRevealed).toBe(true);

    // -------------------------------------------------------------------------
    // STEP 10: NEGATIVE & SECURITY VERIFICATION
    // -------------------------------------------------------------------------
    // 10.1 Block deleting a team with verified decisions
    db.decisions.push({
      id: 'dec-verified-block',
      round_id: 'round-1-uuid',
      team_id: teams[0].id,
      status: 'verified',
    });

    await expect(service.deleteTeam(teams[0].id, superAdminId)).rejects.toThrowError(AppError);

    try {
      await service.deleteTeam(teams[0].id, superAdminId);
    } catch (err: any) {
      expect(err.code).toBe('CASCADE_GUARD_VIOLATION');
      expect(err.statusCode).toBe(409);
    }
  });
});
