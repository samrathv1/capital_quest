import { DomainConfig } from '../types';
import { D } from '../math/precision';

export const DOMAIN_ARCHETYPES: Record<string, DomainConfig> = {
  cleantech: {
    code: 'cleantech',
    name: 'CleanTech & Hardware',
    baseDemand: D(20000),
    benchmarkPrice: D(1200),
    minPrice: D(800),
    maxPrice: D(1800),
    baseUnitCogs: D(600),
    unitHoldingCost: D(40),
    rdElasticity: D(0.85),
    rdRetentionRate: D(0.70),
    mktElasticity: D(0.45),
    mktRetentionRate: D(0.40),
    priceElasticity: D(1.20),
    qualityRegulatoryFloor: D(30.0),
    revenueMultiple: D(1.8),
    ebitdaMultiple: D(3.5),
    rdMultiple: D(0.40),
    marketShareMultiple: D(0.50),
  },
  healthtech: {
    code: 'healthtech',
    name: 'HealthTech & BioDevices',
    baseDemand: D(12000),
    benchmarkPrice: D(2500),
    minPrice: D(1600),
    maxPrice: D(3800),
    baseUnitCogs: D(1100),
    unitHoldingCost: D(75),
    rdElasticity: D(1.10),
    rdRetentionRate: D(0.80),
    mktElasticity: D(0.50),
    mktRetentionRate: D(0.50),
    priceElasticity: D(0.85),
    qualityRegulatoryFloor: D(50.0),
    revenueMultiple: D(1.8),
    ebitdaMultiple: D(3.5),
    rdMultiple: D(0.40),
    marketShareMultiple: D(0.50),
  },
  saas: {
    code: 'saas',
    name: 'Enterprise SaaS & AI',
    baseDemand: D(60000),
    benchmarkPrice: D(350),
    minPrice: D(200),
    maxPrice: D(600),
    baseUnitCogs: D(25),
    unitHoldingCost: D(0),
    rdElasticity: D(0.75),
    rdRetentionRate: D(0.60),
    mktElasticity: D(0.85),
    mktRetentionRate: D(0.65),
    priceElasticity: D(1.45),
    qualityRegulatoryFloor: D(20.0),
    revenueMultiple: D(2.5),
    ebitdaMultiple: D(3.5),
    rdMultiple: D(0.40),
    marketShareMultiple: D(0.50),
  },
  d2c: {
    code: 'd2c',
    name: 'D2C Consumer Goods',
    baseDemand: D(120000),
    benchmarkPrice: D(65),
    minPrice: D(40),
    maxPrice: D(110),
    baseUnitCogs: D(28),
    unitHoldingCost: D(4),
    rdElasticity: D(0.45),
    rdRetentionRate: D(0.50),
    mktElasticity: D(1.15),
    mktRetentionRate: D(0.45),
    priceElasticity: D(1.80),
    qualityRegulatoryFloor: D(15.0),
    revenueMultiple: D(1.2),
    ebitdaMultiple: D(3.5),
    rdMultiple: D(0.40),
    marketShareMultiple: D(0.50),
  },
};

/**
 * Retrieves domain configuration by domain code (case-insensitive).
 */
export function getDomainConfig(code: string): DomainConfig {
  const normalized = code.toLowerCase().trim();
  const aliasMap: Record<string, string> = {
    clean: 'cleantech',
    cleantech: 'cleantech',
    health: 'healthtech',
    healthtech: 'healthtech',
    saas: 'saas',
    d2c: 'd2c',
  };
  const targetKey = aliasMap[normalized] || normalized;
  const config = DOMAIN_ARCHETYPES[targetKey];
  if (!config) {
    throw new Error(`Domain configuration not found for code: "${code}". Allowed domains: cleantech, healthtech, saas, d2c.`);
  }
  return config;
}
