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
  Crown,
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

interface DomainSection {
  domainCode: string;
  domainName: string;
  teams: LeaderboardEntry[];
  champion: LeaderboardEntry | null;
}

interface LeaderboardApiResponse {
  event: { id: string; name: string; status: string } | null;
  hasPublishedRounds: boolean;
  publishedRounds: { roundNumber: number; publishedAt: string | null }[];
  activeRoundNumber: number;
  selectedRoundNumber: number | null;
  lastUpdated: string | null;
  isFinalRoundEmbargoed?: boolean;
  isFinalChampionsView?: boolean;
  champions?: Array<{ domainCode: string; domainName: string; champion: LeaderboardEntry | null }>;
  domainStandings?: Record<string, LeaderboardEntry[]>;
  domains?: DomainSection[];
  leaderboard: LeaderboardEntry[];
}

export default function PublicLeaderboardPage() {
  const [data, setData] = React.useState<LeaderboardApiResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedDomain, setSelectedDomain] = React.useState<string>('ALL');
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [sortBy, setSortBy] = React.useState<'score' | 'valuation' | 'revenue' | 'cash' | 'rank'>('rank');
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('asc');

  const fetchLeaderboard = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Public leaderboard strictly displays the latest published round results
      const res = await fetch('/api/leaderboard');
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to load tournament leaderboard');
      }
      setData(json.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to connect to simulation server';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

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

  // Sort and filter helper for each domain's teams
  const sortAndFilterTeams = React.useCallback(
    (teams: LeaderboardEntry[]) => {
      let list = [...teams];

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        list = list.filter(
          item =>
            item.companyName.toLowerCase().includes(q) ||
            item.teamCode.toLowerCase().includes(q) ||
            (item.tableStation && item.tableStation.toLowerCase().includes(q))
        );
      }

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
          comp = a.domainRank - b.domainRank;
        }

        // Deterministic fallback: finalScore DESC, valuation DESC, teamCode ASC
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
    },
    [searchQuery, sortBy, sortDirection]
  );

  // Determine active domains to render
  const domainSections = React.useMemo(() => {
    if (!data) return [];

    // Fallback: If `domains` not present on API response, construct from leaderboard
    let sections: DomainSection[] = [];
    if (data.domains && data.domains.length > 0) {
      sections = data.domains;
    } else {
      const canonical = [
        { code: 'D2C', name: 'D2C Consumer Goods' },
        { code: 'HEALTH', name: 'HealthTech & BioDevices' },
        { code: 'SAAS', name: 'Enterprise SaaS & AI' },
      ];
      sections = canonical.map(c => {
        const matching = (data.leaderboard || []).filter(
          t => t.domainCode.toUpperCase() === c.code || t.domainName.toLowerCase().includes(c.code.toLowerCase())
        );
        return {
          domainCode: c.code,
          domainName: c.name,
          teams: matching,
          champion: matching.length > 0 ? matching[0] : null,
        };
      });
    }

    if (selectedDomain === 'ALL') {
      return sections;
    }

    return sections.filter(
      s => s.domainCode.toUpperCase() === selectedDomain || s.domainName.toLowerCase().includes(selectedDomain.toLowerCase())
    );
  }, [data, selectedDomain]);

  // Aggregate stats
  const tournamentStats = React.useMemo(() => {
    if (!data?.leaderboard || data.leaderboard.length === 0) return null;
    const totalValuation = data.leaderboard.reduce((acc, i) => acc + i.valuation, 0);
    const avgEquity = data.leaderboard.reduce((acc, i) => acc + i.retainedEquityPct, 0) / data.leaderboard.length;
    return {
      totalValuation,
      avgEquity,
      totalTeams: data.leaderboard.length,
    };
  }, [data?.leaderboard]);

  const isFinalChampionsView = Boolean(data?.isFinalChampionsView);

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
            onClick={fetchLeaderboard}
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
                <span>Three Independent Competition Domains</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                {isFinalChampionsView ? (
                  <>
                    Capital Quest <span className="text-amber-400">Tournament Champions</span>
                  </>
                ) : (
                  <>
                    Round {data?.selectedRoundNumber ?? 1}{' '}
                    <span className="text-emerald-400">Domain Standings</span>
                  </>
                )}
              </h1>
              <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
                {isFinalChampionsView ? (
                  <>
                    Official champions determined independently across the three active business domains using the
                    final equity-adjusted scoring formula and established tie-breakers.
                  </>
                ) : (
                  <>
                    Official independent domain rankings calculated as{' '}
                    <span className="font-mono font-semibold text-amber-300">
                      Company Valuation × Founder Retained Equity %
                    </span>
                    . Ventures compete strictly within their assigned industry domain.
                  </>
                )}
              </p>
            </div>

            {/* ROUND STATUS CARD */}
            {data?.hasPublishedRounds && (
              <div className="flex flex-col items-start md:items-end gap-1.5 bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 shadow-inner">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Current Public View
                </span>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-lg text-xs font-bold bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 font-mono">
                    {isFinalChampionsView ? 'GRAND FINALE CHAMPIONS' : `ROUND ${data.selectedRoundNumber} STANDINGS`}
                  </span>
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
                  Final tournament rankings and domain champions are currently under controlled announcement on the main stage. 
                  Displaying verified standings through Round {data.selectedRoundNumber}. Official final domain champions will unlock here upon conclusion of the reveal ceremony.
                </div>
              </div>
            </div>
          )}

          {/* KPI CARDS */}
          {tournamentStats && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/50 backdrop-blur">
                <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold uppercase">
                  <Building2 className="h-4 w-4" />
                  <span>Independent Domains</span>
                </div>
                <div className="text-xl sm:text-2xl font-bold font-mono text-white mt-1">
                  3 Competitions
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">D2C • HealthTech • SaaS & AI</div>
              </div>

              <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/50 backdrop-blur">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase">
                  <DollarSign className="h-4 w-4" />
                  <span>Combined Valuation</span>
                </div>
                <div className="text-xl sm:text-2xl font-bold font-mono text-white mt-1">
                  {formatCurrency(tournamentStats.totalValuation)}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Aggregated venture worth</div>
              </div>

              <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/50 backdrop-blur">
                <div className="flex items-center gap-2 text-sky-400 text-xs font-semibold uppercase">
                  <PieChart className="h-4 w-4" />
                  <span>Average Founder Equity</span>
                </div>
                <div className="text-xl sm:text-2xl font-bold font-mono text-white mt-1">
                  {formatPercent(tournamentStats.avgEquity)}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Founder retention across fields</div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 3. MAIN CONTENT AREA */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        {error && (
          <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs">
            {error}
          </div>
        )}

        {/* EMPTY STATE: NO PUBLISHED ROUNDS */}
        {!isLoading && (!data || !data.hasPublishedRounds || (data.leaderboard.length === 0 && (!data.domains || data.domains.length === 0))) && (
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
                onClick={fetchLeaderboard}
                className="text-xs gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Check For Updates</span>
              </Button>
            </div>
          </div>
        )}

        {/* FINAL CHAMPIONS SHOWCASE (ROUND 5 REVEALED) */}
        {!isLoading && isFinalChampionsView && data?.hasPublishedRounds && (
          <div className="space-y-6">
            <div className="text-center space-y-2 py-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-400 text-xs font-mono font-bold">
                <Crown className="h-4 w-4" />
                <span>OFFICIAL TOURNAMENT CHAMPIONS</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Independent Domain Champions
              </h2>
              <p className="text-xs text-slate-400 max-w-xl mx-auto">
                Each domain represents an independent competitive track. Exactly one final champion is awarded per active domain.
              </p>
            </div>

            {/* THREE CHAMPION CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { code: 'D2C', name: 'D2C Consumer Goods', badgeBg: 'from-amber-500/20 via-slate-900 to-slate-950', border: 'border-amber-500/50' },
                { code: 'HEALTH', name: 'HealthTech & BioDevices', badgeBg: 'from-emerald-500/20 via-slate-900 to-slate-950', border: 'border-emerald-500/50' },
                { code: 'SAAS', name: 'Enterprise SaaS & AI', badgeBg: 'from-indigo-500/20 via-slate-900 to-slate-950', border: 'border-indigo-500/50' },
              ].map(domainMeta => {
                const champObj = data.champions?.find(
                  c => c.domainCode.toUpperCase() === domainMeta.code || c.domainName.toLowerCase().includes(domainMeta.code.toLowerCase())
                );
                const champ = champObj?.champion;

                if (!champ) {
                  return (
                    <div
                      key={domainMeta.code}
                      className="p-6 rounded-2xl border border-slate-800 bg-slate-950/60 text-center space-y-3 flex flex-col justify-center min-h-[300px]"
                    >
                      <div className="text-xs font-mono font-bold uppercase text-slate-500 tracking-wider">
                        {domainMeta.name}
                      </div>
                      <div className="text-slate-600 text-sm font-semibold">No Competing Teams</div>
                      <p className="text-xs text-slate-600 leading-relaxed max-w-xs mx-auto">
                        No eligible ventures registered in this domain. No champion awarded.
                      </p>
                    </div>
                  );
                }

                return (
                  <div
                    key={domainMeta.code}
                    className={`p-6 rounded-2xl border ${domainMeta.border} bg-gradient-to-b ${domainMeta.badgeBg} shadow-2xl space-y-5 flex flex-col justify-between relative overflow-hidden`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-xs font-black font-mono px-2.5 py-1 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          <Crown className="h-3.5 w-3.5" />
                          <span>CHAMPION</span>
                        </span>
                        <span className="text-[11px] font-mono font-bold text-slate-400 uppercase">
                          {domainMeta.code}
                        </span>
                      </div>

                      <div>
                        <div className="text-xs font-mono uppercase text-slate-400 font-bold tracking-wider">
                          {domainMeta.name}
                        </div>
                        <h3 className="text-2xl font-black text-white tracking-tight mt-1">
                          {champ.companyName}
                        </h3>
                        <div className="text-xs font-mono text-slate-400 mt-0.5">
                          Code: {champ.teamCode} {champ.tableStation ? `• Station ${champ.tableStation}` : ''}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 pt-4 border-t border-slate-800/80">
                      <div>
                        <span className="text-[10px] uppercase text-slate-400 font-semibold block">Final Equity-Adjusted Score</span>
                        <span className="text-2xl font-black font-mono text-amber-400">
                          {formatCurrency(champ.finalScore)}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                        <div>
                          <span className="text-[10px] uppercase text-slate-500 block">Valuation</span>
                          <span className="font-bold font-mono text-indigo-300">
                            {formatCurrency(champ.valuation)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase text-slate-500 block">Retained Equity</span>
                          <span className="font-bold font-mono text-slate-200">
                            {formatPercent(champ.retainedEquityPct)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase text-slate-500 block">Ending Cash</span>
                          <span className="font-semibold font-mono text-sky-400">
                            {formatCurrency(champ.endingCash)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase text-slate-500 block">Gross Revenue</span>
                          <span className="font-semibold font-mono text-emerald-400">
                            {formatCurrency(champ.grossRevenue)}
                          </span>
                        </div>
                      </div>

                      <div className="pt-2">
                        <Link
                          href={`/companies/${champ.companyId}`}
                          className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-slate-900 hover:bg-indigo-600 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white transition-all shadow-sm"
                        >
                          <span>View Official Dossier</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ROUNDS 1-4: INDEPENDENT DOMAIN SECTIONS */}
        {!isLoading && !isFinalChampionsView && data?.hasPublishedRounds && (
          <div className="space-y-6">
            {/* FILTER CONTROLS & SEARCH */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {/* DOMAIN TABS */}
              <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs">
                {[
                  { id: 'ALL', label: 'All Domains' },
                  { id: 'D2C', label: 'D2C' },
                  { id: 'HEALTH', label: 'HealthTech' },
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

            {/* SEPARATE DOMAIN SECTIONS */}
            <div className="space-y-8">
              {domainSections.map(section => {
                const filteredTeams = sortAndFilterTeams(section.teams);

                return (
                  <section
                    key={section.domainCode}
                    className="rounded-2xl border border-slate-800/80 bg-[#0B101E]/80 backdrop-blur overflow-hidden shadow-xl"
                  >
                    {/* DOMAIN SECTION HEADER */}
                    <div className="px-5 py-4 border-b border-slate-800/80 bg-gradient-to-r from-[#0E1526] via-[#0B101E] to-[#0E1526] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className="px-2.5 py-1 rounded-md text-[11px] font-black font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          {section.domainCode}
                        </span>
                        <div>
                          <h2 className="text-base font-extrabold text-white tracking-tight">
                            {section.domainName}
                          </h2>
                          <p className="text-[11px] text-slate-400">
                            Independent competition track • Ranked strictly against peer ventures
                          </p>
                        </div>
                      </div>
                      <div className="text-xs font-mono font-semibold text-slate-400">
                        {section.teams.length} {section.teams.length === 1 ? 'Venture' : 'Ventures'} Competing
                      </div>
                    </div>

                    {/* DOMAIN LEADERBOARD TABLE */}
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
                            <th className="py-3 px-4">Company Name & Identifier</th>
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
                          {filteredTeams.length === 0 ? (
                            <tr>
                              <td colSpan={9} className="py-8 text-center text-slate-500 text-xs font-sans">
                                {section.teams.length === 0
                                  ? `No competing ventures registered in ${section.domainName}.`
                                  : 'No ventures matching search query in this domain.'}
                              </td>
                            </tr>
                          ) : (
                            filteredTeams.map((item) => {
                              const isTop = item.domainRank === 1;
                              return (
                                <tr
                                  key={item.teamId}
                                  className={`hover:bg-slate-800/40 transition-colors group cursor-pointer ${
                                    isTop ? 'bg-amber-950/10' : ''
                                  }`}
                                >
                                  {/* RANK & MOVEMENT (WITHIN DOMAIN) */}
                                  <td className="py-3.5 px-4 text-center">
                                    <div className="flex flex-col items-center justify-center">
                                      <span
                                        className={`text-sm font-extrabold ${
                                          item.domainRank === 1
                                            ? 'text-amber-400 font-black'
                                            : item.domainRank === 2
                                            ? 'text-slate-200'
                                            : item.domainRank === 3
                                            ? 'text-amber-600'
                                            : 'text-slate-400'
                                        }`}
                                      >
                                        #{item.domainRank}
                                      </span>
                                      {/* Movement Indicator within domain */}
                                      {item.rankMovement !== null ? (
                                        item.rankMovement > 0 ? (
                                          <span
                                            className="inline-flex items-center text-[10px] font-bold text-emerald-400"
                                            title={`Moved up ${item.rankMovement} position(s) in ${section.domainCode}`}
                                          >
                                            <ArrowUpRight className="h-3 w-3" />
                                            {item.rankMovement}
                                          </span>
                                        ) : item.rankMovement < 0 ? (
                                          <span
                                            className="inline-flex items-center text-[10px] font-bold text-rose-400"
                                            title={`Moved down ${Math.abs(item.rankMovement)} position(s) in ${section.domainCode}`}
                                          >
                                            <ArrowDownRight className="h-3 w-3" />
                                            {Math.abs(item.rankMovement)}
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center text-[10px] text-slate-500" title="Unchanged domain rank">
                                            <Minus className="h-3 w-3" />
                                          </span>
                                        )
                                      ) : (
                                        <span className="text-[9px] text-indigo-400/80 font-sans font-semibold">NEW</span>
                                      )}
                                    </div>
                                  </td>

                                  {/* COMPANY NAME & IDENTIFIER */}
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
                                        <span className="text-slate-400">{section.domainName}</span>
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
                  </section>
                );
              })}
            </div>

            {/* SCORING RULES FOOTER NOTE */}
            <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-950/60 text-xs text-slate-400 space-y-1">
              <div className="flex items-center gap-2 text-slate-300 font-semibold">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span>Deterministic Scoring Engine & Tie-Break Hierarchy</span>
              </div>
              <p className="leading-relaxed text-slate-500">
                Each domain operates as an independent competition track. Intra-domain rank ordering is computed strictly by: 1) Final Score (Valuation × Retained Equity %), 2) Company Valuation, 3) Gross Revenue, 4) Ending Cash Balance, 5) Alphabetical Team Identifier. A company with lower pre-dilution enterprise value can outrank a higher-valued competitor within its domain by preserving founder equity.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* 4. GLOBAL FOOTER */}
      <footer className="border-t border-slate-800/80 py-6 px-4 sm:px-6 lg:px-8 text-center text-xs text-slate-500 space-y-2">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <span>Capital Quest Simulation Platform</span>
          <span>•</span>
          <span>Independent Domain Rankings</span>
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
