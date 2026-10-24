'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  TrendingUp,
  DollarSign,
  PieChart,
  Award,
  RefreshCw,
  BarChart3,
  Scale,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Boxes,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

interface CompanyPerformanceData {
  company: {
    id: string;
    teamCode: string;
    companyName: string;
    tableStation: string | null;
    domainId: string;
    domainName: string;
    domainCode: string;
    eventId: string;
    eventName: string;
  };
  hasPublishedRounds: boolean;
  publishedRounds: Array<{ roundNumber: number; publishedAt: string | null }>;
  latestSnapshot: {
    roundNumber: number;
    roundType: string;
    publishedAt: string | null;
    startingCash: number;
    grossRevenue: number;
    cogs: number;
    grossProfit: number;
    operatingExpenses: number;
    inventoryHoldingCost: number;
    ebitda: number;
    taxExpense: number;
    netIncome: number;
    operatingCashFlow: number;
    financingCashFlow: number;
    endingCash: number;
    productQualityIndex: number;
    brandEquityScore: number;
    marketSharePct: number;
    potentialDemand: number;
    unitsAvailable: number;
    unitsSold: number;
    unitsStockout: number;
    endingInventory: number;
    enterpriseValue: number;
    cashValuationContribution: number;
    companyValuation: number;
    retainedEquityPct: number;
    equityAdjustedScore: number;
    domainRank: number;
    tournamentRank: number;
  } | null;
  history: Array<{
    roundNumber: number;
    roundType: string;
    publishedAt: string | null;
    startingCash: number;
    grossRevenue: number;
    cogs: number;
    grossProfit: number;
    operatingExpenses: number;
    inventoryHoldingCost: number;
    ebitda: number;
    taxExpense: number;
    netIncome: number;
    operatingCashFlow: number;
    financingCashFlow: number;
    endingCash: number;
    productQualityIndex: number;
    brandEquityScore: number;
    marketSharePct: number;
    potentialDemand: number;
    unitsAvailable: number;
    unitsSold: number;
    unitsStockout: number;
    endingInventory: number;
    enterpriseValue: number;
    cashValuationContribution: number;
    companyValuation: number;
    retainedEquityPct: number;
    equityAdjustedScore: number;
    domainRank: number;
    tournamentRank: number;
  }>;
  roundComparisons: Array<{
    roundNumber: number;
    revenueDelta: number;
    revenueGrowthPct: number | null;
    profitDelta: number;
    valuationDelta: number;
    valuationGrowthPct: number | null;
    equityDelta: number;
    marketShareDelta: number;
    domainRankDelta: number;
    tournamentRankDelta: number;
    financingInflow: number;
  }>;
  capTable: Array<{
    id: string;
    roundNumber: number;
    roundType: string;
    shareholderName: string;
    isFoundingTeam: boolean;
    preRoundEquityPct: number;
    dilutionDeltaPct: number;
    postRoundEquityPct: number;
    investmentAmount: number;
  }>;
  financialStatements: {
    incomeStatement: Array<{
      roundNumber: number;
      grossRevenue: number;
      cogs: number;
      grossProfit: number;
      operatingExpenses: number;
      inventoryHoldingCost: number;
      ebitda: number;
      taxExpense: number;
      netIncome: number;
    }>;
    cashFlow: Array<{
      roundNumber: number;
      startingCash: number;
      operatingCashFlow: number;
      financingCashFlow: number;
      netCashMovement: number;
      endingCash: number;
    }>;
    valuation: Array<{
      roundNumber: number;
      enterpriseValue: number;
      cashValuationContribution: number;
      companyValuation: number;
      retainedEquityPct: number;
      equityAdjustedScore: number;
      domainRank: number;
      tournamentRank: number;
    }>;
  };
}

export default function CompanyPerformancePage() {
  const params = useParams();
  const companyId = params?.companyId as string;

  const [data, setData] = React.useState<CompanyPerformanceData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<'statements' | 'trends' | 'captable' | 'comparison' | 'operations'>('statements');

  const fetchCompanyData = React.useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${companyId}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Company performance data unavailable');
      }
      setData(json.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load company performance';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  React.useEffect(() => {
    fetchCompanyData();
  }, [fetchCompanyData]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const formatPercent = (val: number) => {
    return `${Number(val).toFixed(1)}%`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#070A12] text-slate-100 flex flex-col items-center justify-center p-6 font-sans">
        <RefreshCw className="h-8 w-8 animate-spin text-emerald-400 mb-3" />
        <div className="text-sm font-semibold text-slate-300">Loading published company performance dossier...</div>
        <div className="text-xs text-slate-500 mt-1 font-mono">Auditing multi-round financials & cap-table records</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#070A12] text-slate-100 flex flex-col items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full p-6 rounded-2xl border border-slate-800 bg-[#0B101E] text-center space-y-4">
          <div className="h-12 w-12 mx-auto rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
            <Building2 className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-white">Venture Dossier Unavailable</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            {error || 'This enterprise has not participated in any published tournament rounds yet.'}
          </p>
          <div className="pt-2">
            <Link
              href="/leaderboard"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Return to Public Leaderboard</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { company, latestSnapshot, history, roundComparisons, capTable, financialStatements } = data;

  return (
    <div className="min-h-screen bg-[#070A12] text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* 1. TOP HEADER & BREADCRUMB */}
      <header className="border-b border-slate-800/80 bg-[#0B101E]/90 backdrop-blur sticky top-0 z-40 px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/leaderboard"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-xs font-medium text-slate-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Leaderboard</span>
          </Link>
          <span className="text-slate-700 hidden sm:inline">/</span>
          <div className="hidden sm:flex items-center gap-2">
            <span className="font-bold text-white text-sm">{company.companyName}</span>
            <Badge variant="domain" className="text-[10px] py-0.5">
              {company.domainCode}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="published" indicator className="text-[10px] py-0.5">
            VERIFIED PUBLISHED DOSSIER
          </Badge>
        </div>
      </header>

      {/* 2. VENTURE HERO BANNER */}
      <section className="border-b border-slate-800/80 bg-gradient-to-b from-[#0E1526] via-[#090E1B] to-[#070A12] px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-sky-400">
                  {company.teamCode}
                </span>
                {company.tableStation && (
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                    Station {company.tableStation}
                  </span>
                )}
                <span className="text-xs text-slate-500 font-mono">
                  {company.domainName}
                </span>
              </div>

              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                {company.companyName}
              </h1>

              <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
                Comprehensive financial performance, cap table dilution, and multi-round operating records from the official tournament engine.
              </p>
            </div>

            {/* STANDINGS PILLS */}
            {latestSnapshot && (
              <div className="flex items-center gap-2 bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                <div className="text-right pr-3 border-r border-slate-800">
                  <span className="text-[10px] uppercase text-slate-500 font-semibold block">Tournament Rank</span>
                  <span className="text-xl font-extrabold font-mono text-amber-400">
                    #{latestSnapshot.tournamentRank}
                  </span>
                </div>
                <div className="pl-1 text-left">
                  <span className="text-[10px] uppercase text-slate-500 font-semibold block">Domain Rank</span>
                  <span className="text-xl font-extrabold font-mono text-sky-400">
                    #{latestSnapshot.domainRank}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 3. EXECUTIVE KPI CARDS */}
          {latestSnapshot && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-2">
              <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 backdrop-blur">
                <span className="text-[10px] uppercase text-amber-400 font-semibold block">Final Score</span>
                <span className="text-lg sm:text-xl font-extrabold font-mono text-amber-300 mt-0.5 block">
                  {formatCurrency(latestSnapshot.equityAdjustedScore)}
                </span>
                <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">Valuation × Equity %</span>
              </div>

              <div className="p-3.5 rounded-xl border border-indigo-500/30 bg-indigo-500/5 backdrop-blur">
                <span className="text-[10px] uppercase text-indigo-400 font-semibold block">Company Valuation</span>
                <span className="text-lg sm:text-xl font-bold font-mono text-indigo-200 mt-0.5 block">
                  {formatCurrency(latestSnapshot.companyValuation)}
                </span>
                <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">EV + Cash Component</span>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur">
                <span className="text-[10px] uppercase text-slate-400 font-semibold block">Retained Equity</span>
                <span className="text-lg sm:text-xl font-bold font-mono text-white mt-0.5 block">
                  {formatPercent(latestSnapshot.retainedEquityPct)}
                </span>
                <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">Founder ownership</span>
              </div>

              <div className="p-3.5 rounded-xl border border-sky-500/30 bg-sky-500/5 backdrop-blur">
                <span className="text-[10px] uppercase text-sky-400 font-semibold block">Liquid Cash</span>
                <span className="text-lg sm:text-xl font-bold font-mono text-sky-300 mt-0.5 block">
                  {formatCurrency(latestSnapshot.endingCash)}
                </span>
                <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">Operating Treasury</span>
              </div>

              <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 backdrop-blur">
                <span className="text-[10px] uppercase text-emerald-400 font-semibold block">Market Share</span>
                <span className="text-lg sm:text-xl font-bold font-mono text-emerald-300 mt-0.5 block">
                  {formatPercent(latestSnapshot.marketSharePct)}
                </span>
                <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">Domain volume slice</span>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur">
                <span className="text-[10px] uppercase text-slate-400 font-semibold block">Product Quality</span>
                <span className="text-lg sm:text-xl font-bold font-mono text-purple-300 mt-0.5 block">
                  {Number(latestSnapshot.productQualityIndex).toFixed(1)} / 100
                </span>
                <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">R&D Index Rating</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 4. MAIN DOSSIER NAVIGATION TABS */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex border-b border-slate-800 overflow-x-auto space-x-2 text-xs select-none">
          <button
            onClick={() => setActiveTab('statements')}
            className={`pb-3 px-3 font-semibold transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'statements'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            <span>Financial Statements</span>
          </button>

          <button
            onClick={() => setActiveTab('trends')}
            className={`pb-3 px-3 font-semibold transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'trends'
                ? 'border-indigo-400 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <TrendingUp className="h-4 w-4" />
            <span>Performance Trends & Charts</span>
          </button>

          <button
            onClick={() => setActiveTab('captable')}
            className={`pb-3 px-3 font-semibold transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'captable'
                ? 'border-sky-400 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <PieChart className="h-4 w-4" />
            <span>Cap Table & Ownership</span>
          </button>

          <button
            onClick={() => setActiveTab('comparison')}
            className={`pb-3 px-3 font-semibold transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'comparison'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Scale className="h-4 w-4" />
            <span>Round Comparison</span>
          </button>

          <button
            onClick={() => setActiveTab('operations')}
            className={`pb-3 px-3 font-semibold transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'operations'
                ? 'border-purple-400 text-purple-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Boxes className="h-4 w-4" />
            <span>Operations & Inventory</span>
          </button>
        </div>

        {/* TAB 1: FINANCIAL STATEMENTS */}
        {activeTab === 'statements' && (
          <div className="space-y-6">
            {/* INCOME STATEMENT */}
            <Card className="border border-slate-800 bg-[#0B101E]/90 overflow-hidden shadow-xl">
              <CardHeader className="py-4 px-5 border-b border-slate-800 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-emerald-400" />
                    <span>Income Statement (Round-by-Round)</span>
                  </CardTitle>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Operating revenue, cost of goods sold, operating expenditures, and accounting profit.
                  </p>
                </div>
                <Badge variant="secondary" className="font-mono text-[11px]">
                  All figures in vUSD
                </Badge>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left font-mono">
                  <thead className="bg-[#0E1526] text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-4 font-sans">Line Item</th>
                      {financialStatements.incomeStatement.map(s => (
                        <th key={s.roundNumber} className="py-2.5 px-4 text-right">
                          Round {s.roundNumber}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    <tr className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-4 font-sans font-semibold text-white">Gross Revenue (Units Sold × Price)</td>
                      {financialStatements.incomeStatement.map(s => (
                        <td key={s.roundNumber} className="py-2.5 px-4 text-right text-emerald-400 font-semibold">
                          {formatCurrency(s.grossRevenue)}
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-slate-800/30 text-slate-400">
                      <td className="py-2.5 px-4 font-sans">Less: Cost of Goods Sold (COGS)</td>
                      {financialStatements.incomeStatement.map(s => (
                        <td key={s.roundNumber} className="py-2.5 px-4 text-right">
                          ({formatCurrency(s.cogs)})
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-slate-800/30 bg-slate-900/30 font-semibold text-slate-200">
                      <td className="py-2.5 px-4 font-sans">Gross Profit</td>
                      {financialStatements.incomeStatement.map(s => (
                        <td key={s.roundNumber} className="py-2.5 px-4 text-right">
                          {formatCurrency(s.grossProfit)}
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-slate-800/30 text-slate-400">
                      <td className="py-2.5 px-4 font-sans">Less: Operating Expenses (Marketing, R&D, Ops)</td>
                      {financialStatements.incomeStatement.map(s => (
                        <td key={s.roundNumber} className="py-2.5 px-4 text-right">
                          ({formatCurrency(s.operatingExpenses)})
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-slate-800/30 text-slate-400">
                      <td className="py-2.5 px-4 font-sans">Less: Inventory Holding Cost ($20 / unsold unit)</td>
                      {financialStatements.incomeStatement.map(s => (
                        <td key={s.roundNumber} className="py-2.5 px-4 text-right">
                          ({formatCurrency(s.inventoryHoldingCost)})
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-slate-800/30 bg-slate-900/40 font-bold text-white border-t border-slate-700">
                      <td className="py-2.5 px-4 font-sans">Operating Profit (EBITDA)</td>
                      {financialStatements.incomeStatement.map(s => (
                        <td
                          key={s.roundNumber}
                          className={`py-2.5 px-4 text-right ${
                            s.ebitda >= 0 ? 'text-slate-100' : 'text-rose-400'
                          }`}
                        >
                          {formatCurrency(s.ebitda)}
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-slate-800/30 text-slate-400">
                      <td className="py-2.5 px-4 font-sans">Corporate Tax Expense (25% on taxable gain)</td>
                      {financialStatements.incomeStatement.map(s => (
                        <td key={s.roundNumber} className="py-2.5 px-4 text-right">
                          ({formatCurrency(s.taxExpense)})
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-slate-800/30 bg-emerald-950/20 font-extrabold text-sm border-t-2 border-emerald-500/40">
                      <td className="py-3 px-4 font-sans text-emerald-300">Net Income (Bottom Line Profit)</td>
                      {financialStatements.incomeStatement.map(s => (
                        <td
                          key={s.roundNumber}
                          className={`py-3 px-4 text-right ${
                            s.netIncome >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {formatCurrency(s.netIncome)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>

            {/* CASH FLOW STATEMENT */}
            <Card className="border border-slate-800 bg-[#0B101E]/90 overflow-hidden shadow-xl">
              <CardHeader className="py-4 px-5 border-b border-slate-800 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-sky-400" />
                    <span>Cash Flow Summary & Treasury Movement</span>
                  </CardTitle>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Clear separation of operating cash flow (customers) from financing cash flow (venture capital).
                  </p>
                </div>
                <Badge variant="secondary" className="font-mono text-[11px]">
                  Cash Basis
                </Badge>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left font-mono">
                  <thead className="bg-[#0E1526] text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-4 font-sans">Cash Flow Component</th>
                      {financialStatements.cashFlow.map(c => (
                        <th key={c.roundNumber} className="py-2.5 px-4 text-right">
                          Round {c.roundNumber}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    <tr className="hover:bg-slate-800/30 text-slate-300">
                      <td className="py-2.5 px-4 font-sans">Beginning Cash Balance</td>
                      {financialStatements.cashFlow.map(c => (
                        <td key={c.roundNumber} className="py-2.5 px-4 text-right text-slate-300">
                          {formatCurrency(c.startingCash)}
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-4 font-sans">
                        Operating Cash Flow (OCF: Revenue - Disbursements - Tax)
                      </td>
                      {financialStatements.cashFlow.map(c => (
                        <td
                          key={c.roundNumber}
                          className={`py-2.5 px-4 text-right font-semibold ${
                            c.operatingCashFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {formatCurrency(c.operatingCashFlow)}
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-4 font-sans">
                        Financing Cash Flow (FCF: VC Injections / Equity Deals)
                      </td>
                      {financialStatements.cashFlow.map(c => (
                        <td
                          key={c.roundNumber}
                          className={`py-2.5 px-4 text-right font-semibold ${
                            c.financingCashFlow > 0 ? 'text-indigo-400 font-bold' : 'text-slate-500'
                          }`}
                        >
                          {c.financingCashFlow > 0 ? `+${formatCurrency(c.financingCashFlow)}` : '$0'}
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-slate-800/30 bg-slate-900/30 font-semibold">
                      <td className="py-2.5 px-4 font-sans">Net Cash Movement (OCF + FCF)</td>
                      {financialStatements.cashFlow.map(c => (
                        <td
                          key={c.roundNumber}
                          className={`py-2.5 px-4 text-right ${
                            c.netCashMovement >= 0 ? 'text-slate-200' : 'text-rose-400'
                          }`}
                        >
                          {formatCurrency(c.netCashMovement)}
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-slate-800/30 bg-sky-950/20 font-extrabold text-sm border-t-2 border-sky-500/40">
                      <td className="py-3 px-4 font-sans text-sky-300">Ending Treasury Cash Balance</td>
                      {financialStatements.cashFlow.map(c => (
                        <td key={c.roundNumber} className="py-3 px-4 text-right text-sky-400 font-bold">
                          {formatCurrency(c.endingCash)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>

            {/* VALUATION BREAKDOWN */}
            <Card className="border border-slate-800 bg-[#0B101E]/90 overflow-hidden shadow-xl">
              <CardHeader className="py-4 px-5 border-b border-slate-800 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                    <Award className="h-4 w-4 text-amber-400" />
                    <span>Valuation & Final Tournament Score Breakdown</span>
                  </CardTitle>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Enterprise value, liquid cash valuation contribution, equity retention, and resulting final score.
                  </p>
                </div>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left font-mono">
                  <thead className="bg-[#0E1526] text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-4 font-sans">Valuation Component</th>
                      {financialStatements.valuation.map(v => (
                        <th key={v.roundNumber} className="py-2.5 px-4 text-right">
                          Round {v.roundNumber}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    <tr className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-4 font-sans">Enterprise Value (EV: Market Multiples)</td>
                      {financialStatements.valuation.map(v => (
                        <td key={v.roundNumber} className="py-2.5 px-4 text-right text-indigo-300 font-semibold">
                          {formatCurrency(v.enterpriseValue)}
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-4 font-sans">Cash Valuation Contribution (Liquid Treasury)</td>
                      {financialStatements.valuation.map(v => (
                        <td key={v.roundNumber} className="py-2.5 px-4 text-right text-sky-300">
                          {formatCurrency(v.cashValuationContribution)}
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-slate-800/30 bg-indigo-950/20 font-bold border-t border-indigo-500/30">
                      <td className="py-2.5 px-4 font-sans text-indigo-200">Company Valuation (EV + Cash)</td>
                      {financialStatements.valuation.map(v => (
                        <td key={v.roundNumber} className="py-2.5 px-4 text-right text-indigo-300 text-sm">
                          {formatCurrency(v.companyValuation)}
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-4 font-sans">Founder Retained Equity Stake</td>
                      {financialStatements.valuation.map(v => (
                        <td key={v.roundNumber} className="py-2.5 px-4 text-right text-white font-semibold">
                          {formatPercent(v.retainedEquityPct)}
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-slate-800/30 bg-amber-950/20 font-extrabold text-sm border-t-2 border-amber-500/50">
                      <td className="py-3 px-4 font-sans text-amber-300">
                        Final Tournament Score (Valuation × Retained Equity)
                      </td>
                      {financialStatements.valuation.map(v => (
                        <td key={v.roundNumber} className="py-3 px-4 text-right text-amber-400 font-bold text-base">
                          {formatCurrency(v.equityAdjustedScore)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* TAB 2: TRENDS & CHARTS */}
        {activeTab === 'trends' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* CHART 1: VALUATION & FINAL SCORE GROWTH */}
            <Card className="border border-slate-800 bg-[#0B101E]/90 p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-amber-400" />
                  <span>Valuation vs. Equity-Adjusted Score</span>
                </CardTitle>
                <div className="flex items-center gap-3 text-[11px] font-mono">
                  <span className="flex items-center gap-1 text-indigo-400">
                    <span className="h-2 w-2 rounded-full bg-indigo-400 inline-block" /> Valuation
                  </span>
                  <span className="flex items-center gap-1 text-amber-400">
                    <span className="h-2 w-2 rounded-full bg-amber-400 inline-block" /> Final Score
                  </span>
                </div>
              </div>

              {/* Responsive SVG Chart */}
              <div className="h-56 w-full pt-2">
                <svg viewBox="0 0 400 160" className="w-full h-full overflow-visible">
                  {/* Grid Lines */}
                  <line x1="40" y1="20" x2="380" y2="20" stroke="#1e293b" strokeDasharray="3 3" />
                  <line x1="40" y1="70" x2="380" y2="70" stroke="#1e293b" strokeDasharray="3 3" />
                  <line x1="40" y1="120" x2="380" y2="120" stroke="#1e293b" strokeDasharray="3 3" />

                  {/* Calculations */}
                  {(() => {
                    const maxVal = Math.max(
                      ...history.map(h => Math.max(h.companyValuation, h.equityAdjustedScore)),
                      500000
                    );
                    const count = history.length;
                    const getX = (idx: number) => (count === 1 ? 210 : 50 + (idx * (320 / (count - 1))));
                    const getY = (val: number) => 120 - ((val / maxVal) * 100);

                    const valPoints = history.map((h, i) => `${getX(i)},${getY(h.companyValuation)}`).join(' ');
                    const scorePoints = history.map((h, i) => `${getX(i)},${getY(h.equityAdjustedScore)}`).join(' ');

                    return (
                      <>
                        {/* Valuation Path */}
                        <polyline
                          fill="none"
                          stroke="#818cf8"
                          strokeWidth="2.5"
                          points={valPoints}
                        />
                        {/* Score Path */}
                        <polyline
                          fill="none"
                          stroke="#fbbf24"
                          strokeWidth="3"
                          points={scorePoints}
                        />

                        {/* Nodes */}
                        {history.map((h, i) => (
                          <g key={i}>
                            <circle cx={getX(i)} cy={getY(h.companyValuation)} r="4" fill="#818cf8" />
                            <circle cx={getX(i)} cy={getY(h.equityAdjustedScore)} r="5" fill="#fbbf24" />
                            <text
                              x={getX(i)}
                              y="145"
                              fill="#94a3b8"
                              fontSize="10"
                              textAnchor="middle"
                              fontFamily="monospace"
                            >
                              R{h.roundNumber}
                            </text>
                          </g>
                        ))}
                      </>
                    );
                  })()}
                </svg>
              </div>
              <p className="text-[11px] text-slate-500 font-mono text-center">
                Score tracks below valuation when founder equity is diluted through VC investment.
              </p>
            </Card>

            {/* CHART 2: REVENUE & NET INCOME */}
            <Card className="border border-slate-800 bg-[#0B101E]/90 p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-emerald-400" />
                  <span>Revenue & Net Profit Progression</span>
                </CardTitle>
                <div className="flex items-center gap-3 text-[11px] font-mono">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block" /> Revenue
                  </span>
                  <span className="flex items-center gap-1 text-sky-400">
                    <span className="h-2 w-2 rounded-full bg-sky-400 inline-block" /> Net Income
                  </span>
                </div>
              </div>

              {/* Responsive SVG Chart */}
              <div className="h-56 w-full pt-2">
                <svg viewBox="0 0 400 160" className="w-full h-full overflow-visible">
                  <line x1="40" y1="20" x2="380" y2="20" stroke="#1e293b" strokeDasharray="3 3" />
                  <line x1="40" y1="70" x2="380" y2="70" stroke="#1e293b" strokeDasharray="3 3" />
                  <line x1="40" y1="120" x2="380" y2="120" stroke="#1e293b" strokeDasharray="3 3" />

                  {(() => {
                    const maxVal = Math.max(...history.map(h => h.grossRevenue), 200000);
                    const count = history.length;
                    const getX = (idx: number) => (count === 1 ? 210 : 50 + (idx * (320 / (count - 1))));
                    const getY = (val: number) => Math.max(15, Math.min(130, 120 - ((val / maxVal) * 100)));

                    const revPoints = history.map((h, i) => `${getX(i)},${getY(h.grossRevenue)}`).join(' ');
                    const netPoints = history.map((h, i) => `${getX(i)},${getY(h.netIncome)}`).join(' ');

                    return (
                      <>
                        <polyline fill="none" stroke="#34d399" strokeWidth="2.5" points={revPoints} />
                        <polyline fill="none" stroke="#38bdf8" strokeWidth="2.5" points={netPoints} />

                        {history.map((h, i) => (
                          <g key={i}>
                            <circle cx={getX(i)} cy={getY(h.grossRevenue)} r="4" fill="#34d399" />
                            <circle cx={getX(i)} cy={getY(h.netIncome)} r="4" fill="#38bdf8" />
                            <text
                              x={getX(i)}
                              y="145"
                              fill="#94a3b8"
                              fontSize="10"
                              textAnchor="middle"
                              fontFamily="monospace"
                            >
                              R{h.roundNumber}
                            </text>
                          </g>
                        ))}
                      </>
                    );
                  })()}
                </svg>
              </div>
              <p className="text-[11px] text-slate-500 font-mono text-center">
                Net income reflects earnings after COGS, operating expenditures, holding costs and tax.
              </p>
            </Card>

            {/* CHART 3: MARKET SHARE & QUALITY */}
            <Card className="border border-slate-800 bg-[#0B101E]/90 p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-400" />
                  <span>Product Quality & Market Share</span>
                </CardTitle>
                <div className="flex items-center gap-3 text-[11px] font-mono">
                  <span className="flex items-center gap-1 text-purple-400">
                    <span className="h-2 w-2 rounded-full bg-purple-400 inline-block" /> Quality (0-100)
                  </span>
                  <span className="flex items-center gap-1 text-sky-400">
                    <span className="h-2 w-2 rounded-full bg-sky-400 inline-block" /> Mkt Share %
                  </span>
                </div>
              </div>

              <div className="h-56 w-full pt-2">
                <svg viewBox="0 0 400 160" className="w-full h-full overflow-visible">
                  <line x1="40" y1="20" x2="380" y2="20" stroke="#1e293b" strokeDasharray="3 3" />
                  <line x1="40" y1="70" x2="380" y2="70" stroke="#1e293b" strokeDasharray="3 3" />
                  <line x1="40" y1="120" x2="380" y2="120" stroke="#1e293b" strokeDasharray="3 3" />

                  {(() => {
                    const count = history.length;
                    const getX = (idx: number) => (count === 1 ? 210 : 50 + (idx * (320 / (count - 1))));
                    const getQualityY = (q: number) => 120 - ((q / 100) * 100);
                    const getShareY = (s: number) => 120 - ((s / 50) * 100); // normalized against 50% max share

                    const qPoints = history.map((h, i) => `${getX(i)},${getQualityY(h.productQualityIndex)}`).join(' ');
                    const sPoints = history.map((h, i) => `${getX(i)},${getShareY(h.marketSharePct)}`).join(' ');

                    return (
                      <>
                        <polyline fill="none" stroke="#c084fc" strokeWidth="2.5" points={qPoints} />
                        <polyline fill="none" stroke="#38bdf8" strokeWidth="2.5" points={sPoints} />

                        {history.map((h, i) => (
                          <g key={i}>
                            <circle cx={getX(i)} cy={getQualityY(h.productQualityIndex)} r="4" fill="#c084fc" />
                            <circle cx={getX(i)} cy={getShareY(h.marketSharePct)} r="4" fill="#38bdf8" />
                            <text
                              x={getX(i)}
                              y="145"
                              fill="#94a3b8"
                              fontSize="10"
                              textAnchor="middle"
                              fontFamily="monospace"
                            >
                              R{h.roundNumber}
                            </text>
                          </g>
                        ))}
                      </>
                    );
                  })()}
                </svg>
              </div>
              <p className="text-[11px] text-slate-500 font-mono text-center">
                Continuous R&D investments compound brand equity and customer attractiveness.
              </p>
            </Card>

            {/* CHART 4: CASH BALANCES */}
            <Card className="border border-slate-800 bg-[#0B101E]/90 p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-sky-400" />
                  <span>Treasury Cash Liquidity</span>
                </CardTitle>
                <div className="text-[11px] font-mono text-slate-400">
                  Solvency Boundary: &gt; $0.00
                </div>
              </div>

              <div className="h-56 w-full pt-2">
                <svg viewBox="0 0 400 160" className="w-full h-full overflow-visible">
                  <line x1="40" y1="20" x2="380" y2="20" stroke="#1e293b" strokeDasharray="3 3" />
                  <line x1="40" y1="70" x2="380" y2="70" stroke="#1e293b" strokeDasharray="3 3" />
                  <line x1="40" y1="120" x2="380" y2="120" stroke="#1e293b" strokeDasharray="3 3" />

                  {(() => {
                    const maxVal = Math.max(...history.map(h => h.endingCash), 1200000);
                    const count = history.length;
                    const getX = (idx: number) => (count === 1 ? 210 : 50 + (idx * (320 / (count - 1))));
                    const getY = (val: number) => Math.max(15, Math.min(130, 120 - ((val / maxVal) * 100)));

                    const cashPoints = history.map((h, i) => `${getX(i)},${getY(h.endingCash)}`).join(' ');

                    return (
                      <>
                        <polyline fill="none" stroke="#38bdf8" strokeWidth="3" points={cashPoints} />

                        {history.map((h, i) => (
                          <g key={i}>
                            <circle cx={getX(i)} cy={getY(h.endingCash)} r="4" fill="#38bdf8" />
                            <text
                              x={getX(i)}
                              y="145"
                              fill="#94a3b8"
                              fontSize="10"
                              textAnchor="middle"
                              fontFamily="monospace"
                            >
                              R{h.roundNumber}
                            </text>
                          </g>
                        ))}
                      </>
                    );
                  })()}
                </svg>
              </div>
              <p className="text-[11px] text-slate-500 font-mono text-center">
                Audited to ensure zero pre-clamp overdraft movements in accordance with treasury policy.
              </p>
            </Card>
          </div>
        )}

        {/* TAB 3: CAP TABLE & OWNERSHIP */}
        {activeTab === 'captable' && (
          <div className="space-y-6">
            <Card className="border border-slate-800 bg-[#0B101E]/90 overflow-hidden shadow-xl">
              <CardHeader className="py-4 px-5 border-b border-slate-800 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                    <PieChart className="h-4 w-4 text-sky-400" />
                    <span>Cap Table & Venture Capital Investment History</span>
                  </CardTitle>
                  <p className="text-xs text-slate-400 mt-0.5">
                    100.0000% equity conservation audit across Seed (Round 2) and Series A (Round 4) financing rounds.
                  </p>
                </div>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left font-mono">
                  <thead className="bg-[#0E1526] text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-4 font-sans">Round</th>
                      <th className="py-2.5 px-4 font-sans">Shareholder / Investor</th>
                      <th className="py-2.5 px-4 text-right">Pre-Round Equity %</th>
                      <th className="py-2.5 px-4 text-right">Dilution Delta %</th>
                      <th className="py-2.5 px-4 text-right font-bold text-white">Post-Round Equity %</th>
                      <th className="py-2.5 px-4 text-right">Investment Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {capTable.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500 font-sans">
                          No external VC financing taken yet. Founding team retains 100.0000% ownership.
                        </td>
                      </tr>
                    ) : (
                      capTable.map((eq, i) => (
                        <tr key={eq.id || i} className="hover:bg-slate-800/30">
                          <td className="py-2.5 px-4 font-sans font-semibold text-slate-300">
                            Round {eq.roundNumber} ({eq.roundType})
                          </td>
                          <td className="py-2.5 px-4 font-sans">
                            <span className={eq.isFoundingTeam ? 'text-amber-300 font-bold' : 'text-indigo-300 font-semibold'}>
                              {eq.shareholderName}
                            </span>
                            {eq.isFoundingTeam && (
                              <Badge variant="secondary" className="ml-2 text-[9px] py-0">
                                Founders
                              </Badge>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right text-slate-400">
                            {formatPercent(eq.preRoundEquityPct)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-semibold">
                            {eq.dilutionDeltaPct < 0 ? (
                              <span className="text-rose-400">{formatPercent(eq.dilutionDeltaPct)}</span>
                            ) : (
                              <span className="text-emerald-400">+{formatPercent(eq.dilutionDeltaPct)}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right font-bold text-white">
                            {formatPercent(eq.postRoundEquityPct)}
                          </td>
                          <td className="py-2.5 px-4 text-right text-emerald-400 font-semibold">
                            {eq.investmentAmount > 0 ? formatCurrency(eq.investmentAmount) : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-950/60 text-xs text-slate-400 space-y-1">
              <strong className="text-slate-300 block">Equity Multiplier Mechanism</strong>
              <p className="leading-relaxed text-slate-500">
                In Capital Quest, outside investment injects cash into the treasury and increases Enterprise Value, but dilutes the founder&apos;s equity stake. Because the final score equals Valuation × Retained Equity %, taking investment is a high-stakes trade-off that only pays off if the growth rate exceeds the dilution cost.
              </p>
            </div>
          </div>
        )}

        {/* TAB 4: ROUND COMPARISON */}
        {activeTab === 'comparison' && (
          <div className="space-y-6">
            <Card className="border border-slate-800 bg-[#0B101E]/90 overflow-hidden shadow-xl">
              <CardHeader className="py-4 px-5 border-b border-slate-800 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                    <Scale className="h-4 w-4 text-amber-400" />
                    <span>Round-by-Round Growth & Movement Audit</span>
                  </CardTitle>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Period-over-period variations in revenue, profits, company valuation, and rank movements.
                  </p>
                </div>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left font-mono">
                  <thead className="bg-[#0E1526] text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-4 font-sans">Round</th>
                      <th className="py-2.5 px-4 text-right">Δ Revenue ($)</th>
                      <th className="py-2.5 px-4 text-right">Revenue Growth %</th>
                      <th className="py-2.5 px-4 text-right">Δ Net Income</th>
                      <th className="py-2.5 px-4 text-right">Δ Valuation</th>
                      <th className="py-2.5 px-4 text-right">Valuation Growth %</th>
                      <th className="py-2.5 px-4 text-right">Δ Equity %</th>
                      <th className="py-2.5 px-4 text-right">Δ Tournament Rank</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {roundComparisons.map((cmp) => (
                      <tr key={cmp.roundNumber} className="hover:bg-slate-800/30">
                        <td className="py-3 px-4 font-sans font-bold text-white">
                          Round {cmp.roundNumber}
                          {cmp.roundNumber === 1 && (
                            <span className="text-[10px] text-slate-500 font-mono block font-normal">
                              vs R0 Initial Baseline
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold">
                          {cmp.revenueDelta >= 0 ? (
                            <span className="text-emerald-400">+{formatCurrency(cmp.revenueDelta)}</span>
                          ) : (
                            <span className="text-rose-400">({formatCurrency(Math.abs(cmp.revenueDelta))})</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-300">
                          {cmp.revenueGrowthPct !== null ? (
                            cmp.revenueGrowthPct >= 0 ? (
                              <span className="text-emerald-400">+{cmp.revenueGrowthPct.toFixed(1)}%</span>
                            ) : (
                              <span className="text-rose-400">{cmp.revenueGrowthPct.toFixed(1)}%</span>
                            )
                          ) : (
                            <span className="text-slate-500 font-sans text-[10px]">Baseline 0</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {cmp.profitDelta >= 0 ? (
                            <span className="text-emerald-400">+{formatCurrency(cmp.profitDelta)}</span>
                          ) : (
                            <span className="text-rose-400">({formatCurrency(Math.abs(cmp.profitDelta))})</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-indigo-300">
                          {cmp.valuationDelta >= 0 ? (
                            <span>+{formatCurrency(cmp.valuationDelta)}</span>
                          ) : (
                            <span className="text-rose-400">({formatCurrency(Math.abs(cmp.valuationDelta))})</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {cmp.valuationGrowthPct !== null ? (
                            cmp.valuationGrowthPct >= 0 ? (
                              <span className="text-emerald-400">+{cmp.valuationGrowthPct.toFixed(1)}%</span>
                            ) : (
                              <span className="text-rose-400">{cmp.valuationGrowthPct.toFixed(1)}%</span>
                            )
                          ) : (
                            <span className="text-slate-500 font-sans text-[10px]">N/A</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {cmp.equityDelta < 0 ? (
                            <span className="text-rose-400 font-semibold">{formatPercent(cmp.equityDelta)}</span>
                          ) : (
                            <span className="text-slate-500 font-sans text-[10px]">0.0%</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-bold">
                          {cmp.tournamentRankDelta > 0 ? (
                            <span className="text-emerald-400 inline-flex items-center gap-0.5">
                              <ArrowUpRight className="h-3 w-3" />+{cmp.tournamentRankDelta}
                            </span>
                          ) : cmp.tournamentRankDelta < 0 ? (
                            <span className="text-rose-400 inline-flex items-center gap-0.5">
                              <ArrowDownRight className="h-3 w-3" />{cmp.tournamentRankDelta}
                            </span>
                          ) : (
                            <span className="text-slate-500 inline-flex items-center gap-0.5">
                              <Minus className="h-3 w-3" />0
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* TAB 5: OPERATIONS & INVENTORY */}
        {activeTab === 'operations' && (
          <div className="space-y-6">
            <Card className="border border-slate-800 bg-[#0B101E]/90 overflow-hidden shadow-xl">
              <CardHeader className="py-4 px-5 border-b border-slate-800 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                    <Boxes className="h-4 w-4 text-purple-400" />
                    <span>Fulfillment, Inventory Units & Stockout Metrics</span>
                  </CardTitle>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Production allocation, realized unit sales, unmet demand stockouts, and holding penalties.
                  </p>
                </div>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left font-mono">
                  <thead className="bg-[#0E1526] text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-4 font-sans">Round</th>
                      <th className="py-2.5 px-4 text-right">Potential Demand</th>
                      <th className="py-2.5 px-4 text-right">Units Available</th>
                      <th className="py-2.5 px-4 text-right font-bold text-emerald-400">Units Sold</th>
                      <th className="py-2.5 px-4 text-right">Units Stockout</th>
                      <th className="py-2.5 px-4 text-right">Ending Inventory</th>
                      <th className="py-2.5 px-4 text-right">Holding Cost Penalty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {history.map((h) => (
                      <tr key={h.roundNumber} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-4 font-sans font-bold text-white">
                          Round {h.roundNumber}
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-300">
                          {h.potentialDemand.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-300">
                          {h.unitsAvailable.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-emerald-400">
                          {h.unitsSold.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          {h.unitsStockout > 0 ? (
                            <span className="text-rose-400 font-semibold">
                              {h.unitsStockout.toLocaleString()} missed
                            </span>
                          ) : (
                            <span className="text-slate-500">0</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right text-sky-300">
                          {h.endingInventory.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-4 text-right text-rose-300">
                          {h.inventoryHoldingCost > 0 ? formatCurrency(h.inventoryHoldingCost) : '$0'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </main>

      {/* 5. GLOBAL FOOTER */}
      <footer className="border-t border-slate-800/80 py-6 px-4 sm:px-6 lg:px-8 text-center text-xs text-slate-500 space-y-2">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <span>Capital Quest Simulation Platform</span>
          <span>•</span>
          <span>Company Performance & Financial Dossier</span>
          <span>•</span>
          <Link href="/leaderboard" className="text-slate-400 hover:text-slate-200 underline">
            Public Leaderboard
          </Link>
        </div>
      </footer>
    </div>
  );
}
