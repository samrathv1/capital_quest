'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  History,
  ShieldCheck,
  Award,
  Search,
  Filter,
  RefreshCw,
  ChevronRight,
  BarChart3,
  Scale,
} from 'lucide-react';
import { AdminShell } from '@/components/layout/admin-shell';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

interface SnapshotItem {
  id: string;
  company_id: string;
  company_name: string;
  domain_name: string;
  domain_code: string;
  table_station?: string;
  cash_starting: number;
  gross_revenue: number;
  cogs: number;
  opex: number;
  ebitda: number;
  net_income: number;
  cash_ending: number;
  inventory_units: number;
  product_quality: number;
  market_share: number;
  enterprise_value: number;
  company_valuation: number;
  ownership_percentage: number;
  final_score: number;
  domain_rank: number;
  tournament_rank: number;
  decisions?: {
    marketing_budget: number;
    rd_budget: number;
    operations_budget: number;
    production_units: number;
    unit_price: number;
    investment_decision: string;
  };
}

interface ReconciliationCheck {
  checkName: string;
  passed: boolean;
  description: string;
  failedCompanies?: Array<{ companyName: string; detail: string }>;
}

interface ReconciliationAudit {
  isReconciled: boolean;
  totalCompaniesChecked: number;
  summary: {
    cashFlowBalancedCount: number;
    solvencyPassedCount: number;
    equitySumBalancedCount: number;
    inventoryConsistentCount: number;
    valuationConsistentCount: number;
  };
  checks: ReconciliationCheck[];
}

interface ResultsData {
  round: {
    id: string;
    round_number: number;
    status: 'draft' | 'open' | 'locked' | 'simulated' | 'reviewed' | 'published';
    type: string;
    event_id: string;
  };
  event: { id: string; name: string };
  run: {
    id: string;
    run_number: number;
    status: string;
    input_hash?: string;
    created_at: string;
    created_by?: string;
  } | null;
  snapshots: SnapshotItem[];
  reconciliation: ReconciliationAudit;
}

interface SimulationRunHistoryItem {
  id: string;
  run_number: number;
  status: string;
  input_hash?: string;
  companies_simulated: number;
  created_by?: string;
  created_at: string;
  completed_at?: string;
  correction_reason?: string;
  isActive: boolean;
}

function SimulationResultsContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const roundId = params.roundId as string;

  const [data, setData] = React.useState<ResultsData | null>(null);
  const [historyRuns, setHistoryRuns] = React.useState<SimulationRunHistoryItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

  // Filters & Sorting
  const [domainFilter, setDomainFilter] = React.useState<string>('ALL');
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [sortBy, setSortBy] = React.useState<keyof SnapshotItem>('tournament_rank');
  const [sortAsc, setSortAsc] = React.useState<boolean>(true);

  // Modals
  const [selectedCompany, setSelectedCompany] = React.useState<SnapshotItem | null>(null);
  const [historyModalOpen, setHistoryModalOpen] = React.useState(false);
  const [publishModalOpen, setPublishModalOpen] = React.useState(false);
  const [publishConfirmed, setPublishConfirmed] = React.useState(false);
  const [isPublishing, setIsPublishing] = React.useState(false);
  const [isReviewing, setIsReviewing] = React.useState(false);

  // Void modal
  const [voidModalOpen, setVoidModalOpen] = React.useState(false);
  const [voidPassword, setVoidPassword] = React.useState('');
  const [voidReason, setVoidReason] = React.useState('');
  const [isVoiding, setIsVoiding] = React.useState(false);
  const [voidError, setVoidError] = React.useState<string | null>(null);

  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rounds/${roundId}/results`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to fetch round results');
      }
      setData(json.data);

      // Check query tab
      if (searchParams.get('tab') === 'history') {
        setHistoryModalOpen(true);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading results');
    } finally {
      setIsLoading(false);
    }
  }, [roundId, searchParams]);

  const fetchHistory = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/rounds/${roundId}/history`);
      const json = await res.json();
      if (res.ok && json.data?.runs) {
        setHistoryRuns(json.data.runs);
      }
    } catch {
      // Ignored
    }
  }, [roundId]);

  React.useEffect(() => {
    if (roundId) {
      fetchData();
      fetchHistory();
    }
  }, [roundId, fetchData, fetchHistory]);

  const handleMarkAsReviewed = async () => {
    setIsReviewing(true);
    setError(null);
    try {
      const res = await fetch(`/api/rounds/${roundId}/review`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to review round');
      }
      setSuccessMsg('Round marked as REVIEWED. Financial reconciliation verified.');
      await fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error marking as reviewed');
    } finally {
      setIsReviewing(false);
    }
  };

  const handlePublishResults = async () => {
    if (!publishConfirmed) return;
    setIsPublishing(true);
    setError(null);
    try {
      const res = await fetch(`/api/rounds/${roundId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmPublish: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Publication failed');
      }
      setPublishModalOpen(false);
      setSuccessMsg(`Round ${data?.round.round_number} results PUBLISHED officially! Event round pointer advanced.`);
      await fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to publish results');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleExecuteVoid = async () => {
    if (voidPassword.length < 8) {
      setVoidError('Admin password confirmation required (min 8 characters).');
      return;
    }
    if (voidReason.trim().length < 10) {
      setVoidError('A meaningful audit reason (min 10 characters) is required to correct simulation results.');
      return;
    }
    setIsVoiding(true);
    setVoidError(null);
    try {
      const res = await fetch(`/api/rounds/${roundId}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminPasswordConfirm: voidPassword,
          reason: voidReason.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to void simulation');
      }
      setVoidModalOpen(false);
      setSuccessMsg('Active simulation run voided. Round reverted to LOCKED.');
      await fetchData();
      await fetchHistory();
    } catch (err: unknown) {
      setVoidError(err instanceof Error ? err.message : 'Failed to void simulation');
    } finally {
      setIsVoiding(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercent = (val: number) => {
    return `${(val * 100).toFixed(1)}%`;
  };

  // Filter & Sort snapshots
  const domains = React.useMemo(() => {
    if (!data?.snapshots) return [];
    const set = new Set<string>();
    data.snapshots.forEach((s) => set.add(s.domain_code));
    return Array.from(set);
  }, [data?.snapshots]);

  const filteredSnapshots = React.useMemo(() => {
    if (!data?.snapshots) return [];
    let list = [...data.snapshots];

    if (domainFilter !== 'ALL') {
      list = list.filter((s) => s.domain_code === domainFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) =>
          s.company_name.toLowerCase().includes(q) ||
          (s.table_station && s.table_station.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => {
      const valA = a[sortBy];
      const valB = b[sortBy];
      if (valA === undefined || valB === undefined) return 0;
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortAsc ? valA - valB : valB - valA;
      }
      return sortAsc
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });

    return list;
  }, [data?.snapshots, domainFilter, searchQuery, sortBy, sortAsc]);

  const handleSort = (field: keyof SnapshotItem) => {
    if (sortBy === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(field);
      setSortAsc(field === 'tournament_rank' || field === 'domain_rank');
    }
  };

  const isPublished = data?.round.status === 'published';
  const isReviewed = data?.round.status === 'reviewed';
  const isSimulated = data?.round.status === 'simulated';

  return (
    <AdminShell
      eventName={data?.event.name}
      roundNumber={data?.round.round_number || 1}
      roundStatus={data?.round.status || 'open'}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-indigo-400 font-semibold uppercase">
                {data ? `Round ${data.round.round_number} Results` : 'Simulation Results'}
              </span>
              <span className="text-slate-600">•</span>
              {data && (
                <Badge
                  variant={isPublished ? 'published' : isReviewed ? 'reviewed' : 'simulated'}
                  className="uppercase font-mono text-xs"
                >
                  {data.round.status}
                </Badge>
              )}
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight mt-1 flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-indigo-400" />
              <span>{data ? `Round ${data.round.round_number} Financial & Operational Results` : 'Round Results Review'}</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {isPublished
                ? 'OFFICIAL PUBLISHED RESULTS — Tournament leaderboard records active'
                : isReviewed
                ? 'REVIEWED PROVISIONAL RESULTS — Reconciliation verified, ready for publication'
                : 'PROVISIONAL RESULTS — Requires administrative review and reconciliation verification'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/rounds">
              <Button variant="outline" size="sm" className="border-slate-700 text-slate-300">
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Round Control
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchHistory();
                setHistoryModalOpen(true);
              }}
              className="border-slate-700 text-slate-300"
            >
              <History className="h-4 w-4 mr-1.5" />
              History ({historyRuns.length})
            </Button>
            {!isPublished && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setVoidPassword('');
                  setVoidReason('');
                  setVoidError(null);
                  setVoidModalOpen(true);
                }}
                className="border-rose-900/40 text-rose-300 hover:bg-rose-950/30"
              >
                <RotateCcw className="h-4 w-4 mr-1.5" />
                Void
              </Button>
            )}
            {isSimulated && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleMarkAsReviewed}
                disabled={isReviewing || !data?.reconciliation.isReconciled}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
              >
                <ShieldCheck className="h-4 w-4 mr-1.5" />
                {isReviewing ? 'Verifying...' : 'Mark as Reviewed'}
              </Button>
            )}
            {isReviewed && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setPublishConfirmed(false);
                  setPublishModalOpen(true);
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
              >
                <Award className="h-4 w-4 mr-1.5" />
                Publish Official Results
              </Button>
            )}
          </div>
        </div>
        {/* Global Alerts */}
        {successMsg && (
          <Alert variant="success" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-200">
            <CheckCircle2 className="h-4 w-4 inline mr-2 text-emerald-400" />
            {successMsg}
          </Alert>
        )}
        {error && (
          <Alert variant="error" className="border-rose-500/40 bg-rose-500/10 text-rose-200">
            <AlertTriangle className="h-4 w-4 inline mr-2 text-rose-400" />
            {error}
          </Alert>
        )}

        {/* 1. FINANCIAL RECONCILIATION CARD */}
        {data && (
          <Card className={`border ${data.reconciliation.isReconciled ? 'border-emerald-500/40 bg-emerald-950/10' : 'border-rose-500/40 bg-rose-950/10'}`}>
            <CardHeader className="py-3 px-5 border-b border-slate-800/80">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Scale className="h-4 w-4 text-sky-400" />
                  <span>Financial Integrity & Reconciliation Audit</span>
                  <Badge variant={data.reconciliation.isReconciled ? 'success' : 'error'} className="ml-2 text-xs">
                    {data.reconciliation.isReconciled ? 'ALL 5 CHECKS PASSED' : 'RECONCILIATION ISSUE DETECTED'}
                  </Badge>
                </CardTitle>
                <span className="text-xs font-mono text-slate-400">
                  {data.reconciliation.totalCompaniesChecked} Companies Audited
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-5">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                {data.reconciliation.checks.map((chk, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                      chk.passed
                        ? 'border-emerald-800/40 bg-slate-950/60'
                        : 'border-rose-800/60 bg-rose-950/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-200 truncate">{chk.checkName}</span>
                      {chk.passed ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                      {chk.description}
                    </p>
                    {chk.failedCompanies && chk.failedCompanies.length > 0 && (
                      <div className="pt-1 text-[10px] text-rose-300 border-t border-rose-900/40">
                        {chk.failedCompanies.map((fc, fIdx) => (
                          <div key={fIdx}>• {fc.companyName}: {fc.detail}</div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 2. RESULTS TABLE FILTER & SEARCH BAR */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            <span className="text-xs text-slate-400 font-semibold uppercase flex items-center gap-1.5 shrink-0">
              <Filter className="h-3.5 w-3.5 text-sky-400" />
              Domain:
            </span>
            <Button
              variant={domainFilter === 'ALL' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setDomainFilter('ALL')}
              className="text-xs h-8"
            >
              All Domains
            </Button>
            {domains.map((dom) => (
              <Button
                key={dom}
                variant={domainFilter === dom ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setDomainFilter(dom)}
                className="text-xs h-8 font-mono"
              >
                {dom}
              </Button>
            ))}
          </div>

          <div className="relative w-full md:w-72">
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
            <Input
              placeholder="Search company or table..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs bg-slate-900/90 border-slate-800"
            />
          </div>
        </div>

        {/* 3. EXTENDED FINANCIAL & OPERATIONAL RESULTS TABLE */}
        <Card className="bg-slate-900/80 border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-950/80 text-[11px] uppercase tracking-wider">
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead
                    className="cursor-pointer text-slate-300 font-mono text-center w-12"
                    onClick={() => handleSort('tournament_rank')}
                  >
                    Rank
                  </TableHead>
                  <TableHead
                    className="cursor-pointer text-slate-300"
                    onClick={() => handleSort('company_name')}
                  >
                    Venture & Domain
                  </TableHead>
                  <TableHead
                    className="cursor-pointer text-slate-300 text-right"
                    onClick={() => handleSort('cash_starting')}
                  >
                    Start Cash
                  </TableHead>
                  <TableHead
                    className="cursor-pointer text-slate-300 text-right"
                    onClick={() => handleSort('gross_revenue')}
                  >
                    Revenue
                  </TableHead>
                  <TableHead
                    className="cursor-pointer text-slate-300 text-right"
                    onClick={() => handleSort('cogs')}
                  >
                    COGS
                  </TableHead>
                  <TableHead
                    className="cursor-pointer text-slate-300 text-right"
                    onClick={() => handleSort('ebitda')}
                  >
                    EBITDA
                  </TableHead>
                  <TableHead
                    className="cursor-pointer text-slate-300 text-right"
                    onClick={() => handleSort('net_income')}
                  >
                    Net Income
                  </TableHead>
                  <TableHead
                    className="cursor-pointer text-slate-300 text-right"
                    onClick={() => handleSort('cash_ending')}
                  >
                    End Cash
                  </TableHead>
                  <TableHead
                    className="cursor-pointer text-slate-300 text-right"
                    onClick={() => handleSort('market_share')}
                  >
                    Mkt Share
                  </TableHead>
                  <TableHead
                    className="cursor-pointer text-slate-300 text-right"
                    onClick={() => handleSort('company_valuation')}
                  >
                    Valuation
                  </TableHead>
                  <TableHead
                    className="cursor-pointer text-slate-300 text-right"
                    onClick={() => handleSort('ownership_percentage')}
                  >
                    Equity %
                  </TableHead>
                  <TableHead
                    className="cursor-pointer text-slate-300 text-right font-bold text-amber-400"
                    onClick={() => handleSort('final_score')}
                  >
                    Final Score
                  </TableHead>
                  <TableHead className="w-12 text-center"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center py-12 text-slate-400 text-xs">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto text-sky-400 mb-2" />
                      Loading round snapshots and financials...
                    </TableCell>
                  </TableRow>
                ) : filteredSnapshots.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center py-10 text-slate-500 text-xs">
                      No company snapshots match your search criteria.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSnapshots.map((item) => (
                    <TableRow
                      key={item.id}
                      onClick={() => setSelectedCompany(item)}
                      className="border-slate-800/60 hover:bg-slate-800/40 cursor-pointer text-xs transition-colors"
                    >
                      <TableCell className="text-center font-mono font-bold text-slate-300">
                        #{item.tournament_rank}
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-white flex items-center gap-1.5">
                          {item.company_name}
                          {item.table_station && (
                            <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-1 rounded border border-slate-800">
                              {item.table_station}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2">
                          <span className="font-mono text-sky-400">{item.domain_code}</span>
                          <span>•</span>
                          <span>Domain #{item.domain_rank}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-slate-400">
                        {formatCurrency(item.cash_starting)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-emerald-400 font-semibold">
                        {formatCurrency(item.gross_revenue)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-slate-400">
                        {formatCurrency(item.cogs)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono font-semibold ${
                          item.ebitda >= 0 ? 'text-slate-200' : 'text-rose-400'
                        }`}
                      >
                        {formatCurrency(item.ebitda)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono font-semibold ${
                          item.net_income >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatCurrency(item.net_income)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sky-300 font-semibold">
                        {formatCurrency(item.cash_ending)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-slate-300">
                        {formatPercent(item.market_share)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-indigo-300 font-semibold">
                        {formatCurrency(item.company_valuation)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-slate-300">
                        {formatPercent(item.ownership_percentage)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-amber-400 text-sm">
                        {formatCurrency(item.final_score)}
                      </TableCell>
                      <TableCell className="text-center text-slate-500">
                        <ChevronRight className="h-4 w-4" />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      {/* 4. COMPANY FINANCIAL DRILL-DOWN MODAL */}
      <Modal
        isOpen={Boolean(selectedCompany)}
        onClose={() => setSelectedCompany(null)}
        title={selectedCompany?.company_name || 'Venture Financial Details'}
        description={`Tournament Rank #${selectedCompany?.tournament_rank} • ${selectedCompany?.domain_name} (${selectedCompany?.domain_code})`}
        maxWidth="lg"
      >
        {selectedCompany && (
          <div className="space-y-4 text-xs">
            {/* Top Stat Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] uppercase text-slate-500 font-semibold block">Equity-Adjusted Score</span>
                <span className="text-base font-bold font-mono text-amber-400">
                  {formatCurrency(selectedCompany.final_score)}
                </span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] uppercase text-slate-500 font-semibold block">Company Valuation</span>
                <span className="text-base font-bold font-mono text-indigo-300">
                  {formatCurrency(selectedCompany.company_valuation)}
                </span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] uppercase text-slate-500 font-semibold block">Ownership Retained</span>
                <span className="text-base font-bold font-mono text-white">
                  {formatPercent(selectedCompany.ownership_percentage)}
                </span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] uppercase text-slate-500 font-semibold block">Ending Cash</span>
                <span className="text-base font-bold font-mono text-sky-400">
                  {formatCurrency(selectedCompany.cash_ending)}
                </span>
              </div>
            </div>

            {/* Income Statement & Balance Sheet Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 space-y-2">
                <strong className="text-slate-300 block border-b border-slate-800 pb-1 text-xs">
                  Income Statement
                </strong>
                <div className="space-y-1 font-mono text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Gross Revenue:</span>
                    <span className="text-emerald-400 font-semibold">{formatCurrency(selectedCompany.gross_revenue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Cost of Goods Sold (COGS):</span>
                    <span className="text-slate-300">({formatCurrency(selectedCompany.cogs)})</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-900 pt-0.5">
                    <span className="text-slate-300">Gross Profit:</span>
                    <span className="text-slate-200">{formatCurrency(selectedCompany.gross_revenue - selectedCompany.cogs)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Operating Expenses (OpEx):</span>
                    <span className="text-slate-300">({formatCurrency(selectedCompany.opex)})</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-900 pt-0.5">
                    <span className="text-slate-300">EBITDA:</span>
                    <span className={selectedCompany.ebitda >= 0 ? 'text-slate-200' : 'text-rose-400'}>
                      {formatCurrency(selectedCompany.ebitda)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-slate-800 pt-1 font-bold">
                    <span className="text-white">Net Income:</span>
                    <span className={selectedCompany.net_income >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {formatCurrency(selectedCompany.net_income)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 space-y-2">
                <strong className="text-slate-300 block border-b border-slate-800 pb-1 text-xs">
                  Operational Metrics & Assets
                </strong>
                <div className="space-y-1 font-mono text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Starting Cash:</span>
                    <span className="text-slate-200">{formatCurrency(selectedCompany.cash_starting)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Ending Inventory Units:</span>
                    <span className="text-slate-200">{selectedCompany.inventory_units.toLocaleString()} units</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Product Quality Index:</span>
                    <span className="text-sky-300">{selectedCompany.product_quality.toFixed(1)} / 100</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Market Share:</span>
                    <span className="text-sky-300">{formatPercent(selectedCompany.market_share)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-900 pt-0.5">
                    <span className="text-slate-400">Enterprise Value (EV):</span>
                    <span className="text-indigo-300">{formatCurrency(selectedCompany.enterprise_value)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-800 pt-1 font-bold">
                    <span className="text-white">Ending Cash Balance:</span>
                    <span className="text-sky-400">{formatCurrency(selectedCompany.cash_ending)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Decisions Input Card */}
            {selectedCompany.decisions && (
              <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 space-y-2">
                <strong className="text-slate-300 block border-b border-slate-800 pb-1 text-xs">
                  Submitted Decision Parameters
                </strong>
                <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Marketing:</span>
                    <span className="text-slate-200">{formatCurrency(selectedCompany.decisions.marketing_budget)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">R&D:</span>
                    <span className="text-slate-200">{formatCurrency(selectedCompany.decisions.rd_budget)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Operations:</span>
                    <span className="text-slate-200">{formatCurrency(selectedCompany.decisions.operations_budget)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Production:</span>
                    <span className="text-slate-200">{selectedCompany.decisions.production_units.toLocaleString()} units</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Unit Price:</span>
                    <span className="text-slate-200">{formatCurrency(selectedCompany.decisions.unit_price)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Investment Choice:</span>
                    <span className="text-amber-300 uppercase">{selectedCompany.decisions.investment_decision}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedCompany(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 5. PUBLISH RESULTS CONFIRMATION MODAL */}
      <Modal
        isOpen={publishModalOpen}
        onClose={() => setPublishModalOpen(false)}
        title={data ? `Publish Official Results: Round ${data.round.round_number}` : 'Publish Results'}
        description="Release verified simulation results to participants and public leaderboards."
        maxWidth="md"
      >
        <div className="space-y-4 text-xs">
          <Alert variant="warning" className="border-amber-500/40 bg-amber-500/10 text-amber-200">
            <AlertTriangle className="h-4 w-4 inline mr-1 text-amber-400" />
            Publication makes these financial records official and irrevocable. The tournament active round pointer will advance to Round {(data?.round.round_number ?? 1) + 1}.
          </Alert>

          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-400">Round Status:</span>
              <span className="font-mono text-emerald-400 font-semibold uppercase">{data?.round.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Financial Reconciliation:</span>
              <span className="font-mono text-emerald-400 font-semibold">VERIFIED (5/5 checks)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Participating Ventures:</span>
              <span className="font-mono text-white font-semibold">{data?.snapshots.length} companies</span>
            </div>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={publishConfirmed}
              onChange={(e) => setPublishConfirmed(e.target.checked)}
              className="mt-0.5 rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-sky-500"
            />
            <span className="text-xs text-slate-300 select-none">
              I confirm that I have reviewed the financial reconciliation report and approve the release of these official tournament results.
            </span>
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPublishModalOpen(false)}
              disabled={isPublishing}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handlePublishResults}
              disabled={!publishConfirmed || isPublishing}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
            >
              {isPublishing ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Publishing...
                </>
              ) : (
                <>
                  <Award className="h-4 w-4 mr-2" />
                  Confirm & Publish
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 6. SIMULATION RUN HISTORY MODAL */}
      <Modal
        isOpen={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        title={data ? `Simulation Run History: Round ${data.round.round_number}` : 'Simulation Run History'}
        description="Audit log of all execution attempts, versions, and rollback records."
        maxWidth="lg"
      >
        <div className="space-y-4 text-xs">
          {historyRuns.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              No simulation history recorded for this round.
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {historyRuns.map((run) => (
                <div
                  key={run.id}
                  className={`p-3 rounded-lg border space-y-1.5 ${
                    run.isActive
                      ? 'border-sky-500/50 bg-sky-950/20'
                      : 'border-slate-800 bg-slate-950/60 opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white">Version v{run.run_number}</span>
                      <Badge variant={run.isActive ? 'blue' : 'secondary'} className="text-[10px]">
                        {run.isActive ? 'ACTIVE' : 'SUPERSEDED'}
                      </Badge>
                      <Badge
                        variant={run.status === 'completed' ? 'success' : 'error'}
                        className="text-[10px]"
                      >
                        {run.status}
                      </Badge>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {new Date(run.created_at).toLocaleString()}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-400">
                    <div>
                      Simulated: <span className="text-slate-200">{run.companies_simulated} companies</span>
                    </div>
                    {run.input_hash && (
                      <div className="truncate">
                        Hash: <code className="text-sky-300">{run.input_hash}</code>
                      </div>
                    )}
                  </div>

                  {run.correction_reason && (
                    <div className="text-[11px] text-rose-300 bg-rose-950/30 border border-rose-900/40 rounded p-1.5 mt-1">
                      <strong>Correction Reason:</strong> {run.correction_reason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="outline" size="sm" onClick={() => setHistoryModalOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* 7. VOID MODAL */}
      <Modal
        isOpen={voidModalOpen}
        onClose={() => setVoidModalOpen(false)}
        title={data ? `Void Simulation: Round ${data.round.round_number}` : 'Void Simulation'}
        description="Authorized non-destructive rollback of active simulation run."
        maxWidth="md"
      >
        <div className="space-y-4 text-xs">
          {voidError && (
            <Alert variant="error" className="text-xs">
              {voidError}
            </Alert>
          )}

          <Alert variant="warning" className="border-amber-500/40 bg-amber-500/10 text-amber-200">
            <AlertTriangle className="h-4 w-4 inline mr-1 text-amber-400" />
            Voiding will supersede the active simulation run and revert Round {data?.round.round_number} to <strong>LOCKED</strong>. Volunteer data entry will remain locked until explicitly reopened.
          </Alert>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Admin Password Confirmation (min 8 chars):
              </label>
              <Input
                type="password"
                placeholder="Enter administrator password"
                value={voidPassword}
                onChange={(e) => setVoidPassword(e.target.value)}
                className="bg-slate-950 border-slate-800 text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Mandatory Audit Correction Reason (min 10 chars):
              </label>
              <textarea
                rows={3}
                placeholder="e.g., Authorized re-simulation following official sheet dispute resolution"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVoidModalOpen(false)}
              disabled={isVoiding}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleExecuteVoid}
              disabled={isVoiding || voidPassword.length < 8 || voidReason.trim().length < 10}
              className="bg-rose-600 hover:bg-rose-500 text-white font-semibold"
            >
              {isVoiding ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Voiding...
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Confirm Void & Revert
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}

export default function RoundResultsPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
          <div className="flex items-center gap-3 text-slate-400 font-mono text-sm">
            <RefreshCw className="h-5 w-5 animate-spin text-sky-400" />
            Loading Round Simulation Results...
          </div>
        </div>
      }
    >
      <SimulationResultsContent />
    </React.Suspense>
  );
}
