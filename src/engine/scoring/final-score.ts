import Decimal from 'decimal.js';
import { CompanyRoundResult } from '../types';
import { toInteger } from '../math/precision';

export interface LeaderboardEntry {
  readonly tournamentRank: number;
  readonly domainRank: number;
  readonly teamId: string;
  readonly domainCode: string;
  readonly valuation: Decimal;
  readonly retainedEquityPct: Decimal;
  readonly finalScore: Decimal;
}

/**
 * Computes deterministic tournament and domain rankings from company round results.
 * Tie-breaker order:
 * 1. Final Score (descending)
 * 2. Valuation (descending)
 * 3. Gross Revenue (descending)
 * 4. Ending Cash (descending)
 * 5. Team ID (alphabetical ascending for total determinism)
 */
export function computeRankings(
  companyResults: readonly CompanyRoundResult[]
): readonly LeaderboardEntry[] {
  // Sort across entire tournament deterministically
  const sortedTournament = [...companyResults].sort((a, b) => {
    // 1. Final Score
    if (!a.valuation.finalScore.equals(b.valuation.finalScore)) {
      return b.valuation.finalScore.comparedTo(a.valuation.finalScore);
    }
    // 2. Valuation
    if (!a.valuation.finalValuation.equals(b.valuation.finalValuation)) {
      return b.valuation.finalValuation.comparedTo(a.valuation.finalValuation);
    }
    // 3. Gross Revenue
    if (!a.financial.grossRevenue.equals(b.financial.grossRevenue)) {
      return b.financial.grossRevenue.comparedTo(a.financial.grossRevenue);
    }
    // 4. Ending Cash
    if (!a.financial.endingCash.equals(b.financial.endingCash)) {
      return b.financial.endingCash.comparedTo(a.financial.endingCash);
    }
    // 5. Team ID alphabetical
    return a.teamId.localeCompare(b.teamId);
  });

  // Calculate intra-domain ranks
  const domainCounters = new Map<string, number>();

  return sortedTournament.map((res, index) => {
    const tournamentRank = index + 1;
    const currentDomainCount = (domainCounters.get(res.domainCode) ?? 0) + 1;
    domainCounters.set(res.domainCode, currentDomainCount);
    const domainRank = currentDomainCount;

    return {
      tournamentRank,
      domainRank,
      teamId: res.teamId,
      domainCode: res.domainCode,
      valuation: res.valuation.finalValuation,
      retainedEquityPct: res.valuation.retainedEquityPct,
      finalScore: toInteger(res.valuation.finalScore),
    };
  });
}
