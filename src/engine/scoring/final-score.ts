import Decimal from 'decimal.js';
import { CompanyRoundResult } from '../types';
import { toInteger } from '../math/precision';
import { normalizeDomainCode } from '../config/domain-archetypes';

const D = (v: Decimal.Value): Decimal => new Decimal(v);

export interface FinalScoreInput {
  readonly teamId: string;
  readonly domainId?: string;
  readonly domainCode?: string;
  readonly finalScore: Decimal | number;
  readonly valuation: Decimal | number;
  readonly founderEquityPercent: Decimal | number;
  readonly grossRevenue?: Decimal | number;
  readonly endingCash?: Decimal | number;
}

export type ScorableCompany = CompanyRoundResult | FinalScoreInput;

export interface LeaderboardEntry {
  readonly rank?: number;
  readonly tournamentRank: number;
  readonly domainRank: number;
  readonly teamId: string;
  readonly domainCode: string;
  readonly valuation: Decimal;
  readonly retainedEquityPct: Decimal;
  readonly finalScore: Decimal;
}

function isCompanyRoundResult(c: ScorableCompany): c is CompanyRoundResult {
  return 'valuation' in c && typeof c.valuation === 'object' && c.valuation !== null && 'finalScore' in c.valuation;
}

function extractScore(c: ScorableCompany): Decimal {
  if (isCompanyRoundResult(c)) {
    return D(c.valuation.finalScore);
  }
  return D(c.finalScore);
}

function extractValuation(c: ScorableCompany): Decimal {
  if (isCompanyRoundResult(c)) {
    return D(c.valuation.finalValuation);
  }
  return D(c.valuation);
}

function extractGrossRevenue(c: ScorableCompany): Decimal {
  if (isCompanyRoundResult(c)) {
    return D(c.financial.grossRevenue);
  }
  if (c.grossRevenue !== undefined) return D(c.grossRevenue);
  return D(0);
}

function extractEndingCash(c: ScorableCompany): Decimal {
  if (isCompanyRoundResult(c)) {
    return D(c.financial.endingCash);
  }
  if (c.endingCash !== undefined) return D(c.endingCash);
  return D(0);
}

function extractDomainCode(c: ScorableCompany): string {
  const raw = isCompanyRoundResult(c)
    ? c.domainCode
    : (c.domainCode || c.domainId || 'default');
  const normalized = normalizeDomainCode(raw).toUpperCase();
  if (normalized === 'HEALTHTECH' || normalized === 'HEALTH') return 'HEALTH';
  return normalized;
}

function extractFounderEquity(c: ScorableCompany): Decimal {
  if (isCompanyRoundResult(c)) {
    return c.valuation.retainedEquityPct;
  }
  return D(c.founderEquityPercent);
}

/**
 * Deterministic 5-level tie-breaker comparator:
 * 1. Final Score (descending)
 * 2. Valuation (descending)
 * 3. Gross Revenue (descending)
 * 4. Ending Cash (descending)
 * 5. Team ID (alphabetical ascending for total determinism)
 */
export function compareCompanyResults(
  a: ScorableCompany,
  b: ScorableCompany
): number {
  // 1. Final Score
  const scoreA = extractScore(a);
  const scoreB = extractScore(b);
  if (!scoreA.equals(scoreB)) {
    return scoreB.comparedTo(scoreA);
  }

  // 2. Valuation
  const valA = extractValuation(a);
  const valB = extractValuation(b);
  if (!valA.equals(valB)) {
    return valB.comparedTo(valA);
  }

  // 3. Gross Revenue
  const revA = extractGrossRevenue(a);
  const revB = extractGrossRevenue(b);
  if (!revA.equals(revB)) {
    return revB.comparedTo(revA);
  }

  // 4. Ending Cash
  const cashA = extractEndingCash(a);
  const cashB = extractEndingCash(b);
  if (!cashA.equals(cashB)) {
    return cashB.comparedTo(cashA);
  }

  // 5. Team ID alphabetical
  return a.teamId.localeCompare(b.teamId);
}

/**
 * Computes independent intra-domain rankings for a single domain.
 * Teams in this domain compete strictly against each other.
 */
export function computeSingleDomainRankings(
  domainCompanyResults: readonly ScorableCompany[]
): readonly LeaderboardEntry[] {
  const sorted = [...domainCompanyResults].sort(compareCompanyResults);
  return sorted.map((res, index) => {
    const valuation = extractValuation(res);
    const score = extractScore(res);
    const equity = extractFounderEquity(res);

    return {
      rank: index + 1,
      tournamentRank: index + 1,
      domainRank: index + 1,
      teamId: res.teamId,
      domainCode: extractDomainCode(res),
      valuation,
      retainedEquityPct: equity,
      finalScore: toInteger(score),
    };
  });
}

/**
 * Computes independent domain rankings for each active business domain.
 * Teams are grouped strictly by domain; competitors for ranking must belong to their own domain.
 */
export function computeDomainRankings(
  companyResults: readonly ScorableCompany[]
): Map<string, readonly LeaderboardEntry[]> {
  const domainGroups = new Map<string, ScorableCompany[]>();

  for (const res of companyResults) {
    const key = extractDomainCode(res);
    if (!domainGroups.has(key)) {
      domainGroups.set(key, []);
    }
    domainGroups.get(key)!.push(res);
  }

  const domainRankingsMap = new Map<string, readonly LeaderboardEntry[]>();
  for (const [domainKey, group] of domainGroups.entries()) {
    domainRankingsMap.set(domainKey, computeSingleDomainRankings(group));
  }

  return domainRankingsMap;
}

/**
 * Computes deterministic tournament and independent domain rankings from company round results.
 * Each company's competitors for domain ranking belong strictly to its own domain.
 * Also preserves deterministic tournamentRank for database serialization.
 */
export function computeRankings(
  companyResults: readonly ScorableCompany[]
): readonly LeaderboardEntry[] {
  // 1. Group by domain code and compute independent intra-domain ranks
  const domainGroups = new Map<string, ScorableCompany[]>();
  for (const res of companyResults) {
    const key = extractDomainCode(res);
    if (!domainGroups.has(key)) {
      domainGroups.set(key, []);
    }
    domainGroups.get(key)!.push(res);
  }

  const teamDomainRankMap = new Map<string, number>();
  for (const group of domainGroups.values()) {
    const sorted = [...group].sort(compareCompanyResults);
    sorted.forEach((res, index) => {
      teamDomainRankMap.set(res.teamId, index + 1);
    });
  }

  // 2. Sort across entire tournament deterministically to maintain tournamentRank
  const sortedTournament = [...companyResults].sort(compareCompanyResults);

  return sortedTournament.map((res, index) => {
    const tournamentRank = index + 1;
    const domainRank = teamDomainRankMap.get(res.teamId) ?? (index + 1);
    const valuation = extractValuation(res);
    const score = extractScore(res);
    const equity = extractFounderEquity(res);

    return {
      rank: domainRank,
      tournamentRank,
      domainRank,
      teamId: res.teamId,
      domainCode: extractDomainCode(res),
      valuation,
      retainedEquityPct: equity,
      finalScore: toInteger(score),
    };
  });
}

/**
 * Determines the final champion of each active business domain independently.
 * Returns up to one champion per domain (or null if the domain has no eligible teams).
 */
export function getDomainChampions(
  companyResults: readonly ScorableCompany[]
): Map<string, LeaderboardEntry | null> {
  const domainRankings = computeDomainRankings(companyResults);
  const champions = new Map<string, LeaderboardEntry | null>();

  for (const [domainKey, entries] of domainRankings.entries()) {
    champions.set(domainKey, entries.length > 0 ? entries[0] : null);
  }

  return champions;
}

