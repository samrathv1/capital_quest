import Decimal from 'decimal.js';
import { InvestmentChoice, CompanySnapshot, EquityResult } from '../types';
import { D, ZERO, ONE, HUNDRED } from '../math/precision';
import { InvestmentOfferProvider } from '../config/investment-offers';

/**
 * Resolves investment decisions and updates compounding cap table dilution.
 * Dilution identity: TeamOwnership_t = TeamOwnership_t-1 * (1 - InvestorStake)
 */
export function resolveEquityAndDilution(
  teamId: string,
  roundNumber: number,
  investmentChoice: InvestmentChoice,
  snapshot: CompanySnapshot,
  offerProvider: InvestmentOfferProvider
): EquityResult {
  const preRoundOwnership = snapshot.retainedEquityPct ?? HUNDRED;

  // Investment is strictly authorized only during Seed (R2) and Series A (R4) windows
  const isInvestmentWindow = roundNumber === 2 || roundNumber === 4;

  if (!isInvestmentWindow || investmentChoice === 'REJECT_BOTH') {
    return {
      teamId,
      investmentDecision: investmentChoice,
      cashInjected: ZERO,
      investorEquityStakePct: ZERO,
      preRoundRetainedEquityPct: preRoundOwnership,
      postRoundRetainedEquityPct: preRoundOwnership,
      dilutionFactor: ONE,
    };
  }

  // Retrieve authorized standardized offer
  const offer = offerProvider.getOffer(roundNumber, investmentChoice, snapshot);

  if (!offer) {
    // If offer not found for choice, treat as rejection
    return {
      teamId,
      investmentDecision: 'REJECT_BOTH',
      cashInjected: ZERO,
      investorEquityStakePct: ZERO,
      preRoundRetainedEquityPct: preRoundOwnership,
      postRoundRetainedEquityPct: preRoundOwnership,
      dilutionFactor: ONE,
    };
  }

  const investorStakePct = D(offer.equityStakePct);
  const investorStakeRatio = investorStakePct.dividedBy(HUNDRED);
  const dilutionFactor = ONE.minus(investorStakeRatio);

  const postRoundOwnership = preRoundOwnership.times(dilutionFactor).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

  return {
    teamId,
    investmentDecision: investmentChoice,
    cashInjected: D(offer.cashInjection),
    investorEquityStakePct: investorStakePct,
    preRoundRetainedEquityPct: preRoundOwnership,
    postRoundRetainedEquityPct: postRoundOwnership,
    dilutionFactor,
  };
}
