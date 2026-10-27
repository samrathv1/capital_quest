import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Read Dev config
const devEnv = fs.readFileSync('.env.local', 'utf8');
const devUrl = devEnv.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].replace(/^["']|["']$/g, '').trim();
const devKey = devEnv.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].replace(/^["']|["']$/g, '').trim();
const devClient = createClient(devUrl, devKey);

// Read Prod config
const prodEnv = fs.readFileSync('.env.production.local', 'utf8');
const prodUrl = prodEnv.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].replace(/^["']|["']$/g, '').trim();
const prodKey = prodEnv.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].replace(/^["']|["']$/g, '').trim();
const prodClient = createClient(prodUrl, prodKey);

async function inspect() {
  console.log('================================================================');
  console.log('CAPITAL QUEST — READ-ONLY PRODUCTION & DEV COMPARATIVE AUDIT');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Prod URL:', prodUrl);
  console.log('Dev URL:', devUrl);
  console.log('================================================================\n');

  // 1. MIGRATION HISTORY CHECK
  console.log('--- 1. MIGRATION STATUS ---');
  // Check supabase_migrations table if exists, or check functions
  try {
    const { data: prodMigrations, error: pmErr } = await prodClient
      .from('supabase_migrations')
      .select('*')
      .order('version', { ascending: false });

    if (!pmErr && prodMigrations) {
      console.log('Production supabase_migrations count:', prodMigrations.length);
      console.log('Latest Prod Migrations:', prodMigrations.slice(0, 5));
    } else {
      console.log('Production supabase_migrations query notice:', pmErr?.message);
    }
  } catch (err) {
    console.log('supabase_migrations table check notice:', err.message);
  }

  // Check whether fn_safe_delete_team exists and its definition in Prod
  const { data: prodFn, error: fnErr } = await prodClient.rpc('fn_safe_delete_team', {
    p_team_id: '00000000-0000-0000-0000-000000000000',
    p_actor_id: '00000000-0000-0000-0000-000000000000',
  });
  console.log('Prod fn_safe_delete_team probe result (expected error):', fnErr?.message);

  // 2. PRODUCTION EVENT AUDIT
  console.log('\n--- 2. PRODUCTION EVENT DETAILS ---');
  const { data: events, error: evErr } = await prodClient
    .from('events')
    .select('*')
    .order('created_at', { ascending: false });

  if (evErr) {
    console.error('Error fetching prod events:', evErr);
    return;
  }

  console.log(`Total Events in Prod: ${events.length}`);
  for (const ev of events) {
    console.log(`\nEvent: "${ev.name}" (ID: ${ev.id})`);
    console.log(`  Slug: ${ev.slug}`);
    console.log(`  Status: ${ev.status}`);
    console.log(`  Active Round Number: ${ev.active_round_number}`);
    console.log(`  Total Rounds: ${ev.total_rounds}`);
    console.log(`  Starting Capital: $${ev.starting_capital?.toLocaleString()}`);
    console.log(`  Starting Valuation: $${ev.starting_valuation?.toLocaleString()}`);
    console.log(`  Created At: ${ev.created_at}`);

    // Rounds
    const { data: rounds } = await prodClient
      .from('rounds')
      .select('id, round_number, type, status, opened_at, locked_at, published_at')
      .eq('event_id', ev.id)
      .order('round_number', { ascending: true });

    console.log(`  Rounds (${rounds?.length || 0}):`);
    for (const r of rounds || []) {
      console.log(`    R${r.round_number} (${r.type}): ${r.status} | opened: ${r.opened_at || 'null'} | locked: ${r.locked_at || 'null'} | published: ${r.published_at || 'null'}`);
    }

    // Registered Teams
    const { data: teams } = await prodClient
      .from('teams')
      .select('id, team_code, company_name, domain_id, table_station, is_disqualified, created_at')
      .eq('event_id', ev.id)
      .order('team_code', { ascending: true });

    console.log(`  Registered Teams (${teams?.length || 0}):`);
    for (const t of teams || []) {
      const { count: memberCount } = await prodClient
        .from('team_members')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', t.id);

      console.log(`    [${t.team_code}] ${t.company_name} | Station: ${t.table_station || 'None'} | Disqualified: ${t.is_disqualified} | Members: ${memberCount || 0}`);
    }

    // Decisions
    const { data: decisions } = await prodClient
      .from('decisions')
      .select('id, round_id, team_id, status, submitted_at, verified_at, investment_decision')
      .in('team_id', (teams || []).map(t => t.id));

    console.log(`  Total Decisions in Event: ${decisions?.length || 0}`);
    const decisionsByStatus = (decisions || []).reduce((acc, d) => {
      acc[d.status] = (acc[d.status] || 0) + 1;
      return acc;
    }, {});
    console.log('  Decisions by status:', JSON.stringify(decisionsByStatus));

    // Simulation Runs
    const { data: simRuns } = await prodClient
      .from('simulation_runs')
      .select('id, round_id, execution_duration_ms, is_dry_run, created_at')
      .in('round_id', (rounds || []).map(r => r.id));

    console.log(`  Simulation Runs: ${simRuns?.length || 0}`);

    // Company Snapshots
    const { data: snapshots } = await prodClient
      .from('company_snapshots')
      .select('id, team_id, round_id, valuation, score, rank')
      .in('team_id', (teams || []).map(t => t.id));

    console.log(`  Company Snapshots: ${snapshots?.length || 0}`);

    // Financial Ledger
    const { count: ledgerCount } = await prodClient
      .from('financial_ledger')
      .select('*', { count: 'exact', head: true })
      .in('team_id', (teams || []).map(t => t.id));

    console.log(`  Financial Ledger Entries: ${ledgerCount || 0}`);

    // Equity Transactions
    const { count: equityCount } = await prodClient
      .from('equity_transactions')
      .select('*', { count: 'exact', head: true })
      .in('team_id', (teams || []).map(t => t.id));

    console.log(`  Equity Transactions: ${equityCount || 0}`);

    // Organizer Policies
    const { data: policies } = await prodClient
      .from('organizer_policies')
      .select('*')
      .eq('event_id', ev.id);

    console.log(`  Organizer Policies: ${policies?.length || 0}`);
    if (policies && policies.length > 0) {
      for (const p of policies) {
        console.log(`    Policy: ${p.policy_code || p.name} | Approved: ${p.is_approved ?? p.status}`);
      }
    }

    // Presentation State
    const { data: presState } = await prodClient
      .from('presentation_state')
      .select('*')
      .eq('event_id', ev.id)
      .maybeSingle();

    console.log(`  Presentation State:`, presState ? JSON.stringify(presState) : 'None');
  }

  console.log('\n================================================================');
  console.log('AUDIT COMPLETE — ALL QUERIES WERE STRICTLY READ-ONLY');
  console.log('================================================================');
}

inspect().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
