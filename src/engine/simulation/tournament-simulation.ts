import {
  TournamentSimulationResult,
  DomainSimulationResult,
  CompanyDecision,
  CompanySnapshot,
  DomainConfig,
} from '../types';
import { DOMAIN_ARCHETYPES, getDomainConfig } from '../config/domain-archetypes';
import { simulateDomainRound, DomainSimulationOptions } from './domain-simulation';
import { computeRankings } from '../scoring/final-score';

export interface TournamentSimulationInput {
  readonly roundNumber: number;
  readonly teamDomainMap: ReadonlyMap<string, string>; // teamId -> domainCode
  readonly decisions: readonly CompanyDecision[];
  readonly snapshots: readonly CompanySnapshot[];
  readonly domainConfigs?: Record<string, DomainConfig>;
  readonly options?: DomainSimulationOptions;
}

/**
 * Pure simulation function executing a complete tournament round across all 4 business domains.
 * Partitions teams by domain, executes independent intra-domain competitive resolution,
 * and compiles comprehensive tournament and domain rankings.
 */
export function simulateTournamentRound(
  input: TournamentSimulationInput
): TournamentSimulationResult {
  const { roundNumber, teamDomainMap, decisions, snapshots, options } = input;
  const domainConfigs = input.domainConfigs ?? DOMAIN_ARCHETYPES;

  // Group decisions and snapshots by domain
  const domainDecisionMap = new Map<string, CompanyDecision[]>();
  const domainSnapshotMap = new Map<string, CompanySnapshot[]>();

  for (const decision of decisions) {
    const domainCode = (teamDomainMap.get(decision.teamId) ?? 'cleantech').toLowerCase().trim();
    if (!domainDecisionMap.has(domainCode)) {
      domainDecisionMap.set(domainCode, []);
    }
    domainDecisionMap.get(domainCode)!.push(decision);
  }

  for (const snapshot of snapshots) {
    const domainCode = (teamDomainMap.get(snapshot.teamId) ?? 'cleantech').toLowerCase().trim();
    if (!domainSnapshotMap.has(domainCode)) {
      domainSnapshotMap.set(domainCode, []);
    }
    domainSnapshotMap.get(domainCode)!.push(snapshot);
  }

  // Execute simulation for each active domain
  const domainResults: DomainSimulationResult[] = [];
  const allCompanyResults = [];

  // Sort domain codes deterministically
  const activeDomainCodes = Array.from(domainDecisionMap.keys()).sort();

  for (const domainCode of activeDomainCodes) {
    const domain = domainConfigs[domainCode] ?? getDomainConfig(domainCode);
    const domainDecisions = domainDecisionMap.get(domainCode) ?? [];
    const domainSnapshots = domainSnapshotMap.get(domainCode) ?? [];

    const result = simulateDomainRound(
      domain,
      roundNumber,
      domainDecisions,
      domainSnapshots,
      options
    );

    domainResults.push(result);
    allCompanyResults.push(...result.companyResults);
  }

  // Compute unified tournament leaderboard and domain ranks
  const leaderboard = computeRankings(allCompanyResults);

  return {
    roundNumber,
    domainResults,
    companyResults: allCompanyResults,
    leaderboard,
  };
}
