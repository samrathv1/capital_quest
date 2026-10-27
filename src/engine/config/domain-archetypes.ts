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

export const ACTIVE_DOMAIN_CODES = ['d2c', 'healthtech', 'saas'] as const;
export type ActiveDomainCode = (typeof ACTIVE_DOMAIN_CODES)[number];

export const CANONICAL_ACTIVE_DOMAINS = [
  {
    code: 'D2C',
    normalizedCode: 'd2c',
    name: 'D2C Consumer Goods',
    benchmarkPrice: 65,
    minPrice: 40,
    maxPrice: 110,
    baseCogs: 28,
    baseDemand: 120000,
  },
  {
    code: 'HEALTH',
    normalizedCode: 'healthtech',
    name: 'HealthTech & BioDevices',
    benchmarkPrice: 2500,
    minPrice: 1600,
    maxPrice: 3800,
    baseCogs: 1100,
    baseDemand: 12000,
  },
  {
    code: 'SAAS',
    normalizedCode: 'saas',
    name: 'Enterprise SaaS & AI',
    benchmarkPrice: 350,
    minPrice: 200,
    maxPrice: 600,
    baseCogs: 25,
    baseDemand: 60000,
  },
] as const;

/**
 * Checks whether a given domain code represents an active competition domain.
 */
export function isActiveDomain(code: string): boolean {
  const normalized = normalizeDomainCode(code);
  return (ACTIVE_DOMAIN_CODES as readonly string[]).includes(normalized);
}

/**
 * Normalizes any domain code or alias to its canonical engine archetype key.
 */
export function normalizeDomainCode(code: string): string {
  const clean = (code || '').toLowerCase().trim();
  const aliasMap: Record<string, string> = {
    clean: 'cleantech',
    cleantech: 'cleantech',
    'cleantech & hardware': 'cleantech',
    health: 'healthtech',
    healthtech: 'healthtech',
    'healthtech & biodevices': 'healthtech',
    'healthtech devices': 'healthtech',
    saas: 'saas',
    'enterprise saas': 'saas',
    'enterprise saas & ai': 'saas',
    d2c: 'd2c',
    'd2c consumer goods': 'd2c',
  };
  return aliasMap[clean] || clean;
}

/**
 * Retrieves domain configuration by domain code (case-insensitive).
 */
export function getDomainConfig(code: string): DomainConfig {
  const targetKey = normalizeDomainCode(code);
  const config = DOMAIN_ARCHETYPES[targetKey];
  if (!config) {
    throw new Error(`Domain configuration not found for code: "${code}". Allowed domains: cleantech (archived), healthtech, saas, d2c.`);
  }
  return config;
}
