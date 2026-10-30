'use client';

import * as React from 'react';
import {
  Trophy,
  Maximize2,
  Minimize2,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  Award,
  Crown,
  Layers,
  DollarSign,
  PieChart,
} from 'lucide-react';

interface PublicLeaderboardEntry {
  rank: number;
  companyId: string;
  companyName: string;
  domainId: string;
  domainName: string;
  domainCode: string;
  tableStation: string;
  score: number;
  finalScore?: number;
  equityAdjustedScore?: number;
  valuation: number;
  founderEquityPercent: number;
  retainedEquityPct?: number;
  cashOnHand: number;
  netIncome: number;
  revenue: number;
  rankChange: number;
  rankMovement?: number;
  isBankrupt: boolean;
  publishedRoundNumber: number;
}

interface PublicPresentationData {
  state: {
    eventId: string;
    mode: 'standings' | 'domain' | 'highlights' | 'ceremony';
    selectedRoundNumber: number;
    domainFilter: string;
    ceremonyStage: 'waiting' | 'reveal_third' | 'reveal_second' | 'reveal_first' | 'podium';
    updatedAt: string;
  };
  event: {
    id: string;
    name: string;
    total_rounds: number;
    status: string;
  } | null;
  publishedRounds: { id: string; roundNumber: number }[];
  selectedRoundNumber: number;
  standings: PublicLeaderboardEntry[];
  domainStandings: PublicLeaderboardEntry[];
  highlights: {
    topScorers: PublicLeaderboardEntry[];
    revenueLeaders: PublicLeaderboardEntry[];
    valuationGrowthLeaders: {
      entry: PublicLeaderboardEntry;
      valuationDelta: number;
      growthPercent: number;
    }[];
    rankClimbers: {
      entry: PublicLeaderboardEntry;
      climb: number;
    }[];
    domainLeaders: {
      domainName: string;
      domainCode: string;
      leader: PublicLeaderboardEntry;
    }[];
    equityLeaders: PublicLeaderboardEntry[];
  };
  ceremony: {
    stage: 'waiting' | 'reveal_third' | 'reveal_second' | 'reveal_first' | 'podium';
    isFinalRoundPublished: boolean;
    currentReveal: PublicLeaderboardEntry | null;
    revealedWinners: PublicLeaderboardEntry[];
    domainChampions?: Array<{
      domainCode: string;
      domainName: string;
      champion: PublicLeaderboardEntry | null;
    }>;
  };
}

function formatCents(val: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
}

function formatCompactCurrency(val: number) {
  if (Math.abs(val) >= 1_000_000) {
    return `$${(val / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(val) >= 1_000) {
    return `$${(val / 1_000).toFixed(0)}k`;
  }
  return formatCents(val);
}

export default function PresentationPage() {
  const [data, setData] = React.useState<PublicPresentationData | null>(null);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [isOnline, setIsOnline] = React.useState(true);
  const [lastSyncTime, setLastSyncTime] = React.useState<Date | null>(null);

  const fetchPresentation = React.useCallback(async () => {
    try {
      const res = await fetch('/api/presentation', {
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!res.ok) throw new Error('Network response not ok');
      const json = await res.json();
      setData(json.data);
      setIsOnline(true);
      setLastSyncTime(new Date());
    } catch {
      setIsOnline(false);
    }
  }, []);

  // Poll every 2.5s for live projector sync
  React.useEffect(() => {
    fetchPresentation();
    const timer = setInterval(fetchPresentation, 2500);
    return () => clearInterval(timer);
  }, [fetchPresentation]);

  // Track fullscreen changes
  React.useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen();
      } catch {
        // Fallback if browser denies
      }
    } else {
      try {
        await document.exitFullscreen();
      } catch {
        // Fallback
      }
    }
  };

  const mode = data?.state?.mode || 'standings';
  const ceremonyStage = data?.ceremony?.stage || data?.state?.ceremonyStage || 'waiting';
  const roundNumber = data?.selectedRoundNumber || 1;
  const eventName = data?.event?.name || 'Capital Quest 2026';

  return (
    <div className="min-h-screen w-full bg-[#050811] text-slate-100 flex flex-col justify-between selection:bg-indigo-500/30 overflow-x-hidden font-sans">
      {/* 16:9 FIXED RATIO WRAPPER WITH RESPONSIVE 1080P/4K SCALING */}
      <div className="flex-1 flex flex-col w-full max-w-[1920px] mx-auto p-4 sm:p-6 lg:p-10 2xl:p-16 justify-between relative">
        {/* AMBIENT BACKGROUND GLOWS */}
        <div className="absolute top-0 left-1/4 w-[600px] h-[350px] bg-indigo-600/10 blur-[140px] pointer-events-none rounded-full" />
        <div className="absolute bottom-10 right-1/4 w-[500px] h-[300px] bg-emerald-600/10 blur-[130px] pointer-events-none rounded-full" />
        {mode === 'ceremony' && (
          <div className="absolute top-1/3 left-1/3 w-[700px] h-[400px] bg-amber-500/15 blur-[160px] pointer-events-none rounded-full" />
        )}

        {/* TOP BAR: BRANDING + ROUND INDICATOR + FULLSCREEN TOGGLE */}
        <header className="flex items-center justify-between z-10 border-b border-slate-800/80 pb-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-emerald-500 flex items-center justify-center font-black text-white shadow-lg shadow-indigo-950/60 text-lg sm:text-xl tracking-wider">
              CQ
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl sm:text-2xl font-black tracking-tight text-white">CAPITAL</span>
                <span className="text-xl sm:text-2xl font-black tracking-tight text-emerald-400">QUEST</span>
                <span className="hidden md:inline text-xs font-mono px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-400 ml-2">
                  LIVE STAGE
                </span>
              </div>
              <div className="text-xs sm:text-sm text-slate-400 font-medium">
                {eventName} • Official Tournament Arena
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* CONNECTION STATE PILL */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 text-xs font-mono">
              {isOnline ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-emerald-400 font-semibold hidden sm:inline">LIVE SYNC</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  <span className="text-rose-400 font-semibold hidden sm:inline">RECONNECTING</span>
                </>
              )}
            </div>

            {/* ROUND BADGE */}
            {mode !== 'ceremony' && (
              <div className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-950 to-slate-900 border border-indigo-700/50 text-indigo-200 text-xs sm:text-sm font-bold font-mono tracking-wider shadow-md">
                ROUND {roundNumber}
              </div>
            )}

            {/* FULLSCREEN BUTTON */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-2 sm:p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-all shadow-sm"
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen (16:9 Presentation)'}
              aria-label="Toggle Projector Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
            </button>
          </div>
        </header>

        {/* MAIN STAGE CONTENT AREA */}
        <main className="flex-1 flex flex-col justify-center z-10 my-auto py-2">
          {/* EMPTY / WAITING FOR PUBLICATION SCREEN */}
          {(!data?.publishedRounds || data.publishedRounds.length === 0) && mode !== 'ceremony' ? (
            <div className="text-center py-24 space-y-6 max-w-2xl mx-auto">
              <div className="h-20 w-20 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mx-auto shadow-2xl shadow-indigo-950/80">
                <Layers className="h-10 w-10 animate-pulse" />
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                  Official Results Standby
                </h2>
                <p className="text-slate-400 text-base sm:text-lg">
                  Round results are currently undergoing dual-verification and organizer certification.
                  Standings will automatically display once published.
                </p>
              </div>
            </div>
          ) : mode === 'ceremony' ? (
            /* ========================================================================= */
            /* MODE: CONTROLLED WINNER REVEAL CEREMONY                                   */
            /* ========================================================================= */
            <div className="w-full flex flex-col items-center justify-center animate-in fade-in duration-300">
              {/* CEREMONY STAGE 1: WAITING SCREEN */}
              {ceremonyStage === 'waiting' && (
                <div className="text-center py-16 sm:py-24 space-y-6 max-w-3xl mx-auto">
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-950/50 border border-amber-500/40 text-amber-300 font-mono text-xs font-bold tracking-widest uppercase">
                    <Sparkles className="h-3.5 w-3.5 text-amber-400 animate-spin" />
                    Tournament Finale
                  </div>
                  <h1 className="text-4xl sm:text-6xl 2xl:text-7xl font-black tracking-tight text-white leading-tight">
                    Winner Announcement Ceremony
                  </h1>
                  <p className="text-base sm:text-xl text-slate-300 max-w-xl mx-auto leading-relaxed">
                    All simulation rounds have officially concluded. Final valuations and cap tables are certified.
                    Please take your seats for the podium awards.
                  </p>
                  <div className="pt-4 flex items-center justify-center gap-3 text-slate-500 font-mono text-xs">
                    <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                    <span>Awaiting Organizer Stage Signal</span>
                  </div>
                </div>
              )}

              {/* CEREMONY STAGE 2: 3RD PLACE REVEAL */}
              {ceremonyStage === 'reveal_third' && (
                <div className="w-full max-w-4xl mx-auto text-center space-y-8 animate-in zoom-in-95 duration-500">
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-950/40 border border-amber-700/60 text-amber-400 font-mono text-xs font-bold tracking-widest uppercase">
                    <Crown className="h-4 w-4 text-amber-500" />
                    Domain Champion Spotlight
                  </div>

                  {data?.ceremony?.currentReveal ? (
                    <div className="p-8 sm:p-12 rounded-3xl border-2 border-amber-800/80 bg-gradient-to-b from-[#1c120c] to-[#0c0908] shadow-2xl shadow-amber-950/60 relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-8 opacity-10">
                        <Crown className="h-48 w-48 text-amber-600" />
                      </div>

                      <div className="relative z-10 space-y-6">
                        <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-2xl bg-gradient-to-br from-amber-700 to-amber-900 border-2 border-amber-600 flex items-center justify-center font-black text-white text-3xl sm:text-4xl mx-auto shadow-xl">
                          <Crown className="h-10 w-10 sm:h-12 sm:w-12 text-amber-300" />
                        </div>

                        <div>
                          <span className="text-xs sm:text-sm font-mono uppercase tracking-widest text-amber-500/90 font-bold">
                            {data.ceremony.currentReveal.domainName}
                          </span>
                          <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight mt-1">
                            {data.ceremony.currentReveal.companyName}
                          </h2>
                          <p className="text-xs sm:text-sm text-slate-400 mt-1">
                            Station {data.ceremony.currentReveal.tableStation}
                          </p>
                        </div>

                        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-amber-900/50 max-w-xl mx-auto">
                          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                            <div className="text-[11px] font-mono text-slate-400 uppercase">Final Valuation</div>
                            <div className="text-lg sm:text-2xl font-bold font-mono text-emerald-400 mt-1">
                              {formatCompactCurrency(data.ceremony.currentReveal.valuation)}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              {formatCents(data.ceremony.currentReveal.valuation)}
                            </div>
                          </div>

                          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                            <div className="text-[11px] font-mono text-slate-400 uppercase">Equity Retained</div>
                            <div className="text-lg sm:text-2xl font-bold font-mono text-indigo-300 mt-1">
                              {(data.ceremony.currentReveal.founderEquityPercent ?? data.ceremony.currentReveal.retainedEquityPct ?? 0).toFixed(1)}%
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">Cap Table Share</div>
                          </div>

                          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                            <div className="text-[11px] font-mono text-slate-400 uppercase">Official Score</div>
                            <div className="text-lg sm:text-2xl font-bold font-mono text-amber-400 mt-1">
                              {(data.ceremony.currentReveal.score ?? data.ceremony.currentReveal.finalScore ?? 0).toFixed(2)}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">Champion Score</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-400 text-sm">Champion result is currently embargoed.</div>
                  )}
                </div>
              )}

              {/* CEREMONY STAGE 3: 2ND PLACE REVEAL */}
              {ceremonyStage === 'reveal_second' && (
                <div className="w-full max-w-4xl mx-auto text-center space-y-8 animate-in zoom-in-95 duration-500">
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-800/80 border border-slate-400/60 text-slate-200 font-mono text-xs font-bold tracking-widest uppercase">
                    <Crown className="h-4 w-4 text-slate-300" />
                    Domain Champion Spotlight
                  </div>

                  {data?.ceremony?.currentReveal ? (
                    <div className="p-8 sm:p-12 rounded-3xl border-2 border-slate-400/80 bg-gradient-to-b from-[#151922] to-[#0a0d14] shadow-2xl shadow-slate-900/80 relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-8 opacity-10">
                        <Crown className="h-48 w-48 text-slate-300" />
                      </div>

                      <div className="relative z-10 space-y-6">
                        <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-2xl bg-gradient-to-br from-slate-300 to-slate-500 border-2 border-slate-200 flex items-center justify-center font-black text-slate-950 text-3xl sm:text-4xl mx-auto shadow-xl">
                          <Crown className="h-10 w-10 sm:h-12 sm:w-12 text-slate-950" />
                        </div>

                        <div>
                          <span className="text-xs sm:text-sm font-mono uppercase tracking-widest text-slate-300 font-bold">
                            {data.ceremony.currentReveal.domainName}
                          </span>
                          <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight mt-1">
                            {data.ceremony.currentReveal.companyName}
                          </h2>
                          <p className="text-xs sm:text-sm text-slate-400 mt-1">
                            Station {data.ceremony.currentReveal.tableStation}
                          </p>
                        </div>

                        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-700/50 max-w-xl mx-auto">
                          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                            <div className="text-[11px] font-mono text-slate-400 uppercase">Final Valuation</div>
                            <div className="text-lg sm:text-2xl font-bold font-mono text-emerald-400 mt-1">
                              {formatCompactCurrency(data.ceremony.currentReveal.valuation)}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              {formatCents(data.ceremony.currentReveal.valuation)}
                            </div>
                          </div>

                          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                            <div className="text-[11px] font-mono text-slate-400 uppercase">Equity Retained</div>
                            <div className="text-lg sm:text-2xl font-bold font-mono text-indigo-300 mt-1">
                              {(data.ceremony.currentReveal.founderEquityPercent ?? data.ceremony.currentReveal.retainedEquityPct ?? 0).toFixed(1)}%
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">Cap Table Share</div>
                          </div>

                          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                            <div className="text-[11px] font-mono text-slate-400 uppercase">Official Score</div>
                            <div className="text-lg sm:text-2xl font-bold font-mono text-amber-400 mt-1">
                              {(data.ceremony.currentReveal.score ?? data.ceremony.currentReveal.finalScore ?? 0).toFixed(2)}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">Champion Score</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-400 text-sm">Champion result is currently embargoed.</div>
                  )}
                </div>
              )}

              {/* CEREMONY STAGE 4: 1ST PLACE CHAMPION REVEAL */}
              {ceremonyStage === 'reveal_first' && (
                <div className="w-full max-w-4xl mx-auto text-center space-y-8 animate-in zoom-in-95 duration-500">
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/20 border border-amber-400/80 text-amber-300 font-mono text-xs font-bold tracking-widest uppercase shadow-lg shadow-amber-500/20">
                    <Crown className="h-4 w-4 text-amber-400 animate-pulse" />
                    Domain Champion Spotlight
                  </div>

                  {data?.ceremony?.currentReveal ? (
                    <div className="p-8 sm:p-14 rounded-3xl border-2 border-amber-400 bg-gradient-to-b from-[#2b200b] via-[#1a1408] to-[#0a0805] shadow-2xl shadow-amber-500/30 relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-8 opacity-15">
                        <Crown className="h-56 w-56 text-amber-400" />
                      </div>

                      <div className="relative z-10 space-y-6">
                        <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-3xl bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 border-4 border-amber-200 flex items-center justify-center font-black text-slate-950 text-4xl sm:text-5xl mx-auto shadow-2xl shadow-amber-400/40 animate-bounce">
                          <Crown className="h-12 w-12 sm:h-14 sm:w-14 text-slate-950" />
                        </div>

                        <div>
                          <span className="text-sm font-mono uppercase tracking-widest text-amber-400 font-black">
                            {data.ceremony.currentReveal.domainName}
                          </span>
                          <h2 className="text-4xl sm:text-6xl font-black text-white tracking-tight mt-1">
                            {data.ceremony.currentReveal.companyName}
                          </h2>
                          <p className="text-sm text-amber-200/80 mt-1">
                            Table Station {data.ceremony.currentReveal.tableStation}
                          </p>
                        </div>

                        <div className="grid grid-cols-3 gap-4 pt-6 border-t border-amber-500/40 max-w-xl mx-auto">
                          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-amber-500/30">
                            <div className="text-[11px] font-mono text-amber-300/80 uppercase">Champion Valuation</div>
                            <div className="text-xl sm:text-3xl font-black font-mono text-emerald-400 mt-1">
                              {formatCompactCurrency(data.ceremony.currentReveal.valuation)}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {formatCents(data.ceremony.currentReveal.valuation)}
                            </div>
                          </div>

                          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-amber-500/30">
                            <div className="text-[11px] font-mono text-amber-300/80 uppercase">Founder Equity</div>
                            <div className="text-xl sm:text-3xl font-black font-mono text-indigo-300 mt-1">
                              {(data.ceremony.currentReveal.founderEquityPercent ?? data.ceremony.currentReveal.retainedEquityPct ?? 0).toFixed(1)}%
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">Equity Retained</div>
                          </div>

                          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-amber-500/30">
                            <div className="text-[11px] font-mono text-amber-300/80 uppercase">Winning Score</div>
                            <div className="text-xl sm:text-3xl font-black font-mono text-amber-300 mt-1">
                              {(data.ceremony.currentReveal.score ?? data.ceremony.currentReveal.finalScore ?? 0).toFixed(2)}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">Champion Score</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-400 text-sm">Champion result is currently embargoed.</div>
                  )}
                </div>
              )}

              {/* CEREMONY STAGE 5: FULL PODIUM */}
              {ceremonyStage === 'podium' && (
                <div className="w-full max-w-6xl mx-auto space-y-10 animate-in fade-in duration-500">
                  <div className="text-center space-y-2">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-amber-500/20 via-slate-500/20 to-amber-700/20 border border-amber-500/40 text-amber-300 font-mono text-xs font-bold tracking-widest uppercase">
                      <Trophy className="h-4 w-4 text-amber-400" />
                      Capital Quest Official Tournament Winners
                    </div>
                    <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
                      The Three Domain Champions Showcase
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto">
                      Honoring the independent champions across D2C, HealthTech, and Enterprise SaaS & AI.
                    </p>
                  </div>

                  {/* DOMAIN CHAMPIONS SHOWCASE */}
                  {data?.ceremony?.domainChampions && data.ceremony.domainChampions.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch pt-4">
                      {data.ceremony.domainChampions.map((item) => {
                        const champ = item.champion;
                        if (!champ) {
                          return (
                            <div
                              key={item.domainCode}
                              className="p-8 rounded-3xl border border-dashed border-slate-800 bg-slate-900/30 text-center flex flex-col justify-center items-center space-y-4 min-h-[360px]"
                            >
                              <div className="text-xs font-mono uppercase tracking-widest text-slate-400 font-bold">
                                {item.domainName}
                              </div>
                              <Award className="h-12 w-12 text-slate-700" />
                              <div className="text-base font-bold text-slate-400">
                                No Eligible Contenders
                              </div>
                              <p className="text-xs text-slate-500 max-w-xs">
                                No active teams competed in this domain during this tournament.
                              </p>
                            </div>
                          );
                        }

                        const isD2C = item.domainCode.toUpperCase().includes('D2C');
                        const isHealth = item.domainCode.toUpperCase().includes('HEALTH');

                        return (
                          <div
                            key={item.domainCode}
                            className={`p-6 sm:p-8 rounded-3xl border-2 flex flex-col justify-between text-center space-y-6 shadow-2xl transition-all duration-300 ${
                              isD2C
                                ? 'border-amber-500/60 bg-gradient-to-b from-[#251809] to-[#0c0905] shadow-amber-950/40'
                                : isHealth
                                ? 'border-emerald-500/60 bg-gradient-to-b from-[#0b2416] to-[#050f09] shadow-emerald-950/40'
                                : 'border-indigo-500/60 bg-gradient-to-b from-[#131730] to-[#080a14] shadow-indigo-950/40'
                            }`}
                          >
                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <span
                                  className={`text-[11px] font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                                    isD2C
                                      ? 'bg-amber-950/60 border-amber-600/50 text-amber-300'
                                      : isHealth
                                      ? 'bg-emerald-950/60 border-emerald-600/50 text-emerald-300'
                                      : 'bg-indigo-950/60 border-indigo-600/50 text-indigo-300'
                                  }`}
                                >
                                  {item.domainName}
                                </span>
                                <Crown
                                  className={`h-5 w-5 ${
                                    isD2C ? 'text-amber-400' : isHealth ? 'text-emerald-400' : 'text-indigo-400'
                                  }`}
                                />
                              </div>

                              <div
                                className={`h-16 w-16 rounded-2xl flex items-center justify-center mx-auto shadow-lg border-2 ${
                                  isD2C
                                    ? 'bg-gradient-to-br from-amber-400 to-amber-600 border-amber-300 text-slate-950'
                                    : isHealth
                                    ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 border-emerald-300 text-slate-950'
                                    : 'bg-gradient-to-br from-indigo-400 to-indigo-600 border-indigo-300 text-white'
                                }`}
                              >
                                <Crown className="h-8 w-8" />
                              </div>

                              <div>
                                <div className="text-[11px] font-mono uppercase tracking-widest text-slate-400 font-bold">
                                  Domain Champion
                                </div>
                                <h3 className="text-2xl sm:text-3xl font-black text-white mt-1 tracking-tight">
                                  {champ.companyName}
                                </h3>
                                <p className="text-xs text-slate-400 mt-0.5">
                                  Station {champ.tableStation || 'Main Floor'}
                                </p>
                              </div>
                            </div>

                            <div className="space-y-2 pt-4 border-t border-slate-800">
                              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex justify-between items-center text-left">
                                <span className="text-[11px] font-mono text-slate-400 uppercase">Valuation</span>
                                <span className="text-base font-bold font-mono text-emerald-400">
                                  {formatCompactCurrency(champ.valuation)}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-center text-xs font-mono">
                                <div className="p-2 rounded-lg bg-slate-900/40 border border-slate-800">
                                  <div className="text-[10px] text-slate-500 uppercase">Equity</div>
                                  <div className="font-bold text-indigo-300 mt-0.5">
                                    {(champ.founderEquityPercent ?? champ.retainedEquityPct ?? 0).toFixed(1)}%
                                  </div>
                                </div>
                                <div className="p-2 rounded-lg bg-slate-900/40 border border-slate-800">
                                  <div className="text-[10px] text-slate-500 uppercase">Final Score</div>
                                  <div className="font-bold text-amber-400 mt-0.5">
                                    {(champ.score ?? champ.finalScore ?? 0).toFixed(2)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : data?.ceremony?.revealedWinners && data.ceremony.revealedWinners.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch pt-4">
                      {data.ceremony.revealedWinners.map((winner, idx) => (
                        <div
                          key={winner.companyId || idx}
                          className="p-6 sm:p-8 rounded-3xl border-2 border-amber-500/50 bg-gradient-to-b from-[#1e170c] to-[#0c0a06] flex flex-col justify-between text-center space-y-6 shadow-xl"
                        >
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border bg-amber-950/60 border-amber-600/50 text-amber-300">
                                {winner.domainName}
                              </span>
                              <Crown className="h-5 w-5 text-amber-400" />
                            </div>

                            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 border-2 border-amber-300 text-slate-950 flex items-center justify-center mx-auto shadow-lg">
                              <Crown className="h-8 w-8" />
                            </div>

                            <div>
                              <div className="text-[11px] font-mono uppercase tracking-widest text-amber-400 font-bold">
                                Domain Champion
                              </div>
                              <h3 className="text-2xl sm:text-3xl font-black text-white mt-1 tracking-tight">
                                {winner.companyName}
                              </h3>
                              <p className="text-xs text-slate-400 mt-0.5">Station {winner.tableStation}</p>
                            </div>
                          </div>

                          <div className="space-y-2 pt-4 border-t border-slate-800">
                            <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex justify-between items-center text-left">
                              <span className="text-[11px] font-mono text-slate-400 uppercase">Valuation</span>
                              <span className="text-base font-bold font-mono text-emerald-400">
                                {formatCompactCurrency(winner.valuation)}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-center text-xs font-mono">
                              <div className="p-2 rounded-lg bg-slate-900/40 border border-slate-800">
                                <div className="text-[10px] text-slate-500 uppercase">Equity</div>
                                <div className="font-bold text-indigo-300 mt-0.5">
                                  {(winner.founderEquityPercent ?? winner.retainedEquityPct ?? 0).toFixed(1)}%
                                </div>
                              </div>
                              <div className="p-2 rounded-lg bg-slate-900/40 border border-slate-800">
                                <div className="text-[10px] text-slate-500 uppercase">Final Score</div>
                                <div className="font-bold text-amber-400 mt-0.5">
                                  {(winner.score ?? winner.finalScore ?? 0).toFixed(2)}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-slate-400 text-center py-8">
                      Winner podium rankings are preparing for announcement.
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : mode === 'highlights' ? (
            /* ========================================================================= */
            /* MODE: ROUND HIGHLIGHTS                                                    */
            /* ========================================================================= */
            <div className="w-full space-y-6 animate-in fade-in duration-300">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-4 border-b border-slate-800">
                <div>
                  <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight flex items-center gap-3">
                    <Sparkles className="h-7 w-7 text-indigo-400" />
                    <span>Round {roundNumber} Strategic Highlights</span>
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400 mt-1">
                    Spotlight on outstanding execution, rapid valuation surges, and revenue generation.
                  </p>
                </div>
              </div>

              {/* 4 SPOTLIGHT TILES */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                {/* 1. TOP SCORER */}
                <div className="p-6 rounded-2xl border border-indigo-500/40 bg-gradient-to-b from-[#101426] to-[#090c17] shadow-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-indigo-400">
                      Overall Leader
                    </span>
                    <Trophy className="h-5 w-5 text-indigo-400" />
                  </div>
                  {data?.highlights?.topScorers?.[0] ? (
                    <div>
                      <div className="text-2xl font-black text-white">
                        {data.highlights.topScorers[0].companyName}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {data.highlights.topScorers[0].domainName}
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-1">
                        <div className="text-2xl font-bold font-mono text-emerald-400">
                          {data.highlights.topScorers[0].score.toFixed(2)} pts
                        </div>
                        <div className="text-xs font-mono text-slate-400">
                          Valuation: {formatCompactCurrency(data.highlights.topScorers[0].valuation)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500">No score data available</div>
                  )}
                </div>

                {/* 2. VALUATION GROWTH SURGE */}
                <div className="p-6 rounded-2xl border border-emerald-500/40 bg-gradient-to-b from-[#0c1c17] to-[#07110e] shadow-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-emerald-400">
                      Top Valuation Surge
                    </span>
                    <TrendingUp className="h-5 w-5 text-emerald-400" />
                  </div>
                  {data?.highlights?.valuationGrowthLeaders?.[0] ? (
                    <div>
                      <div className="text-2xl font-black text-white">
                        {data.highlights.valuationGrowthLeaders[0].entry.companyName}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {data.highlights.valuationGrowthLeaders[0].entry.domainName}
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-1">
                        <div className="text-2xl font-bold font-mono text-emerald-400">
                          +{formatCompactCurrency(data.highlights.valuationGrowthLeaders[0].valuationDelta)}
                        </div>
                        <div className="text-xs font-mono text-slate-400">
                          +{data.highlights.valuationGrowthLeaders[0].growthPercent.toFixed(1)}% Round Gain
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500">Valuation growth pending calculation</div>
                  )}
                </div>

                {/* 3. REVENUE LEADER */}
                <div className="p-6 rounded-2xl border border-amber-500/40 bg-gradient-to-b from-[#1f190e] to-[#100c07] shadow-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-amber-400">
                      Top Sales Volume
                    </span>
                    <DollarSign className="h-5 w-5 text-amber-400" />
                  </div>
                  {data?.highlights?.revenueLeaders?.[0] ? (
                    <div>
                      <div className="text-2xl font-black text-white">
                        {data.highlights.revenueLeaders[0].companyName}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {data.highlights.revenueLeaders[0].domainName}
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-1">
                        <div className="text-2xl font-bold font-mono text-amber-300">
                          {formatCompactCurrency(data.highlights.revenueLeaders[0].revenue)}
                        </div>
                        <div className="text-xs font-mono text-slate-400">
                          Net: {formatCompactCurrency(data.highlights.revenueLeaders[0].netIncome)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500">Revenue data pending</div>
                  )}
                </div>

                {/* 4. EQUITY RETENTION STANDOUT */}
                <div className="p-6 rounded-2xl border border-sky-500/40 bg-gradient-to-b from-[#0d1824] to-[#070e17] shadow-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-sky-400">
                      Founder Control
                    </span>
                    <PieChart className="h-5 w-5 text-sky-400" />
                  </div>
                  {data?.highlights?.equityLeaders?.[0] ? (
                    <div>
                      <div className="text-2xl font-black text-white">
                        {data.highlights.equityLeaders[0].companyName}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {data.highlights.equityLeaders[0].domainName}
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-1">
                        <div className="text-2xl font-bold font-mono text-sky-300">
                          {data.highlights.equityLeaders[0].founderEquityPercent.toFixed(1)}% Retained
                        </div>
                        <div className="text-xs font-mono text-slate-400">
                          Score: {data.highlights.equityLeaders[0].score.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500">Equity data pending</div>
                  )}
                </div>
              </div>

              {/* DOMAIN CHAMPIONS ROW */}
              {data?.highlights?.domainLeaders && data.highlights.domainLeaders.length > 0 && (
                <div className="pt-4 space-y-3">
                  <div className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">
                    Domain Division Leaders
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {data.highlights.domainLeaders.map(dl => (
                      <div
                        key={dl.domainCode}
                        className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 flex items-center justify-between"
                      >
                        <div>
                          <div className="text-[10px] font-mono font-bold text-indigo-400 uppercase">
                            {dl.domainName}
                          </div>
                          <div className="text-base font-bold text-white mt-0.5">
                            {(dl.leader ?? dl).companyName}
                          </div>
                          <div className="text-xs text-slate-400 font-mono">
                            {formatCompactCurrency((dl.leader ?? dl).valuation)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-mono font-bold text-amber-400">
                            {(((dl.leader ?? dl).score ?? (dl.leader ?? dl).finalScore ?? 0) as number).toFixed(2)}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">Score</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ========================================================================= */
            /* MODE: LIVE STANDINGS OR DOMAIN STANDINGS                                  */
            /* ========================================================================= */
            <div className="w-full space-y-4 animate-in fade-in duration-300">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-4 border-b border-slate-800">
                <div>
                  <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight flex items-center gap-3">
                    <Trophy className="h-7 w-7 text-amber-400" />
                    <span>
                      {mode === 'domain'
                        ? `${(data?.state?.domainFilter || 'Domain').toUpperCase()} Division Standings`
                        : `Official Tournament Standings — Round ${roundNumber}`}
                    </span>
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400 mt-1">
                    Rankings computed via official valuation, founder equity retention, and audited financial statements.
                  </p>
                </div>

                <div className="text-xs font-mono text-slate-400 hidden lg:block">
                  Cents preserved in financial reconciliation details
                </div>
              </div>

              {/* LARGE HIGH-CONTRAST PROJECTOR TABLE */}
              <div className="rounded-2xl border border-slate-800 bg-[#0B101E]/90 overflow-hidden shadow-2xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/80 text-[11px] sm:text-xs font-mono text-slate-400 uppercase tracking-wider">
                      <th className="py-3.5 px-4 sm:px-6 w-16 text-center">Rank</th>
                      <th className="py-3.5 px-4 sm:px-6">Venture & Domain</th>
                      <th className="py-3.5 px-4 sm:px-6 text-right">Valuation</th>
                      <th className="py-3.5 px-4 sm:px-6 text-right hidden sm:table-cell">Equity</th>
                      <th className="py-3.5 px-4 sm:px-6 text-right">Score</th>
                      <th className="py-3.5 px-4 sm:px-6 text-center w-20">Trend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-sm sm:text-base">
                    {(() => {
                      const list = mode === 'domain' ? (data?.domainStandings || []) : (data?.standings || []);
                      if (list.length === 0) {
                        return (
                          <tr>
                            <td colSpan={6} className="py-12 text-center text-slate-500 font-mono text-sm">
                              No companies found in this division snapshot.
                            </td>
                          </tr>
                        );
                      }
                      return list.map((entry) => {
                        return (
                          <tr
                            key={entry.companyId}
                            className={`transition-colors ${
                              entry.rank === 1
                                ? 'bg-amber-950/20 hover:bg-amber-950/30'
                                : entry.rank === 2
                                ? 'bg-slate-800/20 hover:bg-slate-800/30'
                                : entry.rank === 3
                                ? 'bg-amber-950/10 hover:bg-amber-950/20'
                                : 'hover:bg-slate-900/40'
                            }`}
                          >
                            {/* RANK BADGE */}
                            <td className="py-4 px-4 sm:px-6 text-center">
                              <span
                                className={`inline-flex items-center justify-center font-black rounded-xl ${
                                  entry.rank === 1
                                    ? 'h-9 w-9 bg-amber-400 text-slate-950 text-base shadow-lg shadow-amber-400/30'
                                    : entry.rank === 2
                                    ? 'h-9 w-9 bg-slate-300 text-slate-950 text-base shadow-md'
                                    : entry.rank === 3
                                    ? 'h-9 w-9 bg-amber-700 text-white text-base shadow-md'
                                    : 'h-8 w-8 bg-slate-800 text-slate-300 text-sm font-mono'
                                }`}
                              >
                                {entry.rank}
                              </span>
                            </td>

                            {/* COMPANY NAME & DOMAIN */}
                            <td className="py-4 px-4 sm:px-6">
                              <div className="font-bold text-white text-base sm:text-lg flex items-center gap-2">
                                <span>{entry.companyName}</span>
                                {entry.isBankrupt && (
                                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-950 border border-rose-800 text-rose-300">
                                    BANKRUPT
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-400 font-medium flex items-center gap-2 mt-0.5">
                                <span className="font-mono text-indigo-400">{entry.domainName}</span>
                                <span>•</span>
                                <span>Table {entry.tableStation}</span>
                              </div>
                            </td>

                            {/* VALUATION (COMPACT + CENTS ON HOVER) */}
                            <td className="py-4 px-4 sm:px-6 text-right font-mono font-bold text-emerald-400 text-base sm:text-lg">
                              <div>{formatCompactCurrency(entry.valuation)}</div>
                              <div className="text-[11px] text-slate-500 font-normal">
                                {formatCents(entry.valuation)}
                              </div>
                            </td>

                            {/* FOUNDER EQUITY */}
                            <td className="py-4 px-4 sm:px-6 text-right font-mono text-indigo-300 hidden sm:table-cell text-sm sm:text-base">
                              {(entry.founderEquityPercent ?? entry.retainedEquityPct ?? 0).toFixed(1)}%
                            </td>

                            {/* OFFICIAL SCORE */}
                            <td className="py-4 px-4 sm:px-6 text-right font-mono font-black text-amber-400 text-lg sm:text-xl">
                              {(entry.score ?? entry.finalScore ?? entry.equityAdjustedScore ?? 0).toFixed(2)}
                            </td>

                            {/* TREND / RANK MOVEMENT */}
                            <td className="py-4 px-4 sm:px-6 text-center">
                              {(() => {
                                const rankChange = entry.rankChange ?? entry.rankMovement ?? 0;
                                if (rankChange > 0) {
                                  return (
                                    <div className="inline-flex items-center gap-1 text-emerald-400 font-mono text-xs font-bold">
                                      <TrendingUp className="h-4 w-4" />
                                      <span>+{rankChange}</span>
                                    </div>
                                  );
                                }
                                if (rankChange < 0) {
                                  return (
                                    <div className="inline-flex items-center gap-1 text-rose-400 font-mono text-xs font-bold">
                                      <TrendingDown className="h-4 w-4" />
                                      <span>{rankChange}</span>
                                    </div>
                                  );
                                }
                                return <Minus className="h-4 w-4 text-slate-600 mx-auto" />;
                              })()}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>

        {/* BOTTOM AUDITORIUM STATUS FOOTER */}
        <footer className="flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 border-t border-slate-800/80 pt-4 mt-6 font-mono">
          <div className="flex items-center gap-2">
            <span>Capital Quest Tournament Engine v6.0</span>
            <span>•</span>
            <span>High-Contrast 1080p / 4K Mode</span>
          </div>

          <div className="flex items-center gap-4 mt-2 sm:mt-0">
            {lastSyncTime && (
              <span>Last live sync: {lastSyncTime.toLocaleTimeString()}</span>
            )}
            <span className="text-slate-600">|</span>
            <span className="text-emerald-400 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Projector Display Active
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
