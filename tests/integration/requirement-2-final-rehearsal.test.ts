import { describe, it, expect, beforeEach } from 'vitest';
import { TournamentService } from '@/lib/services/tournament-service';
import {
  getOrganizerPolicyGates,
  resetOrganizerPolicyGates,
} from '@/lib/services/organizer-approvals';
import { DOMAIN_ARCHETYPES } from '@/engine/config/domain-archetypes';
import { AppError } from '@/lib/errors/app-error';
import { D } from '@/engine/math/precision';
import { CompanyDecision, CompanySnapshot, DomainConfig, TournamentSimulationResult } from '@/engine/types';
import { DynamicInvestmentOfferProvider } from '@/engine/config/investment-offers';
import { simulateTournamentRound } from '@/engine/simulation/tournament-simulation';
import { serializeLedgerEntriesForDatabase, serializeSnapshotsForDatabase } from '@/lib/services/simulation-runner';

/**
 * CAPITAL QUEST — REQUIREMENT 2 FINAL DEVELOPMENT REHEARSAL
 *
 * Full End-to-End Multi-Domain Tournament Rehearsal:
 * 1. Isolated Tournament with 6 teams across D2C, HEALTH, and SAAS.
 * 2. Round 1 completion with performance divergence (High, Moderate, Low).
 * 3. Round 2 performance-based investor offers across tiers (Low, Moderate, High).
 * 4. Information barrier: confidence score & breakdown hidden from participants.
 * 5. Accept Offer A, Accept Offer B, and Reject Both testing.
 * 6. Immutability locking: confirmed choices cannot be altered (409 DECISION_LOCKED).
 * 7. Round 2 simulation: financial ledger, cash reconciliation, zero revenue distortion, equity dilution.
 * 8. Round 3 execution with historical carry-forward.
 * 9. Round 4 Series A offers using 50/30/20 weighted historical performance.
 * 10. Round 4 simulation: compounding multiplicative dilution (total exactly 100.0000%) & exactly-once funding.
 * 11. Round 5 Final Harvest: equity-adjusted scoring (Valuation * FounderEquityPct).
 * 12. Independent Domain Champions & Winner Embargo verification.
 * 13. Safe Reset and Recovery behavior.
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
  team_investor_offers: any[];
  tournament_backups: any[];
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
          currentFilter = (row: any) => {
            if (!prev(row)) return false;
            if (col.includes('.')) {
              const parts = col.split('.');
              let cur = row;
              for (const p of parts) {
                cur = cur?.[p];
              }
              return cur === val;
            }
            return row[col] === val;
          };
          return chain;
        },
        neq: (col: string, val: any) => {
          const prev = currentFilter;
          currentFilter = (row: any) => prev(row) && row[col] !== val;
          return chain;
        },
        lt: (col: string, val: any) => {
          const prev = currentFilter;
          currentFilter = (row: any) => prev(row) && row[col] < val;
          return chain;
        },
        lte: (col: string, val: any) => {
          const prev = currentFilter;
          currentFilter = (row: any) => prev(row) && row[col] <= val;
          return chain;
        },
        gt: (col: string, val: any) => {
          const prev = currentFilter;
          currentFilter = (row: any) => prev(row) && row[col] > val;
          return chain;
        },
        gte: (col: string, val: any) => {
          const prev = currentFilter;
          currentFilter = (row: any) => prev(row) && row[col] >= val;
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
              maybeSingle: async () => ({ data: inserted[0] || null, error: null }),
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
              (item.event_id && r.event_id === item.event_id && !item.team_id)
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
              maybeSingle: async () => ({ data: upserted[0] || null, error: null }),
            }),
            then: (resolve: any) => Promise.resolve({ data: upserted, error: null }).then(resolve),
          };
          return builder;
        },
        update: (payload: any) => {
          let updateFilter: ((row: any) => boolean) = currentFilter;
          const updateChain: any = {
            eq: (col: string, val: any) => {
              const prev = updateFilter;
              updateFilter = (row: any) => prev(row) && row[col] === val;
              return updateChain;
            },
            select: () => updateChain,
            single: async () => {
              const res = await updateChain;
              return { data: res.data[0] || null, error: null };
            },
            maybeSingle: async () => {
              const res = await updateChain;
              return { data: res.data[0] || null, error: null };
            },
            then: (resolve: any) => {
              const updatedRows: any[] = [];
              for (let i = 0; i < db[table].length; i++) {
                if (updateFilter(db[table][i])) {
                  db[table][i] = { ...db[table][i], ...payload };
                  updatedRows.push(db[table][i]);
                }
              }
              return Promise.resolve({ data: updatedRows, error: null }).then(resolve);
            },
          };
          return updateChain;
        },
        delete: () => {
          let deleteFilter: ((row: any) => boolean) = currentFilter;
          const deleteChain: any = {
            eq: (col: string, val: any) => {
              const prev = deleteFilter;
              deleteFilter = (row: any) => prev(row) && row[col] === val;
              return deleteChain;
            },
            then: (resolve: any) => {
              const toDelete = db[table].filter(deleteFilter);
              db[table] = db[table].filter(r => !deleteFilter(r));
              return Promise.resolve({ data: toDelete, error: null }).then(resolve);
            },
          };
          return deleteChain;
        },
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
      if (fn === 'fn_transition_round_status') {
        const round = db.rounds.find(r => r.id === args.p_round_id);
        if (!round) {
          return { data: null, error: { message: 'Round not found', code: 'P0002' } };
        }
        round.status = args.p_new_status;
        return { data: { round_id: round.id, new_status: args.p_new_status }, error: null };
      }

      if (fn === 'fn_reset_round_decisions') {
        const round = db.rounds.find(r => r.id === args.p_round_id);
        if (!round) {
          return { data: null, error: { message: 'Round not found', code: 'P0002' } };
        }
        if (['simulated', 'reviewed', 'published'].includes(round.status)) {
          return {
            data: null,
            error: {
              code: '23503',
              message: `Cannot reset round ${round.round_number} decisions because simulation history already exists.`,
            },
          };
        }
        const decisionsCount = db.decisions.filter(d => d.round_id === args.p_round_id).length;
        db.decisions = db.decisions.filter(d => d.round_id !== args.p_round_id);
        round.status = args.p_target_status || 'draft';

        return {
          data: {
            success: true,
            round_id: round.id,
            previous_status: round.status,
            new_status: round.status,
            decisions_cleared: decisionsCount,
          },
          error: null,
        };
      }

      if (fn === 'fn_reset_entire_tournament') {
        const event = db.events.find(e => e.id === args.p_event_id);
        if (!event) return { data: null, error: { message: 'Event not found', code: 'P0002' } };

        db.decisions = [];
        db.company_snapshots = [];
        db.simulation_runs = [];
        db.financial_ledger = [];
        db.equity_transactions = [];
        db.team_investor_offers = [];
        for (const r of db.rounds) {
          r.status = 'draft';
        }

        return {
          data: {
            success: true,
            event_id: args.p_event_id,
            cleared_tables: ['decisions', 'company_snapshots', 'financial_ledger', 'team_investor_offers'],
          },
          error: null,
        };
      }

      return { data: null, error: { message: `Unknown RPC ${fn}`, code: 'P0001' } };
    },
  };
}

describe('Capital Quest — Requirement 2 Comprehensive Development Rehearsal', () => {
  const eventId = '10000000-0000-0000-0000-000000000001';
  const superAdminId = '90000000-0000-0000-0000-000000000099';

  let db: MockDB;
  let service: TournamentService;

  beforeEach(() => {
    resetOrganizerPolicyGates(eventId);
    const gates = getOrganizerPolicyGates(eventId);
    gates.cashValuationPolicyApproved = true;
    gates.corporateTaxationApproved = true;
    gates.standardVCOffersApproved = true;
    gates.strictSpendingRejectionApproved = true;
    gates.proRataScalingApproved = false;

    db = {
      events: [
        {
          id: eventId,
          slug: 'capital-quest-req2-rehearsal',
          name: 'Capital Quest Requirement 2 Rehearsal',
          status: 'setup',
          total_rounds: 5,
          starting_capital: 1000000,
          starting_valuation: 200000,
          active_round_number: 1,
          created_by: superAdminId,
        },
      ],
      domains: [
        { id: 'dom-d2c', event_id: eventId, code: 'D2C', name: 'D2C Consumer Goods' },
        { id: 'dom-health', event_id: eventId, code: 'HEALTH', name: 'HealthTech & BioDevices' },
        { id: 'dom-saas', event_id: eventId, code: 'SAAS', name: 'Enterprise SaaS & AI' },
      ],
      rounds: [
        { id: 'round-1', event_id: eventId, round_number: 1, type: 'regular', status: 'draft' },
        { id: 'round-2', event_id: eventId, round_number: 2, type: 'investment_seed', status: 'draft' },
        { id: 'round-3', event_id: eventId, round_number: 3, type: 'regular', status: 'draft' },
        { id: 'round-4', event_id: eventId, round_number: 4, type: 'investment_series_a', status: 'draft' },
        { id: 'round-5', event_id: eventId, round_number: 5, type: 'final_harvest', status: 'draft' },
      ],
      teams: [
        // D2C
        { id: 'team-d2c-1', event_id: eventId, domain_id: 'dom-d2c', team_code: 'D2C-01', company_name: 'Aura Apparel' },
        { id: 'team-d2c-2', event_id: eventId, domain_id: 'dom-d2c', team_code: 'D2C-02', company_name: 'Nova Nutrition' },
        // HEALTH
        { id: 'team-hlth-1', event_id: eventId, domain_id: 'dom-health', team_code: 'HLT-01', company_name: 'Pulse Diagnostics' },
        { id: 'team-hlth-2', event_id: eventId, domain_id: 'dom-health', team_code: 'HLT-02', company_name: 'CelluCare Health' },
        // SAAS
        { id: 'team-saas-1', event_id: eventId, domain_id: 'dom-saas', team_code: 'SAS-01', company_name: 'CloudMatrix AI' },
        { id: 'team-saas-2', event_id: eventId, domain_id: 'dom-saas', team_code: 'SAS-02', company_name: 'DataSphere Systems' },
      ],
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
          id: 'pres-state',
          event_id: eventId,
          display_mode: 'leaderboard',
          ceremony_stage: 'waiting',
          is_winner_revealed: false,
        },
      ],
      team_investor_offers: [],
      tournament_backups: [],
    };

    service = new TournamentService(createInMemorySupabase(db) as any);
  });

  it('executes full 5-round development rehearsal with dynamic investor funding and equity dilution', async () => {
    // =========================================================================
    // STEP 1: ROUND 1 EXECUTION & DIVERGENT PERFORMANCE
    // =========================================================================
    const r1 = db.rounds[0];
    r1.status = 'open';

    // R1 Decisions across 3 domains
    // D2C
    const d2cConfig = DOMAIN_ARCHETYPES.d2c;
    const decD2C1: CompanyDecision = {
      teamId: 'team-d2c-1',
      unitPrice: D(65),
      marketingBudget: D(100000),
      rdBudget: D(80000),
      productionUnits: D(25000),
      operationsBudget: D(40000),
      investmentDecision: 'REJECT_BOTH',
    };
    const decD2C2: CompanyDecision = {
      teamId: 'team-d2c-2',
      unitPrice: D(85),
      marketingBudget: D(40000),
      rdBudget: D(30000),
      productionUnits: D(15000),
      operationsBudget: D(30000),
      investmentDecision: 'REJECT_BOTH',
    };

    // HEALTH
    const hlthConfig = DOMAIN_ARCHETYPES.healthtech;
    const decHLT1: CompanyDecision = {
      teamId: 'team-hlth-1',
      unitPrice: D(2500),
      marketingBudget: D(140000),
      rdBudget: D(120000),
      productionUnits: D(500),
      operationsBudget: D(60000),
      investmentDecision: 'REJECT_BOTH',
    };
    const decHLT2: CompanyDecision = {
      teamId: 'team-hlth-2',
      unitPrice: D(1600), // Low price, thin/negative margin
      marketingBudget: D(300000), // High burn
      rdBudget: D(150000), // High burn
      productionUnits: D(300), // Low units produced
      operationsBudget: D(100000),
      investmentDecision: 'REJECT_BOTH',
    };

    // SAAS
    const saasConfig = DOMAIN_ARCHETYPES.saas;
    const decSAS1: CompanyDecision = {
      teamId: 'team-saas-1',
      unitPrice: D(350),
      marketingBudget: D(140000),
      rdBudget: D(110000),
      productionUnits: D(25000),
      operationsBudget: D(50000),
      investmentDecision: 'REJECT_BOTH',
    };
    const decSAS2: CompanyDecision = {
      teamId: 'team-saas-2',
      unitPrice: D(450),
      marketingBudget: D(50000),
      rdBudget: D(40000),
      productionUnits: D(15000),
      operationsBudget: D(40000),
      investmentDecision: 'REJECT_BOTH',
    };

    // Store R1 decisions in DB
    for (const d of [decD2C1, decD2C2, decHLT1, decHLT2, decSAS1, decSAS2]) {
      db.decisions.push({
        id: `dec-r1-${d.teamId}`,
        round_id: r1.id,
        team_id: d.teamId,
        unit_price: Number(d.unitPrice),
        marketing_budget: Number(d.marketingBudget),
        rd_budget: Number(d.rdBudget),
        production_units: Number(d.productionUnits),
        operations_budget: Number(d.operationsBudget),
        investment_decision: 'none',
        status: 'verified',
      });
    }

    // Simulate R1 using tournament simulation engine
    const initialSnapshots: CompanySnapshot[] = [
      { teamId: 'team-d2c-1', roundNumber: 0, cash: D(1000000), beginningInventoryUnits: D(0), inventoryAverageUnitCost: D(d2cConfig.baseUnitCogs), cumulativeRdStock: D(0), cumulativeBrandStock: D(0), retainedEquityPct: D(100), valuation: D(200000) },
      { teamId: 'team-d2c-2', roundNumber: 0, cash: D(1000000), beginningInventoryUnits: D(0), inventoryAverageUnitCost: D(d2cConfig.baseUnitCogs), cumulativeRdStock: D(0), cumulativeBrandStock: D(0), retainedEquityPct: D(100), valuation: D(200000) },
      { teamId: 'team-hlth-1', roundNumber: 0, cash: D(1000000), beginningInventoryUnits: D(0), inventoryAverageUnitCost: D(hlthConfig.baseUnitCogs), cumulativeRdStock: D(0), cumulativeBrandStock: D(0), retainedEquityPct: D(100), valuation: D(200000) },
      { teamId: 'team-hlth-2', roundNumber: 0, cash: D(1000000), beginningInventoryUnits: D(0), inventoryAverageUnitCost: D(hlthConfig.baseUnitCogs), cumulativeRdStock: D(0), cumulativeBrandStock: D(0), retainedEquityPct: D(100), valuation: D(200000) },
      { teamId: 'team-saas-1', roundNumber: 0, cash: D(1000000), beginningInventoryUnits: D(0), inventoryAverageUnitCost: D(saasConfig.baseUnitCogs), cumulativeRdStock: D(0), cumulativeBrandStock: D(0), retainedEquityPct: D(100), valuation: D(200000) },
      { teamId: 'team-saas-2', roundNumber: 0, cash: D(1000000), beginningInventoryUnits: D(0), inventoryAverageUnitCost: D(saasConfig.baseUnitCogs), cumulativeRdStock: D(0), cumulativeBrandStock: D(0), retainedEquityPct: D(100), valuation: D(200000) },
    ];

    const domainConfigMap = new Map<string, DomainConfig>([
      ['D2C', d2cConfig],
      ['HEALTH', hlthConfig],
      ['SAAS', saasConfig],
    ]);
    const teamDomainMap = new Map<string, string>([
      ['team-d2c-1', 'D2C'],
      ['team-d2c-2', 'D2C'],
      ['team-hlth-1', 'HEALTH'],
      ['team-hlth-2', 'HEALTH'],
      ['team-saas-1', 'SAAS'],
      ['team-saas-2', 'SAAS'],
    ]);

    const r1Result = simulateTournamentRound({
      roundNumber: 1,
      decisions: [decD2C1, decD2C2, decHLT1, decHLT2, decSAS1, decSAS2],
      snapshots: initialSnapshots,
      teamDomainMap,
    });

    const teamMetaMap = new Map(
      db.teams.map(t => {
        const dom = db.domains.find(d => d.id === t.domain_id)!;
        return [
          t.id,
          {
            id: t.id,
            team_code: t.team_code,
            company_name: t.company_name,
            table_station: 'Table-1',
            domain_id: t.domain_id,
            domains: { id: dom.id, code: dom.code, name: dom.name },
          },
        ];
      })
    );

    // Commit R1 snapshots & ledger
    const r1Snapshots = serializeSnapshotsForDatabase(r1Result);
    const r1Ledger = serializeLedgerEntriesForDatabase(
      r1Result,
      new Map(initialSnapshots.map(s => [s.teamId, s]))
    );
    r1.status = 'published';
    r1.published_at = new Date().toISOString();
    db.events[0].active_round_number = 1;

    for (const snap of r1Snapshots) {
      db.company_snapshots.push({
        ...snap,
        round_id: r1.id,
        event_id: eventId,
        teams: teamMetaMap.get(snap.team_id as string),
        rounds: { round_number: 1, status: 'published', published_at: r1.published_at },
        is_active: true,
      });
    }
    for (const row of r1Ledger) {
      db.financial_ledger.push({ ...row, round_id: r1.id, event_id: eventId });
    }

    // Verify R1 public leaderboard independence
    const r1Leaderboard = await service.getPublicLeaderboard({ eventId });
    expect(r1Leaderboard.roundNumber).toBe(1);
    const d2cSection = r1Leaderboard.domains?.find(d => d.domainCode === 'D2C');
    expect(d2cSection?.teams).toHaveLength(2);
    expect(d2cSection?.teams[0].domainRank).toBe(1);
    const healthSection = r1Leaderboard.domains?.find(d => d.domainCode === 'HEALTH');
    expect(healthSection?.teams).toHaveLength(2);
    const saasSection = r1Leaderboard.domains?.find(d => d.domainCode === 'SAAS');
    expect(saasSection?.teams).toHaveLength(2);

    // =========================================================================
    // STEP 2: ROUND 2 PERFORMANCE-BASED INVESTOR OFFERS & CONFIDENTIALITY
    // =========================================================================
    const r2 = db.rounds[1];
    r2.status = 'open';

    // Query offers as Super Admin (full confidence score & breakdown visible)
    const adminOffersD2C1 = await service.getOrGenerateTeamInvestorOffers(r2.id, 'team-d2c-1', 'super_admin');
    const adminOffersHLT1 = await service.getOrGenerateTeamInvestorOffers(r2.id, 'team-hlth-1', 'super_admin');
    const adminOffersHLT2 = await service.getOrGenerateTeamInvestorOffers(r2.id, 'team-hlth-2', 'super_admin');
    const adminOffersSAS2 = await service.getOrGenerateTeamInvestorOffers(r2.id, 'team-saas-2', 'super_admin');

    // Aura Apparel (D2C-1) had high performance -> High Tier (Score >= 70)
    expect(adminOffersD2C1.confidenceScore).toBeGreaterThanOrEqual(70);
    expect(adminOffersD2C1.confidenceTier).toBe('high');
    expect(adminOffersD2C1.offerA.fundingAmount.toNumber()).toBe(250000);
    expect(adminOffersD2C1.offerA.equityStakePct.toNumber()).toBe(8.0);
    expect(adminOffersD2C1.offerB.fundingAmount.toNumber()).toBe(450000);
    expect(adminOffersD2C1.offerB.equityStakePct.toNumber()).toBe(18.0);

    // Pulse Diagnostics (HLT-1) had high performance -> High Tier
    expect(adminOffersHLT1.confidenceTier).toBe('high');
    expect(adminOffersHLT1.offerB.fundingAmount.toNumber()).toBe(450000);
    expect(adminOffersHLT1.offerB.equityStakePct.toNumber()).toBe(18.0);

    // CelluCare Health (HLT-2) under-produced and had low sales -> Low/Moderate Tier
    expect(adminOffersHLT2.confidenceScore).toBeLessThan(70);
    expect(['low', 'moderate']).toContain(adminOffersHLT2.confidenceTier);

    // Confidentiality Check: Query as participant/volunteer (Score & Breakdown MUST BE HIDDEN)
    const participantOffersD2C1 = await service.getOrGenerateTeamInvestorOffers(r2.id, 'team-d2c-1', 'participant');
    expect(participantOffersD2C1.confidenceScore).toBeUndefined();
    expect(participantOffersD2C1.scoringBreakdown).toBeUndefined();
    expect(participantOffersD2C1.offerA.fundingAmount.toNumber()).toBe(250000);
    expect(participantOffersD2C1.offerA.equityStakePct.toNumber()).toBe(8.0);

    // =========================================================================
    // STEP 3: ACCEPT A, ACCEPT B, REJECT BOTH & IMMUTABILITY LOCKS
    // =========================================================================
    // Team 1: Accept Offer A ($250k for 8%)
    const confirmD2C1 = await service.confirmTeamInvestmentChoice({
      roundId: r2.id,
      teamId: 'team-d2c-1',
      choice: 'offer_a',
      adminId: superAdminId,
    });
    expect(confirmD2C1.success).toBe(true);
    expect(confirmD2C1.selectedChoice).toBe('offer_a');
    expect(confirmD2C1.isConfirmed).toBe(true);

    // Team 2: Reject Both ($0 for 0%)
    await service.confirmTeamInvestmentChoice({
      roundId: r2.id,
      teamId: 'team-d2c-2',
      choice: 'reject_both',
      adminId: superAdminId,
    });

    // Team 3: Accept Offer B ($450k for 18%)
    await service.confirmTeamInvestmentChoice({
      roundId: r2.id,
      teamId: 'team-hlth-1',
      choice: 'offer_b',
      adminId: superAdminId,
    });

    // Team 4: Accept Offer A
    await service.confirmTeamInvestmentChoice({
      roundId: r2.id,
      teamId: 'team-hlth-2',
      choice: 'offer_a',
      adminId: superAdminId,
    });

    // Team 5: Accept Offer B ($450k for 18%)
    await service.confirmTeamInvestmentChoice({
      roundId: r2.id,
      teamId: 'team-saas-1',
      choice: 'offer_b',
      adminId: superAdminId,
    });

    // Team 6: Reject Both
    await service.confirmTeamInvestmentChoice({
      roundId: r2.id,
      teamId: 'team-saas-2',
      choice: 'reject_both',
      adminId: superAdminId,
    });

    // IMMUTABILITY LOCK VERIFICATION:
    // 1. Attempting to confirm choice again must throw DECISION_LOCKED (409)
    await expect(
      service.confirmTeamInvestmentChoice({
        roundId: r2.id,
        teamId: 'team-d2c-1',
        choice: 'offer_b',
        adminId: superAdminId,
      })
    ).rejects.toThrow(AppError);

    // 2. Attempting to submit conflicting decision must throw DECISION_LOCKED (409)
    await expect(
      service.submitDecision(
        {
          roundId: r2.id,
          teamId: 'team-d2c-1',
          unitPrice: 65,
          marketingBudget: 100000,
          rdBudget: 80000,
          productionUnits: 10000,
          operationsBudget: 40000,
          investmentDecision: 'offer_b', // Conflict!
        },
        superAdminId
      )
    ).rejects.toThrow('Investor offer choice is already confirmed and permanently locked');

    // =========================================================================
    // STEP 4: SIMULATE ROUND 2 & FINANCIAL RECONCILIATIONS
    // =========================================================================
    // Create R2 decisions reflecting confirmed choices
    const decR2_D2C1: CompanyDecision = { ...decD2C1, investmentDecision: 'OFFER_A' };
    const decR2_D2C2: CompanyDecision = { ...decD2C2, investmentDecision: 'REJECT_BOTH' };
    const decR2_HLT1: CompanyDecision = { ...decHLT1, investmentDecision: 'OFFER_B' };
    const decR2_HLT2: CompanyDecision = { ...decHLT2, investmentDecision: 'OFFER_A' };
    const decR2_SAS1: CompanyDecision = { ...decSAS1, investmentDecision: 'OFFER_B' };
    const decR2_SAS2: CompanyDecision = { ...decSAS2, investmentDecision: 'REJECT_BOTH' };

    // Previous snapshot map from R1
    const r1SnapshotMap = new Map<string, CompanySnapshot>();
    for (const res of r1Result.companyResults) {
      r1SnapshotMap.set(res.teamId, res.nextSnapshot);
    }

    // Dynamic offer provider configured with frozen database offers
    const dynamicOfferProvider = new DynamicInvestmentOfferProvider();
    for (const offerRow of db.team_investor_offers.filter(o => o.round_number === 2)) {
      const cashA = D(offerRow.offer_a_amount);
      const eqA = D(offerRow.offer_a_equity_pct);
      const postA = cashA.dividedBy(eqA.dividedBy(100));
      const offerA = {
        roundNumber: 2,
        offerType: 'OFFER_A' as const,
        name: 'R2 Offer A',
        cashInjection: cashA,
        equityStakePct: eqA,
        impliedPostMoneyValuation: postA,
        impliedPreMoneyValuation: postA.minus(cashA),
      };

      const cashB = D(offerRow.offer_b_amount);
      const eqB = D(offerRow.offer_b_equity_pct);
      const postB = cashB.dividedBy(eqB.dividedBy(100));
      const offerB = {
        roundNumber: 2,
        offerType: 'OFFER_B' as const,
        name: 'R2 Offer B',
        cashInjection: cashB,
        equityStakePct: eqB,
        impliedPostMoneyValuation: postB,
        impliedPreMoneyValuation: postB.minus(cashB),
      };

      dynamicOfferProvider.registerTeamOffers(offerRow.team_id, offerA, offerB);
    }

    const r2Result = simulateTournamentRound({
      roundNumber: 2,
      decisions: [decR2_D2C1, decR2_D2C2, decR2_HLT1, decR2_HLT2, decR2_SAS1, decR2_SAS2],
      snapshots: Array.from(r1SnapshotMap.values()),
      teamDomainMap,
      options: { offerProvider: dynamicOfferProvider },
    });

    // Commit R2 snapshots & ledger
    const r2Snapshots = serializeSnapshotsForDatabase(r2Result);
    const r2Ledger = serializeLedgerEntriesForDatabase(r2Result, r1SnapshotMap);
    r2.status = 'published';
    r2.published_at = new Date().toISOString();
    db.events[0].active_round_number = 2;

    for (const snap of r2Snapshots) {
      db.company_snapshots.push({
        ...snap,
        round_id: r2.id,
        event_id: eventId,
        teams: teamMetaMap.get(snap.team_id as string),
        rounds: { round_number: 2, status: 'published', published_at: r2.published_at },
        is_active: true,
      });
    }
    for (const row of r2Ledger) {
      db.financial_ledger.push({ ...row, round_id: r2.id, event_id: eventId });
    }

    // FINANCIAL STATEMENT RECONCILIATIONS:
    // Check Team 1 (Aura Apparel - Accepted Offer A: $250k for 8%)
    const resD2C1 = r2Result.companyResults.find(r => r.teamId === 'team-d2c-1')!;
    expect(resD2C1.equity.cashInjected.toNumber()).toBe(250000);
    expect(resD2C1.equity.postRoundRetainedEquityPct.toNumber()).toBe(92.0); // 100% - 8% = 92%
    expect(resD2C1.financial.financingCashFlow.toNumber()).toBe(250000);

    // Zero revenue distortion: Revenue reflects sales ONLY, never investor cash
    expect(resD2C1.financial.grossRevenue.gt(0)).toBe(true);
    expect(resD2C1.financial.grossRevenue.equals(resD2C1.fulfillment.totalUnitsSold.mul(resD2C1.validatedDecision.unitPrice))).toBe(true);

    // Ending Cash Reconciliation: endingCash = beginningCash + sales - opCosts - taxes + financingCashFlow
    const beginningCashD2C1 = r1SnapshotMap.get('team-d2c-1')!.cash;
    const expectedEndingCashD2C1 = beginningCashD2C1
      .add(resD2C1.financial.operatingCashFlow)
      .add(resD2C1.financial.financingCashFlow);
    expect(resD2C1.financial.endingCash.toFixed(2)).toBe(expectedEndingCashD2C1.toFixed(2));

    // Ledger check: exact investor_funding entry in financial_ledger
    const fundingLedgerEntryD2C1 = db.financial_ledger.find(
      l => l.round_id === r2.id && l.team_id === 'team-d2c-1' && l.entry_type === 'investor_funding'
    );
    expect(fundingLedgerEntryD2C1).toBeDefined();
    expect(Number(fundingLedgerEntryD2C1.amount)).toBe(250000);

    // Check Team 2 (Nova Nutrition - Rejected Both)
    const resD2C2 = r2Result.companyResults.find(r => r.teamId === 'team-d2c-2')!;
    expect(resD2C2.equity.cashInjected.toNumber()).toBe(0);
    expect(resD2C2.equity.postRoundRetainedEquityPct.toNumber()).toBe(100.0);
    expect(resD2C2.financial.financingCashFlow.toNumber()).toBe(0);

    // Check Team 3 (Pulse Diagnostics - Accepted Offer B: $450k for 18%)
    const resHLT1 = r2Result.companyResults.find(r => r.teamId === 'team-hlth-1')!;
    expect(resHLT1.equity.cashInjected.toNumber()).toBe(450000);
    expect(resHLT1.equity.postRoundRetainedEquityPct.toNumber()).toBe(82.0); // 100% - 18% = 82%

    // =========================================================================
    // STEP 5: ROUND 3 ADVANCEMENT & CARRY-FORWARD
    // =========================================================================
    const r3 = db.rounds[2];
    r3.status = 'open';

    const r2SnapshotMap = new Map<string, CompanySnapshot>();
    for (const res of r2Result.companyResults) {
      r2SnapshotMap.set(res.teamId, res.nextSnapshot);
    }

    const r3Result = simulateTournamentRound({
      roundNumber: 3,
      decisions: [decD2C1, decD2C2, decHLT1, decHLT2, decSAS1, decSAS2],
      snapshots: Array.from(r2SnapshotMap.values()),
      teamDomainMap,
    });

    const r3Snapshots = serializeSnapshotsForDatabase(r3Result);
    const r3Ledger = serializeLedgerEntriesForDatabase(r3Result, r2SnapshotMap);
    r3.status = 'published';
    r3.published_at = new Date().toISOString();
    db.events[0].active_round_number = 3;

    for (const snap of r3Snapshots) {
      db.company_snapshots.push({
        ...snap,
        round_id: r3.id,
        event_id: eventId,
        teams: teamMetaMap.get(snap.team_id as string),
        rounds: { round_number: 3, status: 'published', published_at: r3.published_at },
        is_active: true,
      });
    }
    for (const row of r3Ledger) {
      db.financial_ledger.push({ ...row, round_id: r3.id, event_id: eventId });
    }

    // =========================================================================
    // STEP 6: ROUND 4 SERIES A OFFERS & COMPOUNDING DILUTION
    // =========================================================================
    const r4 = db.rounds[3];
    r4.status = 'open';

    // Generate R4 offers (Series A evaluates R1, R2, and R3 with 50/30/20 weights)
    const adminOffersHLT1_R4 = await service.getOrGenerateTeamInvestorOffers(r4.id, 'team-hlth-1', 'super_admin');
    expect(adminOffersHLT1_R4.confidenceTier).toBe('high');
    expect(adminOffersHLT1_R4.offerA.fundingAmount.toNumber()).toBe(250000);
    expect(adminOffersHLT1_R4.offerA.equityStakePct.toNumber()).toBe(8.0);
    expect(adminOffersHLT1_R4.offerB.fundingAmount.toNumber()).toBe(450000);
    expect(adminOffersHLT1_R4.offerB.equityStakePct.toNumber()).toBe(18.0);

    // Team 3 (Pulse Diagnostics) currently has 82% equity. Accepts Series A Offer B (18% equity).
    await service.confirmTeamInvestmentChoice({
      roundId: r4.id,
      teamId: 'team-hlth-1',
      choice: 'offer_b',
      adminId: superAdminId,
    });

    // Team 1 (Aura Apparel) currently has 92% equity. Accepts Series A Offer A (8% equity).
    await service.confirmTeamInvestmentChoice({
      roundId: r4.id,
      teamId: 'team-d2c-1',
      choice: 'offer_a',
      adminId: superAdminId,
    });

    // Team 2 (Nova Nutrition) currently has 100% equity. Rejects both.
    await service.confirmTeamInvestmentChoice({
      roundId: r4.id,
      teamId: 'team-d2c-2',
      choice: 'reject_both',
      adminId: superAdminId,
    });

    // Configure dynamic offer provider for R4
    const r4OfferProvider = new DynamicInvestmentOfferProvider();
    for (const offerRow of db.team_investor_offers.filter(o => o.round_number === 4)) {
      const cashA = D(offerRow.offer_a_amount);
      const eqA = D(offerRow.offer_a_equity_pct);
      const postA = cashA.dividedBy(eqA.dividedBy(100));
      const offerA = {
        roundNumber: 4,
        offerType: 'OFFER_A' as const,
        name: 'R4 Offer A',
        cashInjection: cashA,
        equityStakePct: eqA,
        impliedPostMoneyValuation: postA,
        impliedPreMoneyValuation: postA.minus(cashA),
      };

      const cashB = D(offerRow.offer_b_amount);
      const eqB = D(offerRow.offer_b_equity_pct);
      const postB = cashB.dividedBy(eqB.dividedBy(100));
      const offerB = {
        roundNumber: 4,
        offerType: 'OFFER_B' as const,
        name: 'R4 Offer B',
        cashInjection: cashB,
        equityStakePct: eqB,
        impliedPostMoneyValuation: postB,
        impliedPreMoneyValuation: postB.minus(cashB),
      };

      r4OfferProvider.registerTeamOffers(offerRow.team_id, offerA, offerB);
    }

    const r3SnapshotMap = new Map<string, CompanySnapshot>();
    for (const res of r3Result.companyResults) {
      r3SnapshotMap.set(res.teamId, res.nextSnapshot);
    }

    const decR4_HLT1: CompanyDecision = { ...decHLT1, investmentDecision: 'OFFER_B' };
    const decR4_D2C1: CompanyDecision = { ...decD2C1, investmentDecision: 'OFFER_A' };
    const decR4_D2C2: CompanyDecision = { ...decD2C2, investmentDecision: 'REJECT_BOTH' };

    const r4Result = simulateTournamentRound({
      roundNumber: 4,
      decisions: [decR4_D2C1, decR4_D2C2, decR4_HLT1, decHLT2, decSAS1, decSAS2],
      snapshots: Array.from(r3SnapshotMap.values()),
      teamDomainMap,
      options: { offerProvider: r4OfferProvider },
    });

    // Commit R4 snapshots & ledger
    const r4Snapshots = serializeSnapshotsForDatabase(r4Result);
    const r4Ledger = serializeLedgerEntriesForDatabase(r4Result, r3SnapshotMap);
    r4.status = 'published';
    r4.published_at = new Date().toISOString();
    db.events[0].active_round_number = 4;

    for (const snap of r4Snapshots) {
      db.company_snapshots.push({
        ...snap,
        round_id: r4.id,
        event_id: eventId,
        teams: teamMetaMap.get(snap.team_id as string),
        rounds: { round_number: 4, status: 'published', published_at: r4.published_at },
        is_active: true,
      });
    }
    for (const row of r4Ledger) {
      db.financial_ledger.push({ ...row, round_id: r4.id, event_id: eventId });
    }

    // COMPOUNDING DILUTION MATHEMATICAL VERIFICATION:
    // Team 3 (Pulse Diagnostics):
    // Prior Equity: 82.0000% (Founders: 82%, Seed VC: 18%)
    // Series A VC takes: 18.0000%
    // Founders after dilution: 82% * (1 - 0.18) = 67.2400%
    // Seed VC after dilution: 18% * (1 - 0.18) = 14.7600%
    // Series A VC: 18.0000%
    // Total cap table: 67.2400% + 14.7600% + 18.0000% = 100.0000%
    const resHLT1_R4 = r4Result.companyResults.find(r => r.teamId === 'team-hlth-1')!;
    expect(resHLT1_R4.equity.postRoundRetainedEquityPct.toFixed(4)).toBe('67.2400');

    // Team 1 (Aura Apparel):
    // Prior Equity: 92.0000% (Founders: 92%, Seed VC: 8%)
    // Series A VC takes: 8.0000%
    // Founders after dilution: 92% * (1 - 0.08) = 84.6400%
    const resD2C1_R4 = r4Result.companyResults.find(r => r.teamId === 'team-d2c-1')!;
    expect(resD2C1_R4.equity.postRoundRetainedEquityPct.toFixed(4)).toBe('84.6400');

    // =========================================================================
    // STEP 7: ROUND 5 FINAL HARVEST, EQUITY-ADJUSTED SCORING & WINNER EMBARGO
    // =========================================================================
    const r5 = db.rounds[4];
    r5.status = 'open';

    const r4SnapshotMap = new Map<string, CompanySnapshot>();
    for (const res of r4Result.companyResults) {
      r4SnapshotMap.set(res.teamId, res.nextSnapshot);
    }

    const r5Result = simulateTournamentRound({
      roundNumber: 5,
      decisions: [decD2C1, decD2C2, decHLT1, decHLT2, decSAS1, decSAS2],
      snapshots: Array.from(r4SnapshotMap.values()),
      teamDomainMap,
    });

    const r5Snapshots = serializeSnapshotsForDatabase(r5Result);
    r5.status = 'published';
    r5.published_at = new Date().toISOString();
    db.events[0].active_round_number = 5;

    for (const snap of r5Snapshots) {
      db.company_snapshots.push({
        ...snap,
        round_id: r5.id,
        event_id: eventId,
        teams: teamMetaMap.get(snap.team_id as string),
        rounds: { round_number: 5, status: 'published', published_at: r5.published_at },
        is_active: true,
      });
    }

    // EQUITY-ADJUSTED SCORING VERIFICATION:
    // Final Score = toInteger(Final Valuation * Founder Retained Equity Pct)
    for (const res of r5Result.companyResults) {
      const expectedScore = res.valuation.finalValuation.mul(res.equity.postRoundRetainedEquityPct.div(100)).round();
      expect(res.valuation.finalScore.toFixed(0)).toBe(expectedScore.toFixed(0));
    }

    // WINNER EMBARGO & THREE INDEPENDENT DOMAIN CHAMPIONS VERIFICATION:
    // 1. Prior to reveal: public leaderboard returns embargo state
    db.presentation_state[0].is_winner_revealed = false;
    const embargoedLeaderboard = await service.getPublicLeaderboard({ eventId });
    expect(embargoedLeaderboard.isFinalRoundEmbargoed).toBe(true);
    expect(embargoedLeaderboard.isFinalChampionsView).toBe(false);

    // 2. Authorized Reveal: Three Domain Champions Showcase unlocked
    db.presentation_state[0].is_winner_revealed = true;
    db.presentation_state[0].ceremony_stage = 'podium';
    const revealedLeaderboard = await service.getPublicLeaderboard({ eventId });
    expect(revealedLeaderboard.isFinalRoundEmbargoed).toBe(false);
    expect(revealedLeaderboard.isFinalChampionsView).toBe(true);

    // Exactly 3 champions total in final champions view (one per active domain)
    expect(revealedLeaderboard.leaderboard).toHaveLength(3);
    const champNames = revealedLeaderboard.leaderboard.map(c => c.companyName);
    expect(champNames).toContain('Nova Nutrition');
    expect(champNames).toContain('Pulse Diagnostics');
    expect(champNames).toContain('CloudMatrix AI');

    // =========================================================================
    // STEP 8: SAFE RESET & RECOVERY BEHAVIOR
    // =========================================================================
    // 1. Resetting round decisions on a protected published round is BLOCKED
    await expect(
      service.resetRoundDecisions(r5.id, superAdminId, 'Unauthorized attempt to reset published R5')
    ).rejects.toThrow(AppError);

    // 2. Full tournament reset creates a durable backup and cleans investor offers
    const fullResetResult = await service.resetEntireTournament(
      eventId,
      superAdminId,
      'Executing authorized reset rehearsal on development database'
    );
    expect(fullResetResult.success).toBe(true);
    expect(db.team_investor_offers).toHaveLength(0); // All frozen offers purged
    expect(db.company_snapshots).toHaveLength(0); // All snapshots purged
    expect(db.decisions).toHaveLength(0); // All decisions purged
  });
});
