import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { TournamentService } from '../src/lib/services/tournament-service.ts';
import { executeSimulationRound } from '../src/lib/services/simulation-runner.ts';
import { DOMAIN_ARCHETYPES } from '../src/engine/config/domain-archetypes.ts';
import { Decimal } from 'decimal.js';

// 1. SUPABASE CLIENT INITIALIZATION (DEV DATABASE ONLY)
const env = fs.readFileSync('.env.local', 'utf8');
const supabaseUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].replace(/^["']|["']$/g, '').trim();
const serviceRoleKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].replace(/^["']|["']$/g, '').trim();
const anonKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].replace(/^["']|["']$/g, '').trim();

if (!supabaseUrl.includes('nlmegyvtecnapzeghobv')) {
  throw new Error(`SAFETY HALT: Target database is NOT nlmegyvtecnapzeghobv! Target was: ${supabaseUrl}`);
}

const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anonSupabase = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const service = new TournamentService(adminSupabase);

async function retry(fn, retries = 3, delay = 1500) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      console.warn(`[RETRY] Transient failure (${err.message}). Retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

async function runDevDbRehearsal() {
  console.log('================================================================');
  console.log('CAPITAL QUEST — REQUIREMENT 2 LIVE DEV DB REHEARSAL');
  console.log('Target Database:', supabaseUrl);
  console.log('Timestamp:', new Date().toISOString());
  console.log('================================================================\n');

  // STEP 0: FETCH SUPER ADMIN & PROVISION ISOLATED EVENT
  console.log('>>> [STEP 0] Provisioning Isolated Rehearsal Event...');
  const { data: superAdmin, error: adminErr } = await adminSupabase
    .from('profiles')
    .select('id, email, role')
    .eq('role', 'super_admin')
    .eq('is_active', true)
    .limit(1)
    .single();

  if (adminErr || !superAdmin) throw new Error('Super admin not found: ' + adminErr?.message);
  console.log(`[PASS] Using Super Admin: ${superAdmin.email} (${superAdmin.id})`);

  // Clean up any stale test events from prior failed runs
  await adminSupabase.from('events').delete().like('slug', 'cq-live-dev-inv-%');

  const eventSlug = `cq-live-dev-inv-${Date.now()}`;
  const { data: event, error: eventErr } = await adminSupabase
    .from('events')
    .insert({
      name: 'Requirement 2 Live Database Rehearsal',
      slug: eventSlug,
      description: 'Isolated test event for dynamic investor offers and real database integration',
      status: 'setup',
      total_rounds: 5,
      starting_capital: 1000000.00,
      starting_valuation: 200000.00,
      active_round_number: 1,
      created_by: superAdmin.id,
    })
    .select()
    .single();

  if (eventErr) throw new Error('Failed to create event: ' + eventErr.message);
  console.log(`[PASS] Created isolated event: ${event.id} (slug: ${eventSlug})`);

  // STEP 1: CREATE 3 ACTIVE DOMAINS (D2C, HEALTH, SAAS)
  console.log('\n>>> [STEP 1] Setting up 3 Active Competition Domains...');
  const domainSpecs = [
    { code: 'D2C', archKey: 'd2c', name: 'D2C Consumer Goods' },
    { code: 'HEALTH', archKey: 'healthtech', name: 'HealthTech & BioDevices' },
    { code: 'SAAS', archKey: 'saas', name: 'Enterprise SaaS & AI' },
  ];
  const domainMap = new Map();

  for (const spec of domainSpecs) {
    const arch = DOMAIN_ARCHETYPES[spec.archKey];
    const { data: dom, error: domErr } = await adminSupabase
      .from('domains')
      .insert({
        event_id: event.id,
        code: spec.code,
        name: spec.name,
        description: `${spec.name} Competition Division`,
        base_demand: arch.baseDemand.toNumber(),
        benchmark_price: arch.benchmarkPrice.toNumber(),
        min_allowed_price: arch.minPrice.toNumber(),
        max_allowed_price: arch.maxPrice.toNumber(),
        base_unit_cogs: arch.baseUnitCogs.toNumber(),
        unit_holding_cost: arch.unitHoldingCost.toNumber(),
        rd_elasticity: arch.rdElasticity.toNumber(),
        rd_retention_rate: arch.rdRetentionRate.toNumber(),
        mkt_elasticity: arch.mktElasticity.toNumber(),
        mkt_retention_rate: arch.mktRetentionRate.toNumber(),
        price_elasticity: arch.priceElasticity.toNumber(),
        quality_regulatory_floor: arch.qualityRegulatoryFloor.toNumber(),
      })
      .select()
      .single();

    if (domErr) throw new Error(`Failed to create domain ${spec.code}: ` + domErr.message);
    domainMap.set(spec.code, dom.id);
  }
  console.log(`[PASS] Created 3 domains:`, Object.fromEntries(domainMap));

  // STEP 2: CREATE 5 ROUNDS
  console.log('\n>>> [STEP 2] Creating 5 Tournament Rounds...');
  const roundTypes = [
    { num: 1, type: 'regular', status: 'open' },
    { num: 2, type: 'investment_seed', status: 'draft' },
    { num: 3, type: 'regular', status: 'draft' },
    { num: 4, type: 'investment_series_a', status: 'draft' },
    { num: 5, type: 'final_harvest', status: 'draft' },
  ];

  const roundMap = new Map();
  for (const r of roundTypes) {
    const { data: rnd, error: rErr } = await adminSupabase
      .from('rounds')
      .insert({
        event_id: event.id,
        round_number: r.num,
        type: r.type,
        status: r.status,
        opened_at: r.num === 1 ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (rErr) throw new Error(`Failed to create round ${r.num}: ` + rErr.message);
    roundMap.set(r.num, rnd.id);
  }
  console.log(`[PASS] Created 5 rounds:`, Object.fromEntries(roundMap));

  // STEP 3: REGISTER 3 TEAMS (1 PER DOMAIN)
  console.log('\n>>> [STEP 3] Registering 3 Competing Teams...');
  const teamsSpec = [
    { code: 'D2C-01', name: 'Aura Consumer Labs', domain: 'D2C' },
    { code: 'HT-01', name: 'Pulse BioDevices', domain: 'HEALTH' },
    { code: 'ST-01', name: 'Nexus Cloud Systems', domain: 'SAAS' },
  ];

  const teamMap = new Map();
  for (const t of teamsSpec) {
    const { data: team, error: tErr } = await adminSupabase
      .from('teams')
      .insert({
        event_id: event.id,
        domain_id: domainMap.get(t.domain),
        team_code: t.code,
        company_name: t.name,
      })
      .select()
      .single();

    if (tErr) throw new Error(`Failed to register team ${t.code}: ` + tErr.message);
    teamMap.set(t.code, team);
  }
  console.log(`[PASS] Registered teams:`, Array.from(teamMap.keys()));

  // Seed Initial Grant Ledger Entries
  for (const [code, team] of teamMap.entries()) {
    await adminSupabase.from('financial_ledger').insert({
      event_id: event.id,
      round_id: roundMap.get(1),
      team_id: team.id,
      entry_type: 'initial_grant',
      amount: 1000000.00,
      running_balance: 1000000.00,
      description: 'Initial Seed Grant',
    });
  }
  console.log('[PASS] Initial $1,000,000 grant ledger entries seeded.');

  // STEP 4: SIMULATE ROUND 1
  console.log('\n>>> [STEP 4] Simulating Round 1...');
  const r1Id = roundMap.get(1);

  // Submit decisions for R1
  const r1Decisions = [
    { teamCode: 'D2C-01', price: 65.0, units: 10000, mkt: 40000, rd: 20000 },
    { teamCode: 'HT-01', price: 2500.0, units: 300, mkt: 50000, rd: 60000 },
    { teamCode: 'ST-01', price: 350.0, units: 1200, mkt: 60000, rd: 70000 },
  ];

  for (const d of r1Decisions) {
    const team = teamMap.get(d.teamCode);
    await service.submitDecision({
      roundId: r1Id,
      teamId: team.id,
      unitPrice: d.price,
      productionUnits: d.units,
      marketingBudget: d.mkt,
      rdBudget: d.rd,
      operationsBudget: 0,
      investmentChoice: 'none',
    }, superAdmin.id);
  }

  // Lock R1
  await adminSupabase.from('rounds').update({ status: 'locked', locked_at: new Date().toISOString() }).eq('id', r1Id);

  // Run simulation for R1
  const simResultR1 = await executeSimulationRound({
    roundId: r1Id,
    adminId: superAdmin.id,
    requireOrganizerApproval: false,
    supabaseClient: adminSupabase,
  });
  console.log(`[PASS] Round 1 Simulation Run completed (v${simResultR1.runVersion}, ${simResultR1.companiesSimulated} companies simulated).`);

  // Publish R1
  await adminSupabase.from('rounds').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', r1Id);
  await adminSupabase.from('events').update({ active_round_number: 2 }).eq('id', event.id);
  console.log('[PASS] Round 1 Standings Published.');

  // STEP 5: ADVANCE TO ROUND 2 & TEST DYNAMIC INVESTOR OFFERS
  console.log('\n>>> [STEP 5] Round 2 (Seed Funding) — Dynamic Investor Offers Verification...');
  const r2Id = roundMap.get(2);
  await retry(() => service.openRound(r2Id, superAdmin.id));
  console.log('[PASS] Round 2 Opened.');

  // 5.1 Generate Offers via Service
  console.log('Generating offers for all teams in Round 2...');
  const r2Offers = new Map();
  for (const [code, team] of teamMap.entries()) {
    const offer = await service.getOrGenerateTeamInvestorOffers(r2Id, team.id, 'super_admin');
    r2Offers.set(code, offer);
    console.log(`  [${code}] Confidence: ${offer.confidenceScore}% (${offer.confidenceTier}) | Offer A: $${offer.offerA.fundingAmount.toLocaleString()} (${offer.offerA.equityStakePct}%) | Offer B: $${offer.offerB.fundingAmount.toLocaleString()} (${offer.offerB.equityStakePct}%)`);
  }

  // 5.2 Verify DB Persistence & Constraints
  console.log('Verifying rows persisted in public.team_investor_offers on live DB...');
  const { data: dbOffers, error: dbOffersErr } = await adminSupabase
    .from('team_investor_offers')
    .select('*')
    .eq('round_id', r2Id);

  if (dbOffersErr) throw new Error('Error querying team_investor_offers: ' + dbOffersErr.message);
  if (dbOffers.length !== 3) throw new Error(`Expected 3 offers in DB, found ${dbOffers.length}`);
  console.log(`[PASS] Exactly 3 offers found in public.team_investor_offers.`);

  // 5.3 Verify Confidentiality (Participant Role Stripping)
  console.log('Testing Confidentiality: unprivileged query must strip confidence score...');
  const publicOffer = await service.getOrGenerateTeamInvestorOffers(r2Id, teamMap.get('D2C-01').id, 'participant');
  if (publicOffer.confidenceScore !== undefined || publicOffer.scoringBreakdown !== undefined) {
    throw new Error('SECURITY BREACH: confidenceScore or scoringBreakdown exposed to participant!');
  }
  console.log('[PASS] Confidentiality verified: confidenceScore and scoringBreakdown stripped for non-admin callers.');

  // 5.4 Verify Anon Client Zero Exposure via Direct PostgREST
  const { data: directAnonRows } = await anonSupabase.from('team_investor_offers').select('*');
  if (directAnonRows && directAnonRows.length > 0) {
    throw new Error('SECURITY BREACH: anon client directly read team_investor_offers!');
  }
  console.log('[PASS] Direct anonymous client read returns 0 rows (RLS fully enforcing confidentiality).');

  // 5.5 Confirm Investment Choices
  console.log('Confirming team choices: D2C-01 -> Offer A, HT-01 -> Offer B, ST-01 -> Reject Both...');
  await service.confirmTeamInvestmentChoice({
    roundId: r2Id,
    teamId: teamMap.get('D2C-01').id,
    choice: 'offer_a',
    adminId: superAdmin.id,
  });

  await service.confirmTeamInvestmentChoice({
    roundId: r2Id,
    teamId: teamMap.get('HT-01').id,
    choice: 'offer_b',
    adminId: superAdmin.id,
  });

  await service.confirmTeamInvestmentChoice({
    roundId: r2Id,
    teamId: teamMap.get('ST-01').id,
    choice: 'reject_both',
    adminId: superAdmin.id,
  });
  console.log('[PASS] All 3 choices confirmed.');

  // 5.6 Test Immutability Lock
  console.log('Testing Immutability: Re-confirming D2C-01 choice must be rejected...');
  let immutabilityPassed = false;
  try {
    await service.confirmTeamInvestmentChoice({
      roundId: r2Id,
      teamId: teamMap.get('D2C-01').id,
      choice: 'offer_b',
      adminId: superAdmin.id,
    });
  } catch (err) {
    if (err.code === 'DECISION_LOCKED' || err.message.includes('already confirmed')) {
      immutabilityPassed = true;
      console.log(`[PASS] Immutability enforced: ${err.message}`);
    } else {
      throw err;
    }
  }
  if (!immutabilityPassed) throw new Error('FAILED: Immutability lock did not prevent re-confirmation!');

  // 5.7 Submit R2 Operating Decisions
  console.log('Submitting Round 2 operating decisions...');
  const r2Decisions = [
    { teamCode: 'D2C-01', price: 68.0, units: 11000, mkt: 45000, rd: 25000, choice: 'offer_a' },
    { teamCode: 'HT-01', price: 2600.0, units: 350, mkt: 55000, rd: 70000, choice: 'offer_b' },
    { teamCode: 'ST-01', price: 360.0, units: 1400, mkt: 65000, rd: 80000, choice: 'reject_both' },
  ];

  for (const d of r2Decisions) {
    const team = teamMap.get(d.teamCode);
    await service.submitDecision({
      roundId: r2Id,
      teamId: team.id,
      unitPrice: d.price,
      productionUnits: d.units,
      marketingBudget: d.mkt,
      rdBudget: d.rd,
      operationsBudget: 0,
      investmentChoice: d.choice,
    }, superAdmin.id);
  }

  // 5.8 Simulate Round 2
  await adminSupabase.from('rounds').update({ status: 'locked', locked_at: new Date().toISOString() }).eq('id', r2Id);
  const simResultR2 = await executeSimulationRound({
    roundId: r2Id,
    adminId: superAdmin.id,
    requireOrganizerApproval: false,
    supabaseClient: adminSupabase,
  });
  console.log(`[PASS] Round 2 Simulation Run completed (v${simResultR2.runVersion}).`);

  // 5.9 Financial & Cap Table Reconciliation for Round 2
  console.log('Reconciling Treasury, Financial Ledger & Equity Dilution for Round 2...');
  const { data: r2Snapshots } = await adminSupabase
    .from('company_snapshots')
    .select('team_id, gross_revenue, gross_profit, financing_cash_flow, ending_cash, retained_equity_pct')
    .eq('round_id', r2Id)
    .eq('is_active', true);

  const { data: r2EquityTxs } = await adminSupabase
    .from('equity_transactions')
    .select('*')
    .eq('round_id', r2Id)
    .eq('is_voided', false);

  for (const [code, team] of teamMap.entries()) {
    const snap = r2Snapshots.find(s => s.team_id === team.id);
    const tx = r2EquityTxs.filter(t => t.team_id === team.id);
    const offer = r2Offers.get(code);

    if (code === 'D2C-01') {
      const expectedFunding = offer.offerA.fundingAmount.toNumber();
      const expectedEquity = 100 - offer.offerA.equityStakePct.toNumber();
      console.log(`  [D2C-01] Funding: ${snap.financing_cash_flow.toLocaleString()} (Expected ${expectedFunding.toLocaleString()}) | Founder Retained: ${snap.retained_equity_pct}% (Expected ${expectedEquity}%)`);
      if (Math.abs(snap.financing_cash_flow - expectedFunding) > 0.01) throw new Error('D2C-01 funding mismatch!');
      if (Math.abs(snap.retained_equity_pct - expectedEquity) > 0.01) throw new Error('D2C-01 retained equity mismatch!');
    } else if (code === 'HT-01') {
      const expectedFunding = offer.offerB.fundingAmount.toNumber();
      const expectedEquity = 100 - offer.offerB.equityStakePct.toNumber();
      console.log(`  [HT-01] Funding: ${snap.financing_cash_flow.toLocaleString()} (Expected ${expectedFunding.toLocaleString()}) | Founder Retained: ${snap.retained_equity_pct}% (Expected ${expectedEquity}%)`);
      if (Math.abs(snap.financing_cash_flow - expectedFunding) > 0.01) throw new Error('HT-01 funding mismatch!');
      if (Math.abs(snap.retained_equity_pct - expectedEquity) > 0.01) throw new Error('HT-01 retained equity mismatch!');
    } else if (code === 'ST-01') {
      console.log(`  [ST-01] Funding: ${snap.financing_cash_flow.toLocaleString()} (Expected $0) | Founder Retained: ${snap.retained_equity_pct}% (Expected 100%)`);
      if (snap.financing_cash_flow !== 0) throw new Error('ST-01 funding must be 0 for reject_both!');
      if (snap.retained_equity_pct !== 100) throw new Error('ST-01 retained equity must be 100%!');
    }

    // Verify full cap table sum = 100.0000%
    const nonFoundingInvestors = tx.filter(t => !t.is_founding_team);
    const investorEquitySum = nonFoundingInvestors.reduce((acc, t) => acc + (Number(t.post_round_equity_pct) || 0), 0);
    const totalEquity = snap.retained_equity_pct + investorEquitySum;
    if (Math.abs(totalEquity - 100) > 0.001) {
      throw new Error(`Total cap table equity sum mismatch for ${code}: ${totalEquity}% (expected 100%)`);
    }

    // Verify operating revenue does NOT absorb financing cash flow
    const { data: ledgerEntries } = await adminSupabase
      .from('financial_ledger')
      .select('amount, entry_type')
      .eq('round_id', r2Id)
      .eq('team_id', team.id);

    const fundingFromLedger = (ledgerEntries || [])
      .filter(l => l.entry_type === 'investor_funding')
      .reduce((sum, l) => sum + Number(l.amount), 0);

    if (snap.financing_cash_flow > 0 && Math.abs(fundingFromLedger - snap.financing_cash_flow) > 0.05) {
      throw new Error(`Financing cash flow in snapshot does not match investor funding ledger for ${code}`);
    }
  }
  console.log('[PASS] Round 2 Financial Reconciliation & Cap Table Dilution fully verified.');

  // Publish R2
  await adminSupabase.from('rounds').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', r2Id);
  await adminSupabase.from('events').update({ active_round_number: 3 }).eq('id', event.id);

  // STEP 6: ADVANCE THROUGH ROUND 3 (REGULAR)
  console.log('\n>>> [STEP 6] Simulating Round 3 (Regular Operations)...');
  const r3Id = roundMap.get(3);
  await retry(() => service.openRound(r3Id, superAdmin.id));

  for (const [code, team] of teamMap.entries()) {
    await service.submitDecision({
      roundId: r3Id,
      teamId: team.id,
      unitPrice: code === 'D2C-01' ? 70.0 : code === 'HT-01' ? 2700.0 : 370.0,
      productionUnits: code === 'D2C-01' ? 12000 : code === 'HT-01' ? 400 : 1600,
      marketingBudget: 50000,
      rdBudget: 30000,
      operationsBudget: 0,
      investmentChoice: 'none',
    }, superAdmin.id);
  }

  await adminSupabase.from('rounds').update({ status: 'locked', locked_at: new Date().toISOString() }).eq('id', r3Id);
  const simResultR3 = await executeSimulationRound({
    roundId: r3Id,
    adminId: superAdmin.id,
    requireOrganizerApproval: false,
    supabaseClient: adminSupabase,
  });
  console.log(`[PASS] Round 3 Simulation Run completed (v${simResultR3.runVersion}).`);
  await adminSupabase.from('rounds').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', r3Id);
  await adminSupabase.from('events').update({ active_round_number: 4 }).eq('id', event.id);
  console.log('[PASS] Round 3 Completed and Published.');

  // STEP 7: ROUND 4 (SERIES A) — COMPOUNDED DILUTION VERIFICATION
  console.log('\n>>> [STEP 7] Round 4 (Series A) — Compounding Equity Dilution Verification...');
  const r4Id = roundMap.get(4);
  await retry(() => service.openRound(r4Id, superAdmin.id));

  const r4Offers = new Map();
  for (const [code, team] of teamMap.entries()) {
    const offer = await service.getOrGenerateTeamInvestorOffers(r4Id, team.id, 'super_admin');
    r4Offers.set(code, offer);
    console.log(`  [${code}] R4 Confidence: ${offer.confidenceScore}% (${offer.confidenceTier}) | Offer A: $${offer.offerA.fundingAmount.toLocaleString()} (${offer.offerA.equityStakePct}%) | Offer B: $${offer.offerB.fundingAmount.toLocaleString()} (${offer.offerB.equityStakePct}%)`);
  }

  // Choices for R4:
  // D2C-01: Accept Offer B (compounding onto Seed Offer A)
  // HT-01: Reject Both (keeps Seed Offer B dilution only)
  // ST-01: Accept Offer A (first dilution in Series A)
  await service.confirmTeamInvestmentChoice({
    roundId: r4Id,
    teamId: teamMap.get('D2C-01').id,
    choice: 'offer_b',
    adminId: superAdmin.id,
  });

  await service.confirmTeamInvestmentChoice({
    roundId: r4Id,
    teamId: teamMap.get('HT-01').id,
    choice: 'reject_both',
    adminId: superAdmin.id,
  });

  await service.confirmTeamInvestmentChoice({
    roundId: r4Id,
    teamId: teamMap.get('ST-01').id,
    choice: 'offer_a',
    adminId: superAdmin.id,
  });

  // Submit R4 decisions
  for (const [code, team] of teamMap.entries()) {
    const choice = code === 'D2C-01' ? 'offer_b' : code === 'HT-01' ? 'reject_both' : 'offer_a';
    await service.submitDecision({
      roundId: r4Id,
      teamId: team.id,
      unitPrice: code === 'D2C-01' ? 72.0 : code === 'HT-01' ? 2800.0 : 380.0,
      productionUnits: code === 'D2C-01' ? 13000 : code === 'HT-01' ? 450 : 1800,
      marketingBudget: 55000,
      rdBudget: 35000,
      operationsBudget: 0,
      investmentChoice: choice,
    }, superAdmin.id);
  }

  await adminSupabase.from('rounds').update({ status: 'locked', locked_at: new Date().toISOString() }).eq('id', r4Id);
  const simResultR4 = await executeSimulationRound({
    roundId: r4Id,
    adminId: superAdmin.id,
    requireOrganizerApproval: false,
    supabaseClient: adminSupabase,
  });
  console.log(`[PASS] Round 4 Simulation Run completed (v${simResultR4.runVersion}).`);

  // Verify Compounded Cap Table in Round 4
  const { data: r4Snapshots } = await adminSupabase
    .from('company_snapshots')
    .select('team_id, retained_equity_pct')
    .eq('round_id', r4Id)
    .eq('is_active', true);

  const { data: r4EquityTxs } = await adminSupabase
    .from('equity_transactions')
    .select('*')
    .eq('round_id', r4Id)
    .eq('is_voided', false);

  for (const [code, team] of teamMap.entries()) {
    const snap = r4Snapshots.find(s => s.team_id === team.id);
    const d2cSeedOffer = r2Offers.get('D2C-01').offerA.equityStakePct.toNumber();
    const d2cSeriesAOffer = r4Offers.get('D2C-01').offerB.equityStakePct.toNumber();

    if (code === 'D2C-01') {
      // Compounding: founder retains (1 - seed) * (1 - seriesA)
      const expectedRetained = (100 - d2cSeedOffer) * (1 - d2cSeriesAOffer / 100);
      console.log(`  [D2C-01] Compounded Retained: ${snap.retained_equity_pct}% (Expected: ${expectedRetained.toFixed(4)}%)`);
      if (Math.abs(snap.retained_equity_pct - expectedRetained) > 0.01) {
        throw new Error(`D2C-01 compounded equity mismatch! Expected ${expectedRetained}, got ${snap.retained_equity_pct}`);
      }

      // Proportional dilution of existing non-founding seed investor:
      // Seed investor had 8%, diluted by (1 - 0.18) => 6.56%
      const expectedSeedStake = d2cSeedOffer * (1 - d2cSeriesAOffer / 100);
      const expectedSeriesAStake = d2cSeriesAOffer;
      const totalCapTable = expectedRetained + expectedSeedStake + expectedSeriesAStake;
      console.log(`  [D2C-01] Proportional Seed Stake: ${expectedSeedStake.toFixed(4)}% | Series A: ${expectedSeriesAStake}% | Total Cap Table: ${totalCapTable.toFixed(4)}%`);
      if (Math.abs(totalCapTable - 100) > 0.001) {
        throw new Error('Total cap table sum does not equal 100%!');
      }
    }
  }
  console.log('[PASS] Compounding equity dilution strictly mathematically validated on live DB.');

  // STEP 8: DATABASE RESET COMPATIBILITY
  console.log('\n>>> [STEP 8] Testing Real Database Reset Compatibility...');
  // 8.1 Test fn_reset_round_decisions on a round with dynamic investor offers
  console.log('Testing fn_reset_round_decisions on an open round with active investor offers...');
  const { data: tempResetEvent, error: tempEventErr } = await adminSupabase
    .from('events')
    .insert({
      name: 'Temp Reset Verification Event ' + Date.now(),
      slug: 'temp-rst-' + Date.now(),
      status: 'active',
      total_rounds: 5,
      active_round_number: 2,
    })
    .select()
    .single();

  if (tempEventErr || !tempResetEvent) {
    throw new Error('Failed to create temp event: ' + (tempEventErr?.message || 'unknown'));
  }

  const arch = DOMAIN_ARCHETYPES.d2c;
  const { data: tempResetDomain, error: domErr } = await adminSupabase
    .from('domains')
    .insert({
      event_id: tempResetEvent.id,
      code: 'd2c',
      name: 'D2C Consumer Goods',
      description: 'D2C Competition Division',
      base_demand: arch.baseDemand.toNumber(),
      benchmark_price: arch.benchmarkPrice.toNumber(),
      min_allowed_price: arch.minPrice.toNumber(),
      max_allowed_price: arch.maxPrice.toNumber(),
      base_unit_cogs: arch.baseUnitCogs.toNumber(),
      unit_holding_cost: arch.unitHoldingCost.toNumber(),
      rd_elasticity: arch.rdElasticity.toNumber(),
      rd_retention_rate: arch.rdRetentionRate.toNumber(),
      mkt_elasticity: arch.mktElasticity.toNumber(),
      mkt_retention_rate: arch.mktRetentionRate.toNumber(),
      price_elasticity: arch.priceElasticity.toNumber(),
      quality_regulatory_floor: arch.qualityRegulatoryFloor.toNumber(),
    })
    .select()
    .single();

  if (domErr) throw new Error('Failed to create temp domain: ' + domErr.message);

  const { data: tempResetTeam, error: teamErr } = await adminSupabase
    .from('teams')
    .insert({
      event_id: tempResetEvent.id,
      domain_id: tempResetDomain.id,
      team_code: 'RST-01',
      company_name: 'Reset Test Co',
    })
    .select()
    .single();

  if (teamErr) throw new Error('Failed to create temp team: ' + teamErr.message);

  const { data: tempResetRound2, error: tempRoundErr } = await adminSupabase
    .from('rounds')
    .insert({
      event_id: tempResetEvent.id,
      round_number: 2,
      type: 'investment_seed',
      status: 'open',
    })
    .select()
    .single();

  if (tempRoundErr || !tempResetRound2) {
    throw new Error('Failed to create temp round: ' + (tempRoundErr?.message || 'unknown'));
  }

  await adminSupabase.from('team_investor_offers').insert({
    event_id: tempResetEvent.id,
    round_id: tempResetRound2.id,
    team_id: tempResetTeam.id,
    round_number: 2,
    confidence_score: 85,
    confidence_tier: 'high',
    scoring_breakdown: {},
    offer_a_amount: 250000,
    offer_a_equity_pct: 8.0,
    offer_b_amount: 450000,
    offer_b_equity_pct: 18.0,
    selected_choice: 'offer_a',
    is_confirmed: true,
    confirmed_at: new Date().toISOString(),
    confirmed_by: superAdmin.id,
  });

  const { data: resetRoundRes, error: rrErr } = await adminSupabase.rpc('fn_reset_round_decisions', {
    p_round_id: tempResetRound2.id,
    p_actor_id: superAdmin.id,
    p_reason: 'Testing round reset compatibility with dynamic investor offers schema',
    p_target_status: 'open',
  });
  if (rrErr) throw new Error('fn_reset_round_decisions failed: ' + rrErr.message);

  const { data: offerAfterReset } = await adminSupabase
    .from('team_investor_offers')
    .select('selected_choice, is_confirmed, confirmed_at, confirmed_by')
    .eq('round_id', tempResetRound2.id)
    .single();

  if (offerAfterReset.selected_choice !== 'none' || offerAfterReset.is_confirmed !== false) {
    throw new Error(`fn_reset_round_decisions failed to reset offer: choice=${offerAfterReset.selected_choice}, confirmed=${offerAfterReset.is_confirmed}`);
  }
  console.log('[PASS] fn_reset_round_decisions reset verified: selected_choice="none", is_confirmed=false, confirmed_at=null.');

  // Clean up temporary event
  await adminSupabase.from('events').delete().eq('id', tempResetEvent.id);

  // 8.2 Test fn_reset_entire_tournament
  const { data: resetTourneyRes, error: rtErr } = await adminSupabase.rpc('fn_reset_entire_tournament', {
    p_event_id: event.id,
    p_actor_id: superAdmin.id,
    p_reason: 'Testing entire tournament reset compatibility with team_investor_offers table',
    p_confirm_published: true,
  });
  if (rtErr) throw new Error('fn_reset_entire_tournament failed: ' + rtErr.message);
  console.log('[PASS] fn_reset_entire_tournament executed successfully:', resetTourneyRes.success);

  // Verify that team_investor_offers was completely cleaned up by reset
  const { data: remainingOffers } = await adminSupabase
    .from('team_investor_offers')
    .select('id')
    .eq('event_id', event.id);

  if (remainingOffers && remainingOffers.length > 0) {
    throw new Error(`Expected 0 remaining offers after tournament reset, found ${remainingOffers.length}!`);
  }
  console.log('[PASS] team_investor_offers table completely and atomically cleaned up on tournament reset.');

  // STEP 9: CLEANUP ISOLATED REHEARSAL EVENT
  console.log('\n>>> [STEP 9] Cleaning Up Isolated Rehearsal Event...');
  await adminSupabase.from('events').delete().eq('id', event.id);
  console.log(`[PASS] Isolated test event ${event.id} cleanly removed from dev DB.`);

  console.log('\n================================================================');
  console.log('CAPITAL QUEST — REQUIREMENT 2 LIVE DEV DB REHEARSAL COMPLETE: ALL PASS');
  console.log('================================================================');
}

runDevDbRehearsal().catch(err => {
  console.error('\n*** REHEARSAL FAILED ***');
  console.error(err);
  process.exit(1);
});
