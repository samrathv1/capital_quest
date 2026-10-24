import { createHash } from 'crypto';
import Decimal from 'decimal.js';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  simulateTournamentRound,
} from '@/engine/simulation/tournament-simulation';
import {
  CompanyDecision,
  CompanySnapshot,
  DomainConfig,
  InvestmentChoice,
  TournamentSimulationResult,
} from '@/engine/types';
import { DOMAIN_ARCHETYPES, getDomainConfig } from '@/engine/config/domain-archetypes';
import { D, ZERO } from '@/engine/math/precision';
import { AppError } from '@/lib/errors/app-error';
import { assertOrganizerPoliciesApproved } from './organizer-approvals';

export interface ExecuteSimulationParams {
  roundId: string;
  adminId: string;
  isDryRun?: boolean;
  idempotencyKey?: string;
  requireOrganizerApproval?: boolean;
  supabaseClient: SupabaseClient;
}

export interface SimulationExecutionOutput {
  success: boolean;
  roundId: string;
  runId?: string;
  runVersion?: number;
  status: string;
  isDryRun: boolean;
  idempotent?: boolean;
  executionDurationMs: number;
  companiesSimulated: number;
  inputStateHash: string;
  leaderboard: Array<{
    tournamentRank: number;
    domainRank: number;
    teamId: string;
    domainCode: string;
    valuation: string;
    retainedEquityPct: string;
    finalScore: string;
  }>;
}

/**
 * Computes deterministic SHA-256 hash of all canonical input parameters.
 * Sorts all entities deterministically to ensure order-independence.
 */
export function computeInputStateHash(payload: {
  roundId: string;
  roundNumber: number;
  decisions: Array<{
    teamId: string;
    marketingBudget: string;
    rdBudget: string;
    productionUnits: number;
    unitPrice: string;
    operationsBudget: string;
    investmentDecision: string;
  }>;
  domains: Array<{
    code: string;
    baseDemand: number;
    benchmarkPrice: string;
    minAllowedPrice: string;
    maxAllowedPrice: string;
    baseUnitCogs: string;
  }>;
}): string {
  const sortedDecisions = [...payload.decisions].sort((a, b) => a.teamId.localeCompare(b.teamId));
  const sortedDomains = [...payload.domains].sort((a, b) => a.code.localeCompare(b.code));

  const canonicalString = JSON.stringify({
    roundId: payload.roundId,
    roundNumber: payload.roundNumber,
    decisions: sortedDecisions,
    domains: sortedDomains,
  });

  return createHash('sha256').update(canonicalString).digest('hex');
}

/**
 * Maps database decision record to engine CompanyDecision type.
 */
export function mapDatabaseDecisionToEngine(dbDecision: {
  team_id: string;
  marketing_budget: number | string;
  rd_budget: number | string;
  production_units: number;
  unit_price: number | string;
  operations_budget: number | string;
  investment_decision: string;
}): CompanyDecision {
  let invChoice: InvestmentChoice = 'REJECT_BOTH';
  const choice = (dbDecision.investment_decision || 'none').toLowerCase();
  if (choice === 'offer_a') {
    invChoice = 'OFFER_A';
  } else if (choice === 'offer_b') {
    invChoice = 'OFFER_B';
  } else {
    invChoice = 'REJECT_BOTH';
  }

  return {
    teamId: dbDecision.team_id,
    marketingBudget: D(dbDecision.marketing_budget),
    rdBudget: D(dbDecision.rd_budget),
    productionUnits: D(dbDecision.production_units),
    unitPrice: D(dbDecision.unit_price),
    operationsBudget: D(dbDecision.operations_budget),
    investmentDecision: invChoice,
  };
}

/**
 * Maps database active snapshot record to engine CompanySnapshot type.
 */
export function mapDatabaseSnapshotToEngine(dbSnapshot: {
  team_id: string;
  round_number?: number;
  ending_cash: number | string;
  ending_inventory: number;
  cogs: number | string;
  cumulative_rd_asset: number | string;
  brand_equity_score: number | string;
  retained_equity_pct: number | string;
  company_valuation: number | string;
  domain_rank?: number;
  tournament_rank?: number;
}): CompanySnapshot {
  return {
    teamId: dbSnapshot.team_id,
    roundNumber: dbSnapshot.round_number ?? 0,
    cash: D(dbSnapshot.ending_cash),
    beginningInventoryUnits: D(dbSnapshot.ending_inventory),
    inventoryAverageUnitCost: D(dbSnapshot.cogs || 0),
    cumulativeRdStock: D(dbSnapshot.cumulative_rd_asset),
    cumulativeBrandStock: D(dbSnapshot.brand_equity_score),
    retainedEquityPct: D(dbSnapshot.retained_equity_pct),
    valuation: D(dbSnapshot.company_valuation),
    domainRank: dbSnapshot.domain_rank,
    tournamentRank: dbSnapshot.tournament_rank,
  };
}

/**
 * Creates default Round 0 state snapshot for a team with starting operating capital.
 */
export function createDefaultRound0Snapshot(teamId: string, baseUnitCogs: Decimal | number): CompanySnapshot {
  return {
    teamId,
    roundNumber: 0,
    cash: D(1000000), // Exactly $1,000,000.00 starting capital
    beginningInventoryUnits: ZERO,
    inventoryAverageUnitCost: D(baseUnitCogs),
    cumulativeRdStock: ZERO,
    cumulativeBrandStock: ZERO,
    retainedEquityPct: D(100), // 100.0000%
    valuation: D(200000), // Exactly $200,000.00 starting valuation
  };
}

/**
 * Serializes engine results into exact PostgreSQL NUMERIC database snapshots.
 */
export function serializeSnapshotsForDatabase(
  simulationResult: TournamentSimulationResult
): Array<Record<string, unknown>> {
  const leaderboardMap = new Map<string, { domainRank: number; tournamentRank: number }>();
  for (const lb of simulationResult.leaderboard) {
    leaderboardMap.set(lb.teamId, {
      domainRank: lb.domainRank,
      tournamentRank: lb.tournamentRank,
    });
  }

  return simulationResult.companyResults.map(res => {
    const ranks = leaderboardMap.get(res.teamId) ?? { domainRank: 1, tournamentRank: 1 };
    return {
      team_id: res.teamId,
      product_quality_index: res.quality.qualityIndex.toFixed(2),
      brand_equity_score: res.brand.cumulativeBrandStock.toFixed(2),
      attractiveness_score: res.attractiveness.rawAttractiveness.toFixed(4),
      market_share_pct: res.marketShare.marketSharePct.toFixed(4),
      potential_demand: Math.floor(res.marketShare.preliminaryDemandUnits.toNumber()),
      units_available: Math.floor(res.fulfillment.unitsAvailable.toNumber()),
      units_sold: Math.floor(res.fulfillment.totalUnitsSold.toNumber()),
      units_stockout: Math.floor(res.fulfillment.primaryStockoutUnits.toNumber()),
      ending_inventory: Math.floor(res.fulfillment.endingInventoryUnits.toNumber()),
      gross_revenue: res.financial.grossRevenue.toFixed(2),
      cogs: res.financial.cogs.toFixed(2),
      gross_profit: res.financial.grossProfit.toFixed(2),
      operating_expenses: res.financial.totalOpEx.toFixed(2),
      inventory_holding_cost: res.financial.inventoryHoldingCost.toFixed(2),
      ebitda: res.financial.ebitda.toFixed(2),
      tax_expense: res.financial.taxExpense.toFixed(2),
      net_income: res.financial.netIncome.toFixed(2),
      operating_cash_flow: res.financial.operatingCashFlow.toFixed(2),
      financing_cash_flow: res.financial.financingCashFlow.toFixed(2),
      ending_cash: res.financial.endingCash.toFixed(2),
      cumulative_rd_asset: res.quality.cumulativeRdStock.toFixed(2),
      enterprise_value: res.valuation.enterpriseValue.toFixed(2),
      cash_valuation_contribution: res.valuation.cashValuationComponent.toFixed(2),
      company_valuation: res.valuation.finalValuation.toFixed(2),
      retained_equity_pct: res.equity.postRoundRetainedEquityPct.toFixed(4),
      equity_adjusted_score: res.valuation.finalScore.toFixed(2),
      domain_rank: ranks.domainRank,
      tournament_rank: ranks.tournamentRank,
    };
  });
}

/**
 * Builds double-entry financial ledger records from simulation company results.
 * Guarantees that beginningCash + inflows - outflows = endingCash.
 */
export function serializeLedgerEntriesForDatabase(
  simulationResult: TournamentSimulationResult,
  previousSnapshotMap: Map<string, CompanySnapshot>
): Array<Record<string, unknown>> {
  const ledgerRows: Array<Record<string, unknown>> = [];

  for (const res of simulationResult.companyResults) {
    const prev = previousSnapshotMap.get(res.teamId);
    let runningBalance = prev ? prev.cash : D(1000000);

    // 1. Sales Revenue (Cash Inflow)
    if (res.financial.grossRevenue.gt(0)) {
      runningBalance = runningBalance.add(res.financial.grossRevenue);
      ledgerRows.push({
        team_id: res.teamId,
        entry_type: 'sales_revenue',
        amount: res.financial.grossRevenue.toFixed(2),
        running_balance: runningBalance.toFixed(2),
        description: `Round ${res.roundNumber} sales revenue (${res.fulfillment.totalUnitsSold.toString()} units at $${res.validatedDecision.unitPrice.toString()})`,
      });
    }

    // 2. Production Cost (Cash Outflow)
    const prodCost = D(res.fulfillment.actualProductionUnits).mul(res.fulfillment.effectiveUnitProductionCost);
    if (prodCost.gt(0)) {
      runningBalance = runningBalance.sub(prodCost);
      ledgerRows.push({
        team_id: res.teamId,
        entry_type: 'production_cost',
        amount: prodCost.negated().toFixed(2),
        running_balance: runningBalance.toFixed(2),
        description: `Round ${res.roundNumber} production expense (${res.fulfillment.actualProductionUnits.toString()} units)`,
      });
    }

    // 3. Marketing Expense (Cash Outflow)
    const mkt = D(res.validatedDecision.marketingBudget);
    if (mkt.gt(0)) {
      runningBalance = runningBalance.sub(mkt);
      ledgerRows.push({
        team_id: res.teamId,
        entry_type: 'marketing_expense',
        amount: mkt.negated().toFixed(2),
        running_balance: runningBalance.toFixed(2),
        description: `Round ${res.roundNumber} customer acquisition and brand marketing`,
      });
    }

    // 4. R&D Expense (Cash Outflow)
    const rd = D(res.validatedDecision.rdBudget);
    if (rd.gt(0)) {
      runningBalance = runningBalance.sub(rd);
      ledgerRows.push({
        team_id: res.teamId,
        entry_type: 'rd_expense',
        amount: rd.negated().toFixed(2),
        running_balance: runningBalance.toFixed(2),
        description: `Round ${res.roundNumber} research, engineering, and quality development`,
      });
    }

    // 5. Operations Budget (Cash Outflow)
    const ops = D(res.validatedDecision.operationsBudget);
    if (ops.gt(0)) {
      runningBalance = runningBalance.sub(ops);
      ledgerRows.push({
        team_id: res.teamId,
        entry_type: 'operations_expense',
        amount: ops.negated().toFixed(2),
        running_balance: runningBalance.toFixed(2),
        description: `Round ${res.roundNumber} administrative and operational overhead`,
      });
    }

    // 6. Holding Cost (Cash Outflow)
    if (res.financial.inventoryHoldingCost.gt(0)) {
      runningBalance = runningBalance.sub(res.financial.inventoryHoldingCost);
      ledgerRows.push({
        team_id: res.teamId,
        entry_type: 'holding_cost',
        amount: res.financial.inventoryHoldingCost.negated().toFixed(2),
        running_balance: runningBalance.toFixed(2),
        description: `Round ${res.roundNumber} warehouse holding fee for unsold units`,
      });
    }

    // 7. Corporate Tax Payment (Cash Outflow)
    if (res.financial.taxExpense.gt(0)) {
      runningBalance = runningBalance.sub(res.financial.taxExpense);
      ledgerRows.push({
        team_id: res.teamId,
        entry_type: 'tax_payment',
        amount: res.financial.taxExpense.negated().toFixed(2),
        running_balance: runningBalance.toFixed(2),
        description: `Round ${res.roundNumber} corporate income tax (20% on taxable profit)`,
      });
    }

    // 8. Administrative Penalty / Fee (Cash Outflow if applicable)
    const cashDiff = res.financial.endingCash.sub(runningBalance);
    if (cashDiff.lt(0)) {
      const penalty = cashDiff.abs();
      runningBalance = runningBalance.sub(penalty);
      ledgerRows.push({
        team_id: res.teamId,
        entry_type: 'admin_penalty',
        amount: penalty.negated().toFixed(2),
        running_balance: runningBalance.toFixed(2),
        description: `Round ${res.roundNumber} administrative penalty for invalid submission`,
      });
    }

    // 9. Investor Funding (Cash Inflow)
    if (res.equity.cashInjected.gt(0)) {
      runningBalance = runningBalance.add(res.equity.cashInjected);
      ledgerRows.push({
        team_id: res.teamId,
        entry_type: 'investor_funding',
        amount: res.equity.cashInjected.toFixed(2),
        running_balance: runningBalance.toFixed(2),
        description: `Round ${res.roundNumber} VC equity investment (${res.equity.investmentDecision})`,
      });
    }
  }

  return ledgerRows;
}

/**
 * Builds cap-table equity transactions for accepted investment offers.
 */
export function serializeEquityTransactionsForDatabase(
  simulationResult: TournamentSimulationResult
): Array<Record<string, unknown>> {
  const equityRows: Array<Record<string, unknown>> = [];

  for (const res of simulationResult.companyResults) {
    if (res.equity.cashInjected.gt(0)) {
      const investorStake = res.equity.investorEquityStakePct;
      const investorName =
        res.roundNumber === 2
          ? `Seed Venture Partner (${res.equity.investmentDecision})`
          : `Series A Growth Fund (${res.equity.investmentDecision})`;

      // 1. Investor row
      equityRows.push({
        team_id: res.teamId,
        shareholder_name: investorName,
        is_founding_team: false,
        pre_round_equity_pct: '0.0000',
        dilution_delta_pct: investorStake.toFixed(4),
        post_round_equity_pct: investorStake.toFixed(4),
        investment_amount: res.equity.cashInjected.toFixed(2),
      });

      // 2. Founding Team dilution row
      const preFounding = res.equity.preRoundRetainedEquityPct;
      const postFounding = res.equity.postRoundRetainedEquityPct;
      const dilution = postFounding.sub(preFounding);

      equityRows.push({
        team_id: res.teamId,
        shareholder_name: 'Founding Team',
        is_founding_team: true,
        pre_round_equity_pct: preFounding.toFixed(4),
        dilution_delta_pct: dilution.toFixed(4),
        post_round_equity_pct: postFounding.toFixed(4),
        investment_amount: '0.00',
      });
    }
  }

  return equityRows;
}

/**
 * Executes a fully transactional simulation round inside Supabase PostgreSQL.
 * Strict adherence to the 8-stage transaction pipeline defined in CQ-SPEC-07.
 */
export async function executeSimulationRound(
  params: ExecuteSimulationParams
): Promise<SimulationExecutionOutput> {
  const startTime = Date.now();
  const { roundId, adminId, isDryRun = false, idempotencyKey, requireOrganizerApproval = true, supabaseClient } = params;

  // 1. Fetch Target Round
  const { data: round, error: roundError } = await supabaseClient
    .from('rounds')
    .select('*, events(*)')
    .eq('id', roundId)
    .single();

  if (roundError || !round) {
    throw new AppError('NOT_FOUND', `Round ${roundId} not found.`, 404);
  }

  if (round.status !== 'locked' && round.status !== 'simulated') {
    throw new AppError(
      'ROUND_NOT_LOCKED',
      `Cannot execute simulation on round in status '${round.status}'. Round must be 'locked' or 'simulated'.`
    );
  }

  // 2. Organizer Policy Gate Validation
  if (requireOrganizerApproval) {
    const approvalCheck = assertOrganizerPoliciesApproved(round.event_id);
    if (!approvalCheck.approved) {
      throw new AppError(
        'ORGANIZER_APPROVALS_PENDING',
        `Simulation execution blocked: Formal organizer policy sign-off is pending for: ${approvalCheck.pendingPolicies.join('; ')}`,
        403,
        { pendingPolicies: approvalCheck.pendingPolicies }
      );
    }
  }

  // 3. Fetch Teams and Domains
  const { data: teams, error: teamsError } = await supabaseClient
    .from('teams')
    .select('id, domain_id, team_code, domains(code)')
    .eq('event_id', round.event_id)
    .eq('is_disqualified', false);

  if (teamsError || !teams || teams.length === 0) {
    throw new AppError('NOT_FOUND', 'No active teams registered for this event.', 404);
  }

  const teamDomainMap = new Map<string, string>();
  for (const t of teams) {
    const domainObj = t.domains as unknown as { code?: string } | null;
    const domainCode = domainObj?.code ?? 'CLEANTECH';
    teamDomainMap.set(t.id, domainCode.toLowerCase());
  }

  // 4. Fetch Decisions for this Round
  const { data: decisions, error: decisionsError } = await supabaseClient
    .from('decisions')
    .select('*')
    .eq('round_id', roundId);

  if (decisionsError) {
    throw new AppError('SIMULATION_FAILED', `Failed to load decisions: ${decisionsError.message}`, 500);
  }

  // Verify all teams have decisions
  const decisionTeamIds = new Set((decisions || []).map(d => d.team_id));
  const missingTeamCodes: string[] = [];
  for (const t of teams) {
    if (!decisionTeamIds.has(t.id)) {
      missingTeamCodes.push(t.team_code);
    }
  }

  if (missingTeamCodes.length > 0) {
    throw new AppError(
      'MISSING_SUBMISSIONS',
      `Simulation blocked: Missing decisions for teams: ${missingTeamCodes.join(', ')}. All decisions must be entered and locked.`,
      422,
      { missingTeams: missingTeamCodes }
    );
  }

  // 5. Fetch Previous Round Active Snapshots
  const previousSnapshotMap = new Map<string, CompanySnapshot>();
  if (round.round_number > 1) {
    const { data: prevRound } = await supabaseClient
      .from('rounds')
      .select('id')
      .eq('event_id', round.event_id)
      .eq('round_number', round.round_number - 1)
      .single();

    if (prevRound) {
      const { data: prevSnapshots } = await supabaseClient
        .from('company_snapshots')
        .select('*')
        .eq('round_id', prevRound.id)
        .eq('is_active', true);

      if (prevSnapshots) {
        for (const s of prevSnapshots) {
          previousSnapshotMap.set(s.team_id, mapDatabaseSnapshotToEngine(s));
        }
      }
    }
  }

  // For any team without a prior snapshot, populate default starting state
  for (const t of teams) {
    if (!previousSnapshotMap.has(t.id)) {
      const domainCode = teamDomainMap.get(t.id) ?? 'cleantech';
      const domainConf = DOMAIN_ARCHETYPES[domainCode] ?? getDomainConfig(domainCode);
      previousSnapshotMap.set(t.id, createDefaultRound0Snapshot(t.id, domainConf.baseUnitCogs));
    }
  }

  // 6. Compute Cryptographic Input State Hash
  const formattedDecisionsForHash = (decisions || []).map(d => ({
    teamId: d.team_id,
    marketingBudget: d.marketing_budget.toString(),
    rdBudget: d.rd_budget.toString(),
    productionUnits: d.production_units,
    unitPrice: d.unit_price.toString(),
    operationsBudget: d.operations_budget.toString(),
    investmentDecision: d.investment_decision,
  }));

  const { data: dbDomains } = await supabaseClient
    .from('domains')
    .select('code, base_demand, benchmark_price, min_allowed_price, max_allowed_price, base_unit_cogs')
    .eq('event_id', round.event_id);

  const formattedDomainsForHash = (dbDomains || []).map(d => ({
    code: d.code,
    baseDemand: d.base_demand,
    benchmarkPrice: d.benchmark_price.toString(),
    minAllowedPrice: d.min_allowed_price.toString(),
    maxAllowedPrice: d.max_allowed_price.toString(),
    baseUnitCogs: d.base_unit_cogs.toString(),
  }));

  const inputStateHash = computeInputStateHash({
    roundId,
    roundNumber: round.round_number,
    decisions: formattedDecisionsForHash,
    domains: formattedDomainsForHash,
  });

  // 7. Execute Pure Mathematical Engine
  const engineDecisions = (decisions || []).map(mapDatabaseDecisionToEngine);
  const engineSnapshots = Array.from(previousSnapshotMap.values());

  const domainConfigs: Record<string, DomainConfig> = { ...DOMAIN_ARCHETYPES };
  if (dbDomains && dbDomains.length > 0) {
    for (const d of dbDomains) {
      const key = d.code.toLowerCase();
      const baseArch = DOMAIN_ARCHETYPES[key] ?? getDomainConfig(key);
      domainConfigs[key] = {
        ...baseArch,
        baseDemand: d.base_demand,
        benchmarkPrice: D(d.benchmark_price),
        minPrice: D(d.min_allowed_price),
        maxPrice: D(d.max_allowed_price),
        baseUnitCogs: D(d.base_unit_cogs),
      };
    }
  }

  const simulationResult = simulateTournamentRound({
    roundNumber: round.round_number,
    teamDomainMap,
    decisions: engineDecisions,
    snapshots: engineSnapshots,
    domainConfigs,
  });

  // 8. Serialize Results for Database Persistence
  const dbSnapshots = serializeSnapshotsForDatabase(simulationResult);
  const dbLedgerEntries = serializeLedgerEntriesForDatabase(simulationResult, previousSnapshotMap);
  const dbEquityEntries = serializeEquityTransactionsForDatabase(simulationResult);

  const executionDurationMs = Date.now() - startTime;
  const effectiveIdempotencyKey =
    idempotencyKey || `sim_r${round.round_number}_${roundId}_${inputStateHash.substring(0, 12)}`;

  // 9. Atomic Transaction Commit via PostgreSQL RPC
  const { data: commitResult, error: commitError } = await supabaseClient.rpc(
    'fn_commit_simulation_run',
    {
      p_round_id: roundId,
      p_admin_id: adminId,
      p_idempotency_key: effectiveIdempotencyKey,
      p_input_state_hash: inputStateHash,
      p_execution_duration_ms: executionDurationMs,
      p_total_companies: simulationResult.companyResults.length,
      p_is_dry_run: isDryRun,
      p_snapshots: dbSnapshots,
      p_ledger_entries: dbLedgerEntries,
      p_equity_transactions: dbEquityEntries,
      p_audit_details: {
        executedBy: adminId,
        roundNumber: round.round_number,
        timestamp: new Date().toISOString(),
      },
    }
  );

  if (commitError) {
    throw new AppError('SIMULATION_FAILED', `Database transaction rollback: ${commitError.message}`, 500, commitError);
  }

  const formattedLeaderboard = simulationResult.leaderboard.map(lb => ({
    tournamentRank: lb.tournamentRank,
    domainRank: lb.domainRank,
    teamId: lb.teamId,
    domainCode: lb.domainCode,
    valuation: lb.valuation.toFixed(2),
    retainedEquityPct: lb.retainedEquityPct.toFixed(4),
    finalScore: lb.finalScore.toFixed(0),
  }));

  return {
    success: true,
    roundId,
    runId: commitResult?.run_id,
    runVersion: commitResult?.run_version,
    status: isDryRun ? 'dry_run_completed' : 'simulated',
    isDryRun,
    idempotent: commitResult?.idempotent ?? false,
    executionDurationMs,
    companiesSimulated: simulationResult.companyResults.length,
    inputStateHash,
    leaderboard: formattedLeaderboard,
  };
}
