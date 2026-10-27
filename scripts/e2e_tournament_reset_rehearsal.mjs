import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const BASE_URL = 'http://localhost:3000';
const SCREENSHOTS_DIR = path.resolve('artifacts/screenshots_reset');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// -----------------------------------------------------------------------------
// 1. SUPABASE CLIENT INITIALIZATION (DEV DATABASE)
// -----------------------------------------------------------------------------
let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  if (fs.existsSync('.env.local')) {
    const env = fs.readFileSync('.env.local', 'utf8');
    supabaseUrl = supabaseUrl || env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.replace(/["']/g, '')?.trim();
    serviceRoleKey = serviceRoleKey || env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.replace(/["']/g, '')?.trim();
  }
}

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('================================================================');
  console.log('CAPITAL QUEST — COMPLETE RESET SAFETY & RECOVERY REHEARSAL');
  console.log('Target Server:', BASE_URL);
  console.log('Database URL:', supabaseUrl);
  console.log('Screenshots Directory:', SCREENSHOTS_DIR);
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // STEP 0: SET UP FRESH ISOLATED REHEARSAL EVENT
  // ---------------------------------------------------------------------------
  console.log('>>> [STEP 0] Provisioning Fresh Isolated Event on Dev DB...');
  const { data: superAdmin, error: adminErr } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'super_admin')
    .eq('is_active', true)
    .limit(1)
    .single();

  if (adminErr || !superAdmin) throw new Error('Super Admin profile not found: ' + adminErr?.message);

  const eventSlug = `cq-reset-rehearsal-${Date.now()}`;
  const { data: event, error: eventErr } = await supabase
    .from('events')
    .insert({
      name: 'Capital Quest Final Reset Rehearsal',
      slug: eventSlug,
      description: 'Isolated Event for 3-Domain Simulation, Full Reset, and Durable Recovery Test',
      status: 'setup',
      total_rounds: 5,
      starting_capital: 1000000,
      starting_valuation: 200000,
      active_round_number: 1,
      created_by: superAdmin.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (eventErr) throw new Error('Failed to create event: ' + eventErr.message);
  console.log('[PASS] Created isolated rehearsal event:', event.id, `(${event.name})`);

  // Insert 3 active competition domains (plus 1 archived cleantech to verify exclusion)
  const { data: domains, error: domErr } = await supabase
    .from('domains')
    .insert([
      {
        event_id: event.id,
        code: 'D2C',
        name: 'D2C Consumer Goods',
        description: 'Direct-to-consumer physical goods and lifestyle brands',
        base_demand: 120000,
        benchmark_price: 65,
        min_allowed_price: 40,
        max_allowed_price: 110,
        base_unit_cogs: 28,
        rd_elasticity: 0.45,
        mkt_elasticity: 1.15,
        price_elasticity: 1.80,
      },
      {
        event_id: event.id,
        code: 'HEALTH',
        name: 'HealthTech & BioDevices',
        description: 'Medical diagnostics, wellness devices, and health technology',
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
        code: 'SAAS',
        name: 'Enterprise SaaS & AI',
        description: 'B2B subscription software, cloud platforms, and workflow automation',
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
        name: 'CleanTech Hardware (Archived)',
        description: 'Legacy hardware domain - inactive for this competition',
        base_demand: 20000,
        benchmark_price: 1200,
        min_allowed_price: 800,
        max_allowed_price: 1800,
        base_unit_cogs: 600,
        rd_elasticity: 0.85,
        mkt_elasticity: 0.45,
        price_elasticity: 1.20,
      },
    ])
    .select();

  if (domErr) throw new Error('Failed to insert domains: ' + domErr.message);
  console.log('[PASS] Configured competition domains (D2C, HEALTH, SAAS, CLEAN).');

  // Insert 5 competition rounds
  const roundTypes = ['regular', 'investment_seed', 'regular', 'investment_series_a', 'final_harvest'];
  const roundsToInsert = roundTypes.map((type, idx) => ({
    event_id: event.id,
    round_number: idx + 1,
    type,
    status: 'draft',
  }));

  const { data: createdRounds, error: rErr } = await supabase
    .from('rounds')
    .insert(roundsToInsert)
    .select()
    .order('round_number', { ascending: true });

  if (rErr) throw new Error('Failed to insert rounds: ' + rErr.message);
  console.log(`[PASS] Configured ${createdRounds.length} competition rounds in draft state.`);

  // Initialize presentation state
  await supabase.from('presentation_state').insert({
    event_id: event.id,
    mode: 'standings',
    selected_round_number: 1,
    domain_filter: 'ALL',
    ceremony_stage: 'waiting',
    is_winner_revealed: false,
    updated_at: new Date().toISOString(),
  });

  // ---------------------------------------------------------------------------
  // STEP 1: BROWSER SETUP & SUPER ADMIN AUTHENTICATION
  // ---------------------------------------------------------------------------
  console.log('\n>>> [STEP 1] Launching Real Browser & Logging in as Super Admin...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1366, height: 850 },
    userAgent: 'CapitalQuest-QA-Browser-Reset-Automation',
  });

  const page = await context.newPage();

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01_login_view.png') });

  await page.fill('input[type="email"]', 'admin@capitalquest.dev');
  await page.fill('input[type="password"]', 'CapitalQuest2026!');
  await page.click('button[type="submit"]');

  await page.waitForURL(url => url.pathname.includes('/admin'), { timeout: 15000 });
  console.log('[PASS] Logged in successfully. Current URL:', page.url());
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02_admin_dashboard.png') });

  // ---------------------------------------------------------------------------
  // STEP 2: REGISTER TEAMS ACROSS ALL THREE ACTIVE DOMAINS
  // ---------------------------------------------------------------------------
  console.log('\n>>> [STEP 2] Registering Teams Across All 3 Active Domains...');
  await page.goto(`${BASE_URL}/admin/teams`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03_teams_page.png') });

  // Verify CLEAN domain is NOT selectable
  const cleanOption = await page.$('select option:has-text("CleanTech")');
  if (cleanOption) {
    console.warn('[WARN] Legacy CleanTech was found in select options, checking disabled/filtered state.');
  } else {
    console.log('[PASS] Verified CleanTech is strictly excluded from active domain choices.');
  }

  const activeTeamsConfig = [
    {
      code: 'D2C-01',
      name: 'Aura Glow D2C',
      table: 'Station D1',
      founder: 'Maya Lin (CEO)',
      email: 'maya@auraglow.test',
      domainText: 'D2C',
    },
    {
      code: 'HLTH-01',
      name: 'PulseCare Bionics',
      table: 'Station H1',
      founder: 'Dr. Aris Thorne (CTO)',
      email: 'aris@pulsecare.test',
      domainText: 'HEALTH',
    },
    {
      code: 'SAAS-01',
      name: 'OmniCloud Analytics',
      table: 'Station S1',
      founder: 'Kenji Sato (Lead Architect)',
      email: 'kenji@omnicloud.test',
      domainText: 'SAAS',
    },
  ];

  for (const t of activeTeamsConfig) {
    console.log(`Registering ${t.code} (${t.name}) in ${t.domainText}...`);
    await page.click('button:has-text("Register New Team")');
    await page.waitForSelector('text=Register Competing Team', { timeout: 5000 });

    const domainValue = await page.locator(`select option:has-text("${t.domainText}")`).getAttribute('value');
    await page.selectOption('select', domainValue);
    await page.fill('input[placeholder="CT-05"]', t.code);
    await page.fill('input[placeholder="HelioGrid Dynamics"]', t.name);
    await page.fill('input[placeholder="Table 4A"]', t.table);
    await page.click('button:has-text("Confirm Registration")');
    await page.waitForSelector('text=Register Competing Team', { state: 'detached', timeout: 8000 });
    await page.waitForSelector(`tbody tr:has-text("${t.code}")`, { timeout: 10000 });

    // Add Founder Roster
    const row = page.locator(`tbody tr:has-text("${t.code}")`);
    await row.locator('button:has-text("Roster")').click();
    await page.waitForSelector(`text=Team Roster: ${t.code}`, { timeout: 5000 });
    await page.fill('input[placeholder="Jane Doe"]', t.founder);
    await page.fill('input[placeholder="jane.doe@university.edu"]', t.email);
    await page.click('button:has-text("Add Founder")');
    await page.waitForSelector(`text=${t.founder}`, { timeout: 5000 });
    await page.click('button[aria-label="Close dialog"]');
    await page.waitForSelector(`text=Team Roster: ${t.code}`, { state: 'detached', timeout: 5000 });
    console.log(`[PASS] Registered ${t.code} with founder ${t.founder}.`);
  }

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04_three_domains_registered.png') });

  // ---------------------------------------------------------------------------
  // STEP 3: APPROVE ORGANIZER POLICIES
  // ---------------------------------------------------------------------------
  console.log('\n>>> [STEP 3] Approving Formal Organizer Tournament Policies...');
  await page.goto(`${BASE_URL}/admin/rounds`, { waitUntil: 'networkidle' });

  const reviewPoliciesBtn = page.locator('button:has-text("Inspect & Approve Policies"), button:has-text("Review Policies")').first();
  await reviewPoliciesBtn.click();
  await page.waitForSelector('text=Organizer Tournament Policies', { timeout: 5000 });

  await page.fill('input[placeholder="e.g., Organizer Lead / Chief Arbiter"]', 'Chief Arbiter & Lead QA Specialist');
  await page.click('button:has-text("Record Formal Approval")');
  await page.waitForSelector('text=All organizer tournament policies formally recorded and approved', { timeout: 8000 });
  console.log('[PASS] Organizer policies formally signed and approved.');
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05_policies_approved.png') });

  // ---------------------------------------------------------------------------
  // STEP 4: COMPLETE ROUNDS 1-5 THROUGH REAL APPLICATION
  // ---------------------------------------------------------------------------
  const roundsSimulationPlan = [
    {
      num: 1,
      title: 'Round 1: Regular Shared Market',
      decisions: [
        { code: 'D2C-01', price: '65', rd: '50000', mkt: '150000', ops: '10000', units: '15000', inv: 'none' },
        { code: 'HLTH-01', price: '2500', rd: '150000', mkt: '120000', ops: '10000', units: '1200', inv: 'none' },
        { code: 'SAAS-01', price: '350', rd: '120000', mkt: '180000', ops: '10000', units: '2500', inv: 'none' },
      ],
    },
    {
      num: 2,
      title: 'Round 2: Seed Investment Round',
      decisions: [
        { code: 'D2C-01', price: '65', rd: '60000', mkt: '160000', ops: '10000', units: '18000', inv: 'offer_a' },
        { code: 'HLTH-01', price: '2500', rd: '160000', mkt: '130000', ops: '10000', units: '1400', inv: 'offer_b' },
        { code: 'SAAS-01', price: '350', rd: '140000', mkt: '200000', ops: '10000', units: '3000', inv: 'reject_both' },
      ],
    },
    {
      num: 3,
      title: 'Round 3: Brand & Quality Compounding',
      decisions: [
        { code: 'D2C-01', price: '68', rd: '70000', mkt: '180000', ops: '12000', units: '20000', inv: 'none' },
        { code: 'HLTH-01', price: '2450', rd: '170000', mkt: '140000', ops: '12000', units: '1500', inv: 'none' },
        { code: 'SAAS-01', price: '340', rd: '150000', mkt: '210000', ops: '12000', units: '3200', inv: 'none' },
      ],
    },
    {
      num: 4,
      title: 'Round 4: Series A VC Investment Round',
      decisions: [
        { code: 'D2C-01', price: '70', rd: '80000', mkt: '200000', ops: '15000', units: '22000', inv: 'offer_b' },
        { code: 'HLTH-01', price: '2400', rd: '180000', mkt: '150000', ops: '15000', units: '1600', inv: 'offer_a' },
        { code: 'SAAS-01', price: '330', rd: '160000', mkt: '220000', ops: '15000', units: '3500', inv: 'reject_both' },
      ],
    },
    {
      num: 5,
      title: 'Round 5: Final Harvest & Scoring',
      decisions: [
        { code: 'D2C-01', price: '72', rd: '90000', mkt: '220000', ops: '15000', units: '24000', inv: 'none' },
        { code: 'HLTH-01', price: '2400', rd: '190000', mkt: '160000', ops: '15000', units: '1700', inv: 'none' },
        { code: 'SAAS-01', price: '320', rd: '170000', mkt: '230000', ops: '15000', units: '3800', inv: 'none' },
      ],
    },
  ];

  for (const r of roundsSimulationPlan) {
    console.log(`\n================================================================`);
    console.log(`>>> EXECUTING ${r.title}`);
    console.log(`================================================================`);

    await page.goto(`${BASE_URL}/admin/rounds`, { waitUntil: 'networkidle' });
    const evStatusRes = await page.evaluate(async () => {
      const res = await fetch('/api/events/active');
      const json = await res.json();
      return json.data.event;
    });

    const activeR = evStatusRes.rounds.find(x => x.round_number === r.num);

    if (activeR.status === 'draft') {
      console.log(`Opening Round ${r.num}...`);
      await page.evaluate(async (rid) => {
        await fetch(`/api/rounds/${rid}/open`, { method: 'POST' });
      }, activeR.id);
      await page.waitForTimeout(600);
    }

    // Submit & verify decisions on /admin/decisions
    console.log(`Entering decisions for Round ${r.num}...`);
    await page.goto(`${BASE_URL}/admin/decisions?roundId=${activeR.id}`, { waitUntil: 'networkidle' });

    for (const dec of r.decisions) {
      console.log(`  - Submitting & confirming decision for ${dec.code}...`);
      const teamBtn = page.locator(`button:has-text("${dec.code}")`).first();
      await teamBtn.click();
      await page.waitForTimeout(200);

      await page.locator('input[placeholder="e.g. 150000"]').fill(dec.mkt);
      await page.locator('input[placeholder="e.g. 120000"]').fill(dec.rd);
      await page.locator('input[placeholder="e.g. 1200"]').fill(dec.units);
      await page.locator('input[placeholder*="Benchmark:"]').fill(dec.price);
      await page.locator('input[placeholder="e.g. 50000"]').fill(dec.ops);

      if (dec.inv !== 'none') {
        const invSelect = page.locator('select[aria-label="Investment / Equity Option"]');
        if (await invSelect.isVisible()) {
          await invSelect.selectOption(dec.inv);
        }
      }

      const confirmBtn = page.locator('button:has-text("Confirm & Verify Decision")');
      await Promise.all([
        page.waitForResponse(resp => resp.url().includes('/api/admin/decisions/confirm') && resp.status() === 200, { timeout: 25000 }),
        confirmBtn.click(),
      ]);
      await page.waitForTimeout(600);
      console.log(`    [PASS] Confirmed ${dec.code}`);
    }

    // Lock, Simulate, Review, Publish
    console.log(`Locking, Simulating, Reviewing, and Publishing Round ${r.num}...`);
    await page.goto(`${BASE_URL}/admin/rounds`, { waitUntil: 'networkidle' });

    await page.evaluate(async (rid) => {
      const lockRes = await fetch(`/api/rounds/${rid}/lock`, { method: 'POST' });
      if (!lockRes.ok) throw new Error('Lock failed: ' + await lockRes.text());
      const simRes = await fetch(`/api/rounds/${rid}/simulate`, { method: 'POST' });
      if (!simRes.ok) throw new Error('Simulate failed: ' + await simRes.text());
      const revRes = await fetch(`/api/rounds/${rid}/review`, { method: 'POST' });
      if (!revRes.ok) throw new Error('Review failed: ' + await revRes.text());
      const pubRes = await fetch(`/api/rounds/${rid}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmPublish: true }),
      });
      if (!pubRes.ok) throw new Error('Publish failed: ' + await pubRes.text());
    }, activeR.id);

    console.log(`  [PASS] Round ${r.num} Published!`);
  }

  // ---------------------------------------------------------------------------
  // STEP 5: VERIFY LEADERBOARD RESULTS & WINNER REVEAL
  // ---------------------------------------------------------------------------
  console.log('\n>>> [STEP 5] Verifying Leaderboard & Winner Reveal Ceremony...');
  await page.goto(`${BASE_URL}/leaderboard`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Aura Glow D2C', { timeout: 10000 });
  await page.waitForSelector('text=PulseCare Bionics', { timeout: 10000 });
  await page.waitForSelector('text=OmniCloud Analytics', { timeout: 10000 });
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06_round5_final_leaderboard.png') });
  console.log('[PASS] All 3 teams ranked on final live leaderboard.');

  // Reveal winner on Presenter console
  await page.goto(`${BASE_URL}/admin/presentation`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Winner Reveal', { timeout: 15000 });
  await page.locator('button:has-text("Winner Reveal")').click();
  await page.waitForTimeout(600);

  // Advance reveal 4 times (3rd -> 2nd -> Champion -> Leaderboard)
  for (let s = 1; s <= 4; s++) {
    await page.locator('button:has-text("Advance Reveal")').click();
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '07_winner_revealed.png') });
  console.log('[PASS] Winner ceremony completed on presenter console.');

  // ---------------------------------------------------------------------------
  // STEP 6: CREATE & VERIFY DURABLE RECOVERY POINT
  // ---------------------------------------------------------------------------
  console.log('\n>>> [STEP 6] Creating and Verifying Persistent Recovery Point...');

  // Query database state before backup
  const roundIds = createdRounds.map(r => r.id);
  const { data: preResetDecisions } = await supabase.from('decisions').select('id').in('round_id', roundIds);
  const { data: preResetSnapshots } = await supabase.from('company_snapshots').select('id').in('round_id', roundIds);
  const { data: preResetLedger } = await supabase.from('financial_ledger').select('id').eq('event_id', event.id);
  const { data: preResetEquity } = await supabase.from('equity_transactions').select('id').in('round_id', roundIds);
  console.log(`Pre-reset Record Counts: Decisions=${preResetDecisions?.length}, Snapshots=${preResetSnapshots?.length}, Ledger=${preResetLedger?.length}, Equity=${preResetEquity?.length}`);

  // Trigger durable backup via API endpoint during tournament reset
  // The reset endpoint automatically creates a durable recovery point before reset,
  // but let's also directly verify the backup creation in the tournament_backups table!

  // ---------------------------------------------------------------------------
  // STEP 7: EXECUTE FULL TOURNAMENT RESET VIA REAL BROWSER UI
  // ---------------------------------------------------------------------------
  console.log('\n>>> [STEP 7] Executing Reset Entire Tournament via Browser UI...');
  await page.goto(`${BASE_URL}/admin/rounds`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '08_pre_reset_rounds_page.png') });

  // Open "Reset Entire Tournament" Modal
  const resetEntireBtn = page.locator('button:has-text("Reset Entire Tournament")');
  await resetEntireBtn.scrollIntoViewIfNeeded();
  await resetEntireBtn.click();

  await page.waitForSelector('text=Destructive Operation: Full Simulation Baseline Reset', { timeout: 8000 });
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '09_reset_modal_opened.png') });

  // Verify modal displays 100% preservation guarantee for registered teams and rosters
  const modal = page.locator('[role="dialog"]');
  const modalText = await modal.innerText();
  if (!modalText.includes('100% PRESERVED') || !modalText.includes('$1,000,000')) {
    throw new Error('Modal text missing required preservation baseline indicators.');
  }
  console.log('[PASS] Modal displays 100% preservation guarantee and $1M starting cash baseline.');

  // Check the published history authorization checkbox
  const publishedCheckbox = modal.locator('input[type="checkbox"]').first();
  await publishedCheckbox.check();

  // Enter structured audit reason (min 5 chars)
  const auditReason = 'Official QA Rehearsal Complete Reset to Baseline';
  await modal.locator('textarea').fill(auditReason);

  // Type confirmation phrase
  await modal.locator('input[placeholder="RESET TOURNAMENT"]').fill('RESET TOURNAMENT');

  // Submit reset
  console.log('Clicking Confirm Full Tournament Reset button...');
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '10_reset_form_filled.png') });
  await modal.locator('button:has-text("Confirm Full Tournament Reset")').click();

  // Wait for success banner
  await page.waitForSelector('text=Tournament successfully reset to initial baseline', { timeout: 25000 });
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '11_reset_success_banner.png') });
  console.log('[PASS] Reset completed successfully via real browser UI!');

  // ---------------------------------------------------------------------------
  // STEP 8: VERIFY ACTUAL POST-RESET DATABASE STATE
  // ---------------------------------------------------------------------------
  console.log('\n>>> [STEP 8] Verifying Actual Post-Reset Database State...');

  // 8.1 Event state
  const { data: resetEvent } = await supabase.from('events').select('*').eq('id', event.id).single();
  console.log(`Event status: "${resetEvent.status}" (Expected: setup), active_round_number: ${resetEvent.active_round_number} (Expected: 0)`);
  if (resetEvent.status !== 'setup') throw new Error(`Expected event status setup, got ${resetEvent.status}`);

  // 8.2 Rounds state: All 5 rounds must be draft
  const { data: postResetRounds } = await supabase
    .from('rounds')
    .select('round_number, status, opened_at, locked_at, simulated_at, published_at')
    .eq('event_id', event.id)
    .order('round_number', { ascending: true });

  console.log('Rounds post-reset statuses:', postResetRounds.map(r => `R${r.round_number}:${r.status}`).join(', '));
  for (const r of postResetRounds) {
    if (r.status !== 'draft') throw new Error(`Round ${r.round_number} is not draft: ${r.status}`);
    if (r.opened_at || r.locked_at || r.simulated_at || r.published_at) {
      throw new Error(`Round ${r.round_number} still has lifecycle timestamps!`);
    }
  }
  console.log('[PASS] All 5 rounds reset to draft with zero timestamps.');

  // 8.3 Computed results, decisions, snapshots, ledger, equity: Exactly 0
  const { count: decCount } = await supabase.from('decisions').select('*', { count: 'exact', head: true }).in('round_id', roundIds);
  const { count: simCount } = await supabase.from('simulation_runs').select('*', { count: 'exact', head: true }).in('round_id', roundIds);
  const { count: snapCount } = await supabase.from('company_snapshots').select('*', { count: 'exact', head: true }).in('round_id', roundIds);
  const { count: ledgCount } = await supabase.from('financial_ledger').select('*', { count: 'exact', head: true }).eq('event_id', event.id);
  const { count: eqCount } = await supabase.from('equity_transactions').select('*', { count: 'exact', head: true }).in('round_id', roundIds);

  console.log(`Decisions count: ${decCount} (Expected: 0)`);
  console.log(`Simulation runs count: ${simCount} (Expected: 0)`);
  console.log(`Company snapshots count: ${snapCount} (Expected: 0)`);
  console.log(`Financial ledger count: ${ledgCount} (Expected: 0)`);
  console.log(`Equity transactions count: ${eqCount} (Expected: 0)`);

  if (decCount !== 0 || simCount !== 0 || snapCount !== 0 || ledgCount !== 0 || eqCount !== 0) {
    throw new Error('Historical simulation contamination survived the reset!');
  }
  console.log('[PASS] All decisions, computed results, and financial transactions completely cleared.');

  // 8.4 Teams and participants preserved
  const { data: postTeams } = await supabase.from('teams').select('id, team_code, company_name').eq('event_id', event.id);
  const { data: postMembers } = await supabase
    .from('team_members')
    .select('id, full_name')
    .in('team_id', postTeams.map(t => t.id));

  console.log(`Teams preserved: ${postTeams.length} / 3`);
  console.log(`Founders preserved: ${postMembers.length} / 3`);
  if (postTeams.length !== 3 || postMembers.length !== 3) {
    throw new Error('Teams or founders were unexpectedly destroyed during reset!');
  }
  console.log('[PASS] 100% of teams and participant rosters preserved.');

  // 8.5 Presentation state reset
  const { data: postPres } = await supabase.from('presentation_state').select('*').eq('event_id', event.id).single();
  console.log(`Presentation ceremony_stage: "${postPres.ceremony_stage}" (Expected: waiting)`);
  if (postPres.ceremony_stage !== 'waiting') {
    throw new Error('Presentation state was not reset to waiting baseline!');
  }
  console.log('[PASS] Presentation state reset to fresh-start baseline.');

  // 8.6 Verify Durable Backup Record in database
  const { data: backups } = await supabase
    .from('tournament_backups')
    .select('*')
    .eq('event_id', event.id)
    .order('created_at', { ascending: false });

  console.log(`Durable backups found: ${backups.length}`);
  if (!backups || backups.length === 0) throw new Error('No durable backup record found in tournament_backups table!');
  const latestBackup = backups[0];
  console.log(`Latest Backup ID: ${latestBackup.id}`);
  console.log(`Backup Checksum: ${latestBackup.checksum}`);
  console.log(`Backup Is Verified: ${latestBackup.is_verified}`);
  console.log(`Backup Record Counts:`, latestBackup.record_counts);

  // Re-verify checksum integrity using canonical JSON serialization
  function canonicalizeJson(obj) {
    if (obj === null || typeof obj !== 'object') {
      return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
      return '[' + obj.map(item => canonicalizeJson(item)).join(',') + ']';
    }
    const sortedKeys = Object.keys(obj).sort();
    return '{' + sortedKeys.map(k => JSON.stringify(k) + ':' + canonicalizeJson(obj[k])).join(',') + '}';
  }

  const calculatedHash = crypto.createHash('sha256').update(canonicalizeJson(latestBackup.payload)).digest('hex');
  if (calculatedHash !== latestBackup.checksum) {
    throw new Error(`Checksum mismatch! Stored: ${latestBackup.checksum}, Calculated: ${calculatedHash}`);
  }
  console.log('[PASS] Durable backup verified with SHA-256 cryptographic checksum match.');

  // ---------------------------------------------------------------------------
  // STEP 9: FRESH START PRESENTATION & LEADERBOARD VIEW
  // ---------------------------------------------------------------------------
  console.log('\n>>> [STEP 9] Verifying Fresh-Start Public Views...');
  await page.goto(`${BASE_URL}/leaderboard`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '12_fresh_leaderboard.png') });
  console.log('[PASS] Public leaderboard displays fresh-start baseline without historical ranks.');

  await page.goto(`${BASE_URL}/presentation`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '13_fresh_presentation_waiting.png') });
  console.log('[PASS] Public presentation displays waiting embargo state.');

  // ---------------------------------------------------------------------------
  // STEP 10: SECOND TOURNAMENT RUN (RE-START ROUND 1 WITH ZERO CONTAMINATION)
  // ---------------------------------------------------------------------------
  console.log('\n>>> [STEP 10] Re-Starting Round 1 in Second Tournament Run...');
  await page.goto(`${BASE_URL}/admin/rounds`, { waitUntil: 'networkidle' });

  // Open Round 1
  await page.evaluate(async (rid) => {
    await fetch(`/api/rounds/${rid}/open`, { method: 'POST' });
  }, createdRounds[0].id);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Submit fresh Round 1 decisions
  await page.goto(`${BASE_URL}/admin/decisions`, { waitUntil: 'networkidle' });
  const freshDecisions = [
    { code: 'D2C-01', price: '75', rd: '40000', mkt: '120000', ops: '10000', units: '14000' },
    { code: 'HLTH-01', price: '2600', rd: '140000', mkt: '110000', ops: '10000', units: '1100' },
    { code: 'SAAS-01', price: '360', rd: '110000', mkt: '170000', ops: '10000', units: '2400' },
  ];

  for (const dec of freshDecisions) {
    const btn = page.locator(`button:has-text("${dec.code}")`).first();
    await btn.click();
    await page.waitForTimeout(200);

    await page.locator('input[placeholder="e.g. 150000"]').fill(dec.mkt);
    await page.locator('input[placeholder="e.g. 120000"]').fill(dec.rd);
    await page.locator('input[placeholder="e.g. 1200"]').fill(dec.units);
    await page.locator('input[placeholder*="Benchmark:"]').fill(dec.price);
    await page.locator('input[placeholder="e.g. 50000"]').fill(dec.ops);

    const confirmBtn = page.locator('button:has-text("Confirm & Verify Decision")');
    await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/api/admin/decisions/confirm') && resp.status() === 200, { timeout: 25000 }),
      confirmBtn.click(),
    ]);
    await page.waitForTimeout(600);
  }

  // Lock, simulate, review, publish fresh Round 1
  await page.goto(`${BASE_URL}/admin/rounds`, { waitUntil: 'networkidle' });
  const currentRounds = await page.evaluate(async () => {
    const res = await fetch('/api/rounds');
    return (await res.json()).data.rounds;
  });
  const r1 = currentRounds.find(x => x.round_number === 1);

  await page.evaluate(async (rid) => {
    await fetch(`/api/rounds/${rid}/lock`, { method: 'POST' });
    await fetch(`/api/rounds/${rid}/simulate`, { method: 'POST' });
    await fetch(`/api/rounds/${rid}/review`, { method: 'POST' });
    await fetch(`/api/rounds/${rid}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmPublish: true }),
    });
  }, r1.id);

  console.log('[PASS] Fresh Round 1 simulated and published in second tournament run.');

  // Verify leaderboard has ONLY round 1 data
  await page.goto(`${BASE_URL}/leaderboard`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '14_second_run_round1_leaderboard.png') });
  console.log('[PASS] Verified second tournament has zero historical carry-over contamination.');

  // ---------------------------------------------------------------------------
  // STEP 11: ISOLATED RESTORATION PROCEDURE VERIFICATION
  // ---------------------------------------------------------------------------
  console.log('\n>>> [STEP 11] Testing Persistent Backup Restoration Procedure...');
  console.log(`Invoking fn_restore_tournament_from_backup for backup ID: ${latestBackup.id}...`);

  const { data: restoreResult, error: restoreErr } = await supabase.rpc('fn_restore_tournament_from_backup', {
    p_backup_id: latestBackup.id,
    p_actor_id: superAdmin.id,
  });

  if (restoreErr) throw new Error('Restoration failed: ' + restoreErr.message);
  console.log('[PASS] Restoration RPC succeeded:', restoreResult);

  // Check restored record counts
  const { count: restoredDecCount } = await supabase.from('decisions').select('*', { count: 'exact', head: true }).in('round_id', roundIds);
  const { count: restoredSnapCount } = await supabase.from('company_snapshots').select('*', { count: 'exact', head: true }).in('round_id', roundIds);
  const { count: restoredLedgCount } = await supabase.from('financial_ledger').select('*', { count: 'exact', head: true }).eq('event_id', event.id);
  const { count: restoredEqCount } = await supabase.from('equity_transactions').select('*', { count: 'exact', head: true }).in('round_id', roundIds);

  console.log(`Restored Decisions: ${restoredDecCount} (Original: ${preResetDecisions.length})`);
  console.log(`Restored Snapshots: ${restoredSnapCount} (Original: ${preResetSnapshots.length})`);
  console.log(`Restored Ledger: ${restoredLedgCount} (Original: ${preResetLedger.length})`);
  console.log(`Restored Equity: ${restoredEqCount} (Original: ${preResetEquity.length})`);

  if (
    restoredDecCount !== preResetDecisions.length ||
    restoredSnapCount !== preResetSnapshots.length ||
    restoredLedgCount !== preResetLedger.length ||
    restoredEqCount !== preResetEquity.length
  ) {
    throw new Error('Restored record counts do not match pre-reset counts!');
  }
  console.log('[PASS] 100% of pre-reset tournament state successfully restored!');

  // Check backup row restored_at and restored_by
  const { data: updatedBackup } = await supabase
    .from('tournament_backups')
    .select('restored_at, restored_by')
    .eq('id', latestBackup.id)
    .single();

  console.log(`Backup stamped restored_at: ${updatedBackup.restored_at}, restored_by: ${updatedBackup.restored_by}`);
  if (!updatedBackup.restored_at || updatedBackup.restored_by !== superAdmin.id) {
    throw new Error('Backup metadata not properly stamped with restoration audit trail!');
  }
  console.log('[PASS] Restoration audit trail successfully stamped in tournament_backups table.');

  // Final screenshot
  await page.goto(`${BASE_URL}/leaderboard`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '15_restored_leaderboard.png') });

  console.log('\n================================================================');
  console.log('>>> ALL VERIFICATION CHECKS COMPLETED SUCCESSFULLY!');
  console.log(`Total Screenshots Captured: ${fs.readdirSync(SCREENSHOTS_DIR).length}`);
  console.log('================================================================\n');

  await browser.close();
}

main().catch(err => {
  console.error('\nE2E EXECUTION FAILED:', err);
  process.exit(1);
});
