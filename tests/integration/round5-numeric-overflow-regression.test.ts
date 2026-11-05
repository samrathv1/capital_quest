import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
  mapDatabaseSnapshotToEngine,
  serializeSnapshotsForDatabase,
  serializeLedgerEntriesForDatabase
} from '@/lib/services/simulation-runner';
import { simulateTournamentRound } from '@/engine/simulation/tournament-simulation';
import { DOMAIN_ARCHETYPES } from '@/engine/config/domain-archetypes';
import { D } from '@/engine/math/precision';

describe('Round 5 Simulation Numeric Overflow & Inventory Unit Cost Regression Tests', () => {
  it('correctly calculates per-unit average inventory cost instead of total COGS dollars', () => {
    // Simulated snapshot where total COGS was $206,320 and 10,316 units were sold ($20/unit)
    const snapshotWithLargeTotalCogs = {
      team_id: 'team-ct-54',
      round_number: 3,
      ending_cash: 3046192,
      ending_inventory: 59684,
      cogs: 206320, // Total dollars
      units_sold: 10316,
      cumulative_rd_asset: 509000,
      brand_equity_score: 1500000,
      retained_equity_pct: 100,
      company_valuation: 13151533,
      domain_rank: 2,
      tournament_rank: 2,
    };

    const engineSnapshot = mapDatabaseSnapshotToEngine(snapshotWithLargeTotalCogs, 25);

    // inventoryAverageUnitCost must be $20.00 per unit, NOT $206,320.00!
    expect(engineSnapshot.inventoryAverageUnitCost.toNumber()).toBe(20.00);
    expect(engineSnapshot.beginningInventoryUnits.toNumber()).toBe(59684);
  });

  it('safely clamps corrupted historical COGS to domain base unit cost ceiling', () => {
    // Corrupted snapshot from production Round 4 where COGS was $2,424,878,960 and units_sold was 11,753
    const corruptedSnapshot = {
      team_id: 'team-ct-54',
      round_number: 4,
      ending_cash: 7159742,
      ending_inventory: 47931,
      cogs: 2424878960, // Corrupted total dollars
      units_sold: 11753,
      cumulative_rd_asset: 1018000,
      brand_equity_score: 3000000,
      retained_equity_pct: 100,
      company_valuation: 25000000,
      domain_rank: 1,
      tournament_rank: 1,
    };

    const engineSnapshot = mapDatabaseSnapshotToEngine(corruptedSnapshot, 25);

    // Must safely fallback to base unit COGS ($25.00), preventing multi-trillion dollar calculation
    expect(engineSnapshot.inventoryAverageUnitCost.toNumber()).toBe(25.00);
    expect(engineSnapshot.inventoryAverageUnitCost.toNumber()).toBeLessThanOrEqual(25 * 2.5);
  });

  it('executes Round 5 simulation with large carried-forward inventory without numeric overflow', () => {
    const teamId = 'team-ct-54';
    const teamDomainMap = new Map<string, string>([[teamId, 'saas']]);

    // Carry forward 47,931 units of inventory
    const prevSnapshot = mapDatabaseSnapshotToEngine({
      team_id: teamId,
      round_number: 4,
      ending_cash: 7159742,
      ending_inventory: 47931,
      cogs: 2424878960, // Historically inflated cogs
      units_sold: 11753,
      cumulative_rd_asset: 1018000,
      brand_equity_score: 3000000,
      retained_equity_pct: 100,
      company_valuation: 25000000,
    }, DOMAIN_ARCHETYPES.saas.baseUnitCogs);

    // Round 5 decision slip
    const decision = {
      teamId,
      marketingBudget: D(3900000),
      rdBudget: D(509000),
      productionUnits: D(30000),
      unitPrice: D(250),
      operationsBudget: D(2000000),
      investmentDecision: 'REJECT_BOTH' as const,
    };

    const simRes = simulateTournamentRound({
      roundNumber: 5,
      teamDomainMap,
      decisions: [decision],
      snapshots: [prevSnapshot],
      domainConfigs: { ...DOMAIN_ARCHETYPES },
    });

    const dbSnapshots = serializeSnapshotsForDatabase(simRes);
    const resultSnap = dbSnapshots[0];

    // Check that every numeric field conforms to PostgreSQL NUMERIC(15, 2) max 13 integer digits
    const max15_2 = new Decimal('9999999999999.99'); // 13 digits before decimal

    const cogsDec = new Decimal(resultSnap.cogs as string);
    const revDec = new Decimal(resultSnap.gross_revenue as string);
    const profitDec = new Decimal(resultSnap.gross_profit as string);
    const netIncomeDec = new Decimal(resultSnap.net_income as string);
    const valDec = new Decimal(resultSnap.company_valuation as string);
    const scoreDec = new Decimal(resultSnap.equity_adjusted_score as string);

    // COGS must be in a realistic range (not 27 trillion)
    expect(cogsDec.abs().lte(max15_2)).toBe(true);
    expect(cogsDec.toNumber()).toBeLessThan(100000000); // Less than $100M
    expect(cogsDec.toNumber()).toBeGreaterThan(0);

    // Financial outputs must all be strictly within NUMERIC(15, 2) bounds
    expect(revDec.abs().lte(max15_2)).toBe(true);
    expect(profitDec.abs().lte(max15_2)).toBe(true);
    expect(netIncomeDec.abs().lte(max15_2)).toBe(true);
    expect(valDec.abs().lte(max15_2)).toBe(true);
    expect(scoreDec.abs().lte(new Decimal('9999999999999999.99'))).toBe(true);

    // Ensure ending cash is positive and reconciled
    const endingCash = new Decimal(resultSnap.ending_cash as string);
    expect(endingCash.toNumber()).toBeGreaterThan(0);
    expect(endingCash.abs().lte(max15_2)).toBe(true);
  });
});
