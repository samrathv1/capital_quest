'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  BarChart3,
  Search,
  Filter,
  Download,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Eye,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Info,
  Building2,
  ExternalLink,
  X,
  Layers,
  Sparkles,
} from 'lucide-react';
import { AdminShell } from '@/components/layout/admin-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { createClient } from '@/lib/supabase/client';
import {
  TeamIntelligenceRow,
  TeamIntelligenceDashboardData,
} from '@/lib/services/tournament-service';

type DomainFilter = 'ALL' | 'D2C' | 'HEALTH' | 'SAAS';


interface ColumnGroupVisibility {
  identity: boolean;     // Group A (always true)
  operating: boolean;    // Group B
  production: boolean;   // Group C
  financial: boolean;    // Group D
  ownership: boolean;    // Group E
  insights: boolean;     // Group F
  investment: boolean;   // Group G
}

export default function TeamIntelligencePage() {
  const [data, setData] = React.useState<TeamIntelligenceDashboardData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // User state
  const [userRole, setUserRole] = React.useState<string>('super_admin');
  const [userEmail, setUserEmail] = React.useState<string>('admin@capitalquest.dev');

  // Filters & Controls
  const [selectedRound, setSelectedRound] = React.useState<number>(1);
  const [selectedDomain, setSelectedDomain] = React.useState<DomainFilter>('ALL');
  const [searchQuery, setSearchQuery] = React.useState<string>('');

  // Column Groups Visibility
  const [columnGroups, setColumnGroups] = React.useState<ColumnGroupVisibility>({
    identity: true,
    operating: true,
    production: true,
    financial: true,
    ownership: true,
    insights: true,
    investment: true,
  });

  // Sorting
  const [sortKey, setSortKey] = React.useState<string>('domainRank');
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('asc');

  // Drilldown Drawer / Modal
  const [selectedTeam, setSelectedTeam] = React.useState<TeamIntelligenceRow | null>(null);

  // Load auth state
  React.useEffect(() => {
    async function loadAuth() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserEmail(user.email || 'admin@capitalquest.dev');
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
          if (profile?.role) setUserRole(profile.role);
        }
      } catch {
        // Fallback for mock/dev environment
      }
    }
    loadAuth();
  }, []);

  // Fetch Dashboard Data
  const fetchData = React.useCallback(async (roundNum?: number, showRefreshing = false) => {
    try {
      if (showRefreshing) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);

      const targetRound = roundNum ?? selectedRound;
      const res = await fetch(`/api/admin/team-intelligence?roundNumber=${targetRound}`);
      const json = await res.json();

      if (!res.ok || json.error) {
        throw new Error(json.error?.message || 'Failed to load intelligence data');
      }

      setData(json.data);
      if (json.data?.round?.roundNumber) {
        setSelectedRound(json.data.round.roundNumber);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred loading dashboard data');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedRound]);

  React.useEffect(() => {
    fetchData(selectedRound);
  }, [selectedRound, fetchData]);

  // Handle Sort
  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  // Filter & Sort Rows
  const filteredAndSortedRows = React.useMemo(() => {
    if (!data?.rows) return [];

    let rows = [...data.rows];

    // Domain filter
    if (selectedDomain !== 'ALL') {
      rows = rows.filter(r => r.domainCode.toUpperCase() === selectedDomain);
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      rows = rows.filter(
        r =>
          r.teamCode.toLowerCase().includes(q) ||
          r.companyName.toLowerCase().includes(q) ||
          (r.tableStation && r.tableStation.toLowerCase().includes(q)) ||
          r.domainName.toLowerCase().includes(q)
      );
    }

    // Sorting
    rows.sort((a, b) => {
      const aVal = (a as unknown as Record<string, unknown>)[sortKey];
      const bVal = (b as unknown as Record<string, unknown>)[sortKey];

      // Handle nulls: always push nulls to the bottom with strict weak ordering
      const aNull = aVal === null || aVal === undefined;
      const bNull = bVal === null || bVal === undefined;
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      return sortDirection === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });

    return rows;
  }, [data?.rows, selectedDomain, searchQuery, sortKey, sortDirection]);

  // Summary Metrics
  const summary = React.useMemo(() => {
    if (!data?.rows) return { totalTeams: 0, simulatedCount: 0, d2cCount: 0, healthCount: 0, saasCount: 0, avgValuation: 0, avgRevenue: 0 };
    const totalTeams = data.rows.length;
    const simulatedRows = data.rows.filter(r => r.isSimulated);
    const simulatedCount = simulatedRows.length;

    const d2cCount = data.rows.filter(r => r.domainCode.toUpperCase() === 'D2C').length;
    const healthCount = data.rows.filter(r => r.domainCode.toUpperCase() === 'HEALTH').length;
    const saasCount = data.rows.filter(r => r.domainCode.toUpperCase() === 'SAAS').length;

    const totalValuation = simulatedRows.reduce((sum, r) => sum + (r.companyValuation || 0), 0);
    const totalRevenue = simulatedRows.reduce((sum, r) => sum + (r.grossRevenue || 0), 0);

    return {
      totalTeams,
      simulatedCount,
      d2cCount,
      healthCount,
      saasCount,
      avgValuation: simulatedCount > 0 ? totalValuation / simulatedCount : 0,
      avgRevenue: simulatedCount > 0 ? totalRevenue / simulatedCount : 0,
    };
  }, [data?.rows]);

  // Export to CSV
  const handleExportCSV = () => {
    if (!filteredAndSortedRows.length) return;

    const headers = [
      'Team Code',
      'Company Name',
      'Domain',
      'Table Station',
      'Status',
      'Decision Status',
      'Marketing Spend ($)',
      'R&D Spend ($)',
      'Production Units',
      'Unit Price ($)',
      'Operations Budget ($)',
      'Units Available',
      'Units Sold',
      'Ending Inventory',
      'Units Stockout',
      'Market Share (%)',
      'Potential Demand',
      'Gross Revenue ($)',
      'COGS ($)',
      'Gross Profit ($)',
      'Operating Expenses ($)',
      'Net Income ($)',
      'Ending Cash ($)',
      'Financing Cash Flow ($)',
      'Company Valuation ($)',
      'Retained Equity (%)',
      'Equity-Adjusted Score',
      'Domain Rank',
      'Rank Delta',
      'Investor Offer A Amount ($)',
      'Investor Offer A Equity (%)',
      'Investor Offer B Amount ($)',
      'Investor Offer B Equity (%)',
      'Investor Choice',
      'Investor Confirmed',
    ];

    const rowsData = filteredAndSortedRows.map(r => [
      `"${r.teamCode}"`,
      `"${r.companyName.replace(/"/g, '""')}"`,
      `"${r.domainCode}"`,
      `"${r.tableStation || ''}"`,
      `"${r.status}"`,
      `"${r.decisionStatus}"`,
      r.marketingSpend,
      r.rdSpend,
      r.productionUnits,
      r.unitSellingPrice,
      r.operationsBudget,
      r.unitsAvailable ?? '',
      r.unitsSold ?? '',
      r.endingInventory ?? '',
      r.unitsStockout ?? '',
      r.marketSharePct !== null ? (r.marketSharePct * 100).toFixed(2) : '',
      r.potentialDemand ?? '',
      r.grossRevenue ?? '',
      r.cogs ?? '',
      r.grossProfit ?? '',
      r.operatingExpenses ?? '',
      r.netIncome ?? '',
      r.endingCash ?? '',
      r.financingCashFlow ?? '',
      r.companyValuation ?? '',
      r.retainedEquityPct !== null ? r.retainedEquityPct.toFixed(1) : '',
      r.equityAdjustedScore ?? '',
      r.domainRank ?? '',
      r.rankDelta ?? '',
      r.offerAAmount ?? '',
      r.offerAEquityPct ?? '',
      r.offerBAmount ?? '',
      r.offerBEquityPct ?? '',
      `"${r.selectedChoice || ''}"`,
      r.isChoiceConfirmed ? 'TRUE' : 'FALSE',
    ]);

    const csvContent = [headers.join(','), ...rowsData.map(e => e.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Capital_Quest_Team_Intelligence_Round_${selectedRound}_${selectedDomain}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Formatters
  const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return <span className="text-slate-500">—</span>;
    const isNeg = val < 0;
    const formatted = Math.abs(Math.round(val)).toLocaleString('en-US');
    return (
      <span className={isNeg ? 'text-rose-400 font-mono font-medium' : 'text-slate-200 font-mono font-medium'}>
        {isNeg ? `-$${formatted}` : `$${formatted}`}
      </span>
    );
  };

  const formatPct = (val: number | null | undefined, scale = 1) => {
    if (val === null || val === undefined) return <span className="text-slate-500">—</span>;
    return <span className="font-mono text-slate-300 font-medium">{(val * scale).toFixed(1)}%</span>;
  };

  const formatInt = (val: number | null | undefined) => {
    if (val === null || val === undefined) return <span className="text-slate-500">—</span>;
    return <span className="font-mono text-slate-300">{Math.round(val).toLocaleString('en-US')}</span>;
  };

  const renderSortIndicator = (key: string) => {
    if (sortKey !== key) {
      return <ChevronsUpDown className="h-3 w-3 text-slate-600 ml-1 inline opacity-0 group-hover:opacity-100 transition-opacity" />;
    }
    return sortDirection === 'asc' ? (
      <ChevronUp className="h-3.5 w-3.5 text-indigo-400 ml-1 inline" />
    ) : (
      <ChevronDown className="h-3.5 w-3.5 text-indigo-400 ml-1 inline" />
    );
  };

  return (
    <AdminShell
      userRole={userRole}
      userEmail={userEmail}
      eventName={data?.event?.name || 'Capital Quest 2026'}
      roundNumber={selectedRound}
      roundStatus={data?.round?.status || 'open'}
    >
      <div className="space-y-6">
        {/* TOP BAR / HEADER */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500/20 via-sky-500/20 to-emerald-500/20 border border-indigo-500/30 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-indigo-400" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
                  Centralized Team Intelligence
                  <Badge variant="default" className="border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs">
                    Admin View
                  </Badge>
                </h1>
                <p className="text-xs text-slate-400">
                  Comprehensive 5-round, 3-domain spreadsheet intelligence & simplified investor operations
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchData(selectedRound, true)}
              disabled={isRefreshing || isLoading}
              className="border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-300 text-xs gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
              Refresh
            </Button>

            <Button variant="emerald"
              size="sm"
              onClick={handleExportCSV}
              disabled={!filteredAndSortedRows.length}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5 shadow-sm shadow-emerald-950"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* ERROR STATE */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-center gap-3 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400" />
            <div>
              <p className="font-semibold">Unable to load intelligence data</p>
              <p className="text-xs text-rose-300/80">{error}</p>
            </div>
          </div>
        )}

        {/* ROUND SELECTOR TABS */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-900/70 border border-slate-800 rounded-xl backdrop-blur-sm">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 mr-2 flex items-center gap-1">
              <Layers className="h-3.5 w-3.5 text-indigo-400" /> Round:
            </span>
            {[1, 2, 3, 4, 5].map(rNum => {
              const rInfo = data?.rounds?.find(r => r.roundNumber === rNum);
              const isSelected = selectedRound === rNum;
              const isSimulated = rInfo ? ['simulated', 'reviewed', 'published'].includes(rInfo.status) : false;

              return (
                <button
                  key={rNum}
                  onClick={() => setSelectedRound(rNum)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40 border border-indigo-400/30'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 border border-slate-700/50'
                  }`}
                >
                  <span>Round {rNum}</span>
                  {rInfo && (
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        rInfo.status === 'published'
                          ? 'bg-emerald-400 ring-2 ring-emerald-950'
                          : isSimulated
                          ? 'bg-sky-400'
                          : rInfo.status === 'open'
                          ? 'bg-amber-400 animate-pulse'
                          : 'bg-slate-500'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* SIMULATION STATUS BADGE */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Round Status:</span>
            <Badge variant="default"
              className={`capitalize px-2.5 py-0.5 text-xs font-semibold ${
                data?.round?.status === 'published'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : data?.round?.isSimulated
                  ? 'border-sky-500/40 bg-sky-500/10 text-sky-300'
                  : data?.round?.status === 'open'
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                  : 'border-slate-700 bg-slate-800 text-slate-400'
              }`}
            >
              {data?.round?.status || 'Unknown'}
            </Badge>
            {data?.round?.isSimulated ? (
              <span className="text-emerald-400 text-xs flex items-center gap-1 font-medium">
                <CheckCircle2 className="h-3 w-3" /> Outputs Live
              </span>
            ) : (
              <span className="text-amber-400 text-xs flex items-center gap-1 font-medium">
                <AlertTriangle className="h-3 w-3" /> Pending Simulation
              </span>
            )}
          </div>
        </div>

        {/* SUMMARY KPI CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="bg-slate-900/60 border-slate-800 p-3.5">
            <div className="text-xs text-slate-400 font-medium">Total Active Teams</div>
            <div className="text-xl font-bold text-white mt-1 flex items-baseline gap-2">
              {summary.totalTeams}
              <span className="text-xs font-normal text-slate-500">
                ({summary.simulatedCount} simulated)
              </span>
            </div>
          </Card>

          <Card className="bg-slate-900/60 border-slate-800 p-3.5">
            <div className="text-xs text-slate-400 font-medium">Domain Breakdown</div>
            <div className="flex items-center gap-2 mt-1.5 text-xs font-semibold">
              <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                D2C: {summary.d2cCount}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                HLTH: {summary.healthCount}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                SAAS: {summary.saasCount}
              </span>
            </div>
          </Card>

          <Card className="bg-slate-900/60 border-slate-800 p-3.5">
            <div className="text-xs text-slate-400 font-medium">Avg Company Valuation</div>
            <div className="text-xl font-bold text-slate-100 mt-1 font-mono">
              {data?.round?.isSimulated ? `$${Math.round(summary.avgValuation).toLocaleString()}` : '—'}
            </div>
          </Card>

          <Card className="bg-slate-900/60 border-slate-800 p-3.5">
            <div className="text-xs text-slate-400 font-medium">Avg Gross Revenue</div>
            <div className="text-xl font-bold text-emerald-400 mt-1 font-mono">
              {data?.round?.isSimulated ? `$${Math.round(summary.avgRevenue).toLocaleString()}` : '—'}
            </div>
          </Card>
        </div>

        {/* CONTROLS: DOMAIN FILTER, SEARCH, COLUMN VISIBILITY TOGGLES */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 p-3 bg-slate-900/50 border border-slate-800 rounded-xl">
          {/* Domain Filter Pills */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
              <Filter className="h-3 w-3 text-slate-400" /> Domain:
            </span>
            {(['ALL', 'D2C', 'HEALTH', 'SAAS'] as DomainFilter[]).map(domain => {
              const isSelected = selectedDomain === domain;
              return (
                <button
                  key={domain}
                  onClick={() => setSelectedDomain(domain)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                    isSelected
                      ? domain === 'D2C'
                        ? 'bg-purple-600 text-white shadow-sm shadow-purple-950'
                        : domain === 'HEALTH'
                        ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950'
                        : domain === 'SAAS'
                        ? 'bg-sky-600 text-white shadow-sm shadow-sky-950'
                        : 'bg-slate-700 text-white shadow-sm shadow-slate-950'
                      : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
                  }`}
                >
                  {domain}
                </button>
              );
            })}
          </div>

          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              type="text"
              placeholder="Search team code, company, or table station..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs bg-slate-950/70 border-slate-800 focus:border-indigo-500 rounded-lg text-slate-200 placeholder:text-slate-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Column Group Toggles */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
              <Eye className="h-3 w-3 text-slate-400" /> Columns:
            </span>
            <button
              onClick={() => setColumnGroups(g => ({ ...g, operating: !g.operating }))}
              className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                columnGroups.operating
                  ? 'bg-indigo-950/40 border-indigo-500/40 text-indigo-300'
                  : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}
            >
              Grp B (Inputs)
            </button>
            <button
              onClick={() => setColumnGroups(g => ({ ...g, production: !g.production }))}
              className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                columnGroups.production
                  ? 'bg-indigo-950/40 border-indigo-500/40 text-indigo-300'
                  : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}
            >
              Grp C (Dist)
            </button>
            <button
              onClick={() => setColumnGroups(g => ({ ...g, financial: !g.financial }))}
              className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                columnGroups.financial
                  ? 'bg-indigo-950/40 border-indigo-500/40 text-indigo-300'
                  : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}
            >
              Grp D (Finance)
            </button>
            <button
              onClick={() => setColumnGroups(g => ({ ...g, ownership: !g.ownership }))}
              className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                columnGroups.ownership
                  ? 'bg-indigo-950/40 border-indigo-500/40 text-indigo-300'
                  : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}
            >
              Grp E (Ranks)
            </button>
            <button
              onClick={() => setColumnGroups(g => ({ ...g, insights: !g.insights }))}
              className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                columnGroups.insights
                  ? 'bg-indigo-950/40 border-indigo-500/40 text-indigo-300'
                  : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}
            >
              Grp F (Insights)
            </button>
            <button
              onClick={() => setColumnGroups(g => ({ ...g, investment: !g.investment }))}
              className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                columnGroups.investment
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}
            >
              Grp G (Investor)
            </button>
          </div>
        </div>

        {/* SPREADSHEET INTELLIGENCE GRID */}
        <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/30 backdrop-blur shadow-2xl">
          <div className="overflow-x-auto max-h-[70vh]">
            <table className="w-full text-xs border-collapse text-left">
              {/* GROUP HEADER ROW */}
              <thead className="sticky top-0 z-30 bg-[#0E1526] border-b border-slate-800 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  {/* GROUP A: IDENTITY (Sticky) */}
                  <th
                    colSpan={3}
                    className="py-2.5 px-3 bg-[#111A30] text-slate-300 border-r border-slate-800 sticky left-0 z-40 text-center shadow-md"
                  >
                    Group A — Team Identity
                  </th>

                  {/* GROUP B: OPERATING INPUTS */}
                  {columnGroups.operating && (
                    <th
                      colSpan={5}
                      className="py-2.5 px-3 bg-indigo-950/30 text-indigo-300 border-r border-slate-800 text-center font-medium"
                    >
                      Group B — Operating Inputs
                    </th>
                  )}

                  {/* GROUP C: PRODUCTION & DISTRIBUTION */}
                  {columnGroups.production && (
                    <th
                      colSpan={6}
                      className="py-2.5 px-3 bg-sky-950/30 text-sky-300 border-r border-slate-800 text-center font-medium"
                    >
                      Group C — Production & Distribution
                    </th>
                  )}

                  {/* GROUP D: FINANCIAL PERFORMANCE */}
                  {columnGroups.financial && (
                    <th
                      colSpan={7}
                      className="py-2.5 px-3 bg-emerald-950/30 text-emerald-300 border-r border-slate-800 text-center font-medium"
                    >
                      Group D — Financial Outputs
                    </th>
                  )}

                  {/* GROUP E: OWNERSHIP & RANKINGS */}
                  {columnGroups.ownership && (
                    <th
                      colSpan={4}
                      className="py-2.5 px-3 bg-purple-950/30 text-purple-300 border-r border-slate-800 text-center font-medium"
                    >
                      Group E — Ownership & Rankings
                    </th>
                  )}

                  {/* GROUP G: INVESTOR WORKFLOW */}
                  {columnGroups.investment && (
                    <th
                      colSpan={4}
                      className="py-2.5 px-3 bg-amber-950/30 text-amber-300 border-r border-slate-800 text-center font-medium"
                    >
                      Group G — Centralized Investor Data (R2 & R4)
                    </th>
                  )}

                  {/* GROUP F: INSIGHTS & ACTIONS */}
                  {columnGroups.insights && (
                    <th className="py-2.5 px-3 bg-slate-900 text-slate-300 text-center font-medium">
                      Group F — Observations & Drilldown
                    </th>
                  )}
                </tr>

                {/* INDIVIDUAL COLUMN HEADERS */}
                <tr className="border-b border-slate-800 bg-[#0A0F1D] text-[10px] text-slate-400 font-semibold select-none">
                  {/* Sticky Team Identity Columns */}
                  <th
                    onClick={() => handleSort('teamCode')}
                    className="py-2 px-3 sticky left-0 z-40 bg-[#0A0F1D] cursor-pointer hover:text-white border-r border-slate-800/60 min-w-[90px]"
                  >
                    Code {renderSortIndicator('teamCode')}
                  </th>
                  <th
                    onClick={() => handleSort('companyName')}
                    className="py-2 px-3 sticky left-[90px] z-40 bg-[#0A0F1D] cursor-pointer hover:text-white border-r border-slate-800/60 min-w-[140px]"
                  >
                    Company Name {renderSortIndicator('companyName')}
                  </th>
                  <th
                    onClick={() => handleSort('domainCode')}
                    className="py-2 px-3 sticky left-[230px] z-40 bg-[#0A0F1D] cursor-pointer hover:text-white border-r border-slate-800 min-w-[90px]"
                  >
                    Domain {renderSortIndicator('domainCode')}
                  </th>

                  {/* Group B Columns */}
                  {columnGroups.operating && (
                    <>
                      <th
                        onClick={() => handleSort('marketingSpend')}
                        className="py-2 px-2.5 text-right cursor-pointer hover:text-white border-r border-slate-800/40 min-w-[85px]"
                      >
                        Mktg Spend {renderSortIndicator('marketingSpend')}
                      </th>
                      <th
                        onClick={() => handleSort('rdSpend')}
                        className="py-2 px-2.5 text-right cursor-pointer hover:text-white border-r border-slate-800/40 min-w-[85px]"
                      >
                        R&D Spend {renderSortIndicator('rdSpend')}
                      </th>
                      <th
                        onClick={() => handleSort('productionUnits')}
                        className="py-2 px-2.5 text-right cursor-pointer hover:text-white border-r border-slate-800/40 min-w-[80px]"
                      >
                        Prod Units {renderSortIndicator('productionUnits')}
                      </th>
                      <th
                        onClick={() => handleSort('unitSellingPrice')}
                        className="py-2 px-2.5 text-right cursor-pointer hover:text-white border-r border-slate-800/40 min-w-[75px]"
                      >
                        Unit Price {renderSortIndicator('unitSellingPrice')}
                      </th>
                      <th
                        onClick={() => handleSort('operationsBudget')}
                        className="py-2 px-2.5 text-right cursor-pointer hover:text-white border-r border-slate-800 min-w-[85px]"
                      >
                        Ops Budget {renderSortIndicator('operationsBudget')}
                      </th>
                    </>
                  )}

                  {/* Group C Columns */}
                  {columnGroups.production && (
                    <>
                      <th
                        onClick={() => handleSort('unitsAvailable')}
                        className="py-2 px-2.5 text-right cursor-pointer hover:text-white border-r border-slate-800/40 min-w-[80px]"
                      >
                        Available {renderSortIndicator('unitsAvailable')}
                      </th>
                      <th
                        onClick={() => handleSort('unitsSold')}
                        className="py-2 px-2.5 text-right cursor-pointer hover:text-white border-r border-slate-800/40 min-w-[80px]"
                      >
                        Sold {renderSortIndicator('unitsSold')}
                      </th>
                      <th
                        onClick={() => handleSort('endingInventory')}
                        className="py-2 px-2.5 text-right cursor-pointer hover:text-white border-r border-slate-800/40 min-w-[80px]"
                      >
                        End Inv {renderSortIndicator('endingInventory')}
                      </th>
                      <th
                        onClick={() => handleSort('unitsStockout')}
                        className="py-2 px-2.5 text-right cursor-pointer hover:text-white border-r border-slate-800/40 min-w-[80px]"
                      >
                        Stockout {renderSortIndicator('unitsStockout')}
                      </th>
                      <th
                        onClick={() => handleSort('marketSharePct')}
                        className="py-2 px-2.5 text-right cursor-pointer hover:text-white border-r border-slate-800/40 min-w-[80px]"
                      >
                        Share % {renderSortIndicator('marketSharePct')}
                      </th>
                      <th
                        onClick={() => handleSort('potentialDemand')}
                        className="py-2 px-2.5 text-right cursor-pointer hover:text-white border-r border-slate-800 min-w-[85px]"
                      >
                        Demand {renderSortIndicator('potentialDemand')}
                      </th>
                    </>
                  )}

                  {/* Group D Columns */}
                  {columnGroups.financial && (
                    <>
                      <th
                        onClick={() => handleSort('grossRevenue')}
                        className="py-2 px-2.5 text-right cursor-pointer hover:text-white border-r border-slate-800/40 min-w-[95px]"
                      >
                        Revenue {renderSortIndicator('grossRevenue')}
                      </th>
                      <th
                        onClick={() => handleSort('grossProfit')}
                        className="py-2 px-2.5 text-right cursor-pointer hover:text-white border-r border-slate-800/40 min-w-[90px]"
                      >
                        Gross Profit {renderSortIndicator('grossProfit')}
                      </th>
                      <th
                        onClick={() => handleSort('operatingExpenses')}
                        className="py-2 px-2.5 text-right cursor-pointer hover:text-white border-r border-slate-800/40 min-w-[85px]"
                      >
                        OpEx {renderSortIndicator('operatingExpenses')}
                      </th>
                      <th
                        onClick={() => handleSort('netIncome')}
                        className="py-2 px-2.5 text-right cursor-pointer hover:text-white border-r border-slate-800/40 min-w-[90px]"
                      >
                        Net Income {renderSortIndicator('netIncome')}
                      </th>
                      <th
                        onClick={() => handleSort('financingCashFlow')}
                        className="py-2 px-2.5 text-right cursor-pointer hover:text-white border-r border-slate-800/40 min-w-[90px]"
                      >
                        Financing CF {renderSortIndicator('financingCashFlow')}
                      </th>
                      <th
                        onClick={() => handleSort('endingCash')}
                        className="py-2 px-2.5 text-right cursor-pointer hover:text-white border-r border-slate-800/40 min-w-[95px]"
                      >
                        Ending Cash {renderSortIndicator('endingCash')}
                      </th>
                      <th
                        onClick={() => handleSort('companyValuation')}
                        className="py-2 px-2.5 text-right cursor-pointer hover:text-white border-r border-slate-800 min-w-[100px]"
                      >
                        Valuation {renderSortIndicator('companyValuation')}
                      </th>
                    </>
                  )}

                  {/* Group E Columns */}
                  {columnGroups.ownership && (
                    <>
                      <th
                        onClick={() => handleSort('retainedEquityPct')}
                        className="py-2 px-2.5 text-right cursor-pointer hover:text-white border-r border-slate-800/40 min-w-[80px]"
                      >
                        Founder Eq% {renderSortIndicator('retainedEquityPct')}
                      </th>
                      <th
                        onClick={() => handleSort('equityAdjustedScore')}
                        className="py-2 px-2.5 text-right cursor-pointer hover:text-white border-r border-slate-800/40 min-w-[100px]"
                      >
                        Adj Score {renderSortIndicator('equityAdjustedScore')}
                      </th>
                      <th
                        onClick={() => handleSort('domainRank')}
                        className="py-2 px-2.5 text-center cursor-pointer hover:text-white border-r border-slate-800/40 min-w-[65px]"
                      >
                        Rank {renderSortIndicator('domainRank')}
                      </th>
                      <th
                        onClick={() => handleSort('rankDelta')}
                        className="py-2 px-2.5 text-center cursor-pointer hover:text-white border-r border-slate-800 min-w-[65px]"
                      >
                        Delta {renderSortIndicator('rankDelta')}
                      </th>
                    </>
                  )}

                  {/* Group G Columns */}
                  {columnGroups.investment && (
                    <>
                      <th className="py-2 px-2.5 text-left border-r border-slate-800/40 min-w-[110px]">
                        Offer A Terms
                      </th>
                      <th className="py-2 px-2.5 text-left border-r border-slate-800/40 min-w-[110px]">
                        Offer B Terms
                      </th>
                      <th className="py-2 px-2.5 text-center border-r border-slate-800/40 min-w-[90px]">
                        Choice
                      </th>
                      <th className="py-2 px-2.5 text-center border-r border-slate-800 min-w-[85px]">
                        Confirmed
                      </th>
                    </>
                  )}

                  {/* Group F Columns */}
                  {columnGroups.insights && (
                    <th className="py-2 px-3 text-center min-w-[120px]">
                      Insights
                    </th>
                  )}
                </tr>
              </thead>

              {/* TABLE BODY */}
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {isLoading ? (
                  <tr>
                    <td colSpan={30} className="py-16 text-center text-slate-400 font-sans">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <RefreshCw className="h-6 w-6 animate-spin text-indigo-400" />
                        <span>Loading team intelligence across all domains...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredAndSortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={30} className="py-16 text-center text-slate-500 font-sans">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Building2 className="h-7 w-7 text-slate-600" />
                        <span>No teams match current filters.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedRows.map((row, idx) => {
                    const isEven = idx % 2 === 0;

                    return (
                      <tr
                        key={row.teamId}
                        onClick={() => setSelectedTeam(row)}
                        className={`cursor-pointer transition-colors group ${
                          isEven ? 'bg-[#090D16]/90' : 'bg-[#0C1220]/90'
                        } hover:bg-indigo-950/30`}
                      >
                        {/* Group A: Team Code (Sticky) */}
                        <td
                          className={`py-2 px-3 font-semibold text-white sticky left-0 z-20 border-r border-slate-800/60 flex items-center gap-1.5 ${
                            isEven ? 'bg-[#090D16]' : 'bg-[#0C1220]'
                          } group-hover:bg-[#121B35]`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              row.status === 'disqualified'
                                ? 'bg-rose-500'
                                : row.decisionStatus === 'confirmed'
                                ? 'bg-emerald-400'
                                : row.decisionStatus === 'submitted'
                                ? 'bg-sky-400'
                                : 'bg-amber-400'
                            }`}
                          />
                          <span>{row.teamCode}</span>
                        </td>

                        {/* Group A: Company Name (Sticky) */}
                        <td
                          className={`py-2 px-3 font-sans font-medium text-slate-200 truncate max-w-[160px] sticky left-[90px] z-20 border-r border-slate-800/60 ${
                            isEven ? 'bg-[#090D16]' : 'bg-[#0C1220]'
                          } group-hover:bg-[#121B35]`}
                          title={row.companyName}
                        >
                          {row.companyName}
                        </td>

                        {/* Group A: Domain Code (Sticky) */}
                        <td
                          className={`py-2 px-3 font-sans sticky left-[230px] z-20 border-r border-slate-800 ${
                            isEven ? 'bg-[#090D16]' : 'bg-[#0C1220]'
                          } group-hover:bg-[#121B35]`}
                        >
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              row.domainCode === 'D2C'
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                : row.domainCode === 'HEALTH'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                            }`}
                          >
                            {row.domainCode}
                          </span>
                        </td>

                        {/* Group B: Operating Inputs */}
                        {columnGroups.operating && (
                          <>
                            <td className="py-2 px-2.5 text-right border-r border-slate-800/30">
                              {formatCurrency(row.marketingSpend)}
                            </td>
                            <td className="py-2 px-2.5 text-right border-r border-slate-800/30">
                              {formatCurrency(row.rdSpend)}
                            </td>
                            <td className="py-2 px-2.5 text-right border-r border-slate-800/30">
                              {formatInt(row.productionUnits)}
                            </td>
                            <td className="py-2 px-2.5 text-right border-r border-slate-800/30">
                              {formatCurrency(row.unitSellingPrice)}
                            </td>
                            <td className="py-2 px-2.5 text-right border-r border-slate-800">
                              {formatCurrency(row.operationsBudget)}
                            </td>
                          </>
                        )}

                        {/* Group C: Production & Distribution */}
                        {columnGroups.production && (
                          <>
                            <td className="py-2 px-2.5 text-right border-r border-slate-800/30">
                              {row.isSimulated ? formatInt(row.unitsAvailable) : <span className="text-slate-600">—</span>}
                            </td>
                            <td className="py-2 px-2.5 text-right border-r border-slate-800/30">
                              {row.isSimulated ? formatInt(row.unitsSold) : <span className="text-slate-600">—</span>}
                            </td>
                            <td className="py-2 px-2.5 text-right border-r border-slate-800/30">
                              {row.isSimulated ? (
                                <span className={row.endingInventory && row.endingInventory > 0 ? 'text-amber-300 font-medium' : 'text-slate-400'}>
                                  {formatInt(row.endingInventory)}
                                </span>
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>
                            <td className="py-2 px-2.5 text-right border-r border-slate-800/30">
                              {row.isSimulated ? (
                                <span className={row.unitsStockout && row.unitsStockout > 0 ? 'text-rose-400 font-semibold' : 'text-slate-400'}>
                                  {formatInt(row.unitsStockout)}
                                </span>
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>
                            <td className="py-2 px-2.5 text-right border-r border-slate-800/30">
                              {row.isSimulated ? formatPct(row.marketSharePct, 100) : <span className="text-slate-600">—</span>}
                            </td>
                            <td className="py-2 px-2.5 text-right border-r border-slate-800">
                              {row.isSimulated ? formatInt(row.potentialDemand) : <span className="text-slate-600">—</span>}
                            </td>
                          </>
                        )}

                        {/* Group D: Financial Performance */}
                        {columnGroups.financial && (
                          <>
                            <td className="py-2 px-2.5 text-right border-r border-slate-800/30 font-semibold text-emerald-400">
                              {row.isSimulated ? formatCurrency(row.grossRevenue) : <span className="text-slate-600">—</span>}
                            </td>
                            <td className="py-2 px-2.5 text-right border-r border-slate-800/30">
                              {row.isSimulated ? formatCurrency(row.grossProfit) : <span className="text-slate-600">—</span>}
                            </td>
                            <td className="py-2 px-2.5 text-right border-r border-slate-800/30">
                              {row.isSimulated ? formatCurrency(row.operatingExpenses) : <span className="text-slate-600">—</span>}
                            </td>
                            <td className="py-2 px-2.5 text-right border-r border-slate-800/30">
                              {row.isSimulated ? formatCurrency(row.netIncome) : <span className="text-slate-600">—</span>}
                            </td>
                            <td className="py-2 px-2.5 text-right border-r border-slate-800/30">
                              {row.isSimulated ? formatCurrency(row.financingCashFlow) : <span className="text-slate-600">—</span>}
                            </td>
                            <td className="py-2 px-2.5 text-right border-r border-slate-800/30 font-medium">
                              {row.isSimulated ? formatCurrency(row.endingCash) : <span className="text-slate-600">—</span>}
                            </td>
                            <td className="py-2 px-2.5 text-right border-r border-slate-800 font-bold text-slate-100">
                              {row.isSimulated ? formatCurrency(row.companyValuation) : <span className="text-slate-600">—</span>}
                            </td>
                          </>
                        )}

                        {/* Group E: Ownership & Dynamic Rankings */}
                        {columnGroups.ownership && (
                          <>
                            <td className="py-2 px-2.5 text-right border-r border-slate-800/30 font-semibold text-indigo-300">
                              {row.isSimulated ? formatPct(row.retainedEquityPct, 1) : <span className="text-slate-600">—</span>}
                            </td>
                            <td className="py-2 px-2.5 text-right border-r border-slate-800/30 font-bold text-slate-100">
                              {row.isSimulated ? formatCurrency(row.equityAdjustedScore) : <span className="text-slate-600">—</span>}
                            </td>
                            <td className="py-2 px-2.5 text-center border-r border-slate-800/30 font-sans">
                              {row.domainRank !== null ? (
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-[11px] font-black ${
                                    row.domainRank === 1
                                      ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                                      : row.domainRank === 2
                                      ? 'bg-slate-300/20 text-slate-200 border border-slate-300/40'
                                      : row.domainRank === 3
                                      ? 'bg-amber-700/20 text-amber-400 border border-amber-700/40'
                                      : 'bg-slate-800 text-slate-400'
                                  }`}
                                >
                                  #{row.domainRank}
                                </span>
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>
                            <td className="py-2 px-2.5 text-center border-r border-slate-800 font-sans">
                              {row.rankDelta !== null ? (
                                row.rankDelta > 0 ? (
                                  <span className="text-emerald-400 font-semibold text-[11px] flex items-center justify-center gap-0.5">
                                    <TrendingUp className="h-3 w-3" /> +{row.rankDelta}
                                  </span>
                                ) : row.rankDelta < 0 ? (
                                  <span className="text-rose-400 font-semibold text-[11px] flex items-center justify-center gap-0.5">
                                    <TrendingDown className="h-3 w-3" /> {row.rankDelta}
                                  </span>
                                ) : (
                                  <span className="text-slate-500 font-medium text-[11px]">—</span>
                                )
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>
                          </>
                        )}

                        {/* Group G: Centralized Investor Data */}
                        {columnGroups.investment && (
                          <>
                            <td className="py-2 px-2.5 text-left border-r border-slate-800/30 font-sans text-[11px]">
                              {row.hasInvestorOffers && row.offerAAmount ? (
                                <span className="text-slate-300 font-mono">
                                  ${(row.offerAAmount / 1000).toFixed(0)}k @ {row.offerAEquityPct}%
                                </span>
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>
                            <td className="py-2 px-2.5 text-left border-r border-slate-800/30 font-sans text-[11px]">
                              {row.hasInvestorOffers && row.offerBAmount ? (
                                <span className="text-slate-300 font-mono">
                                  ${(row.offerBAmount / 1000).toFixed(0)}k @ {row.offerBEquityPct}%
                                </span>
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>
                            <td className="py-2 px-2.5 text-center border-r border-slate-800/30 font-sans">
                              {row.selectedChoice && row.selectedChoice !== 'none' ? (
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                    row.selectedChoice === 'offer_a'
                                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                      : row.selectedChoice === 'offer_b'
                                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                                      : 'bg-slate-700/50 text-slate-300 border border-slate-600'
                                  }`}
                                >
                                  {row.selectedChoice === 'offer_a'
                                    ? 'Offer A'
                                    : row.selectedChoice === 'offer_b'
                                    ? 'Offer B'
                                    : 'Reject Both'}
                                </span>
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>
                            <td className="py-2 px-2.5 text-center border-r border-slate-800 font-sans">
                              {row.isChoiceConfirmed ? (
                                <span className="text-emerald-400 font-semibold text-[10px] flex items-center justify-center gap-1">
                                  <ShieldCheck className="h-3 w-3" /> Yes
                                </span>
                              ) : row.selectedChoice && row.selectedChoice !== 'none' ? (
                                <span className="text-amber-400 font-semibold text-[10px]">Pending</span>
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>
                          </>
                        )}

                        {/* Group F: Insights */}
                        {columnGroups.insights && (
                          <td className="py-2 px-3 text-center font-sans">
                            <div className="flex items-center justify-center gap-1.5">
                              {row.insights.length > 0 ? (
                                <>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                    {row.insights.length} {row.insights.length === 1 ? 'obs' : 'obs'}
                                  </span>
                                  {row.insights.some(i => i.type === 'warning') && (
                                    <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
                                  )}
                                </>
                              ) : (
                                <span className="text-slate-600 text-[11px]">—</span>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* TEAM DRILLDOWN MODAL / DRAWER */}
        {selectedTeam && (
          <Modal
            isOpen={Boolean(selectedTeam)}
            onClose={() => setSelectedTeam(null)}
            title={`${selectedTeam.teamCode} — ${selectedTeam.companyName}`}
            description={`${selectedTeam.domainName} (${selectedTeam.domainCode}) • Table Station: ${selectedTeam.tableStation || 'N/A'}`}
            maxWidth="xl"
          >
            <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-1">
              {/* Quick Status Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
                <div>
                  <div className="text-slate-400">Intra-Domain Rank:</div>
                  <div className="text-sm font-bold text-white mt-0.5">
                    {selectedTeam.domainRank ? `#${selectedTeam.domainRank}` : 'Unranked'}
                    {selectedTeam.rankDelta !== null && (
                      <span className={`ml-2 text-xs font-semibold ${selectedTeam.rankDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        ({selectedTeam.rankDelta >= 0 ? `+${selectedTeam.rankDelta}` : selectedTeam.rankDelta})
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-slate-400">Valuation:</div>
                  <div className="text-sm font-bold text-slate-100 font-mono mt-0.5">
                    {formatCurrency(selectedTeam.companyValuation)}
                  </div>
                </div>

                <div>
                  <div className="text-slate-400">Founder Retained:</div>
                  <div className="text-sm font-bold text-indigo-300 font-mono mt-0.5">
                    {formatPct(selectedTeam.retainedEquityPct, 1)}
                  </div>
                </div>

                <div>
                  <div className="text-slate-400">Equity-Adjusted Score:</div>
                  <div className="text-sm font-bold text-emerald-400 font-mono mt-0.5">
                    {formatCurrency(selectedTeam.equityAdjustedScore)}
                  </div>
                </div>
              </div>

              {/* Group F: Rule-Based Observations */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                  Automated Observations & Descriptive Insights
                </h4>
                {selectedTeam.insights.length === 0 ? (
                  <p className="text-xs text-slate-500 italic p-3 rounded-lg bg-slate-900/40 border border-slate-800">
                    No active anomalies or special observations flagged for this round.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selectedTeam.insights.map(insight => (
                      <div
                        key={insight.id}
                        className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                          insight.type === 'warning'
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                            : insight.type === 'success'
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                            : insight.type === 'opportunity'
                            ? 'bg-sky-500/10 border-sky-500/30 text-sky-200'
                            : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-200'
                        }`}
                      >
                        {insight.type === 'warning' ? (
                          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                        ) : insight.type === 'success' ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                        ) : (
                          <Info className="h-4 w-4 shrink-0 text-indigo-400 mt-0.5" />
                        )}
                        <div>
                          <div className="font-bold text-[13px]">{insight.title}</div>
                          <div className="mt-0.5 leading-relaxed opacity-90">{insight.message}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Round 2 & 4 Investor Record */}
              {(selectedRound === 2 || selectedRound === 4) && (
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300 mb-3 flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5 text-amber-400" />
                    Round {selectedRound} Investor Selection Terms
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80">
                      <div className="text-slate-400 font-medium">Offer A</div>
                      <div className="text-sm font-bold text-white mt-1 font-mono">
                        {selectedTeam.offerAAmount ? `$${selectedTeam.offerAAmount.toLocaleString()}` : '—'}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                        Equity: {selectedTeam.offerAEquityPct !== null ? `${selectedTeam.offerAEquityPct}%` : '—'}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80">
                      <div className="text-slate-400 font-medium">Offer B</div>
                      <div className="text-sm font-bold text-white mt-1 font-mono">
                        {selectedTeam.offerBAmount ? `$${selectedTeam.offerBAmount.toLocaleString()}` : '—'}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                        Equity: {selectedTeam.offerBEquityPct !== null ? `${selectedTeam.offerBEquityPct}%` : '—'}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80">
                      <div className="text-slate-400 font-medium">Chosen Action</div>
                      <div className="mt-1">
                        {selectedTeam.selectedChoice && selectedTeam.selectedChoice !== 'none' ? (
                          <Badge
                            className={`font-semibold uppercase text-xs ${
                              selectedTeam.selectedChoice === 'offer_a'
                                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                                : selectedTeam.selectedChoice === 'offer_b'
                                ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                                : 'bg-slate-700 text-slate-200'
                            }`}
                          >
                            {selectedTeam.selectedChoice === 'offer_a'
                              ? 'Accepted Offer A'
                              : selectedTeam.selectedChoice === 'offer_b'
                              ? 'Accepted Offer B'
                              : 'Rejected Both'}
                          </Badge>
                        ) : (
                          <span className="text-slate-500">None Selected</span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        Status: {selectedTeam.isChoiceConfirmed ? 'Locked & Confirmed' : 'Draft / Unconfirmed'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Financial Statements Breakdown */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Income Statement Breakdown */}
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
                  <h5 className="font-bold text-slate-300 mb-2.5 border-b border-slate-800 pb-1.5">
                    Income Statement Breakdown
                  </h5>
                  <div className="space-y-1.5 font-mono">
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">Gross Revenue:</span>
                      <span className="text-slate-200">{formatCurrency(selectedTeam.grossRevenue)}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">Cost of Goods Sold (COGS):</span>
                      <span className="text-slate-200">{formatCurrency(selectedTeam.cogs)}</span>
                    </div>
                    <div className="flex justify-between py-1 border-t border-slate-800/80 font-bold">
                      <span className="text-slate-300">Gross Profit:</span>
                      <span>{formatCurrency(selectedTeam.grossProfit)}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">Operating Expenses (OpEx):</span>
                      <span className="text-slate-200">{formatCurrency(selectedTeam.operatingExpenses)}</span>
                    </div>
                    <div className="flex justify-between py-1 border-t border-slate-800/80 font-bold">
                      <span className="text-slate-200">Net Income:</span>
                      <span className="text-emerald-400">{formatCurrency(selectedTeam.netIncome)}</span>
                    </div>
                  </div>
                </div>

                {/* Cash Flow & Inventory */}
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
                  <h5 className="font-bold text-slate-300 mb-2.5 border-b border-slate-800 pb-1.5">
                    Distribution & Cash Flow
                  </h5>
                  <div className="space-y-1.5 font-mono">
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">Units Available:</span>
                      <span className="text-slate-200">{formatInt(selectedTeam.unitsAvailable)}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">Units Sold:</span>
                      <span className="text-slate-200">{formatInt(selectedTeam.unitsSold)}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">Ending Unsold Inventory:</span>
                      <span className="text-slate-200">{formatInt(selectedTeam.endingInventory)}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">Financing Cash Flow (Capital):</span>
                      <span className="text-slate-200">{formatCurrency(selectedTeam.financingCashFlow)}</span>
                    </div>
                    <div className="flex justify-between py-1 border-t border-slate-800/80 font-bold">
                      <span className="text-slate-200">Ending Cash / Treasury:</span>
                      <span className="text-emerald-400">{formatCurrency(selectedTeam.endingCash)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedTeam(null)}
                  className="border-slate-800 text-xs"
                >
                  Close
                </Button>
                <Link href="/admin/teams">
                  <Button variant="emerald"
                    size="sm"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs gap-1.5"
                  >
                    Open Teams & Rosters
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </AdminShell>
  );
}
