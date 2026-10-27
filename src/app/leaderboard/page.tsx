'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Trophy,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Sparkles,
  Search,
  RefreshCw,
  ShieldCheck,
  ChevronRight,
  Building2,
  DollarSign,
  PieChart,
  Award,
  ShieldAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface LeaderboardEntry {
  rank: number;
  tournamentRank: number;
  domainRank: number;
  previousRank: number | null;
  rankMovement: number | null;
  teamId: string;
  companyId: string;
  teamCode: string;
  companyName: string;
  tableStation: string | null;
  domainId: string;
  domainCode: string;
  domainName: string;
  valuation: number;
  retainedEquityPct: number;
  equityAdjustedScore: number;
  finalScore: number;
  endingCash: number;
  grossRevenue: number;
  netIncome: number;
  ebitda: number;
  cogs: number;
  operatingExpenses: number;
  marketSharePct: number;
  productQualityIndex: number;
  brandEquityScore: number;
}

interface PublishedRound {
  roundNumber: number;
  publishedAt: string | null;
}

interface LeaderboardApiResponse {
  event: { id: string; name: string; status: string } | null;
  hasPublishedRounds: boolean;
  publishedRounds: PublishedRound[];
  activeRoundNumber: number;
  selectedRoundNumber: number | null;
  lastUpdated: string | null;
  isFinalRoundEmbargoed?: boolean;
  leaderboard: LeaderboardEntry[];
}

export default function PublicLeaderboardPage() {
  const [data, setData] = React.useState<LeaderboardApiResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedRound, setSelectedRound] = React.useState<number | null>(null);
  const [selectedDomain, setSelectedDomain] = React.useState<string>('ALL');
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [sortBy, setSortBy] = React.useState<'score' | 'valuation' | 'revenue' | 'cash' | 'rank'>('score');
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('desc');

  const fetchLeaderboard = React.useCallback(async (roundNum?: number | null) => {
    setIsLoading(true);
    setError(null);
    try {
      const url = new URL('/api/leaderboard', window.location.origin);
      if (roundNum !== undefined && roundNum !== null) {
        url.searchParams.set('roundNumber', roundNum.toString());
      }
      const res = await fetch(url.toString());
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to load tournament leaderboard');
      }
      setData(json.data);
      if (selectedRound === null && json.data.selectedRoundNumber) {
        setSelectedRound(json.data.selectedRoundNumber);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to connect to simulation server';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [selectedRound]);

  React.useEffect(() => {
    fetchLeaderboard(selectedRound);
  }, [selectedRound, fetchLeaderboard]);

  const formatCurrency = (val: number, decimals: number = 0) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(val);
  };

  const formatPercent = (val: number) => {
    return `${Number(val).toFixed(2)}%`;
  };

  const formatDateTime = (iso: string | null) => {
    if (!iso) return 'Recent';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' (' + d.toLocaleDateString() + ')';
    } catch {
      return iso;
    }
  };

  // Filter and sort items
  const filteredEntries = React.useMemo(() => {
    if (!data?.leaderboard) return [];

    let list = [...data.leaderboard];

    // Filter by Domain
    if (selectedDomain !== 'ALL') {
      list = list.filter(
        item => item.domainCode.toUpperCase() === selectedDomain || item.domainName.toLowerCase().includes(selectedDomain.toLowerCase())
      );
    }

    // Filter by Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        item =>
          item.companyName.toLowerCase().includes(q) ||
          item.teamCode.toLowerCase().includes(q) ||
          (item.tableStation && item.tableStation.toLowerCase().includes(q))
      );
    }

    // Sort
    list.sort((a, b) => {
      let comp = 0;
      if (sortBy === 'score') {
        comp = b.finalScore - a.finalScore;
      } else if (sortBy === 'valuation') {
        comp = b.valuation - a.valuation;
      } else if (sortBy === 'revenue') {
        comp = b.grossRevenue - a.grossRevenue;
      } else if (sortBy === 'cash') {
        comp = b.endingCash - a.endingCash;
      } else if (sortBy === 'rank') {
        comp = a.rank - b.rank;
      }

      // Tie breaker fallback: finalScore DESC, valuation DESC, teamId ASC
      if (comp === 0) {
        const scoreDiff = b.finalScore - a.finalScore;
        if (scoreDiff !== 0) return scoreDiff;
        const valDiff = b.valuation - a.valuation;
        if (valDiff !== 0) return valDiff;
        return a.teamCode.localeCompare(b.teamCode);
      }

      return sortDirection === 'desc' ? comp : -comp;
    });

    return list;
  }, [data?.leaderboard, selectedDomain, searchQuery, sortBy, sortDirection]);

  // Aggregate stats
  const tournamentStats = React.useMemo(() => {
    if (!data?.leaderboard || data.leaderboard.length === 0) return null;
    const topScore = Math.max(...data.leaderboard.map(i => i.finalScore));
    const totalValuation = data.leaderboard.reduce((acc, i) => acc + i.valuation, 0);
    const avgEquity = data.leaderboard.reduce((acc, i) => acc + i.retainedEquityPct, 0) / data.leaderboard.length;
    return {
      topScore,
      totalValuation,
      avgEquity,
      totalTeams: data.leaderboard.length,
    };
  }, [data?.leaderboard]);

  const topThree = React.useMemo(() => {
    if (!data?.leaderboard || data.leaderboard.length === 0) return [];
    return data.leaderboard.slice(0, 3);
  }, [data?.leaderboard]);

  return (
    <div className="min-h-screen bg-[#070A12] text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* 1. TOP ANNOUNCEMENT & BRANDING HEADER */}
      <header className="border-b border-slate-800/80 bg-[#0B101E]/90 backdrop-blur sticky top-0 z-40 px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center font-bold text-white shadow-md shadow-indigo-900/40 group-hover:scale-105 transition-transform">
              CQ
            </div>
            <div>
              <span className="font-extrabold tracking-tight text-white text-base">CAPITAL</span>
              <span className="font-extrabold tracking-tight text-emerald-400 text-base ml-1">QUEST</span>
            </div>
          </Link>
          <span className="text-slate-700 hidden sm:inline">|</span>
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-300">
              {data?.event?.name || 'Capital Quest 2026'}
            </span>
            <Badge variant="published" indicator className="text-[10px] py-0.5">
              OFFICIAL LEADERBOARD
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchLeaderboard(selectedRound)}
            disabled={isLoading}
            className="text-xs text-slate-400 hover:text-slate-200 h-8 px-2.5 gap-1.5"
            title="Refresh official rankings"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-sky-400' : ''}`} />
            <span className="hidden md:inline">Refresh</span>
          </Button>
          <Link
            href="/admin/dashboard"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-600 bg-slate-900/80 text-xs font-medium text-slate-300 hover:text-white transition-colors"
          >
            <span>Staff Portal</span>
            <ChevronRight className="h-3 w-3 text-slate-500" />
          </Link>
        </div>
      </header>

      {/* 2. HERO BANNER */}
      <section className="relative overflow-hidden border-b border-slate-800/80 bg-gradient-to-b from-[#0E1526] via-[#090E1B] to-[#070A12] px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-mono font-semibold">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Deterministic Verification Engine Active</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                Tournament <span className="text-emerald-400">Standings</span> & Final Scores
              </h1>
              <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
                Official competitive rankings calculated as{' '}
                <span className="font-mono font-semibold text-amber-300">
                  Company Valuation × Founder Retained Equity %
                </span>
                . Only fully verified and published simulation snapshots are reflected.
              </p>
            </div>

            {/* ROUND SELECTOR PILL GROUP */}
            {data?.hasPublishedRounds && data.publishedRounds.length > 0 && (
              <div className="flex flex-col items-start md:items-end gap-1.5 bg-slate-950/80 p-3 rounded-xl border border-slate-800 shadow-inner">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Published Rounds
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {data.publishedRounds.map(r => {
                    const isSelected = selectedRound === r.roundNumber;
                    return (
                      <button
                        key={r.roundNumber}
                        onClick={() => setSelectedRound(r.roundNumber)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          isSelected
                            ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950 border border-emerald-400/40'
                            : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
                        }`}
                      >
                        Round {r.roundNumber}
                      </button>
                    );
                  })}
                </div>
                {data.lastUpdated && (
                  <span className="text-[10px] text-slate-500 font-mono">
                    Published: {formatDateTime(data.lastUpdated)}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* FINAL ROUND WINNER EMBARGO BANNER */}
          {data?.isFinalRoundEmbargoed && (
            <div className="p-4 rounded-xl border border-amber-900/60 bg-amber-950/30 flex items-start gap-3.5 text-amber-300 text-xs shadow-lg animate-in fade-in duration-200">
              <ShieldAlert className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-amber-200 text-sm">Final Round Results Embargoed — Winner Reveal in Progress</div>
                <div className="text-amber-300/80 mt-1 leading-relaxed">
                  Final tournament rankings and champion scores are currently under controlled announcement on the main stage. 
                  Displaying results through Round {data.selectedRoundNumber}. Official final standings will unlock here upon conclusion of the podium reveal ceremony.
                </div>
              </div>
            </div>
          )}

          {/* KPI CARDS */}
          {tournamentStats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/50 backdrop-blur">
                <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold uppercase">
                  <Award className="h-4 w-4" />
                  <span>Leader Score</span>
                </div>
                <div className="text-xl sm:text-2xl font-bold font-mono text-white mt-1">
                  {formatCurrency(tournamentStats.topScore)}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Top venture score</div>
              </div>

              <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/50 backdrop-blur">
                <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold uppercase">
                  <Building2 className="h-4 w-4" />
                  <span>Active Ventures</span>
                </div>
                <div className="text-xl sm:text-2xl font-bold font-mono text-white mt-1">
                  {tournamentStats.totalTeams} Teams
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Across 4 domains</div>
              </div>

              <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/50 backdrop-blur">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase">
                  <DollarSign className="h-4 w-4" />
                  <span>Combined Valuation</span>
                </div>
                <div className="text-xl sm:text-2xl font-bold font-mono text-white mt-1">
                  {formatCurrency(tournamentStats.totalValuation)}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Aggregated market worth</div>
              </div>

              <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/50 backdrop-blur">
                <div className="flex items-center gap-2 text-sky-400 text-xs font-semibold uppercase">
                  <PieChart className="h-4 w-4" />
                  <span>Average Equity</span>
                </div>
                <div className="text-xl sm:text-2xl font-bold font-mono text-white mt-1">
                  {formatPercent(tournamentStats.avgEquity)}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Founder retention avg</div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 3. MAIN CONTENT AREA */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {error && (
          <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs">
            {error}
          </div>
        )}

        {/* EMPTY STATE */}
        {!isLoading && (!data || !data.hasPublishedRounds || data.leaderboard.length === 0) && (
          <div className="py-20 text-center space-y-4 max-w-md mx-auto">
            <div className="h-16 w-16 mx-auto rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500">
              <Trophy className="h-8 w-8 text-amber-500/50" />
            </div>
            <h2 className="text-xl font-bold text-white">No Published Rounds Yet</h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Official simulation results are released only after strict organizer dual-verification and financial reconciliation. Check back shortly during competition reveals.
            </p>
            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchLeaderboard(null)}
                className="text-xs gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Check For Updates</span>
              </Button>
            </div>
          </div>
        )}

        {/* PODIUM TOP 3 CARDS (SHOWN ON GLOBAL ALL DOMAINS VIEW) */}
        {!isLoading && selectedDomain === 'ALL' && topThree.length >= 3 && !searchQuery && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <Award className="h-4 w-4 text-amber-400" />
                <span>Tournament Podium Leaders</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {topThree.map((item, idx) => {
                const podiumColors = [
                  'border-amber-500/40 bg-gradient-to-b from-amber-500/10 via-slate-950 to-slate-950', // #1 Gold
                  'border-slate-400/40 bg-gradient-to-b from-slate-400/10 via-slate-950 to-slate-950', // #2 Silver
                  'border-amber-700/40 bg-gradient-to-b from-amber-800/10 via-slate-950 to-slate-950', // #3 Bronze
                ];
                const medalBadges = ['🥇 RANK 1', '🥈 RANK 2', '🥉 RANK 3'];

                return (
                  <Link
                    key={item.teamId}
                    href={`/companies/${item.companyId}`}
                    className={`p-4 rounded-xl border transition-all hover:scale-[1.01] hover:border-indigo-500/50 group ${podiumColors[idx]}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold font-mono text-amber-300">
                        {medalBadges[idx]}
                      </span>
                      <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                        {item.domainCode}
                      </span>
                    </div>

                    <div className="mt-3">
                      <div className="text-base font-bold text-white group-hover:text-emerald-400 transition-colors flex items-center gap-1.5">
                        <span>{item.companyName}</span>
                        <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-emerald-400 transition-transform group-hover:translate-x-0.5" />
                      </div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">
                        Code: {item.teamCode} {item.tableStation ? `• Station ${item.tableStation}` : ''}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] uppercase text-slate-500 block">Final Score</span>
                        <span className="text-base font-extrabold font-mono text-amber-400">
                          {formatCurrency(item.finalScore)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase text-slate-500 block">Valuation</span>
                        <span className="text-sm font-bold font-mono text-indigo-300">
                          {formatCurrency(item.valuation)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase text-slate-500 block">Retained Equity</span>
                        <span className="text-xs font-semibold font-mono text-slate-300">
                          {formatPercent(item.retainedEquityPct)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase text-slate-500 block">Ending Cash</span>
                        <span className="text-xs font-semibold font-mono text-sky-400">
                          {formatCurrency(item.endingCash)}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. FILTER CONTROLS & SEARCH */}
        {data?.hasPublishedRounds && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {/* DOMAIN TABS */}
              <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs">
                {[
                  { id: 'ALL', label: 'All Domains' },
                  { id: 'D2C', label: 'D2C' },
                  { id: 'HEALTHTECH', label: 'HealthTech' },
                  { id: 'SAAS', label: 'Enterprise SaaS & AI' },
                ].map(d => (
                  <button
                    key={d.id}
                    onClick={() => setSelectedDomain(d.id)}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                      selectedDomain === d.id
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              {/* SEARCH INPUT */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search venture or code..."
                  className="pl-9 h-9 text-xs bg-slate-900/90 border-slate-800 focus:border-indigo-500"
                />
              </div>
            </div>

            {/* 5. LEADERBOARD TABLE */}
            <div className="rounded-xl border border-slate-800 bg-[#0B101E]/80 backdrop-blur overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#0E1526] text-slate-400 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-800 select-none">
                    <tr>
                      <th
                        onClick={() => {
                          setSortBy('rank');
                          setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                        }}
                        className="py-3 px-4 text-center cursor-pointer hover:text-slate-200 w-20"
                      >
                        Rank
                      </th>
                      <th className="py-3 px-4">Company Name & Domain</th>
                      <th
                        onClick={() => {
                          setSortBy('valuation');
                          setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
                        }}
                        className="py-3 px-4 text-right cursor-pointer hover:text-slate-200"
                      >
                        Valuation
                      </th>
                      <th className="py-3 px-4 text-right">Founder Equity</th>
                      <th
                        onClick={() => {
                          setSortBy('score');
                          setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
                        }}
                        className="py-3 px-4 text-right cursor-pointer hover:text-slate-200 font-bold text-amber-400"
                      >
                        Final Score
                      </th>
                      <th
                        onClick={() => {
                          setSortBy('revenue');
                          setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
                        }}
                        className="py-3 px-4 text-right cursor-pointer hover:text-slate-200 hidden md:table-cell"
                      >
                        Revenue
                      </th>
                      <th
                        onClick={() => {
                          setSortBy('cash');
                          setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
                        }}
                        className="py-3 px-4 text-right cursor-pointer hover:text-slate-200 hidden lg:table-cell"
                      >
                        Ending Cash
                      </th>
                      <th className="py-3 px-4 text-right hidden xl:table-cell">Net Income</th>
                      <th className="py-3 px-4 text-center w-16">Dossier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {isLoading ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-slate-400 text-xs">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto text-sky-400 mb-2" />
                          <span>Loading official published standings...</span>
                        </td>
                      </tr>
                    ) : filteredEntries.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-10 text-center text-slate-500 text-xs font-sans">
                          No company records found matching your filters.
                        </td>
                      </tr>
                    ) : (
                      filteredEntries.map(item => {
                        const isTopThree = item.rank <= 3;
                        return (
                          <tr
                            key={item.teamId}
                            className={`hover:bg-slate-800/40 transition-colors group cursor-pointer ${
                              isTopThree ? 'bg-indigo-950/10' : ''
                            }`}
                          >
                            {/* RANK & MOVEMENT */}
                            <td className="py-3.5 px-4 text-center">
                              <div className="flex flex-col items-center justify-center">
                                <span
                                  className={`text-sm font-extrabold ${
                                    item.rank === 1
                                      ? 'text-amber-400 font-black'
                                      : item.rank === 2
                                      ? 'text-slate-200'
                                      : item.rank === 3
                                      ? 'text-amber-600'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  #{item.rank}
                                </span>
                                {/* Movement Indicator */}
                                {item.rankMovement !== null ? (
                                  item.rankMovement > 0 ? (
                                    <span
                                      className="inline-flex items-center text-[10px] font-bold text-emerald-400"
                                      title={`Moved up ${item.rankMovement} positions`}
                                    >
                                      <ArrowUpRight className="h-3 w-3" />
                                      {item.rankMovement}
                                    </span>
                                  ) : item.rankMovement < 0 ? (
                                    <span
                                      className="inline-flex items-center text-[10px] font-bold text-rose-400"
                                      title={`Moved down ${Math.abs(item.rankMovement)} positions`}
                                    >
                                      <ArrowDownRight className="h-3 w-3" />
                                      {Math.abs(item.rankMovement)}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center text-[10px] text-slate-500" title="Unchanged rank">
                                      <Minus className="h-3 w-3" />
                                    </span>
                                  )
                                ) : (
                                  <span className="text-[9px] text-indigo-400/80 font-sans font-semibold">NEW</span>
                                )}
                              </div>
                            </td>

                            {/* COMPANY NAME & DOMAIN */}
                            <td className="py-3.5 px-4 font-sans">
                              <Link
                                href={`/companies/${item.companyId}`}
                                className="block group-hover:text-emerald-300 transition-colors"
                              >
                                <div className="font-bold text-white text-sm flex items-center gap-1.5">
                                  <span>{item.companyName}</span>
                                  {item.tableStation && (
                                    <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-1 py-0.2 rounded border border-slate-800">
                                      {item.tableStation}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                                  <span className="font-mono text-sky-400 font-semibold">{item.teamCode}</span>
                                  <span>•</span>
                                  <span className="text-slate-400">{item.domainName}</span>
                                  {selectedDomain === 'ALL' && (
                                    <>
                                      <span>•</span>
                                      <span className="text-slate-500">Domain #{item.domainRank}</span>
                                    </>
                                  )}
                                </div>
                              </Link>
                            </td>

                            {/* VALUATION */}
                            <td className="py-3.5 px-4 text-right text-indigo-200 font-semibold">
                              {formatCurrency(item.valuation)}
                            </td>

                            {/* RETAINED EQUITY */}
                            <td className="py-3.5 px-4 text-right text-slate-300">
                              {formatPercent(item.retainedEquityPct)}
                            </td>

                            {/* FINAL SCORE */}
                            <td className="py-3.5 px-4 text-right font-extrabold text-amber-400 text-sm">
                              {formatCurrency(item.finalScore)}
                            </td>

                            {/* REVENUE */}
                            <td className="py-3.5 px-4 text-right text-emerald-400 font-semibold hidden md:table-cell">
                              {formatCurrency(item.grossRevenue)}
                            </td>

                            {/* ENDING CASH */}
                            <td className="py-3.5 px-4 text-right text-sky-300 font-semibold hidden lg:table-cell">
                              {formatCurrency(item.endingCash)}
                            </td>

                            {/* NET INCOME */}
                            <td
                              className={`py-3.5 px-4 text-right font-semibold hidden xl:table-cell ${
                                item.netIncome >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {formatCurrency(item.netIncome)}
                            </td>

                            {/* DOSSIER LINK */}
                            <td className="py-3.5 px-4 text-center">
                              <Link
                                href={`/companies/${item.companyId}`}
                                className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-slate-800/80 hover:bg-indigo-600 text-slate-400 hover:text-white transition-all shadow-sm"
                                title="View venture performance dossier"
                              >
                                <ChevronRight className="h-4 w-4" />
                              </Link>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* SCORING RULES FOOTER NOTE */}
            <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-950/60 text-xs text-slate-400 space-y-1">
              <div className="flex items-center gap-2 text-slate-300 font-semibold">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span>Deterministic Scoring Engine & Tie-Break Hierarchy</span>
              </div>
              <p className="leading-relaxed text-slate-500">
                Rank ordering is computed strictly by: 1) Final Score (Valuation × Retained Equity %), 2) Company Valuation, 3) Gross Revenue, 4) Ending Cash Balance, 5) Alphabetical Team Identifier. A company with lower pre-dilution enterprise value can outrank a higher-valued competitor by preserving founder equity.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* 6. GLOBAL FOOTER */}
      <footer className="border-t border-slate-800/80 py-6 px-4 sm:px-6 lg:px-8 text-center text-xs text-slate-500 space-y-2">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <span>Capital Quest Simulation Platform</span>
          <span>•</span>
          <span>Phase 5: Financial Dossiers & Public Leaderboard</span>
          <span>•</span>
          <Link href="/admin/dashboard" className="text-slate-400 hover:text-slate-200 underline">
            Staff Portal
          </Link>
        </div>
        <p className="text-[11px] text-slate-600">
          All financial computations executed in 28-precision Decimal.js arithmetic and secured via PostgreSQL Row-Level Security.
        </p>
      </footer>
    </div>
  );
}
