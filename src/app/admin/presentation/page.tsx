'use client';

import * as React from 'react';
import {
  MonitorPlay,
  Trophy,
  Play,
  RotateCcw,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  ShieldAlert,
  Building2,
  BarChart3,
  RefreshCw,
  Award,
  Crown,
  Eye,
  CheckCircle2,
} from 'lucide-react';
import { AdminShell } from '@/components/layout/admin-shell';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

interface PresentationState {
  eventId: string;
  mode: 'standings' | 'domain' | 'highlights' | 'ceremony';
  selectedRoundNumber: number;
  domainFilter: string;
  ceremonyStage: 'waiting' | 'reveal_third' | 'reveal_second' | 'reveal_first' | 'podium';
  updatedAt: string;
  updatedBy?: string;
}

interface AdminPresentationResponse {
  state: PresentationState;
  event: {
    id: string;
    name: string;
    total_rounds: number;
    status: string;
  } | null;
  publishedRounds: {
    id: string;
    roundNumber: number;
    status: string;
  }[];
  isFinalRoundPublished: boolean;
  topThreeCandidatePreview: {
    rank: number;
    companyName: string;
    domainName: string;
    score: number;
    valuation: number;
    founderEquityPercent: number;
  }[];
}

const CEREMONY_STAGES: {
  id: PresentationState['ceremonyStage'];
  label: string;
  desc: string;
  badge: string;
}[] = [
  { id: 'waiting', label: '1. Waiting Screen', desc: 'Results hidden, suspenseful auditorium standby', badge: 'Standby' },
  { id: 'reveal_third', label: '2. Reveal 3rd Place', desc: 'Spotlight on Bronze medal finalist', badge: 'Bronze' },
  { id: 'reveal_second', label: '3. Reveal 2nd Place', desc: 'Spotlight on Silver medal finalist', badge: 'Silver' },
  { id: 'reveal_first', label: '4. Reveal 1st Champion', desc: 'Spotlight on Grand Champion gold honoree', badge: 'Gold' },
  { id: 'podium', label: '5. Full Winner Podium', desc: 'Grand celebratory 3-tier podium', badge: 'Podium' },
];

const DOMAIN_OPTIONS = [
  { id: 'ALL', label: 'All Domains' },
  { id: 'cleantech', label: 'CleanTech Hardware' },
  { id: 'healthtech', label: 'HealthTech Devices' },
  { id: 'saas', label: 'Enterprise SaaS' },
  { id: 'd2c', label: 'D2C Consumer Goods' },
];

export default function AdminPresentationPage() {
  const [data, setData] = React.useState<AdminPresentationResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = React.useState<string | null>(null);

  const fetchPresentationData = async () => {
    try {
      setErrorMessage(null);
      const res = await fetch('/api/admin/presentation');
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || 'Failed to load presentation controller data');
      }
      setData(json.data);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error loading presentation controller');
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    fetchPresentationData();
  }, []);

  const updateState = async (updates: Partial<PresentationState>) => {
    if (!data?.state?.eventId) return;
    setIsUpdating(true);
    setErrorMessage(null);
    setActionSuccess(null);

    try {
      const res = await fetch('/api/admin/presentation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: data.state.eventId,
          ...updates,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || 'Failed to update presentation state');
      }

      setData(prev => {
        if (!prev) return null;
        return {
          ...prev,
          state: json.data.presentationState,
        };
      });

      setActionSuccess('Projector state updated successfully');
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error updating presentation state');
    } finally {
      setIsUpdating(false);
    }
  };

  const currentState = data?.state;
  const isFinalRoundPublished = !!data?.isFinalRoundPublished;
  const activeRound = data?.publishedRounds?.find(r => r.roundNumber === currentState?.selectedRoundNumber);

  const currentCeremonyIndex = CEREMONY_STAGES.findIndex(s => s.id === currentState?.ceremonyStage);

  const handleNextCeremonyStep = () => {
    if (currentCeremonyIndex < CEREMONY_STAGES.length - 1) {
      updateState({
        mode: 'ceremony',
        ceremonyStage: CEREMONY_STAGES[currentCeremonyIndex + 1].id,
      });
    }
  };

  const handlePrevCeremonyStep = () => {
    if (currentCeremonyIndex > 0) {
      updateState({
        mode: 'ceremony',
        ceremonyStage: CEREMONY_STAGES[currentCeremonyIndex - 1].id,
      });
    }
  };

  const handleResetCeremony = () => {
    updateState({
      mode: 'ceremony',
      ceremonyStage: 'waiting',
    });
  };

  const launchProjector = () => {
    window.open('/presentation', 'CapitalQuestProjector', 'width=1920,height=1080');
  };

  return (
    <AdminShell
      eventName={data?.event?.name || 'Capital Quest 2026'}
      roundNumber={currentState?.selectedRoundNumber || 1}
      roundStatus={activeRound?.status || 'published'}
    >
      <div className="space-y-8 animate-in fade-in duration-200">
        {/* HEADER BAR */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-indigo-400 font-semibold tracking-wider uppercase">
                Stage & Ceremony Operations
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-xs text-slate-400">Auditorium Projector Master Controller</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1 flex items-center gap-2.5">
              <MonitorPlay className="h-7 w-7 text-indigo-400" />
              <span>Presenter Controller</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Synchronize projector display mode, published round views, domain rankings, and controlled winner reveal ceremony.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchPresentationData}
              disabled={isLoading || isUpdating}
              className="gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh State</span>
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={launchProjector}
              className="gap-1.5 bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 shadow-indigo-900/40"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Launch Projector Display</span>
            </Button>
          </div>
        </div>

        {errorMessage && (
          <Alert variant="error" title="Controller Action Error">
            {errorMessage}
          </Alert>
        )}

        {actionSuccess && (
          <Alert variant="success" title="State Updated">
            {actionSuccess}
          </Alert>
        )}

        {/* CONTROLLER GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT COLUMN: CONTROLS (8 COLS) */}
          <div className="lg:col-span-8 space-y-6">
            {/* 1. PRESENTATION MODE SWITCHER */}
            <Card className="border-slate-800 bg-[#0B101E]">
              <CardHeader className="pb-3 border-b border-slate-800/80">
                <CardTitle className="text-sm font-bold text-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MonitorPlay className="h-4 w-4 text-indigo-400" />
                    <span>Active Projector View Mode</span>
                  </div>
                  <Badge variant="domain" className="text-[10px]">
                    CURRENT: {currentState?.mode?.toUpperCase() || 'STANDINGS'}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <button
                    type="button"
                    onClick={() => updateState({ mode: 'standings' })}
                    disabled={isUpdating}
                    className={`p-3.5 rounded-xl border text-left transition-all ${
                      currentState?.mode === 'standings'
                        ? 'border-indigo-500 bg-indigo-950/40 shadow-lg shadow-indigo-950/50'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <Trophy className={`h-4 w-4 ${currentState?.mode === 'standings' ? 'text-indigo-400' : 'text-slate-400'}`} />
                      {currentState?.mode === 'standings' && (
                        <span className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
                      )}
                    </div>
                    <div className="text-sm font-bold text-white">Live Standings</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">Overall tournament rankings</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateState({ mode: 'domain' })}
                    disabled={isUpdating}
                    className={`p-3.5 rounded-xl border text-left transition-all ${
                      currentState?.mode === 'domain'
                        ? 'border-indigo-500 bg-indigo-950/40 shadow-lg shadow-indigo-950/50'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <Building2 className={`h-4 w-4 ${currentState?.mode === 'domain' ? 'text-indigo-400' : 'text-slate-400'}`} />
                      {currentState?.mode === 'domain' && (
                        <span className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
                      )}
                    </div>
                    <div className="text-sm font-bold text-white">Domain Focus</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">Domain-isolated standings</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateState({ mode: 'highlights' })}
                    disabled={isUpdating}
                    className={`p-3.5 rounded-xl border text-left transition-all ${
                      currentState?.mode === 'highlights'
                        ? 'border-indigo-500 bg-indigo-950/40 shadow-lg shadow-indigo-950/50'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <BarChart3 className={`h-4 w-4 ${currentState?.mode === 'highlights' ? 'text-indigo-400' : 'text-slate-400'}`} />
                      {currentState?.mode === 'highlights' && (
                        <span className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
                      )}
                    </div>
                    <div className="text-sm font-bold text-white">Round Highlights</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">Spotlight on top achievements</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (!isFinalRoundPublished) return;
                      updateState({ mode: 'ceremony' });
                    }}
                    disabled={isUpdating || !isFinalRoundPublished}
                    className={`p-3.5 rounded-xl border text-left transition-all ${
                      currentState?.mode === 'ceremony'
                        ? 'border-amber-500 bg-amber-950/40 shadow-lg shadow-amber-950/50'
                        : !isFinalRoundPublished
                        ? 'border-slate-800/50 bg-slate-900/20 opacity-50 cursor-not-allowed'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <Crown className={`h-4 w-4 ${currentState?.mode === 'ceremony' ? 'text-amber-400' : 'text-slate-400'}`} />
                      {currentState?.mode === 'ceremony' && (
                        <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                      )}
                    </div>
                    <div className="text-sm font-bold text-white flex items-center gap-1">
                      <span>Winner Reveal</span>
                      {!isFinalRoundPublished && <ShieldAlert className="h-3 w-3 text-amber-500" />}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">Final podium ceremony</div>
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* 2. ROUND SELECTION */}
            <Card className="border-slate-800 bg-[#0B101E]">
              <CardHeader className="pb-3 border-b border-slate-800/80">
                <CardTitle className="text-sm font-bold text-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Play className="h-4 w-4 text-emerald-400" />
                    <span>Projector Published Round</span>
                  </div>
                  <span className="text-xs text-slate-400">
                    Showing results up through official round
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {(!data?.publishedRounds || data.publishedRounds.length === 0) ? (
                  <div className="text-xs text-slate-400 p-4 border border-dashed border-slate-800 rounded-lg text-center">
                    No rounds have been officially published yet. Projector will display the Standby Waiting Screen.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2.5">
                    {data.publishedRounds.map(round => {
                      const isSelected = currentState?.selectedRoundNumber === round.roundNumber;
                      return (
                        <Button
                          key={round.id}
                          variant={isSelected ? 'primary' : 'outline'}
                          size="sm"
                          disabled={isUpdating}
                          onClick={() => updateState({ selectedRoundNumber: round.roundNumber })}
                          className={`gap-1.5 ${isSelected ? 'shadow-md shadow-indigo-900/40' : ''}`}
                        >
                          <span>Round {round.roundNumber}</span>
                          <Badge variant="published" className="text-[10px] py-0 px-1.5">
                            PUBLISHED
                          </Badge>
                        </Button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 3. DOMAIN FOCUS SELECTOR */}
            {currentState?.mode === 'domain' && (
              <Card className="border-slate-800 bg-[#0B101E] animate-in fade-in duration-150">
                <CardHeader className="pb-3 border-b border-slate-800/80">
                  <CardTitle className="text-sm font-bold text-white flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-indigo-400" />
                      <span>Domain Standings Filter</span>
                    </div>
                    <Badge variant="domain" className="text-[10px]">
                      {currentState?.domainFilter?.toUpperCase() || 'ALL'}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="flex flex-wrap gap-2">
                    {DOMAIN_OPTIONS.map(d => {
                      const isSelected = (currentState?.domainFilter || 'ALL').toLowerCase() === d.id.toLowerCase();
                      return (
                        <Button
                          key={d.id}
                          variant={isSelected ? 'primary' : 'outline'}
                          size="sm"
                          disabled={isUpdating}
                          onClick={() => updateState({ domainFilter: d.id })}
                          className="text-xs"
                        >
                          {d.label}
                        </Button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 4. WINNER REVEAL CEREMONY STEPPER */}
            <Card className={`border-slate-800 bg-[#0B101E] ${currentState?.mode === 'ceremony' ? 'ring-1 ring-amber-500/50' : ''}`}>
              <CardHeader className="pb-3 border-b border-slate-800/80">
                <CardTitle className="text-sm font-bold text-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Award className="h-4 w-4 text-amber-400" />
                    <span>Winner Reveal Ceremony Stepper</span>
                  </div>
                  <Badge variant={currentState?.mode === 'ceremony' ? 'warning' : 'secondary'} className="text-[10px]">
                    {currentState?.mode === 'ceremony' ? 'CEREMONY ACTIVE' : 'CEREMONY INACTIVE'}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                {!isFinalRoundPublished ? (
                  <div className="p-4 rounded-xl border border-amber-900/60 bg-amber-950/20 flex items-start gap-3 text-amber-300 text-xs">
                    <ShieldAlert className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-amber-200">Ceremony Locked — Final Round Unpublished</div>
                      <div className="text-amber-300/80 mt-0.5">
                        In accordance with tournament security rules, the winner reveal ceremony is strictly embargoed until the final round is officially published. Organizers cannot advance reveal stages until final scores are published.
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                      {CEREMONY_STAGES.map((stage, idx) => {
                        const isCurrent = currentState?.ceremonyStage === stage.id;
                        const isPast = currentCeremonyIndex > idx;
                        return (
                          <button
                            key={stage.id}
                            type="button"
                            onClick={() => updateState({ mode: 'ceremony', ceremonyStage: stage.id })}
                            disabled={isUpdating}
                            className={`p-2.5 rounded-lg border text-left transition-all ${
                              isCurrent
                                ? 'border-amber-400 bg-amber-950/50 text-white font-bold shadow-md shadow-amber-950/60'
                                : isPast
                                ? 'border-emerald-800/60 bg-emerald-950/20 text-emerald-300'
                                : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                              <span>STEP {idx + 1}</span>
                              {isCurrent ? (
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />
                              ) : isPast ? (
                                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                              ) : null}
                            </div>
                            <div className="text-xs font-semibold leading-tight">{stage.label.replace(/^\d\.\s/, '')}</div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handlePrevCeremonyStep}
                          disabled={isUpdating || currentCeremonyIndex <= 0}
                          className="gap-1 text-xs"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                          <span>Previous Step</span>
                        </Button>

                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handleNextCeremonyStep}
                          disabled={isUpdating || currentCeremonyIndex >= CEREMONY_STAGES.length - 1}
                          className="gap-1 text-xs bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/40"
                        >
                          <span>Advance Reveal</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleResetCeremony}
                        disabled={isUpdating}
                        className="text-xs text-slate-400 hover:text-rose-400 gap-1.5"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Reset to Waiting Screen</span>
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* RIGHT COLUMN: PREVIEWS & SUMMARY (4 COLS) */}
          <div className="lg:col-span-4 space-y-6">
            {/* 1. MINI PROJECTOR PREVIEW (16:9) */}
            <Card className="border-slate-800 bg-[#0B101E]">
              <CardHeader className="pb-3 border-b border-slate-800/80">
                <CardTitle className="text-sm font-bold text-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-emerald-400" />
                    <span>Projector Screen Preview</span>
                  </div>
                  <Badge variant="published" className="text-[9px] py-0">
                    LIVE PREVIEW
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                {/* 16:9 ASPECT CONTAINER */}
                <div className="relative aspect-video w-full rounded-lg border border-slate-700 bg-[#050811] p-3 flex flex-col justify-between overflow-hidden shadow-inner">
                  <div className="flex justify-between items-start text-[10px] text-slate-400 font-mono">
                    <span className="font-bold text-white">CAPITAL QUEST</span>
                    <span className="text-amber-400 uppercase">{currentState?.mode}</span>
                  </div>

                  <div className="text-center my-auto">
                    {currentState?.mode === 'ceremony' ? (
                      <div className="space-y-1">
                        <Trophy className="h-6 w-6 text-amber-400 mx-auto animate-bounce" />
                        <div className="text-xs font-bold text-amber-200">
                          {CEREMONY_STAGES.find(s => s.id === currentState?.ceremonyStage)?.label}
                        </div>
                        <div className="text-[9px] text-slate-400">
                          {currentState?.ceremonyStage === 'waiting'
                            ? 'Suspenseful Standby Screen'
                            : 'Spotlight Reveal Active'}
                        </div>
                      </div>
                    ) : currentState?.mode === 'highlights' ? (
                      <div className="space-y-1">
                        <Sparkles className="h-6 w-6 text-indigo-400 mx-auto" />
                        <div className="text-xs font-bold text-white">Round {currentState?.selectedRoundNumber} Highlights</div>
                        <div className="text-[9px] text-slate-400">Pioneers, Growth & Revenue Leaders</div>
                      </div>
                    ) : currentState?.mode === 'domain' ? (
                      <div className="space-y-1">
                        <Building2 className="h-6 w-6 text-emerald-400 mx-auto" />
                        <div className="text-xs font-bold text-white">{currentState?.domainFilter?.toUpperCase()} Standings</div>
                        <div className="text-[9px] text-slate-400">Round {currentState?.selectedRoundNumber} Rankings</div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Trophy className="h-6 w-6 text-indigo-400 mx-auto" />
                        <div className="text-xs font-bold text-white">Live Tournament Standings</div>
                        <div className="text-[9px] text-slate-400">Round {currentState?.selectedRoundNumber} Official Ranks</div>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between items-center text-[9px] text-slate-500 font-mono">
                    <span>16:9 Scale</span>
                    <span className="text-emerald-400 flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Active
                    </span>
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 text-center">
                  Auditorium display refreshes within 2–3 seconds of any controller action.
                </div>
              </CardContent>
            </Card>

            {/* 2. CONFIDENTIAL ORGANIZER WINNER PREVIEW */}
            <Card className="border-slate-800 bg-[#0B101E]">
              <CardHeader className="pb-3 border-b border-slate-800/80">
                <CardTitle className="text-sm font-bold text-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Crown className="h-4 w-4 text-amber-400" />
                    <span>Organizer Script Preview</span>
                  </div>
                  <Badge variant="domain" className="text-[9px] py-0">
                    HOST ONLY
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                <p className="text-[11px] text-slate-400">
                  Authoritative top 3 finalists from officially published final results. Use this card to coordinate stage announcements.
                </p>

                {(!data?.topThreeCandidatePreview || data.topThreeCandidatePreview.length === 0) ? (
                  <div className="text-xs text-slate-500 p-3 border border-dashed border-slate-800 rounded-lg text-center">
                    Top 3 winners unavailable until final round is published.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.topThreeCandidatePreview.map(winner => (
                      <div
                        key={winner.rank}
                        className={`p-2.5 rounded-lg border flex items-center justify-between ${
                          winner.rank === 1
                            ? 'border-amber-500/50 bg-amber-950/20'
                            : winner.rank === 2
                            ? 'border-slate-400/50 bg-slate-800/30'
                            : 'border-amber-800/40 bg-amber-950/10'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`h-6 w-6 rounded-full flex items-center justify-center font-bold text-xs ${
                              winner.rank === 1
                                ? 'bg-amber-400 text-slate-950'
                                : winner.rank === 2
                                ? 'bg-slate-300 text-slate-950'
                                : 'bg-amber-700 text-white'
                            }`}
                          >
                            {winner.rank}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-white">{winner.companyName}</div>
                            <div className="text-[10px] text-slate-400">{winner.domainName}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-mono font-bold text-emerald-400">
                            {winner.score.toFixed(2)} pts
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            ${(winner.valuation / 1000).toFixed(0)}k val
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
