import { createClient } from '@supabase/supabase-js';

import fs from 'fs';

let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  if (fs.existsSync('.env.local')) {
    const env = fs.readFileSync('.env.local', 'utf8');
    supabaseUrl = supabaseUrl || env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
    serviceRoleKey = serviceRoleKey || env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim();
  }
}

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
}

const client = createClient(supabaseUrl, serviceRoleKey);

async function setup() {
  console.log('--- Setting up Fresh Isolated Event on Dev Database ---');
  const { data: admin } = await client.from('profiles').select('id').eq('role', 'super_admin').limit(1).single();

  const { data: event, error: evErr } = await client.from('events').insert({
    name: 'Capital Quest E2E Live Rehearsal',
    slug: `cq-live-rehearsal-${Date.now()}`,
    description: 'Isolated Real-Browser End-to-End Rehearsal Event',
    status: 'setup',
    total_rounds: 5,
    starting_capital: 1000000,
    starting_valuation: 200000,
    active_round_number: 1,
    created_by: admin.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).select().single();

  if (evErr) throw new Error(evErr.message);

  await client.from('domains').insert([
    {
      event_id: event.id,
      code: 'SAAS',
      name: 'Enterprise SaaS & AI',
      description: 'Enterprise B2B Software and Cloud Intelligence',
      base_demand: 60000,
      benchmark_price: 350,
      min_allowed_price: 200,
      max_allowed_price: 600,
      base_unit_cogs: 25,
      rd_elasticity: 0.75,
      mkt_elasticity: 0.85,
      price_elasticity: 1.45,
    },
    {
      event_id: event.id,
      code: 'CLEAN',
      name: 'CleanTech Hardware',
      description: 'Clean Energy & Hardware Devices',
      base_demand: 20000,
      benchmark_price: 1200,
      min_allowed_price: 800,
      max_allowed_price: 1800,
      base_unit_cogs: 600,
      rd_elasticity: 0.85,
      mkt_elasticity: 0.45,
      price_elasticity: 1.20,
    },
    {
      event_id: event.id,
      code: 'HEALTH',
      name: 'HealthTech Devices',
      description: 'Medical and Health Diagnostics',
      base_demand: 12000,
      benchmark_price: 2500,
      min_allowed_price: 1600,
      max_allowed_price: 3800,
      base_unit_cogs: 1100,
      rd_elasticity: 1.10,
      mkt_elasticity: 0.50,
      price_elasticity: 0.85,
    },
    {
      event_id: event.id,
      code: 'D2C',
      name: 'D2C Consumer Goods',
      description: 'Direct to Consumer Brands',
      base_demand: 80000,
      benchmark_price: 150,
      min_allowed_price: 90,
      max_allowed_price: 260,
      base_unit_cogs: 45,
      rd_elasticity: 0.50,
      mkt_elasticity: 1.25,
      price_elasticity: 1.60,
    },
  ]);

  await client.from('rounds').insert([
    { event_id: event.id, round_number: 1, type: 'regular', status: 'draft' },
    { event_id: event.id, round_number: 2, type: 'investment_seed', status: 'draft' },
    { event_id: event.id, round_number: 3, type: 'regular', status: 'draft' },
    { event_id: event.id, round_number: 4, type: 'investment_series_a', status: 'draft' },
    { event_id: event.id, round_number: 5, type: 'final_harvest', status: 'draft' },
  ]);

  await client.from('presentation_state').insert({
    event_id: event.id,
    mode: 'standings',
    selected_round_number: 1,
    domain_filter: 'ALL',
    ceremony_stage: 'waiting',
    updated_at: new Date().toISOString(),
  });

  console.log('Ready. New Event ID:', event.id);
}

setup().catch(err => {
  console.error(err);
  process.exit(1);
});
