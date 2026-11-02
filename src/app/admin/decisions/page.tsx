'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  FileEdit,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  Lock,
  Search,
  TrendingUp,
  Info,
} from 'lucide-react';
import { AdminShell } from '@/components/layout/admin-shell';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';

interface ExistingDecision {
  id: string;
  status: 'missing' | 'entered' | 'verified' | 'flagged' | 'locked';
  marketingBudget: number;
  rdBudget: number;
  productionUnits: number;
  unitPrice: number;
  operationsBudget: number;
  investmentDecision: 'none' | 'offer_a' | 'offer_b' | 'reject_both';
  enteredBy?: string;
  enteredAt?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  adminOverrideNotes?: string;
}

interface DynamicOfferInfo {
  name: string;
  investmentAmount: number;
  equityStakePct: number;
}

interface TeamInvestorOfferInfo {
  id?: string;
  confidenceTier?: string;
  offerA: DynamicOfferInfo;
  offerB: DynamicOfferInfo;
  selectedChoice: 'none' | 'offer_a' | 'offer_b' | 'reject_both';
  isConfirmed: boolean;
  confirmedAt?: string | null;
}

interface TeamDecisionEntry {
  teamId: string;
  teamCode: string;
  companyName: string;
  tableStation?: string;
  domainId: string;
  domainCode: string;
  domainName: string;
  baseDemand: number;
  benchmarkPrice: number;
  minAllowedPrice: number;
  maxAllowedPrice: number;
  baseUnitCogs: number;
  availableCash: number;
  currentFounderEquityPct?: number;
  investorOffer?: TeamInvestorOfferInfo | null;
  decision: ExistingDecision | null;
}

interface RoundData {
  round: {
    id: string;
    roundNumber: number;
    status: string;
    type: string;
    eventId: string;
  };
  stats: {
    total: number;
    verifiedCount: number;
    enteredCount: number;
    missingCount: number;
    flaggedCount: number;
    isReadyToLock: boolean;
  };
  teams: TeamDecisionEntry[];
  allRounds?: Array<{
    id: string;
    roundNumber: number;
    status: string;
    type: string;
  }>;
}

function AdminDecisionsContent() {
  const searchParams = useSearchParams();
  const initialTeamId = searchParams.get('teamId') || '';
  const initialRoundId = searchParams.get('roundId') || '';

  const [data, setData] = React.useState<RoundData | null>(null);
  const [selectedRoundId, setSelectedRoundId] = React.useState<string>(initialRoundId);
  const [selectedTeamId, setSelectedTeamId] = React.useState<string>(initialTeamId);
  const [searchFilter, setSearchFilter] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

  // Form Fields
  const [marketingBudget, setMarketingBudget] = React.useState<string>('');
  const [rdBudget, setRdBudget] = React.useState<string>('');
  const [productionUnits, setProductionUnits] = React.useState<string>('');
  const [unitPrice, setUnitPrice] = React.useState<string>('');
  const [operationsBudget, setOperationsBudget] = React.useState<string>('');
  const [investmentDecision, setInvestmentDecision] = React.useState<'none' | 'offer_a' | 'offer_b' | 'reject_both'>('none');
  const [adminNotes, setAdminNotes] = React.useState<string>('');

  // Investor Offer Confirmation Modal State
  const [confirmModalOpen, setConfirmModalOpen] = React.useState(false);
  const [pendingOfferChoice, setPendingOfferChoice] = React.useState<'offer_a' | 'offer_b' | 'reject_both' | null>(null);
  const [isConfirmingOffer, setIsConfirmingOffer] = React.useState(false);

  const mktRef = React.useRef<HTMLInputElement>(null);

  const fetchRoundData = React.useCallback(async (targetTeamId?: string, targetRoundId?: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const activeRound = targetRoundId !== undefined ? targetRoundId : selectedRoundId;
      const url = activeRound ? `/api/admin/decisions?roundId=${encodeURIComponent(activeRound)}` : '/api/admin/decisions';
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || json.message || 'Failed to load round decisions');
      }
      const roundData: RoundData = json.data;
      setData(roundData);
      if (roundData.round?.id) {
        setSelectedRoundId(roundData.round.id);
      }

      // Determine active team
      const targetId = targetTeamId || selectedTeamId;
      const found = roundData.teams.find(t => t.teamId === targetId);
      if (found) {
        setSelectedTeamId(found.teamId);
        populateForm(found);
      } else if (roundData.teams.length > 0) {
        setSelectedTeamId(roundData.teams[0].teamId);
        populateForm(roundData.teams[0]);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error loading tournament data');
    } finally {
      setIsLoading(false);
    }
  }, [selectedTeamId, selectedRoundId]);

  React.useEffect(() => {
    fetchRoundData(initialTeamId, initialRoundId || undefined);
  }, [initialTeamId, initialRoundId, fetchRoundData]);

  const populateForm = (team: TeamDecisionEntry) => {
    if (team.decision) {
      setMarketingBudget(team.decision.marketingBudget.toString());
      setRdBudget(team.decision.rdBudget.toString());
      setProductionUnits(team.decision.productionUnits.toString());
      setUnitPrice(team.decision.unitPrice.toString());
      setOperationsBudget(team.decision.operationsBudget.toString());
      const effectiveInv = team.investorOffer?.isConfirmed && team.investorOffer?.selectedChoice !== 'none'
        ? team.investorOffer.selectedChoice
        : (team.decision.investmentDecision || 'none');
      setInvestmentDecision(effectiveInv);
      setAdminNotes(team.decision.adminOverrideNotes || '');
    } else {
      setMarketingBudget('');
      setRdBudget('');
      setProductionUnits('');
      setUnitPrice(team.benchmarkPrice.toString());
      setOperationsBudget('');
      const effectiveInv = team.investorOffer?.isConfirmed && team.investorOffer?.selectedChoice !== 'none'
        ? team.investorOffer.selectedChoice
        : 'none';
      setInvestmentDecision(effectiveInv);
      setAdminNotes('');
    }
    setErrorMsg(null);
    setSuccessMsg(null);
  };


  const handleConfirmInvestorChoice = async () => {
    if (!pendingOfferChoice || !selectedTeam || !data?.round) return;
    setIsConfirmingOffer(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/rounds/${data.round.id}/investor-offers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: selectedTeam.teamId,
          choice: pendingOfferChoice,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || json.message || 'Failed to confirm investor choice');
      }
      setInvestmentDecision(pendingOfferChoice);
      setSuccessMsg(
        `Successfully confirmed ${
          pendingOfferChoice === 'reject_both'
            ? 'rejection of both offers'
            : pendingOfferChoice === 'offer_a'
            ? 'Offer A'
            : 'Offer B'
        } for ${selectedTeam.companyName}.`
      );
      setConfirmModalOpen(false);
      setPendingOfferChoice(null);
      await fetchRoundData(selectedTeam.teamId, data.round.id);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error confirming investor offer');
    } finally {
      setIsConfirmingOffer(false);
    }
  };

  const handleSelectTeam = (team: TeamDecisionEntry) => {
    setSelectedTeamId(team.teamId);
    populateForm(team);
    setTimeout(() => {
      mktRef.current?.focus();
    }, 50);
  };

  const selectedTeam = data?.teams.find(t => t.teamId === selectedTeamId);
  const isRoundLocked = data?.round.status === 'locked' || data?.round.status === 'simulated' || data?.round.status === 'completed';
  const isDecisionLocked = selectedTeam?.decision?.status === 'locked' || isRoundLocked;
  const isInvestmentAllowed = data?.round.roundNumber === 2 || data?.round.roundNumber === 4;

  // Numeric parsers
  const numMkt = parseFloat(marketingBudget) || 0;
  const numRd = parseFloat(rdBudget) || 0;
  const numProd = parseInt(productionUnits, 10) || 0;
  const numPrice = parseFloat(unitPrice) || 0;
  const numOps = parseFloat(operationsBudget) || 0;

  // Domain constraints
  const baseUnitCogs = selectedTeam?.baseUnitCogs ?? 100;
  const availableCash = selectedTeam?.availableCash ?? 1000000;
  const minPrice = selectedTeam?.minAllowedPrice ?? 500;
  const maxPrice = selectedTeam?.maxAllowedPrice ?? 2000;

  // Solvency calculations
  const calculatedMfgCost = numProd * baseUnitCogs;
  const totalPlannedOutflow = numMkt + numRd + numOps + calculatedMfgCost;
  const cashDeficit = totalPlannedOutflow - availableCash;
  const isOverspent = cashDeficit > 0.001;

  // Price validation
  const isPriceValid = numPrice >= minPrice && numPrice <= maxPrice;

  const handleConfirmDecision = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!data?.round) return;
    if (!selectedTeam) {
      setErrorMsg('Please select a team.');
      return;
    }

    if (data.round.status !== 'open') {
      setErrorMsg(
        `Round ${data.round.roundNumber} is currently in '${data.round.status.toUpperCase()}' status. Decisions can only be confirmed for an OPEN round. Please open Round ${data.round.roundNumber} from Round Control before confirming decisions.`
      );
      return;
    }

    if (isOverspent) {
      setErrorMsg(
        `Planned cash outflow ($${totalPlannedOutflow.toLocaleString()}) exceeds available liquid cash ($${availableCash.toLocaleString()}) by $${cashDeficit.toLocaleString()}. Overspending decisions are strictly rejected per tournament rules.`
      );
      return;
    }

    if (!isPriceValid) {
      setErrorMsg(
        `Unit price ($${numPrice}) must be between the domain bounds of $${minPrice.toLocaleString()} and $${maxPrice.toLocaleString()}.`
      );
      return;
    }

    if (!isInvestmentAllowed && investmentDecision !== 'none') {
      setErrorMsg(`Investment options are only available in Rounds 2 and 4.`);
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/admin/decisions/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roundId: data.round.id,
          teamId: selectedTeam.teamId,
          marketingBudget: numMkt,
          rdBudget: numRd,
          productionUnits: numProd,
          unitPrice: numPrice,
          operationsBudget: numOps,
          investmentDecision,
          adminNotes: adminNotes.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || json.message || 'Confirmation failed');
      }

      setSuccessMsg(`Decision for ${selectedTeam.teamCode} (${selectedTeam.companyName}) confirmed and verified successfully.`);

      // Advance to next unverified team if available
      const nextTeam = data.teams.find(t => t.teamId !== selectedTeam.teamId && (!t.decision || (t.decision.status !== 'verified' && t.decision.status !== 'locked')));

      await fetchRoundData(nextTeam ? nextTeam.teamId : selectedTeam.teamId);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error confirming decision.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredTeams = (data?.teams || []).filter(t => {
    const q = searchFilter.toLowerCase();
    return (
      t.teamCode.toLowerCase().includes(q) ||
      t.companyName.toLowerCase().includes(q) ||
      t.domainCode.toLowerCase().includes(q) ||
      (t.tableStation && t.tableStation.toLowerCase().includes(q))
    );
  });

  return (
    <AdminShell
      roundNumber={data?.round.roundNumber || 1}
      roundStatus={data?.round.status || 'open'}
    >
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-emerald-400 font-semibold uppercase">
                Single-Admin Simulator Console
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-xs text-slate-400">Decision Entry & Review</span>
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight mt-1 flex items-center gap-2">
              <FileEdit className="h-6 w-6 text-emerald-400" />
              <span>Admin Decision Entry & Verification</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Enter and confirm team decisions directly with automated solvency enforcement and instant audit verification.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/admin/readiness">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5 text-amber-400" />
                <span>Round Readiness ({data?.stats.verifiedCount || 0}/{data?.stats.total || 0})</span>
              </Button>
            </Link>

            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchRoundData()}
              isLoading={isLoading}
              className="gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Refresh</span>
            </Button>
          </div>
        </div>

        {/* ROUND SELECTOR PILLS */}
        {data?.allRounds && data.allRounds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pb-1 border-b border-slate-800/60">
            <span className="text-xs font-mono text-slate-400 mr-1 uppercase font-semibold">Round:</span>
            {data.allRounds.map((r) => {
              const isSelected = r.id === data.round.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    if (r.id !== data.round.id) {
                      fetchRoundData(undefined, r.id);
                    }
                  }}
                  className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-all flex items-center gap-2 border ${
                    isSelected
                      ? 'bg-sky-600 text-white border-sky-500 font-bold shadow-md shadow-sky-950'
                      : 'bg-slate-900/80 text-slate-300 border-slate-800 hover:text-white hover:bg-slate-800/90'
                  }`}
                >
                  <span>Round {r.roundNumber}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-mono uppercase font-semibold ${
                      r.status === 'open'
                        ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                        : r.status === 'locked'
                        ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                        : r.status === 'simulated' || r.status === 'published'
                        ? 'bg-purple-950/80 text-purple-300 border border-purple-800/60'
                        : 'bg-slate-950 text-slate-500 border border-slate-800'
                    }`}
                  >
                    {r.status}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* PROGRESS BANNER */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 bg-[#0C1322] border border-slate-800 rounded-lg">
            <div className="text-[11px] font-mono text-slate-400 uppercase">Total Teams</div>
            <div className="text-xl font-bold font-mono text-white mt-0.5">{data?.stats.total || 0}</div>
          </div>
          <div className="p-3 bg-[#0C1322] border border-emerald-900/40 rounded-lg">
            <div className="text-[11px] font-mono text-emerald-400 uppercase">Verified & Approved</div>
            <div className="text-xl font-bold font-mono text-emerald-400 mt-0.5">{data?.stats.verifiedCount || 0}</div>
          </div>
          <div className="p-3 bg-[#0C1322] border border-amber-900/40 rounded-lg">
            <div className="text-[11px] font-mono text-amber-400 uppercase">Pending Review</div>
            <div className="text-xl font-bold font-mono text-amber-400 mt-0.5">{data?.stats.enteredCount || 0}</div>
          </div>
          <div className="p-3 bg-[#0C1322] border border-rose-900/40 rounded-lg">
            <div className="text-[11px] font-mono text-rose-400 uppercase">Missing Decisions</div>
            <div className="text-xl font-bold font-mono text-rose-400 mt-0.5">{data?.stats.missingCount || 0}</div>
          </div>
        </div>

        {data?.round.status === 'draft' && (
          <Alert variant="warning" title={`Round ${data.round.roundNumber} in Draft Status`}>
            Round {data.round.roundNumber} has not been opened yet. Decision entry and verification are only permitted when the round is OPEN. Please open Round {data.round.roundNumber} from{' '}
            <Link href="/admin/rounds" className="underline font-bold text-amber-300 hover:text-amber-200">
              Round Control
            </Link>{' '}
            before submitting decisions.
          </Alert>
        )}

        {errorMsg && (
          <Alert variant="error" title="Validation or System Error">
            {errorMsg}
          </Alert>
        )}

        {successMsg && (
          <Alert variant="success" title="Decision Confirmed">
            {successMsg}
          </Alert>
        )}

        {/* MAIN WORKSPACE GRID: ROSTER SIDEBAR + DECISION FORM */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* ROSTER SIDEBAR (4 cols) */}
          <div className="lg:col-span-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <Input
                placeholder="Filter teams..."
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                className="pl-9 h-9 text-xs bg-[#0C1322] border-slate-800"
              />
            </div>

            <div className="space-y-1.5 max-h-[620px] overflow-y-auto pr-1">
              {filteredTeams.map(t => {
                const isSelected = t.teamId === selectedTeamId;
                const status = t.decision?.status || 'missing';

                return (
                  <button
                    key={t.teamId}
                    type="button"
                    onClick={() => handleSelectTeam(t)}
                    className={`w-full text-left p-3 rounded-lg border transition-all flex items-center justify-between ${
                      isSelected
                        ? 'bg-indigo-950/40 border-indigo-500 text-white shadow-sm'
                        : 'bg-[#0C1322] border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-white">{t.teamCode}</span>
                        <Badge variant="domain" className="text-[10px] px-1.5 py-0">{t.domainCode}</Badge>
                      </div>
                      <div className="text-xs font-semibold truncate text-slate-200 mt-0.5">{t.companyName}</div>
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                        Treasury: ${t.availableCash.toLocaleString()}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <Badge
                        variant={
                          status === 'verified' || status === 'locked'
                            ? 'verified'
                            : status === 'entered'
                            ? 'entered'
                            : status === 'flagged'
                            ? 'flagged'
                            : 'missing'
                        }
                        indicator
                        className="text-[10px]"
                      >
                        {status.toUpperCase()}
                      </Badge>
                    </div>
                  </button>
                );
              })}

              {filteredTeams.length === 0 && (
                <div className="text-center py-8 text-xs text-slate-500">
                  No teams matching search filter.
                </div>
              )}
            </div>
          </div>

          {/* DECISION ENTRY & CONFIRMATION PANEL (8 cols) */}
          <div className="lg:col-span-8">
            {selectedTeam ? (
              <Card className="border-slate-800 bg-[#0C1322]">
                <CardHeader className="border-b border-slate-800/80 pb-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-bold text-amber-400">
                          {selectedTeam.teamCode}
                        </span>
                        <span className="text-slate-600">•</span>
                        <span className="text-sm font-semibold text-white">
                          {selectedTeam.companyName}
                        </span>
                        <Badge variant="domain">{selectedTeam.domainCode}</Badge>
                      </div>
                      <div className="text-xs text-slate-400 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                        <span>Market Demand: <strong className="text-slate-200">{selectedTeam.baseDemand.toLocaleString()} units</strong></span>
                        <span>Price Bounds: <strong className="text-slate-200">${minPrice} – ${maxPrice}</strong></span>
                        <span>Unit COGS: <strong className="text-slate-200">${baseUnitCogs}</strong></span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          selectedTeam.decision?.status === 'verified' || selectedTeam.decision?.status === 'locked'
                            ? 'verified'
                            : selectedTeam.decision?.status === 'entered'
                            ? 'entered'
                            : 'missing'
                        }
                        indicator
                      >
                        {selectedTeam.decision?.status ? selectedTeam.decision.status.toUpperCase() : 'MISSING'}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-6">
                  {isDecisionLocked && (
                    <div className="mb-6 p-3 bg-amber-950/30 border border-amber-800/50 rounded-lg flex items-center gap-2 text-amber-300 text-xs">
                      <Lock className="h-4 w-4 shrink-0 text-amber-400" />
                      <span>This round or decision is LOCKED. Decision values are frozen and cannot be edited.</span>
                    </div>
                  )}

                  {selectedTeam.decision?.status === 'verified' && !isDecisionLocked && (
                    <div className="mb-6 p-3 bg-emerald-950/20 border border-emerald-800/40 rounded-lg flex items-center justify-between text-emerald-300 text-xs">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
                        <span>Decision is verified and approved. You may update and re-confirm if needed before round locking.</span>
                      </div>
                    </div>
                  )}

                  <form onSubmit={handleConfirmDecision} noValidate className="space-y-6">
                    {/* 5 CORE DECISION INPUTS */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* MARKETING */}
                      <div>
                        <label className="block text-xs font-mono font-medium text-slate-300 mb-1">
                          Marketing Budget ($)
                        </label>
                        <Input
                          ref={mktRef}
                          type="number"
                          min="0"
                          step="any"
                          placeholder="e.g. 150000"
                          value={marketingBudget}
                          onChange={e => setMarketingBudget(e.target.value)}
                          disabled={isDecisionLocked || isSubmitting}
                          className="bg-[#080D1A] border-slate-700 font-mono text-sm"
                        />
                        <span className="text-[10px] text-slate-500 mt-0.5 block">Driver of customer acquisition and brand equity</span>
                      </div>

                      {/* R&D */}
                      <div>
                        <label className="block text-xs font-mono font-medium text-slate-300 mb-1">
                          R&D Budget ($)
                        </label>
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          placeholder="e.g. 120000"
                          value={rdBudget}
                          onChange={e => setRdBudget(e.target.value)}
                          disabled={isDecisionLocked || isSubmitting}
                          className="bg-[#080D1A] border-slate-700 font-mono text-sm"
                        />
                        <span className="text-[10px] text-slate-500 mt-0.5 block">Cumulative product quality score enhancer</span>
                      </div>

                      {/* PRODUCTION UNITS */}
                      <div>
                        <label className="block text-xs font-mono font-medium text-slate-300 mb-1">
                          Production Volume (Units)
                        </label>
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          placeholder="e.g. 1200"
                          value={productionUnits}
                          onChange={e => setProductionUnits(e.target.value)}
                          disabled={isDecisionLocked || isSubmitting}
                          className="bg-[#080D1A] border-slate-700 font-mono text-sm"
                        />
                        <span className="text-[10px] text-slate-400 mt-0.5 block font-mono">
                          Manufacturing Cost: ${(numProd * baseUnitCogs).toLocaleString()} (${baseUnitCogs}/unit)
                        </span>
                      </div>

                      {/* UNIT PRICE */}
                      <div>
                        <label className="block text-xs font-mono font-medium text-slate-300 mb-1">
                          Unit Selling Price ($)
                        </label>
                        <Input
                          type="number"
                          min={minPrice}
                          max={maxPrice}
                          step="any"
                          placeholder={`Benchmark: $${selectedTeam.benchmarkPrice}`}
                          value={unitPrice}
                          onChange={e => setUnitPrice(e.target.value)}
                          disabled={isDecisionLocked || isSubmitting}
                          className={`bg-[#080D1A] font-mono text-sm ${!isPriceValid && unitPrice ? 'border-rose-500' : 'border-slate-700'}`}
                        />
                        <span className={`text-[10px] mt-0.5 block font-mono ${!isPriceValid && unitPrice ? 'text-rose-400 font-semibold' : 'text-slate-500'}`}>
                          Allowed: ${minPrice} – ${maxPrice} (Benchmark: ${selectedTeam.benchmarkPrice})
                        </span>
                      </div>

                      {/* OPERATIONS BUDGET */}
                      <div>
                        <label className="block text-xs font-mono font-medium text-slate-300 mb-1">
                          Operations Budget ($)
                        </label>
                        <Input
                          type="number"
                          min="0"
                          step="1000"
                          placeholder="e.g. 50000"
                          value={operationsBudget}
                          onChange={e => setOperationsBudget(e.target.value)}
                          disabled={isDecisionLocked || isSubmitting}
                          className="bg-[#080D1A] border-slate-700 font-mono text-sm"
                        />
                        <span className="text-[10px] text-slate-500 mt-0.5 block">Logistics and internal efficiency allocation</span>
                      </div>

                      {/* DYNAMIC INVESTOR FUNDING OPPORTUNITY SECTION (Rounds 2 & 4) */}
                      {isInvestmentAllowed ? (
                        <div className="col-span-1 md:col-span-2 p-4 bg-[#070C18] border border-indigo-900/40 rounded-xl space-y-4">
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-indigo-950 pb-3">
                            <div className="flex items-center gap-2">
                              <TrendingUp className="h-4 w-4 text-indigo-400" />
                              <span className="text-xs font-mono font-bold uppercase tracking-wider text-indigo-300">
                                Investor Funding Opportunity (Round {data?.round.roundNumber})
                              </span>
                            </div>
                            {selectedTeam?.investorOffer?.isConfirmed ? (
                              <Badge variant="success" className="text-[11px] gap-1 px-2.5 py-0.5 font-mono">
                                <Lock className="h-3 w-3" /> Confirmed & Permanently Locked
                              </Badge>
                            ) : (
                              <Badge variant="warning" className="text-[11px] gap-1 px-2.5 py-0.5 font-mono">
                                Pending Decision Confirmation
                              </Badge>
                            )}
                          </div>

                          {/* Founder equity baseline */}
                          <div className="text-xs font-mono text-slate-300 flex items-center justify-between bg-slate-900/60 px-3 py-2 rounded-lg border border-slate-800">
                            <span>Current Retained Founder Equity:</span>
                            <span className="font-bold text-white">
                              {(selectedTeam?.currentFounderEquityPct ?? 100).toFixed(1)}%
                            </span>
                          </div>

                          {/* Three Side-by-Side Term Sheets */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {/* OFFER A CARD */}
                            {(() => {
                              const offerA = selectedTeam?.investorOffer?.offerA ?? {
                                name: data?.round.roundNumber === 2 ? 'Seed Conservative Partner' : 'Series A Growth Partner',
                                investmentAmount: 200000,
                                equityStakePct: 10.0,
                              };
                              const founderBefore = selectedTeam?.currentFounderEquityPct ?? 100;
                              const founderAfter = founderBefore * (1 - offerA.equityStakePct / 100);
                              const isSelected = investmentDecision === 'offer_a';
                              const isConfirmedOffer = selectedTeam?.investorOffer?.isConfirmed && selectedTeam?.investorOffer?.selectedChoice === 'offer_a';

                              return (
                                <div
                                  className={`p-3.5 rounded-lg border transition-all flex flex-col justify-between ${
                                    isConfirmedOffer
                                      ? 'bg-emerald-950/30 border-emerald-500 shadow-md'
                                      : isSelected
                                      ? 'bg-indigo-950/40 border-indigo-400 shadow-md'
                                      : 'bg-[#0B1120] border-slate-800 hover:border-slate-700'
                                  }`}
                                >
                                  <div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-indigo-400">
                                        Offer A
                                      </span>
                                      {isConfirmedOffer && (
                                        <Badge variant="success" className="text-[9px] px-1 py-0">LOCKED</Badge>
                                      )}
                                    </div>
                                    <div className="text-xs font-semibold text-white mt-1">
                                      {offerA.name}
                                    </div>
                                    <div className="mt-2 text-lg font-bold font-mono text-emerald-400">
                                      +${offerA.investmentAmount.toLocaleString()}
                                    </div>
                                    <div className="text-[11px] font-mono text-amber-300 mt-0.5">
                                      for {offerA.equityStakePct.toFixed(1)}% Equity Stake
                                    </div>

                                    {/* Equity Preview */}
                                    <div className="mt-3 pt-2.5 border-t border-slate-800/80 space-y-1 text-[11px] font-mono">
                                      <div className="flex justify-between text-slate-400">
                                        <span>Founder Equity:</span>
                                        <span className="text-white font-medium">
                                          {founderBefore.toFixed(1)}% → {founderAfter.toFixed(2)}%
                                        </span>
                                      </div>
                                      <div className="flex justify-between text-slate-400">
                                        <span>Investor Stake:</span>
                                        <span className="text-amber-300 font-medium">
                                          {offerA.equityStakePct.toFixed(2)}%
                                        </span>
                                      </div>
                                      <div className="flex justify-between text-slate-400">
                                        <span>Cash Inflow:</span>
                                        <span className="text-emerald-400 font-medium">
                                          +${offerA.investmentAmount.toLocaleString()}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="mt-4 pt-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant={isConfirmedOffer ? 'emerald' : isSelected ? 'primary' : 'secondary'}
                                      disabled={isDecisionLocked || Boolean(selectedTeam?.investorOffer?.isConfirmed) || data?.round.status !== 'open'}
                                      onClick={() => {
                                        setPendingOfferChoice('offer_a');
                                        setConfirmModalOpen(true);
                                      }}
                                      className="w-full text-xs font-bold"
                                    >
                                      {isConfirmedOffer ? 'Accepted & Locked' : isSelected ? 'Selected (Offer A)' : 'Accept Offer A'}
                                    </Button>
                                  </div>
                                </div>
                              );
                            })()}

                            {/* OFFER B CARD */}
                            {(() => {
                              const offerB = selectedTeam?.investorOffer?.offerB ?? {
                                name: data?.round.roundNumber === 2 ? 'Seed Strategic VC' : 'Series A Growth Fund',
                                investmentAmount: 350000,
                                equityStakePct: 20.0,
                              };
                              const founderBefore = selectedTeam?.currentFounderEquityPct ?? 100;
                              const founderAfter = founderBefore * (1 - offerB.equityStakePct / 100);
                              const isSelected = investmentDecision === 'offer_b';
                              const isConfirmedOffer = selectedTeam?.investorOffer?.isConfirmed && selectedTeam?.investorOffer?.selectedChoice === 'offer_b';

                              return (
                                <div
                                  className={`p-3.5 rounded-lg border transition-all flex flex-col justify-between ${
                                    isConfirmedOffer
                                      ? 'bg-emerald-950/30 border-emerald-500 shadow-md'
                                      : isSelected
                                      ? 'bg-indigo-950/40 border-indigo-400 shadow-md'
                                      : 'bg-[#0B1120] border-slate-800 hover:border-slate-700'
                                  }`}
                                >
                                  <div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-purple-400">
                                        Offer B
                                      </span>
                                      {isConfirmedOffer && (
                                        <Badge variant="success" className="text-[9px] px-1 py-0">LOCKED</Badge>
                                      )}
                                    </div>
                                    <div className="text-xs font-semibold text-white mt-1">
                                      {offerB.name}
                                    </div>
                                    <div className="mt-2 text-lg font-bold font-mono text-emerald-400">
                                      +${offerB.investmentAmount.toLocaleString()}
                                    </div>
                                    <div className="text-[11px] font-mono text-purple-300 mt-0.5">
                                      for {offerB.equityStakePct.toFixed(1)}% Equity Stake
                                    </div>

                                    {/* Equity Preview */}
                                    <div className="mt-3 pt-2.5 border-t border-slate-800/80 space-y-1 text-[11px] font-mono">
                                      <div className="flex justify-between text-slate-400">
                                        <span>Founder Equity:</span>
                                        <span className="text-white font-medium">
                                          {founderBefore.toFixed(1)}% → {founderAfter.toFixed(2)}%
                                        </span>
                                      </div>
                                      <div className="flex justify-between text-slate-400">
                                        <span>Investor Stake:</span>
                                        <span className="text-purple-300 font-medium">
                                          {offerB.equityStakePct.toFixed(2)}%
                                        </span>
                                      </div>
                                      <div className="flex justify-between text-slate-400">
                                        <span>Cash Inflow:</span>
                                        <span className="text-emerald-400 font-medium">
                                          +${offerB.investmentAmount.toLocaleString()}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="mt-4 pt-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant={isConfirmedOffer ? 'emerald' : isSelected ? 'primary' : 'secondary'}
                                      disabled={isDecisionLocked || Boolean(selectedTeam?.investorOffer?.isConfirmed) || data?.round.status !== 'open'}
                                      onClick={() => {
                                        setPendingOfferChoice('offer_b');
                                        setConfirmModalOpen(true);
                                      }}
                                      className="w-full text-xs font-bold"
                                    >
                                      {isConfirmedOffer ? 'Accepted & Locked' : isSelected ? 'Selected (Offer B)' : 'Accept Offer B'}
                                    </Button>
                                  </div>
                                </div>
                              );
                            })()}

                            {/* REJECT BOTH OFFERS CARD */}
                            {(() => {
                              const founderBefore = selectedTeam?.currentFounderEquityPct ?? 100;
                              const isSelected = investmentDecision === 'reject_both';
                              const isConfirmedOffer = selectedTeam?.investorOffer?.isConfirmed && selectedTeam?.investorOffer?.selectedChoice === 'reject_both';

                              return (
                                <div
                                  className={`p-3.5 rounded-lg border transition-all flex flex-col justify-between ${
                                    isConfirmedOffer
                                      ? 'bg-rose-950/30 border-rose-500 shadow-md'
                                      : isSelected
                                      ? 'bg-slate-800/60 border-slate-400 shadow-md'
                                      : 'bg-[#0B1120] border-slate-800 hover:border-slate-700'
                                  }`}
                                >
                                  <div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-rose-400">
                                        Alternative
                                      </span>
                                      {isConfirmedOffer && (
                                        <Badge variant="error" className="text-[9px] px-1 py-0">REJECTED</Badge>
                                      )}
                                    </div>
                                    <div className="text-xs font-semibold text-white mt-1">
                                      Reject Both Offers
                                    </div>
                                    <div className="mt-2 text-lg font-bold font-mono text-slate-300">
                                      $0.00
                                    </div>
                                    <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                                      0.0% Dilution (Bootstrapping)
                                    </div>

                                    {/* Equity Preview */}
                                    <div className="mt-3 pt-2.5 border-t border-slate-800/80 space-y-1 text-[11px] font-mono">
                                      <div className="flex justify-between text-slate-400">
                                        <span>Founder Equity:</span>
                                        <span className="text-white font-medium">
                                          {founderBefore.toFixed(1)}% (Unchanged)
                                        </span>
                                      </div>
                                      <div className="flex justify-between text-slate-400">
                                        <span>Investor Stake:</span>
                                        <span className="text-slate-400 font-medium">0.00%</span>
                                      </div>
                                      <div className="flex justify-between text-slate-400">
                                        <span>Cash Inflow:</span>
                                        <span className="text-slate-400 font-medium">$0.00</span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="mt-4 pt-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant={isConfirmedOffer ? 'destructive' : isSelected ? 'secondary' : 'outline'}
                                      disabled={isDecisionLocked || Boolean(selectedTeam?.investorOffer?.isConfirmed) || data?.round.status !== 'open'}
                                      onClick={() => {
                                        setPendingOfferChoice('reject_both');
                                        setConfirmModalOpen(true);
                                      }}
                                      className="w-full text-xs font-bold"
                                    >
                                      {isConfirmedOffer ? 'Rejected & Locked' : isSelected ? 'Selected (Reject Both)' : 'Reject Both'}
                                    </Button>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>

                          {/* Financing Accounting Disclaimer */}
                          <div className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-lg text-[10px] font-mono text-slate-400 flex items-start gap-2">
                            <Info className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                            <span>
                              <strong>Financing Accounting Policy:</strong> Investor funding is classified strictly as financing cash flow. Cash is added directly to company ending liquid treasury upon simulation. Funding is NEVER recognized as sales revenue, gross profit, or operating income.
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label className="block text-xs font-mono font-medium text-slate-300 mb-1">
                            Investment / Equity Option
                          </label>
                          <div className="w-full h-10 px-3 bg-[#080D1A] border border-slate-800 rounded-md text-xs font-mono text-slate-500 flex items-center">
                            Standard Operations (No investment window in Round {data?.round.roundNumber})
                          </div>
                          <span className="text-[10px] text-slate-500 mt-0.5 block">
                            Fundraising rounds occur exclusively in Round 2 (Seed) and Round 4 (Series A).
                          </span>
                        </div>
                      )}
                    </div>

                    {/* ADMIN AUDIT NOTE */}
                    <div>
                      <label className="block text-xs font-mono font-medium text-slate-300 mb-1">
                        Admin Audit / Override Note (Optional)
                      </label>
                      <Input
                        type="text"
                        placeholder="e.g. Verified against physical slip signed by team captain"
                        value={adminNotes}
                        onChange={e => setAdminNotes(e.target.value)}
                        disabled={isDecisionLocked || isSubmitting}
                        className="bg-[#080D1A] border-slate-700 text-xs"
                      />
                    </div>

                    {/* REAL-TIME SOLVENCY GAUGE */}
                    <div className={`p-4 rounded-lg border ${isOverspent ? 'bg-rose-950/20 border-rose-800' : 'bg-slate-900/60 border-slate-800'}`}>
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <div>
                          <div className="text-xs font-mono text-slate-400 uppercase">Available Liquid Treasury</div>
                          <div className="text-xl font-bold font-mono text-white mt-0.5">
                            ${availableCash.toLocaleString()}
                          </div>
                        </div>

                        <div className="text-left sm:text-right">
                          <div className="text-xs font-mono text-slate-400 uppercase">Total Planned Outflow</div>
                          <div className={`text-xl font-bold font-mono mt-0.5 ${isOverspent ? 'text-rose-400' : 'text-emerald-400'}`}>
                            ${totalPlannedOutflow.toLocaleString()}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
                        <span className="text-slate-400">Projected Ending Cash:</span>
                        <span className={`font-bold ${isOverspent ? 'text-rose-400' : 'text-white'}`}>
                          ${(availableCash - totalPlannedOutflow).toLocaleString()}
                          {isOverspent && ` (DEFICIT: $${cashDeficit.toLocaleString()})`}
                        </span>
                      </div>

                      {isOverspent && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-rose-400">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          <span>Budget exceeds available cash. Overspending is prohibited by tournament rules.</span>
                        </div>
                      )}
                    </div>

                    {/* ACTIONS */}
                    {!isDecisionLocked && (
                      <div className="flex justify-end gap-3 pt-2">
                        <Button
                          type="submit"
                          variant="emerald"
                          size="md"
                          disabled={data?.round.status !== 'open' || isOverspent || !isPriceValid || isSubmitting}
                          isLoading={isSubmitting}
                          className="font-bold shadow-lg gap-2"
                        >
                          <ShieldCheck className="h-4 w-4" />
                          <span>
                            {data?.round.status === 'draft'
                              ? `Round ${data.round.roundNumber} in Draft (Open Round First)`
                              : 'Confirm & Verify Decision'}
                          </span>
                        </Button>
                      </div>
                    )}
                  </form>
                </CardContent>
              </Card>
            ) : (
              <div className="h-96 flex items-center justify-center border border-dashed border-slate-800 rounded-lg text-slate-500 text-xs">
                Select a team from the roster on the left to enter or review decisions.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* IMMUTABLE CONFIRMATION MODAL */}
      {confirmModalOpen && pendingOfferChoice && selectedTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0C1322] border border-slate-700 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-950/80 border border-indigo-700/60 rounded-lg text-indigo-400">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Confirm Investment Choice
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  {selectedTeam.companyName} ({selectedTeam.teamCode})
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-lg space-y-2 text-xs font-mono">
              <div className="text-slate-400">Selected Action:</div>
              <div className="text-sm font-bold text-white uppercase">
                {pendingOfferChoice === 'offer_a'
                  ? 'Accept Offer A (Conservative Funding)'
                  : pendingOfferChoice === 'offer_b'
                  ? 'Accept Offer B (Growth Capital)'
                  : 'Reject Both Offers'}
              </div>

              {pendingOfferChoice === 'offer_a' && selectedTeam.investorOffer?.offerA && (
                <div className="pt-2 border-t border-slate-800 text-slate-300 space-y-1">
                  <div>Cash Injection: <span className="text-emerald-400 font-bold">+${selectedTeam.investorOffer.offerA.investmentAmount.toLocaleString()}</span></div>
                  <div>Equity Dilution: <span className="text-amber-300 font-bold">{selectedTeam.investorOffer.offerA.equityStakePct.toFixed(1)}%</span></div>
                  <div>
                    Projected Founder Equity:{' '}
                    <span className="text-white font-bold">
                      {((selectedTeam.currentFounderEquityPct ?? 100) * (1 - selectedTeam.investorOffer.offerA.equityStakePct / 100)).toFixed(2)}%
                    </span>
                  </div>
                </div>
              )}

              {pendingOfferChoice === 'offer_b' && selectedTeam.investorOffer?.offerB && (
                <div className="pt-2 border-t border-slate-800 text-slate-300 space-y-1">
                  <div>Cash Injection: <span className="text-emerald-400 font-bold">+${selectedTeam.investorOffer.offerB.investmentAmount.toLocaleString()}</span></div>
                  <div>Equity Dilution: <span className="text-purple-300 font-bold">{selectedTeam.investorOffer.offerB.equityStakePct.toFixed(1)}%</span></div>
                  <div>
                    Projected Founder Equity:{' '}
                    <span className="text-white font-bold">
                      {((selectedTeam.currentFounderEquityPct ?? 100) * (1 - selectedTeam.investorOffer.offerB.equityStakePct / 100)).toFixed(2)}%
                    </span>
                  </div>
                </div>
              )}

              {pendingOfferChoice === 'reject_both' && (
                <div className="pt-2 border-t border-slate-800 text-slate-300 space-y-1">
                  <div>Cash Injection: <span className="text-slate-400 font-bold">$0.00</span></div>
                  <div>Equity Dilution: <span className="text-slate-400 font-bold">0.00% (No Dilution)</span></div>
                  <div>
                    Retained Founder Equity:{' '}
                    <span className="text-white font-bold">
                      {(selectedTeam.currentFounderEquityPct ?? 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 bg-amber-950/30 border border-amber-800/60 rounded-lg text-[11px] text-amber-300 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                <strong>Warning — Immutable Action:</strong> Once confirmed, this investor offer selection is permanently locked. Teams and administrators cannot switch offers or reconsider rejections.
              </span>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isConfirmingOffer}
                onClick={() => {
                  setConfirmModalOpen(false);
                  setPendingOfferChoice(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="emerald"
                size="sm"
                isLoading={isConfirmingOffer}
                onClick={handleConfirmInvestorChoice}
                className="font-bold gap-1.5"
              >
                <Lock className="h-3.5 w-3.5" />
                Confirm & Lock Choice
              </Button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

export default function AdminDecisionsPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-[#090D16] text-slate-400 flex items-center justify-center font-mono text-xs">
          Loading Admin Decision Console...
        </div>
      }
    >
      <AdminDecisionsContent />
    </React.Suspense>
  );
}
