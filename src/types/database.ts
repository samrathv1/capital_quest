/**
 * CAPITAL QUEST — DATABASE TYPES (Supabase PostgreSQL)
 * Reference: CQ-SPEC-04
 */

export type UserRole =
  | 'super_admin'
  | 'domain_coordinator'
  | 'volunteer'
  | 'judge'
  | 'public_observer';

export type EventStatus =
  | 'setup'
  | 'active'
  | 'paused'
  | 'completed'
  | 'archived';

export type RoundStatus =
  | 'draft'
  | 'open'
  | 'locked'
  | 'simulated'
  | 'reviewed'
  | 'published';

export type RoundType =
  | 'regular'
  | 'investment_seed'
  | 'investment_series_a'
  | 'final_harvest';

export type DecisionStatus =
  | 'unsubmitted'
  | 'entered'
  | 'verified'
  | 'locked'
  | 'flagged';

export type InvestmentChoice =
  | 'none'
  | 'offer_a'
  | 'offer_b'
  | 'reject_both';

export type LedgerEntryType =
  | 'initial_grant'
  | 'marketing_expense'
  | 'rd_expense'
  | 'operations_expense'
  | 'production_cost'
  | 'sales_revenue'
  | 'holding_cost'
  | 'tax_payment'
  | 'investor_funding'
  | 'admin_penalty';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  assigned_domain_id?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EventRecord {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  status: EventStatus;
  total_rounds: number;
  starting_capital: number;
  starting_valuation: number;
  active_round_number: number;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DomainRecord {
  id: string;
  event_id: string;
  code: string;
  name: string;
  description?: string | null;
  base_demand: number;
  benchmark_price: number;
  min_allowed_price: number;
  max_allowed_price: number;
  base_unit_cogs: number;
  unit_holding_cost: number;
  rd_elasticity: number;
  rd_retention_rate: number;
  mkt_elasticity: number;
  mkt_retention_rate: number;
  price_elasticity: number;
  quality_regulatory_floor: number;
  created_at: string;
}

export interface TeamRecord {
  id: string;
  event_id: string;
  domain_id: string;
  team_code: string;
  company_name: string;
  table_station?: string | null;
  is_disqualified: boolean;
  created_at: string;
  updated_at: string;
}

export interface RoundRecord {
  id: string;
  event_id: string;
  round_number: number;
  type: RoundType;
  status: RoundStatus;
  opened_at?: string | null;
  locked_at?: string | null;
  simulated_at?: string | null;
  published_at?: string | null;
  created_at: string;
}

export interface DecisionRecord {
  id: string;
  round_id: string;
  team_id: string;
  status: DecisionStatus;
  marketing_budget: number;
  rd_budget: number;
  production_units: number;
  unit_price: number;
  operations_budget: number;
  investment_decision: InvestmentChoice;
  entered_by?: string | null;
  entered_at?: string | null;
  verified_by?: string | null;
  verified_at?: string | null;
  admin_override_notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinancialLedgerRecord {
  id: string;
  event_id: string;
  round_id?: string | null;
  team_id: string;
  entry_type: LedgerEntryType;
  amount: number;
  running_balance: number;
  reference_id?: string | null;
  simulation_run_id?: string | null;
  is_voided: boolean;
  voided_at?: string | null;
  void_reason?: string | null;
  description: string;
  created_at: string;
}

export interface EquityTransactionRecord {
  id: string;
  team_id: string;
  round_id: string;
  simulation_run_id?: string | null;
  shareholder_name: string;
  is_founding_team: boolean;
  pre_round_equity_pct: number;
  dilution_delta_pct: number;
  post_round_equity_pct: number;
  investment_amount: number;
  is_voided: boolean;
  created_at: string;
}

export interface CompanySnapshotRecord {
  id: string;
  round_id: string;
  team_id: string;
  simulation_run_id?: string | null;
  snapshot_version: number;
  is_active: boolean;
  product_quality_index: number;
  brand_equity_score: number;
  attractiveness_score: number;
  market_share_pct: number;
  potential_demand: number;
  units_available: number;
  units_sold: number;
  units_stockout: number;
  ending_inventory: number;
  gross_revenue: number;
  cogs: number;
  gross_profit: number;
  operating_expenses: number;
  inventory_holding_cost: number;
  ebitda: number;
  tax_expense: number;
  net_income: number;
  operating_cash_flow: number;
  financing_cash_flow: number;
  ending_cash: number;
  cumulative_rd_asset: number;
  enterprise_value: number;
  cash_valuation_contribution: number;
  company_valuation: number;
  retained_equity_pct: number;
  equity_adjusted_score: number;
  domain_rank: number;
  tournament_rank: number;
  created_at: string;
}

export interface SimulationRunRecord {
  id: string;
  round_id: string;
  executed_by: string;
  idempotency_key: string;
  run_version: number;
  is_active: boolean;
  input_state_hash: string;
  execution_duration_ms: number;
  total_companies_simulated: number;
  is_dry_run: boolean;
  status: 'completed' | 'superseded' | 'voided';
  void_reason?: string | null;
  error_payload?: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogRecord {
  id: string;
  actor_id?: string | null;
  action: string;
  entity_name: string;
  entity_id: string;
  before_state?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
}
