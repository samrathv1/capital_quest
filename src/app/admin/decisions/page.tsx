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
}

function AdminDecisionsContent() {
  const searchParams = useSearchParams();
  const initialTeamId = searchParams.get('teamId') || '';

  const [data, setData] = React.useState<RoundData | null>(null);
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

  const mktRef = React.useRef<HTMLInputElement>(null);

  const fetchRoundData = React.useCallback(async (targetTeamId?: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/admin/decisions');
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || 'Failed to load round decisions');
      }
      const roundData: RoundData = json.data;
      setData(roundData);

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
  }, [selectedTeamId]);

  React.useEffect(() => {
    fetchRoundData(initialTeamId);
  }, [initialTeamId, fetchRoundData]);

  const populateForm = (team: TeamDecisionEntry) => {
    if (team.decision) {
      setMarketingBudget(team.decision.marketingBudget.toString());
      setRdBudget(team.decision.rdBudget.toString());
      setProductionUnits(team.decision.productionUnits.toString());
      setUnitPrice(team.decision.unitPrice.toString());
      setOperationsBudget(team.decision.operationsBudget.toString());
      setInvestmentDecision(team.decision.investmentDecision || 'none');
      setAdminNotes(team.decision.adminOverrideNotes || '');
    } else {
      setMarketingBudget('');
      setRdBudget('');
      setProductionUnits('');
      setUnitPrice(team.benchmarkPrice.toString());
      setOperationsBudget('');
      setInvestmentDecision('none');
      setAdminNotes('');
    }
    setErrorMsg(null);
    setSuccessMsg(null);
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
        throw new Error(json.message || 'Confirmation failed');
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

                  <form onSubmit={handleConfirmDecision} className="space-y-6">
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
                          step="1000"
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
                          step="1000"
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
                          step="50"
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
                          step="10"
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

                      {/* INVESTMENT DECISION */}
                      <div>
                        <label className="block text-xs font-mono font-medium text-slate-300 mb-1">
                          Investment / Equity Option
                        </label>
                        <select
                          value={investmentDecision}
                          onChange={e => setInvestmentDecision(e.target.value as 'none' | 'offer_a' | 'offer_b' | 'reject_both')}
                          disabled={isDecisionLocked || isSubmitting || !isInvestmentAllowed}
                          aria-label="Investment / Equity Option"
                          className="w-full h-10 px-3 bg-[#080D1A] border border-slate-700 rounded-md text-xs font-mono text-slate-200 disabled:opacity-50"
                        >
                          <option value="none">None (Standard Operations)</option>
                          {isInvestmentAllowed && (
                            <>
                              <option value="offer_a">Offer A (Growth Capital Injection)</option>
                              <option value="offer_b">Offer B (Strategic Equity Partner)</option>
                              <option value="reject_both">Reject Both Offers</option>
                            </>
                          )}
                        </select>
                        <span className="text-[10px] text-slate-500 mt-0.5 block">
                          {isInvestmentAllowed ? 'Investment window open for this round' : 'Investment decisions permitted only in Rounds 2 & 4'}
                        </span>
                      </div>
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
                          disabled={isOverspent || !isPriceValid || isSubmitting}
                          isLoading={isSubmitting}
                          className="font-bold shadow-lg gap-2"
                        >
                          <ShieldCheck className="h-4 w-4" />
                          <span>Confirm & Verify Decision</span>
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
