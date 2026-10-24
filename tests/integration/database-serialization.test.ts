import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
  serializeSnapshotsForDatabase,
  serializeLedgerEntriesForDatabase,
  serializeEquityTransactionsForDatabase,
  createDefaultRound0Snapshot,
  computeInputStateHash,
} from '@/lib/services/simulation-runner';
import { simulateTournamentRound } from '@/engine/simulation/tournament-simulation';
import { DOMAIN_ARCHETYPES } from '@/engine/config/domain-archetypes';
import { D } from '@/engine/math/precision';

describe('Phase 2: Database Serialization & Financial Reconciliation', () => {
  it('correctly serializes company snapshots into exact database NUMERIC strings', () => {
    const teamDomainMap = new Map<string, string>([
      ['team-1', 'cleantech'],
      ['team-2', 'cleantech'],
    ]);

    const decisions = [
      {
        teamId: 'team-1',
        marketingBudget: D(50000),
        rdBudget: D(40000),
        productionUnits: D(500),
        unitPrice: D(1000),
        operationsBudget: D(25000),
        investmentDecision: 'REJECT_BOTH' as const,
      },
      {
        teamId: 'team-2',
        marketingBudget: D(60000),
        rdBudget: D(50000),
        productionUnits: D(600),
        unitPrice: D(1100),
        operationsBudget: D(30000),
        investmentDecision: 'REJECT_BOTH' as const,
      },
    ];

    const prevSnapshots = [
      createDefaultRound0Snapshot('team-1', DOMAIN_ARCHETYPES.cleantech.baseUnitCogs),
      createDefaultRound0Snapshot('team-2', DOMAIN_ARCHETYPES.cleantech.baseUnitCogs),
    ];

    const result = simulateTournamentRound({
      roundNumber: 1,
      teamDomainMap,
      decisions,
      snapshots: prevSnapshots,
    });

    const serializedSnapshots = serializeSnapshotsForDatabase(result);

    expect(serializedSnapshots).toHaveLength(2);
    for (const snap of serializedSnapshots) {
      expect(typeof snap.gross_revenue).toBe('string');
      expect(typeof snap.cogs).toBe('string');
      expect(typeof snap.ending_cash).toBe('string');
      expect(typeof snap.company_valuation).toBe('string');
      expect(typeof snap.retained_equity_pct).toBe('string');
      expect(typeof snap.equity_adjusted_score).toBe('string');

      // Verify no floating point artifacts like .000000000004
      expect(snap.ending_cash).toMatch(/^\d+(\.\d{2})?$/);
      expect(snap.retained_equity_pct).toMatch(/^\d+(\.\d{4})?$/);
    }
  });

  it('reconciles financial ledger entries with 100% exact double-entry cash balance', () => {
    const teamDomainMap = new Map<string, string>([
      ['team-1', 'cleantech'],
    ]);

    const decisions = [
      {
        teamId: 'team-1',
        marketingBudget: D(50000),
        rdBudget: D(40000),
        productionUnits: D(500),
        unitPrice: D(1000),
        operationsBudget: D(25000),
        investmentDecision: 'REJECT_BOTH' as const,
      },
    ];

    const prevSnapshotMap = new Map([
      ['team-1', createDefaultRound0Snapshot('team-1', DOMAIN_ARCHETYPES.cleantech.baseUnitCogs)],
    ]);

    const result = simulateTournamentRound({
      roundNumber: 1,
      teamDomainMap,
      decisions,
      snapshots: Array.from(prevSnapshotMap.values()),
    });

    const ledgerEntries = serializeLedgerEntriesForDatabase(result, prevSnapshotMap);
    expect(ledgerEntries.length).toBeGreaterThan(0);

    const team1Entries = ledgerEntries.filter(e => e.team_id === 'team-1');
    const startCash = prevSnapshotMap.get('team-1')!.cash;
    let computedCash = new Decimal(startCash);

    for (const entry of team1Entries) {
      computedCash = computedCash.add(new Decimal(entry.amount as string));
    }

    const companyResult = result.companyResults.find(r => r.teamId === 'team-1')!;
    const engineEndingCash = companyResult.financial.endingCash;

    // Check that ledger running balance matches engine ending cash to the exact cent
    expect(computedCash.toFixed(2)).toBe(engineEndingCash.toFixed(2));
    expect(team1Entries[team1Entries.length - 1].running_balance).toBe(engineEndingCash.toFixed(2));
  });

  it('correctly serializes equity transactions and preserves 100% cap-table conservation', () => {
    const teamDomainMap = new Map<string, string>([
      ['team-vc', 'saas'],
    ]);

    // Round 2 VC investment window: OFFER_A ($400,000 for 25% equity)
    const decisions = [
      {
        teamId: 'team-vc',
        marketingBudget: D(30000),
        rdBudget: D(30000),
        productionUnits: D(800),
        unitPrice: D(300),
        operationsBudget: D(20000),
        investmentDecision: 'OFFER_A' as const,
      },
    ];

    const prevSnapshotMap = new Map([
      ['team-vc', createDefaultRound0Snapshot('team-vc', DOMAIN_ARCHETYPES.saas.baseUnitCogs)],
    ]);

    const result = simulateTournamentRound({
      roundNumber: 2,
      teamDomainMap,
      decisions,
      snapshots: Array.from(prevSnapshotMap.values()),
    });

    const equityTxns = serializeEquityTransactionsForDatabase(result);
    expect(equityTxns).toHaveLength(2); // 1 investor row + 1 founding team dilution row

    const investorRow = equityTxns.find(e => !e.is_founding_team)!;
    const founderRow = equityTxns.find(e => e.is_founding_team)!;

    expect(investorRow.investment_amount).toBe('400000.00');
    expect(investorRow.post_round_equity_pct).toBe('25.0000');

    expect(founderRow.pre_round_equity_pct).toBe('100.0000');
    expect(founderRow.dilution_delta_pct).toBe('-25.0000');
    expect(founderRow.post_round_equity_pct).toBe('75.0000');

    // Total post-round equity must equal 100%
    const totalEquity = new Decimal(investorRow.post_round_equity_pct as string).add(
      new Decimal(founderRow.post_round_equity_pct as string)
    );
    expect(totalEquity.toFixed(4)).toBe('100.0000');
  });

  it('computes input state hash deterministically regardless of decision input ordering', () => {
    const payloadA = {
      roundId: '11111111-1111-1111-1111-111111111111',
      roundNumber: 1,
      decisions: [
        {
          teamId: 'team-alpha',
          marketingBudget: '10000.00',
          rdBudget: '20000.00',
          productionUnits: 100,
          unitPrice: '50.00',
          operationsBudget: '5000.00',
          investmentDecision: 'none',
        },
        {
          teamId: 'team-beta',
          marketingBudget: '15000.00',
          rdBudget: '25000.00',
          productionUnits: 120,
          unitPrice: '55.00',
          operationsBudget: '6000.00',
          investmentDecision: 'none',
        },
      ],
      domains: [
        {
          code: 'CLEANTECH',
          baseDemand: 1000,
          benchmarkPrice: '100.00',
          minAllowedPrice: '50.00',
          maxAllowedPrice: '150.00',
          baseUnitCogs: '40.00',
        },
      ],
    };

    // Identical data with reversed decision order
    const payloadB = {
      ...payloadA,
      decisions: [payloadA.decisions[1], payloadA.decisions[0]],
    };

    const hashA = computeInputStateHash(payloadA);
    const hashB = computeInputStateHash(payloadB);

    expect(hashA).toBe(hashB);
    expect(hashA).toHaveLength(64); // SHA-256 hex string
  });
});
