import { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '@/lib/errors/app-error';
import { DecisionSubmitInput, VoidRoundInput } from '@/lib/validation/api-schemas';
import { D } from '@/engine/math/precision';

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

  async publishRound(roundId: string, adminId: string) {
    const round = await this.getRoundById(roundId);
    if (round.status !== 'simulated' && round.status !== 'reviewed') {
      throw new AppError(
        'ROUND_NOT_SIMULATED',
        `Cannot publish round in status '${round.status}'. Round must be 'simulated' or 'reviewed'.`
      );
    }

    // Update round status
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

    // Increment event active round
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

  // 4. LEADERBOARD & SNAPSHOTS
  async getLeaderboard(eventId: string, roundNumber?: number, domainId?: string) {
    let query = this.supabase
      .from('company_snapshots')
      .select('*, teams(id, team_code, company_name, domain_id, domains(code, name)), rounds!inner(round_number, status, event_id)')
      .eq('is_active', true)
      .eq('rounds.event_id', eventId);

    if (roundNumber !== undefined) {
      query = query.eq('rounds.round_number', roundNumber);
    }
    if (domainId) {
      query = query.eq('teams.domain_id', domainId);
    }

    const { data, error } = await query.order('equity_adjusted_score', { ascending: false });

    if (error) {
      throw new AppError('NOT_FOUND', `Failed to query leaderboard: ${error.message}`, 500);
    }

    return (data || []).map((row, index) => {
      const teamObj = row.teams as unknown as {
        team_code?: string;
        company_name?: string;
        domains?: { name?: string; code?: string };
      } | null;

      return {
        rank: index + 1,
        teamId: row.team_id,
        teamCode: teamObj?.team_code ?? 'UNKNOWN',
        companyName: teamObj?.company_name ?? 'Virtual Company',
        domainName: teamObj?.domains?.name ?? 'CleanTech',
        domainCode: teamObj?.domains?.code ?? 'CLEANTECH',
        valuation: Number(row.company_valuation),
        retainedEquityPct: Number(row.retained_equity_pct),
        equityAdjustedScore: Number(row.equity_adjusted_score),
        endingCash: Number(row.ending_cash),
        grossRevenue: Number(row.gross_revenue),
        netIncome: Number(row.net_income),
      };
    });
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
}
