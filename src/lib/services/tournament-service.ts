import { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '@/lib/errors/app-error';
import { DecisionSubmitInput, VoidRoundInput } from '@/lib/validation/api-schemas';
import { D } from '@/engine/math/precision';
import { assertOrganizerPoliciesApproved } from './organizer-approvals';

interface PresentationEventRecord {
  id: string;
  name: string;
  status: string;
  total_rounds: number;
  active_round_number: number;
}

export interface PublicLeaderboardRow {
  rank: number;
  tournamentRank: number;
  domainRank: number;
  previousRank: number | null;
  rankMovement: number | null;
  teamId: string;
  companyId: string;
  teamCode: string;
  companyName: string;
  tableStation: string | null;
  domainId: string;
  domainCode: string;
  domainName: string;
  valuation: number;
  retainedEquityPct: number;
  equityAdjustedScore: number;
  finalScore: number;
  endingCash: number;
  grossRevenue: number;
  netIncome: number;
  ebitda: number;
  cogs: number;
  operatingExpenses: number;
  marketSharePct: number;
  productQualityIndex: number;
  brandEquityScore: number;
}

/**
 * CAPITAL QUEST — BACKEND OPERATIONS SERVICE
 * Reference: CQ-SPEC-05, CQ-SPEC-08
 */
export class TournamentService {
  constructor(private readonly supabase: SupabaseClient) {}

  // 1. TEAM OPERATIONS
  async getTeams(eventId: string) {
    const { data, error } = await this.supabase
      .from('teams')
      .select('*, domains(code, name)')
      .eq('event_id', eventId)
      .order('team_code');

    if (error) throw new AppError('NOT_FOUND', `Failed to load teams: ${error.message}`, 500);
    return data;
  }

  async getTeamById(teamId: string) {
    const { data, error } = await this.supabase
      .from('teams')
      .select('*, domains(*), team_members(*)')
      .eq('id', teamId)
      .single();

    if (error || !data) throw new AppError('NOT_FOUND', `Team not found: ${teamId}`, 404);
    return data;
  }

  async registerTeam(input: {
    eventId: string;
    domainId: string;
    teamCode: string;
    companyName: string;
    tableStation?: string;
  }) {
    const { data, error } = await this.supabase
      .from('teams')
      .insert({
        event_id: input.eventId,
        domain_id: input.domainId,
        team_code: input.teamCode,
        company_name: input.companyName,
        table_station: input.tableStation,
      })
      .select()
      .single();

    if (error) throw new AppError('VALIDATION_ERROR', `Failed to register team: ${error.message}`, 400);
    return data;
  }

  async getActiveEvent() {
    const { data, error } = await this.supabase
      .from('events')
      .select('*, domains(*), rounds(*)')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new AppError('NOT_FOUND', `Failed to load active event: ${error.message}`, 500);
    return data;
  }

  async getDomains(eventId: string) {
    const { data, error } = await this.supabase
      .from('domains')
      .select('*')
      .eq('event_id', eventId)
      .order('code');

    if (error) throw new AppError('NOT_FOUND', `Failed to load domains: ${error.message}`, 500);
    return data;
  }

  async addTeamMember(input: {
    teamId: string;
    fullName: string;
    email?: string;
    studentId?: string;
    roleTitle?: string;
  }) {
    const { data, error } = await this.supabase
      .from('team_members')
      .insert({
        team_id: input.teamId,
        full_name: input.fullName,
        email: input.email || null,
        student_id: input.studentId || null,
        role_title: input.roleTitle || 'Co-Founder',
      })
      .select()
      .single();

    if (error) throw new AppError('VALIDATION_ERROR', `Failed to add team member: ${error.message}`, 400);
    return data;
  }

  async getTeamMembers(teamId: string) {
    const { data, error } = await this.supabase
      .from('team_members')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at');

    if (error) throw new AppError('NOT_FOUND', `Failed to load team members: ${error.message}`, 500);
    return data;
  }

  // 2. ROUND OPERATIONS
  async getRounds(eventId: string) {
    const { data, error } = await this.supabase
      .from('rounds')
      .select('*')
      .eq('event_id', eventId)
      .order('round_number');

    if (error) throw new AppError('NOT_FOUND', `Failed to load rounds: ${error.message}`, 500);
    return data;
  }

  async getRoundById(roundId: string) {
    const { data, error } = await this.supabase
      .from('rounds')
      .select('*, events(*)')
      .eq('id', roundId)
      .single();

    if (error || !data) throw new AppError('NOT_FOUND', `Round not found: ${roundId}`, 404);
    return data;
  }

  async lockRound(roundId: string, adminId: string, overrideMissing = false) {
    const round = await this.getRoundById(roundId);
    if (round.status !== 'open') {
      throw new AppError('ROUND_NOT_OPEN', `Cannot lock round in status '${round.status}'. Round must be 'open'.`);
    }

    // Check decisions
    const { data: decisions } = await this.supabase
      .from('decisions')
      .select('id, team_id, status')
      .eq('round_id', roundId);

    const { data: teams } = await this.supabase
      .from('teams')
      .select('id, team_code')
      .eq('event_id', round.event_id)
      .eq('is_disqualified', false);

    const submittedTeamIds = new Set((decisions || []).map(d => d.team_id));
    const missingTeams = (teams || []).filter(t => !submittedTeamIds.has(t.id));

    if (missingTeams.length > 0 && !overrideMissing) {
      throw new AppError(
        'MISSING_SUBMISSIONS',
        `Cannot lock round: ${missingTeams.length} teams have not submitted decisions. Set overrideMissing: true to apply default fallbacks.`,
        422,
        { missingTeams: missingTeams.map(t => t.team_code) }
      );
    }

    // Lock all decisions
    await this.supabase
      .from('decisions')
      .update({ status: 'locked' })
      .eq('round_id', roundId);

    // Update round status
    const { data: updatedRound, error: updateError } = await this.supabase
      .from('rounds')
      .update({
        status: 'locked',
        locked_at: new Date().toISOString(),
      })
      .eq('id', roundId)
      .select()
      .single();

    if (updateError) {
      throw new AppError('SIMULATION_FAILED', `Failed to lock round: ${updateError.message}`, 500);
    }

    // Audit log
    await this.logAuditEvent({
      actorId: adminId,
      action: 'LOCK_ROUND',
      entityName: 'rounds',
      entityId: roundId,
      beforeState: { status: round.status },
      afterState: { status: 'locked', overrideMissing },
    });

    return updatedRound;
  }

  async openRound(roundId: string, adminId: string) {
    const round = await this.getRoundById(roundId);
    if (round.status !== 'draft') {
      throw new AppError('ROUND_NOT_DRAFT', `Cannot open round in status '${round.status}'. Round must be in 'draft' status.`);
    }

    // If round_number > 1, check that previous round is published
    if (round.round_number > 1) {
      const { data: prevRound } = await this.supabase
        .from('rounds')
        .select('id, status, round_number')
        .eq('event_id', round.event_id)
        .eq('round_number', round.round_number - 1)
        .single();

      if (!prevRound || prevRound.status !== 'published') {
        throw new AppError(
          'PREVIOUS_ROUND_NOT_PUBLISHED',
          `Cannot open Round ${round.round_number}: Previous Round ${round.round_number - 1} must be 'published' first. Current status: ${prevRound?.status || 'missing'}.`
        );
      }
    }

    const { data: updatedRound, error: updateError } = await this.supabase
      .from('rounds')
      .update({
        status: 'open',
        opened_at: new Date().toISOString(),
      })
      .eq('id', roundId)
      .select()
      .single();

    if (updateError) {
      throw new AppError('SIMULATION_FAILED', `Failed to open round: ${updateError.message}`, 500);
    }

    await this.logAuditEvent({
      actorId: adminId,
      action: 'OPEN_ROUND',
      entityName: 'rounds',
      entityId: roundId,
      beforeState: { status: round.status },
      afterState: { status: 'open' },
    });

    return updatedRound;
  }

  async reviewRound(roundId: string, adminId: string) {
    const round = await this.getRoundById(roundId);
    if (round.status !== 'simulated') {
      throw new AppError(
        'ROUND_NOT_SIMULATED',
        `Cannot review round in status '${round.status}'. Round must be 'simulated' first.`
      );
    }

    // Run reconciliation check
    const reconciliation = await this.getFinancialReconciliation(roundId);
    if (!reconciliation.isReconciled) {
      throw new AppError(
        'RECONCILIATION_FAILED',
        `Financial reconciliation failed with ${reconciliation.errors.length} discrepancies. Review blockers must be resolved before proceeding.`,
        422,
        { discrepancies: reconciliation.errors }
      );
    }

    const { data: updatedRound, error: updateError } = await this.supabase
      .from('rounds')
      .update({
        status: 'reviewed',
      })
      .eq('id', roundId)
      .select()
      .single();

    if (updateError) {
      throw new AppError('SIMULATION_FAILED', `Failed to mark round as reviewed: ${updateError.message}`, 500);
    }

    await this.logAuditEvent({
      actorId: adminId,
      action: 'REVIEW_ROUND_RESULTS',
      entityName: 'rounds',
      entityId: roundId,
      beforeState: { status: round.status },
      afterState: { status: 'reviewed' },
    });

    return updatedRound;
  }

  async publishRound(roundId: string, adminId: string) {
    const round = await this.getRoundById(roundId);
    if (round.status !== 'reviewed') {
      throw new AppError(
        'ROUND_NOT_REVIEWED',
        `Cannot publish round in status '${round.status}'. Round must be formally 'reviewed' and reconciled before publication.`
      );
    }

    // Verify required organizer policy approvals
    const approvalStatus = assertOrganizerPoliciesApproved(round.event_id);
    if (!approvalStatus.approved) {
      throw new AppError(
        'POLICIES_NOT_APPROVED',
        `Cannot publish round results: Required organizer policies have not been formally approved: ${approvalStatus.pendingPolicies.join(', ')}`,
        403,
        { pendingPolicies: approvalStatus.pendingPolicies }
      );
    }

    // Re-verify financial reconciliation before official publication
    const reconciliation = await this.getFinancialReconciliation(roundId);
    if (!reconciliation.isReconciled) {
      throw new AppError(
        'RECONCILIATION_FAILED',
        `Cannot publish: Financial reconciliation audit failed with discrepancies.`,
        422,
        { discrepancies: reconciliation.errors }
      );
    }

    // Update round status to published
    const { data: updatedRound, error: updateError } = await this.supabase
      .from('rounds')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
      })
      .eq('id', roundId)
      .select()
      .single();

    if (updateError) {
      throw new AppError('SIMULATION_FAILED', `Failed to publish round: ${updateError.message}`, 500);
    }

    // Increment event active round pointer
    await this.supabase
      .from('events')
      .update({
        active_round_number: round.round_number + 1,
      })
      .eq('id', round.event_id);

    // Audit log
    await this.logAuditEvent({
      actorId: adminId,
      action: 'PUBLISH_ROUND_RESULTS',
      entityName: 'rounds',
      entityId: roundId,
      beforeState: { status: round.status },
      afterState: { status: 'published' },
    });

    return updatedRound;
  }

  async voidRound(roundId: string, adminId: string, input: VoidRoundInput) {
    // Call atomic stored procedure
    const { data, error } = await this.supabase.rpc('fn_void_or_supersede_round', {
      p_round_id: roundId,
      p_admin_id: adminId,
      p_void_reason: input.reason,
    });

    if (error) {
      throw new AppError('ROLLBACK_FAILED', `Void operation failed: ${error.message}`, 400, error);
    }

    return data;
  }

  // 3. DECISION OPERATIONS
  async submitDecision(input: DecisionSubmitInput, operatorId: string) {
    // 1. Verify target round is open
    const round = await this.getRoundById(input.roundId);
    if (round.status !== 'open') {
      throw new AppError('ROUND_NOT_OPEN', `Round is not open for decision entry. Current status: ${round.status}`);
    }

    // 2. Fetch team's current available liquid cash
    let currentCash = D(1000000); // Default starting capital
    if (round.round_number > 1) {
      const { data: prevSnap } = await this.supabase
        .from('company_snapshots')
        .select('ending_cash')
        .eq('team_id', input.teamId)
        .eq('is_active', true)
        .order('round_id', { ascending: false })
        .limit(1)
        .single();

      if (prevSnap) {
        currentCash = D(prevSnap.ending_cash);
      }
    }

    // Fetch domain base COGS for unit production estimation
    const { data: team } = await this.supabase
      .from('teams')
      .select('domain_id, domains(base_unit_cogs)')
      .eq('id', input.teamId)
      .single();

    const domainObj = team?.domains as unknown as { base_unit_cogs?: number } | null;
    const baseUnitCogs = D(domainObj?.base_unit_cogs || 100);

    const totalOutflow = D(input.marketingBudget)
      .add(input.rdBudget)
      .add(input.operationsBudget)
      .add(D(input.productionUnits).mul(baseUnitCogs));

    if (totalOutflow.gt(currentCash)) {
      throw new AppError(
        'OVERSPENT_BUDGET',
        `Planned cash outflow ($${totalOutflow.toFixed(2)}) exceeds available liquid cash ($${currentCash.toFixed(2)}).`,
        422,
        {
          availableCash: currentCash.toFixed(2),
          totalOutflow: totalOutflow.toFixed(2),
          deficit: totalOutflow.sub(currentCash).toFixed(2),
        }
      );
    }

    // Upsert decision
    const { data: decision, error } = await this.supabase
      .from('decisions')
      .upsert(
        {
          round_id: input.roundId,
          team_id: input.teamId,
          status: 'entered',
          marketing_budget: input.marketingBudget,
          rd_budget: input.rdBudget,
          production_units: input.productionUnits,
          unit_price: input.unitPrice,
          operations_budget: input.operationsBudget,
          investment_decision: input.investmentDecision,
          entered_by: operatorId,
          entered_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'round_id,team_id' }
      )
      .select()
      .single();

    if (error) {
      throw new AppError('VALIDATION_ERROR', `Failed to submit decision: ${error.message}`, 400);
    }

    return decision;
  }

  async verifyDecision(input: DecisionSubmitInput, verifierId: string) {
    const { data: existing, error } = await this.supabase
      .from('decisions')
      .select('*')
      .eq('round_id', input.roundId)
      .eq('team_id', input.teamId)
      .single();

    if (error || !existing) {
      throw new AppError('NOT_FOUND', 'Original decision slip not found for verification.', 404);
    }

    const discrepancies: string[] = [];
    if (Number(existing.marketing_budget) !== input.marketingBudget) discrepancies.push('marketingBudget');
    if (Number(existing.rd_budget) !== input.rdBudget) discrepancies.push('rdBudget');
    if (Number(existing.production_units) !== input.productionUnits) discrepancies.push('productionUnits');
    if (Number(existing.unit_price) !== input.unitPrice) discrepancies.push('unitPrice');
    if (Number(existing.operations_budget) !== input.operationsBudget) discrepancies.push('operationsBudget');
    if (existing.investment_decision !== input.investmentDecision) discrepancies.push('investmentDecision');

    if (discrepancies.length > 0) {
      await this.supabase
        .from('decisions')
        .update({ status: 'flagged' })
        .eq('id', existing.id);

      throw new AppError(
        'VALIDATION_ERROR',
        `Verification mismatch in fields: ${discrepancies.join(', ')}. Decision marked as FLAGGED.`,
        422,
        { discrepancies }
      );
    }

    const { data: verified, error: updateError } = await this.supabase
      .from('decisions')
      .update({
        status: 'verified',
        verified_by: verifierId,
        verified_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (updateError) {
      throw new AppError('VALIDATION_ERROR', `Failed to verify decision: ${updateError.message}`, 500);
    }

    return verified;
  }

  async getDecisions(roundId: string) {
    const { data, error } = await this.supabase
      .from('decisions')
      .select('*, teams(id, team_code, company_name, table_station, domain_id, domains(code, name))')
      .eq('round_id', roundId)
      .order('created_at');

    if (error) throw new AppError('NOT_FOUND', `Failed to load decisions: ${error.message}`, 500);
    return data;
  }

  async getOverviewStats(eventId: string) {
    const event = await this.supabase
      .from('events')
      .select('*, rounds(*)')
      .eq('id', eventId)
      .single();

    const { count: teamCount } = await this.supabase
      .from('teams')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId);

    const { count: domainCount } = await this.supabase
      .from('domains')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId);

    const rounds = (event.data?.rounds || []) as Array<{ id: string; round_number: number; status: string }>;
    rounds.sort((a, b) => a.round_number - b.round_number);

    const activeRound = rounds.find(r => r.status === 'open' || r.status === 'locked' || r.status === 'simulated') 
      || rounds.find(r => r.status === 'draft') 
      || rounds[0] 
      || null;

    let submittedCount = 0;
    let verifiedCount = 0;
    let flaggedCount = 0;

    if (activeRound) {
      const { data: decisions } = await this.supabase
        .from('decisions')
        .select('status')
        .eq('round_id', activeRound.id);

      for (const d of decisions || []) {
        if (d.status === 'entered') submittedCount++;
        else if (d.status === 'verified' || d.status === 'locked') {
          submittedCount++;
          verifiedCount++;
        } else if (d.status === 'flagged') {
          flaggedCount++;
        }
      }
    }

    const totalTeams = teamCount || 0;
    const missingCount = Math.max(0, totalTeams - submittedCount - flaggedCount);

    return {
      event: event.data,
      totalTeams,
      totalDomains: domainCount || 0,
      activeRound,
      submittedCount,
      verifiedCount,
      missingCount,
      flaggedCount,
      eventStatus: event.data?.status || 'setup',
    };
  }

  async getDomainReadiness(roundId: string, domainId: string) {
    const round = await this.getRoundById(roundId);

    const { data: domainTeams, error: teamsError } = await this.supabase
      .from('teams')
      .select('id, team_code, company_name, table_station')
      .eq('event_id', round.event_id)
      .eq('domain_id', domainId)
      .eq('is_disqualified', false);

    if (teamsError) throw new AppError('NOT_FOUND', `Failed to load domain teams: ${teamsError.message}`, 500);

    const { data: decisions, error: decError } = await this.supabase
      .from('decisions')
      .select('*')
      .eq('round_id', roundId);

    if (decError) throw new AppError('NOT_FOUND', `Failed to load decisions: ${decError.message}`, 500);

    const decisionMap = new Map((decisions || []).map(d => [d.team_id, d]));

    const teamsStatus = (domainTeams || []).map(team => {
      const dec = decisionMap.get(team.id);
      return {
        teamId: team.id,
        teamCode: team.team_code,
        companyName: team.company_name,
        tableStation: team.table_station,
        status: dec ? dec.status : 'missing',
        decision: dec || null,
      };
    });

    const total = teamsStatus.length;
    const verified = teamsStatus.filter(t => t.status === 'verified' || t.status === 'locked').length;
    const entered = teamsStatus.filter(t => t.status === 'entered').length;
    const flagged = teamsStatus.filter(t => t.status === 'flagged').length;
    const missing = teamsStatus.filter(t => t.status === 'missing').length;

    return {
      domainId,
      roundId,
      roundNumber: round.round_number,
      roundStatus: round.status,
      totalTeams: total,
      verifiedCount: verified,
      enteredCount: entered,
      flaggedCount: flagged,
      missingCount: missing,
      isReady: total > 0 && verified === total,
      teams: teamsStatus,
    };
  }

  // 4. LEADERBOARD & SNAPSHOTS (ENHANCED FOR PHASE 5)
  async getPublicLeaderboard(params: {
    eventId?: string;
    roundNumber?: number;
    domainId?: string;
  }) {
    // 1. Resolve event
    let eventId = params.eventId;
    let event: { id: string; name: string; status: string; active_round_number: number } | null = null;
    if (!eventId) {
      const activeEvent = await this.getActiveEvent();
      if (!activeEvent) {
        return {
          event: null,
          hasPublishedRounds: false,
          publishedRounds: [],
          activeRoundNumber: 0,
          selectedRoundNumber: null,
          lastUpdated: null,
          leaderboard: [],
        };
      }
      eventId = activeEvent.id;
      event = activeEvent;
    } else {
      const { data: eventData, error: eventErr } = await this.supabase
        .from('events')
        .select('id, name, status, active_round_number')
        .eq('id', eventId)
        .single();
      if (eventErr || !eventData) {
        throw new AppError('NOT_FOUND', `Tournament event not found: ${eventId}`, 404);
      }
      event = eventData;
    }

    if (!event) {
      throw new AppError('NOT_FOUND', 'Tournament event could not be resolved', 404);
    }

    // 2. Query published rounds for this event
    const { data: publishedRounds, error: roundsError } = await this.supabase
      .from('rounds')
      .select('id, round_number, status, published_at')
      .eq('event_id', eventId)
      .eq('status', 'published')
      .order('round_number', { ascending: true });

    if (roundsError) {
      throw new AppError('NOT_FOUND', `Failed to load published rounds: ${roundsError.message}`, 500);
    }

    if (!publishedRounds || publishedRounds.length === 0) {
      return {
        event: {
          id: event.id,
          name: event.name,
          status: event.status,
        },
        hasPublishedRounds: false,
        publishedRounds: [],
        activeRoundNumber: event.active_round_number ?? 0,
        selectedRoundNumber: null,
        lastUpdated: null,
        leaderboard: [],
      };
    }

    // 3. Determine selected round
    let selectedRound: { id: string; round_number: number; status: string; published_at: string | null };
    if (params.roundNumber !== undefined) {
      const found = publishedRounds.find(r => r.round_number === params.roundNumber);
      if (!found) {
        throw new AppError('NOT_FOUND', `Round ${params.roundNumber} is not published yet.`, 404);
      }
      selectedRound = found;
    } else {
      selectedRound = publishedRounds[publishedRounds.length - 1];
    }

    // 4. Identify immediately prior published round (if any) to calculate rank movement
    const selectedIndex = publishedRounds.findIndex(r => r.id === selectedRound.id);
    const priorRound = selectedIndex > 0 ? publishedRounds[selectedIndex - 1] : null;

    const priorRankMap = new Map<string, { tournamentRank: number; domainRank: number }>();
    if (priorRound) {
      const { data: priorSnapshots } = await this.supabase
        .from('company_snapshots')
        .select('team_id, tournament_rank, domain_rank')
        .eq('round_id', priorRound.id)
        .eq('is_active', true);

      if (priorSnapshots) {
        for (const ps of priorSnapshots) {
          priorRankMap.set(ps.team_id, {
            tournamentRank: Number(ps.tournament_rank),
            domainRank: Number(ps.domain_rank),
          });
        }
      }
    }

    // 5. Query active published snapshots for the selected round
    let snapshotQuery = this.supabase
      .from('company_snapshots')
      .select(`
        id,
        round_id,
        team_id,
        product_quality_index,
        brand_equity_score,
        market_share_pct,
        gross_revenue,
        cogs,
        gross_profit,
        operating_expenses,
        inventory_holding_cost,
        ebitda,
        net_income,
        ending_cash,
        enterprise_value,
        company_valuation,
        retained_equity_pct,
        equity_adjusted_score,
        domain_rank,
        tournament_rank,
        teams!inner(
          id,
          team_code,
          company_name,
          table_station,
          domain_id,
          domains!inner(id, code, name)
        ),
        rounds!inner(round_number, status, published_at)
      `)
      .eq('round_id', selectedRound.id)
      .eq('is_active', true)
      .eq('rounds.status', 'published');

    if (params.domainId) {
      snapshotQuery = snapshotQuery.eq('teams.domain_id', params.domainId);
    }

    const { data: snapshots, error: snapError } = await snapshotQuery;
    if (snapError) {
      throw new AppError('NOT_FOUND', `Failed to query leaderboard snapshots: ${snapError.message}`, 500);
    }

    // 6. Deterministic 5-level tie-breaker sort:
    // 1. finalScore DESC (equity_adjusted_score)
    // 2. valuation DESC (company_valuation)
    // 3. grossRevenue DESC
    // 4. endingCash DESC
    // 5. teamId ASC (alphabetical)
    const sortedSnapshots = [...(snapshots || [])].sort((a, b) => {
      const scoreDiff = Number(b.equity_adjusted_score) - Number(a.equity_adjusted_score);
      if (scoreDiff !== 0) return scoreDiff;

      const valDiff = Number(b.company_valuation) - Number(a.company_valuation);
      if (valDiff !== 0) return valDiff;

      const revDiff = Number(b.gross_revenue) - Number(a.gross_revenue);
      if (revDiff !== 0) return revDiff;

      const cashDiff = Number(b.ending_cash) - Number(a.ending_cash);
      if (cashDiff !== 0) return cashDiff;

      return String(a.team_id).localeCompare(String(b.team_id));
    });

    // 7. Format entries with rank and movement
    const isDomainFiltered = Boolean(params.domainId);
    const leaderboard = sortedSnapshots.map((row) => {
      const teamObj = row.teams as unknown as {
        id: string;
        team_code: string;
        company_name: string;
        table_station?: string;
        domain_id: string;
        domains?: { id: string; code: string; name: string };
      };

      const tournamentRank = Number(row.tournament_rank);
      const domainRank = Number(row.domain_rank);

      // Current display rank: in domain view, domainRank; in global view, tournamentRank
      const currentRank = isDomainFiltered ? domainRank : tournamentRank;

      const priorInfo = priorRankMap.get(row.team_id);
      let previousRank: number | null = null;
      let rankMovement: number | null = null;

      if (priorInfo) {
        previousRank = isDomainFiltered ? priorInfo.domainRank : priorInfo.tournamentRank;
        rankMovement = previousRank - currentRank;
      }

      return {
        rank: currentRank,
        tournamentRank,
        domainRank,
        previousRank,
        rankMovement,
        teamId: row.team_id,
        companyId: row.team_id,
        teamCode: teamObj?.team_code ?? 'UNKNOWN',
        companyName: teamObj?.company_name ?? 'Virtual Enterprise',
        tableStation: teamObj?.table_station ?? null,
        domainId: teamObj?.domain_id,
        domainCode: teamObj?.domains?.code ?? 'CLEANTECH',
        domainName: teamObj?.domains?.name ?? 'CleanTech',
        valuation: Number(row.company_valuation),
        retainedEquityPct: Number(row.retained_equity_pct),
        equityAdjustedScore: Number(row.equity_adjusted_score),
        finalScore: Number(row.equity_adjusted_score),
        endingCash: Number(row.ending_cash),
        grossRevenue: Number(row.gross_revenue),
        netIncome: Number(row.net_income),
        ebitda: Number(row.ebitda),
        cogs: Number(row.cogs),
        operatingExpenses: Number(row.operating_expenses),
        marketSharePct: Number(row.market_share_pct),
        productQualityIndex: Number(row.product_quality_index),
        brandEquityScore: Number(row.brand_equity_score),
      };
    });

    return {
      event: {
        id: event.id,
        name: event.name,
        status: event.status,
      },
      hasPublishedRounds: true,
      publishedRounds: publishedRounds.map(r => ({
        roundNumber: r.round_number,
        publishedAt: r.published_at,
      })),
      activeRoundNumber: event.active_round_number ?? 0,
      selectedRoundNumber: selectedRound.round_number,
      lastUpdated: selectedRound.published_at,
      leaderboard,
    };
  }

  // Backward compatible leaderboard getter
  async getLeaderboard(eventId: string, roundNumber?: number, domainId?: string) {
    const result = await this.getPublicLeaderboard({ eventId, roundNumber, domainId });
    return result.leaderboard;
  }

  // 4c. COMPANY PERFORMANCE & FINANCIAL REPORTS (PHASE 5)
  async getCompanyPerformance(companyId: string) {
    // 1. Resolve company by UUID id or team_code
    let teamQuery = this.supabase
      .from('teams')
      .select('*, events(id, name, status, starting_capital, starting_valuation), domains(*)')
      .limit(1);

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId);
    if (isUUID) {
      teamQuery = teamQuery.eq('id', companyId);
    } else {
      teamQuery = teamQuery.eq('team_code', companyId);
    }

    const { data: teamData, error: teamErr } = await teamQuery.maybeSingle();
    if (teamErr || !teamData) {
      throw new AppError('NOT_FOUND', `Company not found: ${companyId}`, 404);
    }

    const team = teamData;
    const event = team.events as { id: string; name: string; status: string; starting_capital?: number; starting_valuation?: number } | null;
    const domain = team.domains as { id: string; code: string; name: string } | null;

    // 2. Fetch all published rounds for this event
    const { data: publishedRounds, error: roundsErr } = await this.supabase
      .from('rounds')
      .select('id, round_number, status, type, published_at')
      .eq('event_id', team.event_id)
      .eq('status', 'published')
      .order('round_number', { ascending: true });

    if (roundsErr) {
      throw new AppError('NOT_FOUND', `Failed to load published rounds: ${roundsErr.message}`, 500);
    }

    if (!publishedRounds || publishedRounds.length === 0) {
      return {
        company: {
          id: team.id,
          teamCode: team.team_code,
          companyName: team.company_name,
          tableStation: team.table_station,
          domainId: team.domain_id,
          domainName: domain?.name ?? 'CleanTech',
          domainCode: domain?.code ?? 'CLEANTECH',
          eventId: team.event_id,
          eventName: event?.name ?? 'Capital Quest',
        },
        hasPublishedRounds: false,
        publishedRounds: [],
        latestSnapshot: null,
        history: [],
        roundComparisons: [],
        capTable: [],
        financialStatements: {
          incomeStatement: [],
          cashFlow: [],
          valuation: [],
        },
        ledgerEntries: [],
      };
    }

    // 3. Fetch active snapshots for this team across published rounds
    const { data: snapshotsData, error: snapErr } = await this.supabase
      .from('company_snapshots')
      .select(`
        *,
        rounds!inner(id, round_number, status, type, published_at)
      `)
      .eq('team_id', team.id)
      .eq('is_active', true)
      .eq('rounds.status', 'published')
      .order('rounds(round_number)', { ascending: true });

    if (snapErr) {
      throw new AppError('NOT_FOUND', `Failed to load company snapshots: ${snapErr.message}`, 500);
    }

    const snapshots = snapshotsData || [];

    // 4. Fetch equity transactions for published rounds
    const { data: equityData } = await this.supabase
      .from('equity_transactions')
      .select(`
        *,
        rounds!inner(id, round_number, status, type, published_at)
      `)
      .eq('team_id', team.id)
      .eq('is_voided', false)
      .eq('rounds.status', 'published')
      .order('rounds(round_number)', { ascending: true });

    // 5. Fetch financial ledger for published rounds
    const { data: ledgerData } = await this.supabase
      .from('financial_ledger')
      .select(`
        *,
        rounds!inner(id, round_number, status)
      `)
      .eq('team_id', team.id)
      .eq('is_voided', false)
      .eq('rounds.status', 'published')
      .order('created_at', { ascending: true });

    // 6. Build Round History & Statements
    const initialCapital = Number(event?.starting_capital ?? 1000000);
    const initialValuation = Number(event?.starting_valuation ?? 200000);

    const history = snapshots.map((s, idx) => {
      const roundObj = s.rounds as { round_number?: number; type?: string; published_at?: string } | null;
      const roundNum = roundObj?.round_number ?? idx + 1;
      const startingCash = idx === 0 ? initialCapital : Number(snapshots[idx - 1].ending_cash);

      return {
        roundNumber: roundNum,
        roundType: roundObj?.type ?? 'regular',
        publishedAt: roundObj?.published_at ?? null,
        startingCash,
        grossRevenue: Number(s.gross_revenue),
        cogs: Number(s.cogs),
        grossProfit: Number(s.gross_profit),
        operatingExpenses: Number(s.operating_expenses),
        inventoryHoldingCost: Number(s.inventory_holding_cost),
        ebitda: Number(s.ebitda),
        taxExpense: Number(s.tax_expense),
        netIncome: Number(s.net_income),
        operatingCashFlow: Number(s.operating_cash_flow),
        financingCashFlow: Number(s.financing_cash_flow),
        endingCash: Number(s.ending_cash),
        productQualityIndex: Number(s.product_quality_index),
        brandEquityScore: Number(s.brand_equity_score),
        marketSharePct: Number(s.market_share_pct),
        potentialDemand: Number(s.potential_demand),
        unitsAvailable: Number(s.units_available),
        unitsSold: Number(s.units_sold),
        unitsStockout: Number(s.units_stockout),
        endingInventory: Number(s.ending_inventory),
        enterpriseValue: Number(s.enterprise_value),
        cashValuationContribution: Number(s.cash_valuation_contribution),
        companyValuation: Number(s.company_valuation),
        retainedEquityPct: Number(s.retained_equity_pct),
        equityAdjustedScore: Number(s.equity_adjusted_score),
        domainRank: Number(s.domain_rank),
        tournamentRank: Number(s.tournament_rank),
      };
    });

    // 7. Calculate Round-by-Round Comparisons (Handling baseline = 0 gracefully)
    const roundComparisons = history.map((curr, idx) => {
      if (idx === 0) {
        // Compare with Round 0 baseline
        const valDelta = curr.companyValuation - initialValuation;
        const valPct = initialValuation > 0 ? (valDelta / initialValuation) * 100 : null;

        return {
          roundNumber: curr.roundNumber,
          revenueDelta: curr.grossRevenue,
          revenueGrowthPct: null, // Zero baseline
          profitDelta: curr.netIncome,
          valuationDelta: valDelta,
          valuationGrowthPct: valPct,
          equityDelta: curr.retainedEquityPct - 100,
          marketShareDelta: curr.marketSharePct,
          domainRankDelta: 0,
          tournamentRankDelta: 0,
          financingInflow: curr.financingCashFlow,
        };
      }

      const prev = history[idx - 1];
      const revDelta = curr.grossRevenue - prev.grossRevenue;
      const revPct = prev.grossRevenue > 0 ? (revDelta / prev.grossRevenue) * 100 : null;

      const profitDelta = curr.netIncome - prev.netIncome;

      const valDelta = curr.companyValuation - prev.companyValuation;
      const valPct = prev.companyValuation > 0 ? (valDelta / prev.companyValuation) * 100 : null;

      const equityDelta = curr.retainedEquityPct - prev.retainedEquityPct;
      const marketShareDelta = curr.marketSharePct - prev.marketSharePct;

      const domainRankDelta = prev.domainRank - curr.domainRank;
      const tournamentRankDelta = prev.tournamentRank - curr.tournamentRank;

      return {
        roundNumber: curr.roundNumber,
        revenueDelta: revDelta,
        revenueGrowthPct: revPct,
        profitDelta,
        valuationDelta: valDelta,
        valuationGrowthPct: valPct,
        equityDelta,
        marketShareDelta,
        domainRankDelta,
        tournamentRankDelta,
        financingInflow: curr.financingCashFlow,
      };
    });

    // 8. Financial Statements breakdown
    const incomeStatement = history.map(h => ({
      roundNumber: h.roundNumber,
      grossRevenue: h.grossRevenue,
      cogs: h.cogs,
      grossProfit: h.grossProfit,
      operatingExpenses: h.operatingExpenses,
      inventoryHoldingCost: h.inventoryHoldingCost,
      ebitda: h.ebitda,
      taxExpense: h.taxExpense,
      netIncome: h.netIncome,
    }));

    const cashFlow = history.map(h => ({
      roundNumber: h.roundNumber,
      startingCash: h.startingCash,
      operatingCashFlow: h.operatingCashFlow,
      financingCashFlow: h.financingCashFlow,
      netCashMovement: h.operatingCashFlow + h.financingCashFlow,
      endingCash: h.endingCash,
    }));

    const valuation = history.map(h => ({
      roundNumber: h.roundNumber,
      enterpriseValue: h.enterpriseValue,
      cashValuationContribution: h.cashValuationContribution,
      companyValuation: h.companyValuation,
      retainedEquityPct: h.retainedEquityPct,
      equityAdjustedScore: h.equityAdjustedScore,
      domainRank: h.domainRank,
      tournamentRank: h.tournamentRank,
    }));

    // 9. Cap Table & Equity Transactions
    const capTable = (equityData || []).map(eq => ({
      id: eq.id,
      roundNumber: (eq.rounds as { round_number?: number } | null)?.round_number,
      roundType: (eq.rounds as { type?: string } | null)?.type,
      shareholderName: eq.shareholder_name,
      isFoundingTeam: eq.is_founding_team,
      preRoundEquityPct: Number(eq.pre_round_equity_pct),
      dilutionDeltaPct: Number(eq.dilution_delta_pct),
      postRoundEquityPct: Number(eq.post_round_equity_pct),
      investmentAmount: Number(eq.investment_amount),
    }));

    const latestSnapshot = history.length > 0 ? history[history.length - 1] : null;

    return {
      company: {
        id: team.id,
        teamCode: team.team_code,
        companyName: team.company_name,
        tableStation: team.table_station,
        domainId: team.domain_id,
        domainName: domain?.name ?? 'CleanTech',
        domainCode: domain?.code ?? 'CLEANTECH',
        eventId: team.event_id,
        eventName: event?.name ?? 'Capital Quest',
      },
      hasPublishedRounds: true,
      publishedRounds: publishedRounds.map(r => ({
        roundNumber: r.round_number,
        publishedAt: r.published_at,
      })),
      latestSnapshot,
      history,
      roundComparisons,
      capTable,
      financialStatements: {
        incomeStatement,
        cashFlow,
        valuation,
      },
      ledgerEntries: (ledgerData || []).map(l => ({
        id: l.id,
        roundNumber: (l.rounds as { round_number?: number } | null)?.round_number,
        entryType: l.entry_type,
        amount: Number(l.amount),
        runningBalance: Number(l.running_balance),
        description: l.description,
      })),
    };
  }

  // 4b. FINANCIAL RECONCILIATION AUDIT
  async getFinancialReconciliation(roundId: string) {
    const round = await this.getRoundById(roundId);

    const { data: snapshots, error } = await this.supabase
      .from('company_snapshots')
      .select('*, teams(id, team_code, company_name, domain_id, domains(code, name))')
      .eq('round_id', roundId)
      .eq('is_active', true);

    if (error) {
      throw new AppError('NOT_FOUND', `Failed to load snapshots for reconciliation: ${error.message}`, 500);
    }

    // Fetch previous round snapshots (to get starting cash for each company)
    const prevCashMap = new Map<string, number>();
    if (round.round_number > 1) {
      const { data: prevRound } = await this.supabase
        .from('rounds')
        .select('id')
        .eq('event_id', round.event_id)
        .eq('round_number', round.round_number - 1)
        .single();

      if (prevRound) {
        const { data: prevSnaps } = await this.supabase
          .from('company_snapshots')
          .select('team_id, ending_cash')
          .eq('round_id', prevRound.id)
          .eq('is_active', true);

        for (const ps of (prevSnaps || [])) {
          prevCashMap.set(ps.team_id, Number(ps.ending_cash));
        }
      }
    }

    // Fetch financial ledger entries for this round to cross-audit cash movements
    const { data: ledgerEntries } = await this.supabase
      .from('financial_ledger')
      .select('team_id, amount')
      .eq('round_id', roundId)
      .eq('is_voided', false);

    const ledgerNetDeltaMap = new Map<string, number>();
    for (const le of (ledgerEntries || [])) {
      const current = ledgerNetDeltaMap.get(le.team_id) || 0;
      ledgerNetDeltaMap.set(le.team_id, current + Number(le.amount));
    }

    // Fetch equity transactions for this round to audit 100.0000% cap-table conservation
    const { data: equityTxs } = await this.supabase
      .from('equity_transactions')
      .select('team_id, shareholder_name, is_founding_team, pre_round_equity_pct, dilution_delta_pct, post_round_equity_pct')
      .eq('round_id', roundId)
      .eq('is_voided', false);

    const equityByTeamMap = new Map<string, Array<{
      shareholder_name: string;
      is_founding_team: boolean;
      pre_round_equity_pct: number;
      dilution_delta_pct: number;
      post_round_equity_pct: number;
    }>>();
    for (const eq of (equityTxs || [])) {
      const list = equityByTeamMap.get(eq.team_id) || [];
      list.push({
        shareholder_name: eq.shareholder_name,
        is_founding_team: eq.is_founding_team,
        pre_round_equity_pct: Number(eq.pre_round_equity_pct),
        dilution_delta_pct: Number(eq.dilution_delta_pct),
        post_round_equity_pct: Number(eq.post_round_equity_pct),
      });
      equityByTeamMap.set(eq.team_id, list);
    }

    const errors: string[] = [];
    const cashFlowFailures: Array<{ companyName: string; detail: string }> = [];
    const solvencyFailures: Array<{ companyName: string; detail: string }> = [];
    const equityFailures: Array<{ companyName: string; detail: string }> = [];
    const inventoryFailures: Array<{ companyName: string; detail: string }> = [];
    const valuationFailures: Array<{ companyName: string; detail: string }> = [];

    let cashFlowBalancedCount = 0;
    let solvencyPassedCount = 0;
    let equitySumBalancedCount = 0;
    let inventoryConsistentCount = 0;
    let valuationConsistentCount = 0;

    for (const snap of (snapshots || [])) {
      const teamObj = snap.teams as unknown as { team_code?: string; company_name?: string } | null;
      const code = teamObj?.team_code || snap.team_id;
      const companyName = teamObj?.company_name || `Venture ${code}`;

      const startingCash = Number(snap.starting_cash ?? prevCashMap.get(snap.team_id) ?? 1000000);
      const endingCash = Number(snap.ending_cash);
      const ocf = snap.operating_cash_flow !== undefined
        ? Number(snap.operating_cash_flow)
        : (snap.net_income !== undefined ? Number(snap.net_income) : 0);
      const fcf = snap.financing_cash_flow !== undefined
        ? Number(snap.financing_cash_flow)
        : 0;
      const retainedEquity = Number(snap.retained_equity_pct);
      const enterpriseValue = Number(snap.enterprise_value);
      const cashValContribution = Number(snap.cash_valuation_contribution);
      const finalValuation = Number(snap.company_valuation);
      const finalScore = Number(snap.equity_adjusted_score ?? snap.final_score ?? 0);
      const unitsAvail = Number(snap.units_available);
      const unitsSold = Number(snap.units_sold);
      const endingInv = Number(snap.ending_inventory);

      // Check 1: Treasury Solvency (no negative ending cash, and no negative pre-clamp balance)
      const expectedRawEndingCash = startingCash + ocf + fcf;
      const isDeficit = expectedRawEndingCash < -0.01;
      const isEndingNegative = endingCash < -0.01;

      if (!isDeficit && !isEndingNegative) {
        solvencyPassedCount++;
      } else {
        const detail = isDeficit
          ? `Negative ending cash balance ($${endingCash.toFixed(2)}): Pre-clamp balance ($${expectedRawEndingCash.toFixed(2)}) incurred deficit. Zero-clamping cannot conceal insolvency.`
          : `Negative ending cash balance ($${endingCash.toFixed(2)}).`;
        solvencyFailures.push({ companyName, detail });
        errors.push(`Venture ${code}: ${detail}`);
      }

      // Check 2: Cash Flow Continuity
      // Ending cash must strictly equal startingCash + OCF + FCF without concealing negative pre-clamp balance
      let cashFlowOk = Math.abs(endingCash - expectedRawEndingCash) < 0.05 && !isDeficit;

      // If ledger entries exist, verify ending cash matches ledger sum
      const ledgerNet = ledgerNetDeltaMap.get(snap.team_id);
      if (ledgerNet !== undefined) {
        const expectedLedgerEnding = startingCash + ledgerNet;
        if (Math.abs(endingCash - expectedLedgerEnding) >= 0.05 || expectedLedgerEnding < -0.01) {
          cashFlowOk = false;
        }
      }

      if (cashFlowOk) {
        cashFlowBalancedCount++;
      } else {
        const detail = isDeficit
          ? `Cash deficit leak: Pre-clamp balance ($${expectedRawEndingCash.toFixed(2)}) is negative. Beg ($${startingCash.toFixed(2)}) + OCF ($${ocf.toFixed(2)}) + FCF ($${fcf.toFixed(2)}) != End ($${endingCash.toFixed(2)}).`
          : `Cash mismatch: Beg ($${startingCash.toFixed(2)}) + OCF ($${ocf.toFixed(2)}) + FCF ($${fcf.toFixed(2)}) != End ($${endingCash.toFixed(2)}).`;
        cashFlowFailures.push({ companyName, detail });
        errors.push(`Venture ${code}: ${detail}`);
      }

      // Check 3: Equity Conservation & Cap Table 100.0000%
      let equityOk = true;
      if (retainedEquity < 0 || retainedEquity > 100.0001) {
        equityOk = false;
        const detail = `Retained founder equity (${retainedEquity.toFixed(4)}%) out of bounds [0, 100].`;
        equityFailures.push({ companyName, detail });
        errors.push(`Venture ${code}: ${detail}`);
      }

      const teamEquityTxs = equityByTeamMap.get(snap.team_id);
      if (teamEquityTxs && teamEquityTxs.length > 0) {
        let totalPostEquity = 0;
        const seenShareholders = new Set<string>();
        let hasDuplicate = false;

        for (const tx of teamEquityTxs) {
          if (tx.post_round_equity_pct < -0.0001) {
            equityOk = false;
            const detail = `Investor ${tx.shareholder_name} has negative stake (${tx.post_round_equity_pct.toFixed(4)}%).`;
            equityFailures.push({ companyName, detail });
            errors.push(`Venture ${code}: ${detail}`);
          }
          if (seenShareholders.has(tx.shareholder_name)) {
            hasDuplicate = true;
          }
          seenShareholders.add(tx.shareholder_name);
          totalPostEquity += tx.post_round_equity_pct;
        }

        if (hasDuplicate) {
          equityOk = false;
          const detail = `Duplicate equity transaction recorded for shareholder in round.`;
          equityFailures.push({ companyName, detail });
          errors.push(`Venture ${code}: ${detail}`);
        }

        if (Math.abs(totalPostEquity - 100.0000) > 0.01) {
          equityOk = false;
          const detail = `Cap table does not sum to 100.0000%: Total = ${totalPostEquity.toFixed(4)}%.`;
          equityFailures.push({ companyName, detail });
          errors.push(`Venture ${code}: ${detail}`);
        }
      }

      if (equityOk) {
        equitySumBalancedCount++;
      }

      // Check 4: Inventory Consistency (unitsAvail - unitsSold == endingInv)
      if (Math.abs(unitsAvail - unitsSold - endingInv) <= 1 && unitsAvail >= 0 && unitsSold >= 0 && endingInv >= 0) {
        inventoryConsistentCount++;
      } else {
        const detail = `Inventory mismatch: ${unitsAvail} avail - ${unitsSold} sold != ${endingInv} ending.`;
        inventoryFailures.push({ companyName, detail });
        errors.push(`Venture ${code}: ${detail}`);
      }

      // Check 5: Valuation & Score Consistency
      const valOk = Math.abs(enterpriseValue + cashValContribution - finalValuation) <= 0.10;
      const expectedScore = finalValuation * (retainedEquity / 100);
      const scoreOk = Math.abs(finalScore - expectedScore) <= 2.0; // allow integer rounding

      if (valOk && scoreOk) {
        valuationConsistentCount++;
      } else {
        const detail = `Valuation / score mismatch: EV ($${enterpriseValue.toFixed(2)}) + Cash Contribution ($${cashValContribution.toFixed(2)}) != Total ($${finalValuation.toFixed(2)}) or score ($${finalScore}) mismatch.`;
        valuationFailures.push({ companyName, detail });
        errors.push(`Venture ${code}: ${detail}`);
      }
    }

    const checksList: Array<{
      checkName: string;
      passed: boolean;
      description: string;
      failedCompanies?: Array<{ companyName: string; detail: string }>;
    }> = [
      {
        checkName: 'Cash Flow Continuity',
        passed: cashFlowFailures.length === 0,
        description: 'Verifies that starting cash + operating cash flows + financing cash flows equals ending cash reserve with zero ledger leakage.',
        failedCompanies: cashFlowFailures,
      },
      {
        checkName: 'Treasury Solvency',
        passed: solvencyFailures.length === 0,
        description: 'Verifies all ending cash balances remain nonnegative with zero unauthorized deficit spending or unbacked borrowing.',
        failedCompanies: solvencyFailures,
      },
      {
        checkName: 'Equity Conservation (100.0000%)',
        passed: equityFailures.length === 0,
        description: 'Verifies founder ownership bounds and guarantees that founder equity plus all active investor equity stakes strictly sum to 100.0000%.',
        failedCompanies: equityFailures,
      },
      {
        checkName: 'Inventory & Unit Balance',
        passed: inventoryFailures.length === 0,
        description: 'Verifies physical unit conservation: available units (beginning inventory + production) minus units sold equals ending warehouse inventory.',
        failedCompanies: inventoryFailures,
      },
      {
        checkName: 'Enterprise Valuation & Score',
        passed: valuationFailures.length === 0,
        description: 'Verifies company valuation identity (Enterprise Value + Cash Contribution) and equity-adjusted final score calculation.',
        failedCompanies: valuationFailures,
      },
    ];

    // Preserve boolean map on checks array for legacy test compatibility
    const checksObj = {
      cashFlowContinuity: cashFlowFailures.length === 0,
      treasurySolvency: solvencyFailures.length === 0,
      equityConservation: equityFailures.length === 0,
      inventoryConsistency: inventoryFailures.length === 0,
      valuationConsistency: valuationFailures.length === 0,
    };
    const checks = Object.assign(checksList, checksObj);

    const summary = {
      cashFlowBalancedCount,
      solvencyPassedCount,
      equitySumBalancedCount,
      inventoryConsistentCount,
      valuationConsistentCount,
    };

    const totalCompanies = (snapshots || []).length;
    const isReconciled = checks.every(c => c.passed) && errors.length === 0;

    return {
      isReconciled,
      totalCompaniesChecked: totalCompanies,
      summary,
      checks,
      errors,
    };
  }

  // 4c. ROUND RESULTS AND RECONCILIATION
  async getRoundResults(roundId: string) {
    const round = await this.getRoundById(roundId);

    // Fetch active snapshots
    const { data: snapshots, error: snapError } = await this.supabase
      .from('company_snapshots')
      .select('*, teams(id, team_code, company_name, domain_id, table_station, domains(code, name))')
      .eq('round_id', roundId)
      .eq('is_active', true)
      .order('tournament_rank', { ascending: true });

    if (snapError) {
      throw new AppError('NOT_FOUND', `Failed to load round snapshots: ${snapError.message}`, 500);
    }

    // Fetch decisions for this round
    const { data: decisions } = await this.supabase
      .from('decisions')
      .select('*')
      .eq('round_id', roundId);

    const decisionMap = new Map((decisions || []).map(d => [d.team_id, d]));

    // Fetch latest simulation run
    const { data: latestRun } = await this.supabase
      .from('simulation_runs')
      .select('*, profiles(full_name, email)')
      .eq('round_id', roundId)
      .eq('is_active', true)
      .order('run_version', { ascending: false })
      .limit(1)
      .single();

    // Fetch previous round snapshots (to get starting cash for each company)
    const prevCashMap = new Map<string, number>();
    if (round.round_number > 1) {
      const { data: prevRound } = await this.supabase
        .from('rounds')
        .select('id')
        .eq('event_id', round.event_id)
        .eq('round_number', round.round_number - 1)
        .single();

      if (prevRound) {
        const { data: prevSnaps } = await this.supabase
          .from('company_snapshots')
          .select('team_id, ending_cash')
          .eq('round_id', prevRound.id)
          .eq('is_active', true);

        for (const ps of (prevSnaps || [])) {
          prevCashMap.set(ps.team_id, Number(ps.ending_cash));
        }
      }
    }

    const companyResults = (snapshots || []).map(snap => {
      const teamObj = snap.teams as unknown as {
        team_code?: string;
        company_name?: string;
        table_station?: string;
        domains?: { code?: string; name?: string };
      } | null;
      const dec = decisionMap.get(snap.team_id);
      const startingCash = prevCashMap.get(snap.team_id) ?? 1000000;

      return {
        // Primary Identifiers
        id: snap.id,
        teamId: snap.team_id,
        team_id: snap.team_id,
        company_id: snap.team_id,
        teamCode: teamObj?.team_code || 'UNK',
        companyName: teamObj?.company_name || 'Venture',
        company_name: teamObj?.company_name || 'Venture',
        domainCode: teamObj?.domains?.code || 'TECH',
        domain_code: teamObj?.domains?.code || 'TECH',
        domainName: teamObj?.domains?.name || 'Technology',
        domain_name: teamObj?.domains?.name || 'Technology',
        tableStation: teamObj?.table_station,
        table_station: teamObj?.table_station,

        // Financial Cash Flows & Balances
        startingCash,
        cash_starting: startingCash,
        endingCash: Number(snap.ending_cash),
        cash_ending: Number(snap.ending_cash),
        grossRevenue: Number(snap.gross_revenue),
        gross_revenue: Number(snap.gross_revenue),
        cogs: Number(snap.cogs),
        grossProfit: Number(snap.gross_profit),
        operatingExpenses: Number(snap.operating_expenses),
        opex: Number(snap.operating_expenses),
        ebitda: Number(snap.ebitda),
        taxExpense: Number(snap.tax_expense),
        netIncome: Number(snap.net_income),
        net_income: Number(snap.net_income),
        operatingCashFlow: Number(snap.operating_cash_flow),
        financingCashFlow: Number(snap.financing_cash_flow),

        // Operational Metrics
        productQualityIndex: Number(snap.product_quality_index),
        product_quality: Number(snap.product_quality_index),
        brandEquityScore: Number(snap.brand_equity_score),
        attractivenessScore: Number(snap.attractiveness_score),
        marketSharePct: Number(snap.market_share_pct),
        market_share: Number(snap.market_share_pct),
        unitsSold: Number(snap.units_sold),
        endingInventory: Number(snap.ending_inventory),
        inventory_units: Number(snap.ending_inventory),

        // Valuation & Rankings
        enterpriseValue: Number(snap.enterprise_value),
        enterprise_value: Number(snap.enterprise_value),
        cashValuationContribution: Number(snap.cash_valuation_contribution),
        companyValuation: Number(snap.company_valuation),
        company_valuation: Number(snap.company_valuation),
        retainedEquityPct: Number(snap.retained_equity_pct),
        ownership_percentage: Number(snap.retained_equity_pct),
        equityAdjustedScore: Number(snap.equity_adjusted_score),
        final_score: Number(snap.equity_adjusted_score),
        domainRank: snap.domain_rank,
        domain_rank: snap.domain_rank,
        tournamentRank: snap.tournament_rank,
        tournament_rank: snap.tournament_rank,

        // Decisions
        marketingBudget: Number(dec?.marketing_budget || 0),
        rdBudget: Number(dec?.rd_budget || 0),
        operationsBudget: Number(dec?.operations_budget || 0),
        productionUnits: Number(dec?.production_units || 0),
        unitPrice: Number(dec?.unit_price || 0),
        investmentDecision: dec?.investment_decision || 'none',
        decisions: {
          marketing_budget: Number(dec?.marketing_budget || 0),
          rd_budget: Number(dec?.rd_budget || 0),
          operations_budget: Number(dec?.operations_budget || 0),
          production_units: Number(dec?.production_units || 0),
          unit_price: Number(dec?.unit_price || 0),
          investment_decision: dec?.investment_decision || 'none',
        },
      };
    });

    const reconciliation = await this.getFinancialReconciliation(roundId);
    const eventObj = round.events as unknown as { name?: string } | null;

    return {
      round: {
        id: round.id,
        round_number: round.round_number,
        roundNumber: round.round_number,
        type: round.type,
        status: round.status,
        event_id: round.event_id,
        eventId: round.event_id,
        openedAt: round.opened_at,
        lockedAt: round.locked_at,
        simulatedAt: round.simulated_at,
        publishedAt: round.published_at,
        eventName: eventObj?.name || 'Capital Quest Competition',
      },
      event: {
        id: round.event_id,
        name: eventObj?.name || 'Capital Quest Competition',
      },
      run: latestRun ? {
        id: latestRun.id,
        run_number: latestRun.run_version,
        status: latestRun.status,
        input_hash: latestRun.input_state_hash,
        created_at: latestRun.created_at,
      } : null,
      latestRun: latestRun || null,
      snapshots: companyResults,
      results: companyResults,
      reconciliation,
    };
  }

  // 4d. SIMULATION RUN HISTORY
  async getSimulationRuns(roundId: string) {
    const { data, error } = await this.supabase
      .from('simulation_runs')
      .select('*, profiles(full_name, email)')
      .eq('round_id', roundId)
      .order('run_version', { ascending: false });

    if (error) {
      throw new AppError('NOT_FOUND', `Failed to load simulation runs: ${error.message}`, 500);
    }
    return data || [];
  }

  // 4e. ROUNDS OVERVIEW ACROSS EVENT
  async getRoundsOverview(eventId: string) {
    const { data: rounds, error: roundsError } = await this.supabase
      .from('rounds')
      .select('*')
      .eq('event_id', eventId)
      .order('round_number', { ascending: true });

    if (roundsError) {
      throw new AppError('NOT_FOUND', `Failed to load rounds: ${roundsError.message}`, 500);
    }

    const { data: teams } = await this.supabase
      .from('teams')
      .select('id, team_code, is_disqualified')
      .eq('event_id', eventId)
      .eq('is_disqualified', false);

    const eligibleCount = (teams || []).length;

    // Fetch decisions for all rounds
    const { data: allDecisions } = await this.supabase
      .from('decisions')
      .select('round_id, team_id, status');

    // Fetch market events
    const { data: marketEvents } = await this.supabase
      .from('market_events')
      .select('*')
      .eq('event_id', eventId);

    // Fetch latest simulation runs
    const { data: simRuns } = await this.supabase
      .from('simulation_runs')
      .select('round_id, id, run_version, status, is_active, created_at, execution_duration_ms')
      .eq('is_active', true);

    const runMap = new Map((simRuns || []).map(r => [r.round_id, r]));

    const decisionsByRound = new Map<string, Array<{ team_id: string; status: string }>>();
    for (const d of (allDecisions || [])) {
      if (!decisionsByRound.has(d.round_id)) {
        decisionsByRound.set(d.round_id, []);
      }
      decisionsByRound.get(d.round_id)!.push(d);
    }

    const policyApproval = assertOrganizerPoliciesApproved(eventId);

    const roundsOverview = (rounds || []).map(r => {
      const decs = decisionsByRound.get(r.id) || [];
      const entered = decs.filter(d => d.status === 'entered').length;
      const verified = decs.filter(d => d.status === 'verified' || d.status === 'locked').length;
      const flagged = decs.filter(d => d.status === 'flagged').length;
      const submittedTeamIds = new Set(decs.map(d => d.team_id));
      const missing = Math.max(0, eligibleCount - submittedTeamIds.size);

      const activeEvent = (marketEvents || []).find(me => me.activation_round === r.round_number);
      const latestRun = runMap.get(r.id);

      // Compute state transition blockers
      const blockers: string[] = [];
      if (r.status === 'draft') {
        if (r.round_number > 1) {
          const prev = (rounds || []).find(pr => pr.round_number === r.round_number - 1);
          if (prev && prev.status !== 'published') {
            blockers.push(`Round ${r.round_number - 1} must be published first.`);
          }
        }
      } else if (r.status === 'open') {
        if (missing > 0) blockers.push(`${missing} teams have not submitted decision slips.`);
        if (flagged > 0) blockers.push(`${flagged} slips have flagged discrepancies.`);
        if (entered > 0) blockers.push(`${entered} slips pending dual-verification.`);
      } else if (r.status === 'locked') {
        if (!policyApproval.approved) {
          blockers.push(`Organizer policies pending: ${policyApproval.pendingPolicies.join(', ')}`);
        }
      } else if (r.status === 'simulated') {
        blockers.push('Round results must be formally reviewed and reconciled.');
      }

      return {
        id: r.id,
        roundNumber: r.round_number,
        type: r.type,
        status: r.status,
        openedAt: r.opened_at,
        lockedAt: r.locked_at,
        simulatedAt: r.simulated_at,
        publishedAt: r.published_at,
        eligibleCompaniesCount: eligibleCount,
        decisionStats: {
          total: eligibleCount,
          entered,
          verified,
          flagged,
          missing,
          isAllVerified: eligibleCount > 0 && verified === eligibleCount,
        },
        marketEvent: activeEvent ? {
          name: activeEvent.name,
          description: activeEvent.description,
          demandMultiplier: Number(activeEvent.demand_multiplier),
          costMultiplier: Number(activeEvent.cost_multiplier),
        } : null,
        latestRun: latestRun || null,
        blockers,
        canOpen: r.status === 'draft' && blockers.length === 0,
        canLock: r.status === 'open' && (missing === 0 && flagged === 0 && entered === 0),
        canSimulate: r.status === 'locked' && policyApproval.approved,
        canReview: r.status === 'simulated',
        canPublish: r.status === 'reviewed',
        canVoid: r.status === 'simulated' || r.status === 'reviewed',
      };
    });

    return {
      eventId,
      eligibleCompaniesCount: eligibleCount,
      allPoliciesApproved: policyApproval.approved,
      pendingPolicies: policyApproval.pendingPolicies,
      rounds: roundsOverview,
    };
  }

  // 5. AUDIT LOGGING
  async logAuditEvent(event: {
    actorId?: string;
    action: string;
    entityName: string;
    entityId: string;
    beforeState?: Record<string, unknown>;
    afterState?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }) {
    await this.supabase.from('audit_logs').insert({
      actor_id: event.actorId,
      action: event.action,
      entity_name: event.entityName,
      entity_id: event.entityId,
      before_state: event.beforeState,
      after_state: event.afterState,
      ip_address: event.ipAddress,
      user_agent: event.userAgent,
    });
  }

  async getAuditLogs(entityName?: string, entityId?: string) {
    let query = this.supabase.from('audit_logs').select('*, profiles(full_name, email)');
    if (entityName) query = query.eq('entity_name', entityName);
    if (entityId) query = query.eq('entity_id', entityId);

    const { data, error } = await query.order('created_at', { ascending: false }).limit(100);
    if (error) throw new AppError('NOT_FOUND', `Failed to load audit logs: ${error.message}`, 500);
    return data;
  }

  // 6. PRESENTATION & WINNER REVEAL (PHASE 6)
  async getPresentationState(eventId: string) {
    const { data, error } = await this.supabase
      .from('presentation_state')
      .select('*')
      .eq('event_id', eventId)
      .maybeSingle();

    if (error || !data) {
      return {
        eventId,
        mode: 'standings' as const,
        selectedRoundNumber: 1,
        domainFilter: 'ALL' as const,
        ceremonyStage: 'waiting' as const,
        updatedAt: new Date().toISOString(),
      };
    }

    return {
      eventId: data.event_id,
      mode: data.mode as 'standings' | 'domain' | 'highlights' | 'ceremony',
      selectedRoundNumber: data.selected_round_number,
      domainFilter: data.domain_filter as 'ALL' | 'CLEANTECH' | 'HEALTHTECH' | 'SAAS' | 'D2C',
      ceremonyStage: data.ceremony_stage as 'waiting' | 'reveal_third' | 'reveal_second' | 'reveal_first' | 'podium',
      updatedAt: data.updated_at,
    };
  }

  async updatePresentationState(
    eventId: string,
    update: {
      mode?: 'standings' | 'domain' | 'highlights' | 'ceremony';
      selectedRoundNumber?: number;
      domainFilter?: string;
      ceremonyStage?: 'waiting' | 'reveal_third' | 'reveal_second' | 'reveal_first' | 'podium';
    },
    operatorId?: string
  ) {
    // 1. Fetch current event details
    const { data: event, error: eventErr } = await this.supabase
      .from('events')
      .select('id, name, total_rounds, active_round_number')
      .eq('id', eventId)
      .single();

    if (eventErr || !event) {
      throw new AppError('NOT_FOUND', `Tournament event not found: ${eventId}`, 404);
    }

    // 2. Security Gate: Verify Ceremony Activation & Reveal Progression
    const finalRoundNumber = event.total_rounds ?? 5;
    const isActivatingCeremony = update.mode === 'ceremony';
    const isAdvancingReveal = update.ceremonyStage && update.ceremonyStage !== 'waiting';

    if (isActivatingCeremony || isAdvancingReveal) {
      const { data: finalRound } = await this.supabase
        .from('rounds')
        .select('id, round_number, status')
        .eq('event_id', eventId)
        .eq('round_number', finalRoundNumber)
        .maybeSingle();

      if (!finalRound || finalRound.status !== 'published') {
        throw new AppError(
          'FORBIDDEN',
          `Winner reveal ceremony is strictly embargoed until the final round (Round ${finalRoundNumber}) is officially published. Current status: ${finalRound?.status ?? 'unopened'}`,
          403
        );
      }
    }

    // 3. Upsert into presentation_state
    const currentState = await this.getPresentationState(eventId);
    const newState = {
      event_id: eventId,
      mode: update.mode ?? currentState.mode,
      selected_round_number: update.selectedRoundNumber ?? currentState.selectedRoundNumber,
      domain_filter: update.domainFilter ?? currentState.domainFilter,
      ceremony_stage: update.ceremonyStage ?? currentState.ceremonyStage,
      updated_at: new Date().toISOString(),
      updated_by: operatorId || null,
    };

    const { error: upsertErr } = await this.supabase
      .from('presentation_state')
      .upsert(newState, { onConflict: 'event_id' });

    if (upsertErr) {
      console.warn('Failed to persist presentation_state:', upsertErr.message);
    }

    return {
      eventId: newState.event_id,
      mode: newState.mode,
      selectedRoundNumber: newState.selected_round_number,
      domainFilter: newState.domain_filter,
      ceremonyStage: newState.ceremony_stage,
      updatedAt: newState.updated_at,
    };
  }

  // 6b. PUBLIC PRESENTATION DATA (WITH STRICT STAGE EMBARGO)
  async getPublicPresentationData(eventId?: string) {
    // 1. Resolve event
    let targetEventId: string;
    let event: PresentationEventRecord;
    if (!eventId) {
      const activeEvent = await this.getActiveEvent();
      if (!activeEvent) {
        return {
          event: null,
          hasPublishedRounds: false,
          state: null,
          standings: [],
          highlights: null,
          ceremony: null,
        };
      }
      targetEventId = activeEvent.id;
      event = activeEvent;
    } else {
      targetEventId = eventId;
      const { data: evData, error: evErr } = await this.supabase
        .from('events')
        .select('id, name, status, total_rounds, active_round_number')
        .eq('id', targetEventId)
        .single();
      if (evErr || !evData) {
        throw new AppError('NOT_FOUND', `Tournament event not found: ${targetEventId}`, 404);
      }
      event = evData;
    }

    // 2. Fetch presentation state
    const state = await this.getPresentationState(targetEventId);

    // 3. Fetch published rounds
    const { data: publishedRoundsData } = await this.supabase
      .from('rounds')
      .select('id, round_number, status, published_at')
      .eq('event_id', targetEventId)
      .eq('status', 'published')
      .order('round_number', { ascending: true });

    const publishedRounds = publishedRoundsData || [];
    if (publishedRounds.length === 0) {
      return {
        event: { id: event.id, name: event.name, status: event.status, totalRounds: event.total_rounds },
        hasPublishedRounds: false,
        state,
        publishedRounds: [],
        standings: [],
        highlights: null,
        ceremony: null,
      };
    }

    let selectedRound = publishedRounds.find(r => r.round_number === state.selectedRoundNumber);
    if (!selectedRound) {
      selectedRound = publishedRounds[publishedRounds.length - 1];
    }

    // 4. Mode-specific data delivery
    let standings: PublicLeaderboardRow[] = [];
    let highlights: Record<string, unknown> | null = null;
    let ceremony: Record<string, unknown> | null = null;

    if (state.mode === 'standings' || state.mode === 'domain') {
      const domainFilter = state.mode === 'domain' && state.domainFilter !== 'ALL' ? state.domainFilter : undefined;
      const lb = await this.getPublicLeaderboard({
        eventId: targetEventId,
        roundNumber: selectedRound.round_number,
        domainId: domainFilter ? (await this.resolveDomainId(targetEventId, domainFilter)) : undefined,
      });
      standings = lb.leaderboard;
    } else if (state.mode === 'highlights') {
      highlights = await this.getRoundHighlights(targetEventId, selectedRound.round_number);
    } else if (state.mode === 'ceremony') {
      // 5. STAGE EMBARGO & WINNER REVEAL (CRITICAL INTEGRITY)
      const finalRoundNumber = event.total_rounds ?? 5;
      const finalRound = publishedRounds.find(r => r.round_number === finalRoundNumber);

      if (!finalRound) {
        ceremony = {
          isAvailable: false,
          reason: `Final round (Round ${finalRoundNumber}) is not published yet. Winner reveal ceremony locked.`,
          stage: 'waiting',
          winners: [],
          currentReveal: null,
        };
      } else {
        const finalLb = await this.getPublicLeaderboard({
          eventId: targetEventId,
          roundNumber: finalRoundNumber,
        });

        const topThree = finalLb.leaderboard.slice(0, 3);
        const rank3Winner = topThree.find(w => w.tournamentRank === 3) || topThree[2] || null;
        const rank2Winner = topThree.find(w => w.tournamentRank === 2) || topThree[1] || null;
        const rank1Winner = topThree.find(w => w.tournamentRank === 1) || topThree[0] || null;

        // Embargo filter strictly by ceremonyStage
        if (state.ceremonyStage === 'waiting') {
          ceremony = {
            isAvailable: true,
            stage: 'waiting',
            winners: [],
            revealedWinners: [],
            currentReveal: null,
            message: 'Grand Finale Podium Ceremony Commencing...',
          };
        } else if (state.ceremonyStage === 'reveal_third') {
          const winners = rank3Winner ? [rank3Winner] : [];
          ceremony = {
            isAvailable: true,
            stage: 'reveal_third',
            winners,
            revealedWinners: winners,
            currentReveal: rank3Winner,
            message: 'Third Place — Bronze Podium Winner',
          };
        } else if (state.ceremonyStage === 'reveal_second') {
          const winners = [rank3Winner, rank2Winner].filter(Boolean);
          ceremony = {
            isAvailable: true,
            stage: 'reveal_second',
            winners,
            revealedWinners: winners,
            currentReveal: rank2Winner,
            message: 'Second Place — Silver Podium Winner',
          };
        } else if (state.ceremonyStage === 'reveal_first') {
          const winners = [rank3Winner, rank2Winner, rank1Winner].filter(Boolean);
          ceremony = {
            isAvailable: true,
            stage: 'reveal_first',
            winners,
            revealedWinners: winners,
            currentReveal: rank1Winner,
            message: 'Grand Champion — Capital Quest First Place',
          };
        } else if (state.ceremonyStage === 'podium') {
          const winners = [rank1Winner, rank2Winner, rank3Winner].filter(Boolean);
          ceremony = {
            isAvailable: true,
            stage: 'podium',
            winners,
            revealedWinners: winners,
            currentReveal: null,
            isPodiumComplete: true,
            message: 'Official Capital Quest Tournament Podium',
          };
        }
      }
    }

    return {
      event: {
        id: event.id,
        name: event.name,
        status: event.status,
        totalRounds: event.total_rounds,
      },
      hasPublishedRounds: true,
      state,
      publishedRounds: publishedRounds.map(r => ({
        roundNumber: r.round_number,
        publishedAt: r.published_at,
      })),
      selectedRoundNumber: selectedRound.round_number,
      standings,
      highlights,
      ceremony,
      lastUpdated: new Date().toISOString(),
    };
  }

  // 6c. ROUND HIGHLIGHTS ENGINE
  async getRoundHighlights(eventId: string, roundNumber: number) {
    const currentLb = await this.getPublicLeaderboard({ eventId, roundNumber });
    const currentList = currentLb.leaderboard;

    if (currentList.length === 0) {
      return {
        roundNumber,
        topScorers: [],
        revenueLeaders: [],
        valuationGrowthLeaders: [],
        rankClimbers: [],
        domainLeaders: [],
        equityRetentionStandouts: [],
      };
    }

    const topScorers = currentList.slice(0, 3);

    const revenueLeaders = [...currentList]
      .sort((a, b) => b.grossRevenue - a.grossRevenue)
      .slice(0, 3);

    let valuationGrowthLeaders: (PublicLeaderboardRow & {
      valuationDelta: number;
      valuationGrowthPct: number;
    })[] = [];
    if (roundNumber > 1) {
      const priorLb = await this.getPublicLeaderboard({ eventId, roundNumber: roundNumber - 1 });
      const priorValMap = new Map<string, number>();
      for (const p of priorLb.leaderboard) {
        priorValMap.set(p.teamId, p.valuation);
      }

      valuationGrowthLeaders = [...currentList]
        .map(curr => {
          const priorVal = priorValMap.get(curr.teamId) ?? 200000;
          const valDelta = curr.valuation - priorVal;
          const growthPct = priorVal > 0 ? (valDelta / priorVal) * 100 : 0;
          return {
            ...curr,
            valuationDelta: valDelta,
            valuationGrowthPct: growthPct,
          };
        })
        .sort((a, b) => b.valuationDelta - a.valuationDelta)
        .slice(0, 3);
    } else {
      valuationGrowthLeaders = [...currentList]
        .map(curr => {
          const valDelta = curr.valuation - 200000;
          const growthPct = (valDelta / 200000) * 100;
          return {
            ...curr,
            valuationDelta: valDelta,
            valuationGrowthPct: growthPct,
          };
        })
        .sort((a, b) => b.valuationDelta - a.valuationDelta)
        .slice(0, 3);
    }

    const rankClimbers = [...currentList]
      .filter(item => item.rankMovement !== null && item.rankMovement > 0)
      .sort((a, b) => (b.rankMovement ?? 0) - (a.rankMovement ?? 0))
      .slice(0, 3);

    const domainLeaderMap = new Map<string, PublicLeaderboardRow>();
    for (const item of currentList) {
      if (item.domainRank === 1) {
        domainLeaderMap.set(item.domainCode.toUpperCase(), item);
      }
    }
    const domainLeaders = Array.from(domainLeaderMap.values());

    const equityRetentionStandouts = [...currentList.slice(0, 10)]
      .sort((a, b) => b.retainedEquityPct - a.retainedEquityPct)
      .slice(0, 3);

    return {
      roundNumber,
      topScorers,
      revenueLeaders,
      valuationGrowthLeaders,
      rankClimbers,
      domainLeaders,
      equityRetentionStandouts,
    };
  }

  // 6d. PRESENTER CONTROLLER DATA (PRIVILEGED)
  async getAdminPresentationData(eventId?: string) {
    let targetEventId: string;
    let event: PresentationEventRecord;
    if (!eventId) {
      const activeEvent = await this.getActiveEvent();
      if (!activeEvent) throw new AppError('NOT_FOUND', 'No active tournament event found', 404);
      targetEventId = activeEvent.id;
      event = activeEvent;
    } else {
      targetEventId = eventId;
      const { data: evData, error: evErr } = await this.supabase
        .from('events')
        .select('id, name, status, total_rounds, active_round_number')
        .eq('id', targetEventId)
        .single();
      if (evErr || !evData) throw new AppError('NOT_FOUND', `Event not found: ${targetEventId}`, 404);
      event = evData;
    }

    const state = await this.getPresentationState(targetEventId);

    const { data: publishedRounds } = await this.supabase
      .from('rounds')
      .select('id, round_number, status, published_at')
      .eq('event_id', targetEventId)
      .eq('status', 'published')
      .order('round_number', { ascending: true });

    const finalRoundNumber = event.total_rounds ?? 5;
    const finalRound = (publishedRounds || []).find(r => r.round_number === finalRoundNumber);
    const isFinalRoundPublished = Boolean(finalRound);

    let topThreeCandidates: PublicLeaderboardRow[] = [];
    if (isFinalRoundPublished) {
      const finalLb = await this.getPublicLeaderboard({
        eventId: targetEventId,
        roundNumber: finalRoundNumber,
      });
      topThreeCandidates = finalLb.leaderboard.slice(0, 3);
    }

    return {
      event: {
        id: event.id,
        name: event.name,
        status: event.status,
        totalRounds: event.total_rounds,
        activeRoundNumber: event.active_round_number,
      },
      state,
      publishedRounds: (publishedRounds || []).map(r => ({
        roundNumber: r.round_number,
        publishedAt: r.published_at,
      })),
      finalRoundNumber,
      isFinalRoundPublished,
      topThreeCandidates,
    };
  }

  private async resolveDomainId(eventId: string, domainCode: string): Promise<string | undefined> {
    const { data } = await this.supabase
      .from('domains')
      .select('id')
      .eq('event_id', eventId)
      .ilike('code', domainCode)
      .maybeSingle();

    return data?.id;
  }
}
