import { InvestmentOffer, CompanySnapshot } from '../types';
import { D } from '../math/precision';

/**
 * Standard uniform tournament offer matrix (CQ-SPEC-02 Section 7.1).
 */
export const STANDARD_TOURNAMENT_OFFERS: Record<number, Record<'OFFER_A' | 'OFFER_B', InvestmentOffer>> = {
  2: {
    OFFER_A: {
      roundNumber: 2,
      offerType: 'OFFER_A',
      name: 'Seed Aggressive Growth Partner',
      cashInjection: D(400000),
      equityStakePct: D(25.0),
      impliedPostMoneyValuation: D(1600000),
      impliedPreMoneyValuation: D(1200000),
    },
    OFFER_B: {
      roundNumber: 2,
      offerType: 'OFFER_B',
      name: 'Seed Founder-Friendly Boutique VC',
      cashInjection: D(200000),
      equityStakePct: D(12.5),
      impliedPostMoneyValuation: D(1600000),
      impliedPreMoneyValuation: D(1400000),
    },
  },
  4: {
    OFFER_A: {
      roundNumber: 4,
      offerType: 'OFFER_A',
      name: 'Series A Global Tier-1 VC',
      cashInjection: D(800000),
      equityStakePct: D(20.0),
      impliedPostMoneyValuation: D(4000000),
      impliedPreMoneyValuation: D(3200000),
    },
    OFFER_B: {
      roundNumber: 4,
      offerType: 'OFFER_B',
      name: 'Series A Strategic Corporate Partner',
      cashInjection: D(450000),
      equityStakePct: D(10.0),
      impliedPostMoneyValuation: D(4500000),
      impliedPreMoneyValuation: D(4050000),
    },
  },
};

/**
 * Provider interface allowing tournament organizers to toggle between
 * Uniform Standardized Offers (default) and Performance-Tiered Standardized Offers.
 */
export interface InvestmentOfferProvider {
  getOffer(
    roundNumber: number,
    offerType: 'OFFER_A' | 'OFFER_B',
    companySnapshot?: CompanySnapshot
  ): InvestmentOffer | null;
}

/**
 * Default provider: Returns standard uniform offers identical for all teams.
 */
export class UniformInvestmentOfferProvider implements InvestmentOfferProvider {
  getOffer(roundNumber: number, offerType: 'OFFER_A' | 'OFFER_B'): InvestmentOffer | null {
    const roundOffers = STANDARD_TOURNAMENT_OFFERS[roundNumber];
    if (!roundOffers) return null;
    return roundOffers[offerType] || null;
  }
}

/**
 * Tiered provider: Offers identical objective rules where valuation and check sizes
 * scale according to objective performance tiers (e.g. enterprise value).
 */
export class PerformanceTieredInvestmentOfferProvider implements InvestmentOfferProvider {
  constructor(private readonly baselineProvider: InvestmentOfferProvider = new UniformInvestmentOfferProvider()) {}

  getOffer(
    roundNumber: number,
    offerType: 'OFFER_A' | 'OFFER_B',
    companySnapshot?: CompanySnapshot
  ): InvestmentOffer | null {
    const base = this.baselineProvider.getOffer(roundNumber, offerType);
    if (!base || !companySnapshot) return base;

    // Example objective performance tiering rule:
    // If valuation exceeds $3,000,000 in Round 4, offer premium valuation tier (same equity, 20% higher cash)
    if (roundNumber === 4 && companySnapshot.valuation.gte(3000000)) {
      const bonusCash = base.cashInjection.times(1.20);
      const postMoney = bonusCash.dividedBy(base.equityStakePct.dividedBy(100));
      return {
        ...base,
        name: `${base.name} (Top-Tier Performance Term Sheet)`,
        cashInjection: bonusCash,
        impliedPostMoneyValuation: postMoney,
        impliedPreMoneyValuation: postMoney.minus(bonusCash),
      };
    }

    return base;
  }
}

/**
 * Dynamic Investment Offer Provider (Requirement 2):
 * Returns individualized, performance-driven investment offers based on the team's
 * finalized completed rounds and Investor Confidence Score.
 */
export class DynamicInvestmentOfferProvider implements InvestmentOfferProvider {
  private readonly teamOffersMap: Map<string, { OFFER_A: InvestmentOffer; OFFER_B: InvestmentOffer }>;

  constructor(
    customOffers?: Map<string, { OFFER_A: InvestmentOffer; OFFER_B: InvestmentOffer }>
  ) {
    this.teamOffersMap = customOffers ? new Map(customOffers) : new Map();
  }

  /**
   * Registers a frozen offer pair for a specific team.
   */
  registerTeamOffers(
    teamId: string,
    offerA: InvestmentOffer,
    offerB: InvestmentOffer
  ): void {
    this.teamOffersMap.set(teamId, { OFFER_A: offerA, OFFER_B: offerB });
  }

  getOffer(
    roundNumber: number,
    offerType: 'OFFER_A' | 'OFFER_B',
    companySnapshot?: CompanySnapshot
  ): InvestmentOffer | null {
    if (roundNumber !== 2 && roundNumber !== 4) return null;

    if (companySnapshot) {
      // 1. Check if frozen offers exist for this team
      const existing = this.teamOffersMap.get(companySnapshot.teamId);
      if (existing) {
        return existing[offerType] || null;
      }
    }

    // 2. Default fallback: Moderate confidence tier
    // Round 2 / 4 Moderate: Offer A ($200k / 10%), Offer B ($350k / 20%)
    if (offerType === 'OFFER_A') {
      const cash = D(200000);
      const equity = D(10.0);
      const postMoney = cash.dividedBy(equity.dividedBy(100));
      return {
        roundNumber,
        offerType: 'OFFER_A',
        name: 'Strategic Synergy Angels (Conservative Term Sheet)',
        cashInjection: cash,
        equityStakePct: equity,
        impliedPostMoneyValuation: postMoney,
        impliedPreMoneyValuation: postMoney.minus(cash),
      };
    } else {
      const cash = D(350000);
      const equity = D(20.0);
      const postMoney = cash.dividedBy(equity.dividedBy(100));
      return {
        roundNumber,
        offerType: 'OFFER_B',
        name: 'Apex Venture Partners (Expansion Term Sheet)',
        cashInjection: cash,
        equityStakePct: equity,
        impliedPostMoneyValuation: postMoney,
        impliedPreMoneyValuation: postMoney.minus(cash),
      };
    }
  }
}

