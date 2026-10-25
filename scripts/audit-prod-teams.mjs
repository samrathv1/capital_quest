import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env.production.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const sb = createClient(url, key);

async function check() {
  console.log('--- PRODUCTION TEAMS READ-ONLY STATUS AUDIT ---');
  console.log('Database URL:', url);

  const { data: event, error: evErr } = await sb.from('events').select('id, name, status, active_round_number').maybeSingle();
  if (evErr) {
    console.error('Error querying event:', evErr);
    return;
  }
  console.log('Active Event:', event.name, `(${event.id})`);
  console.log('Event Status:', event.status, '| Active Round Pointer:', event.active_round_number);

  const { data: simulatedRounds } = await sb
    .from('rounds')
    .select('id, round_number, status')
    .eq('event_id', event.id)
    .in('status', ['simulated', 'reviewed', 'published']);

  console.log('Simulated Rounds in Event:', simulatedRounds?.length || 0);

  const { data: teams, error: tErr } = await sb
    .from('teams')
    .select('id, team_code, company_name, table_station, domain_id, domains(code)')
    .order('team_code');

  if (tErr) {
    console.error('Error querying teams:', tErr);
    return;
  }

  console.log(`\nFound ${teams.length} registered production teams:\n`);

  for (const t of teams) {
    const { data: decs } = await sb.from('decisions').select('id, status').eq('team_id', t.id);
    const activeDecs = (decs || []).filter(d => d.status !== 'unsubmitted');
    const { count: snapCount } = await sb.from('company_snapshots').select('*', { count: 'exact', head: true }).eq('team_id', t.id);
    const { count: ledgCount } = await sb.from('financial_ledger').select('*', { count: 'exact', head: true }).eq('team_id', t.id);
    const { count: eqCount } = await sb.from('equity_transactions').select('*', { count: 'exact', head: true }).eq('team_id', t.id);
    const { count: memberCount } = await sb.from('team_members').select('*', { count: 'exact', head: true }).eq('team_id', t.id);

    const reasons = [];
    if (simulatedRounds && simulatedRounds.length > 0) reasons.push('Event has simulated rounds');
    if (activeDecs.length > 0) reasons.push(`${activeDecs.length} active/submitted decisions`);
    if (snapCount > 0) reasons.push(`${snapCount} simulation snapshots`);
    if (ledgCount > 0) reasons.push(`${ledgCount} financial ledger records`);
    if (eqCount > 0) reasons.push(`${eqCount} equity transactions`);

    let classification = 'Eligible for deletion';
    if (reasons.length > 0) {
      classification = 'Blocked by: ' + reasons.join(', ');
    }

    console.log(`Team Code: ${t.team_code}`);
    console.log(`  ID: ${t.id}`);
    console.log(`  Company: ${t.company_name} [${t.domains?.code || 'TECH'}]`);
    console.log(`  Station: ${t.table_station || 'None'} | Members: ${memberCount}`);
    console.log(`  Decisions: ${decs?.length || 0} (active: ${activeDecs.length})`);
    console.log(`  Classification: ${classification}`);
    console.log('----------------------------------------------------');
  }
}

check().catch(console.error);
