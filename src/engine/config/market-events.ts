import { MarketEventShock } from '../types';
import { D } from '../math/precision';

export const SEEDED_MARKET_EVENTS: readonly MarketEventShock[] = [
  {
    id: 'EV-01',
    name: 'Government Clean Energy Subsidy',
    targetDomainCode: 'cleantech',
    triggerRound: 2,
    demandMultiplierDelta: D(0.30), // +30% Total Domain Demand
    customerQualitySensitivityDelta: D(0.20), // +20% Customer Quality Sensitivity
    description: 'Federal renewable energy incentive bill passes, surging commercial demand for smart grid storage by 30% and elevating buyer focus on proven hardware reliability.',
  },
  {
    id: 'EV-02',
    name: 'Critical Bio-Device Component Shortage',
    targetDomainCode: 'healthtech',
    triggerRound: 3,
    cogsMultiplierShock: D(1.40), // +40% Unit Production Costs
    maxCapacityCapPct: D(0.65), // Max Production Capacity capped at 65% of order
    description: 'Global disruption in medical-grade semiconductor silicon spikes unit production costs by 40% and caps manufacturing throughput at 65% of ordered volume.',
  },
  {
    id: 'EV-03',
    name: 'Enterprise AI Security Vulnerability',
    targetDomainCode: 'saas',
    triggerRound: 3,
    demandMultiplierDelta: D(-0.25), // -25% Base Demand
    minQualitySalesThreshold: D(40.0), // Quality < 40 loses 50% sales
    minQualitySalesPenaltyPct: D(0.50),
    description: 'Industry-wide zero-day exploit rattles corporate CTOs, shrinking enterprise AI demand by 25% and halving sales for platforms with substandard security/quality indices below 40.0.',
  },
  {
    id: 'EV-04',
    name: 'Viral TikTok Influencer Adoption',
    targetDomainCode: 'd2c',
    triggerRound: 4,
    demandMultiplierDelta: D(0.50), // +50% Total Domain Demand
    marketingSensitivityMultiplier: D(1.35), // +35% Marketing Sensitivity (alpha_m)
    description: 'Tier-1 creators organically endorse sustainable consumer products, boosting domain customer demand by 50% and supercharging brand marketing responsiveness by 35%.',
  },
  {
    id: 'EV-05',
    name: 'Macroeconomic Credit Crunch & Slowdown',
    targetDomainCode: 'ALL',
    triggerRound: 5,
    demandMultiplierDelta: D(-0.20), // -20% Total Demand
    priceElasticityMultiplier: D(1.30), // +30% Price Elasticity
    description: 'Central bank liquidity tightening suppresses broad economic demand by 20% across all sectors, making enterprise and retail buyers 30% more price sensitive.',
  },
];

/**
 * Finds all active market events applicable to a specific domain and round number.
 */
export function getActiveEvents(domainCode: string, roundNumber: number): readonly MarketEventShock[] {
  const normalizedDomain = domainCode.toLowerCase().trim();
  return SEEDED_MARKET_EVENTS.filter(event => {
    if (event.triggerRound !== roundNumber) return false;
    const target = event.targetDomainCode.toLowerCase().trim();
    return target === 'all' || target === normalizedDomain;
  });
}
