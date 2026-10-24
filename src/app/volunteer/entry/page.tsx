'use client';

import * as React from 'react';
import {
  AlertCircle,
  Sparkles,
  Flag,
  ArrowRight,
} from 'lucide-react';
import { VolunteerShell } from '@/components/layout/volunteer-shell';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Modal } from '@/components/ui/modal';

interface TeamOption {
  id: string;
  team_code: string;
  company_name: string;
  table_station?: string;
  domain_id: string;
  domains?: { code: string; name: string; base_unit_cogs?: number; benchmark_price?: number; min_allowed_price?: number; max_allowed_price?: number };
}

interface RoundItem {
  id: string;
  round_number: number;
  status: string;
}

interface SubmissionReceipt {
  teamCode?: string;
  companyName?: string;
  outflow: number;
  units: number;
  price: number;
  receiptId: string;
}

export default function VolunteerEntryPage() {
  const [teams, setTeams] = React.useState<TeamOption[]>([]);
  const [activeRound, setActiveRound] = React.useState<RoundItem | null>(null);
  const [selectedTeamId, setSelectedTeamId] = React.useState<string>('');
  const availableCash = 1000000;

  // Form Fields (10-key numeric strings)
  const [marketingBudget, setMarketingBudget] = React.useState<string>('');
  const [rdBudget, setRdBudget] = React.useState<string>('');
  const [productionUnits, setProductionUnits] = React.useState<string>('');
  const [unitPrice, setUnitPrice] = React.useState<string>('');
  const [operationsBudget, setOperationsBudget] = React.useState<string>('');
  const [investmentDecision, setInvestmentDecision] = React.useState<string>('none');

  // Input refs for keyboard auto-advance
  const teamSelectRef = React.useRef<HTMLSelectElement>(null);
  const mktRef = React.useRef<HTMLInputElement>(null);
  const rdRef = React.useRef<HTMLInputElement>(null);
  const prodRef = React.useRef<HTMLInputElement>(null);
  const priceRef = React.useRef<HTMLInputElement>(null);
  const opsRef = React.useRef<HTMLInputElement>(null);
  const submitButtonRef = React.useRef<HTMLButtonElement>(null);

  const [isLoading, setIsLoading] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitSuccessReceipt, setSubmitSuccessReceipt] = React.useState<SubmissionReceipt | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Load active tournament data
  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const eventRes = await fetch('/api/events/active');
      const eventJson = await eventRes.json();
      const event = eventJson.data?.event;

      if (event) {
        const rounds = [...(event.rounds || [])] as RoundItem[];
        rounds.sort((a, b) => a.round_number - b.round_number);
        const current = rounds.find(r => r.status === 'open') || rounds[0];
        setActiveRound(current || null);

        const teamsRes = await fetch(`/api/teams?eventId=${event.id}`);
        const teamsJson = await teamsRes.json();
        const loadedTeams = teamsJson.data?.teams || [];
        setTeams(loadedTeams);

        if (loadedTeams.length > 0 && !selectedTeamId) {
          setSelectedTeamId(loadedTeams[0].id);
        }
      }
    } catch {
      // Fallback
    } finally {
      setIsLoading(false);
    }
  }, [selectedTeamId]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const selectedTeam = teams.find(t => t.id === selectedTeamId);
  const baseUnitCogs = Number(selectedTeam?.domains?.base_unit_cogs || 120);

  // Numeric parsers
  const numMkt = parseFloat(marketingBudget) || 0;
  const numRd = parseFloat(rdBudget) || 0;
  const numProd = parseInt(productionUnits, 10) || 0;
  const numPrice = parseFloat(unitPrice) || 0;
  const numOps = parseFloat(operationsBudget) || 0;

  // Real-time Solvency Calculations
  const calculatedMfgCost = numProd * baseUnitCogs;
  const totalPlannedOutflow = numMkt + numRd + numOps + calculatedMfgCost;
  const cashDeficit = totalPlannedOutflow - availableCash;
  const isOverspent = cashDeficit > 0.001;

  // F8: Auto-Scale R&D and Marketing to fit within cash
  const handleAutoScale = () => {
    const fixedOutflows = numOps + calculatedMfgCost;
    if (fixedOutflows >= availableCash) {
      setErrorMsg('Fixed manufacturing & operations exceed total available cash. Cannot auto-scale.');
      return;
    }

    const discretionaryCash = availableCash - fixedOutflows;
    const currentDiscretionary = numMkt + numRd;

    if (currentDiscretionary > 0) {
      const scaleFactor = discretionaryCash / currentDiscretionary;
      const newMkt = Math.floor(numMkt * scaleFactor);
      const newRd = Math.floor(discretionaryCash - newMkt);

      setMarketingBudget(newMkt.toString());
      setRdBudget(newRd.toString());
      setErrorMsg(null);
    }
  };

  // F9: Flag slip as illegible
  const handleFlagSlip = async () => {
    if (!activeRound || !selectedTeamId) return;
    try {
      await fetch('/api/decisions/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roundId: activeRound.id,
          teamId: selectedTeamId,
          marketingBudget: 0,
          rdBudget: 0,
          productionUnits: 0,
          unitPrice: 0,
          operationsBudget: 0,
          investmentDecision: 'none',
        }),
      });

      alert(`Slip for ${selectedTeam?.team_code} flagged as ILLEGIBLE. Coordinator notified.`);
      resetFormForNextSlip();
    } catch {
      alert('Error flagging slip');
    }
  };

  // Reset form and focus team selector
  const resetFormForNextSlip = () => {
    setMarketingBudget('');
    setRdBudget('');
    setProductionUnits('');
    setUnitPrice('');
    setOperationsBudget('');
    setInvestmentDecision('none');
    setErrorMsg(null);

    // Auto-advance to next team in list
    const currentIndex = teams.findIndex(t => t.id === selectedTeamId);
    if (currentIndex >= 0 && currentIndex < teams.length - 1) {
      setSelectedTeamId(teams[currentIndex + 1].id);
    }

    setTimeout(() => {
      mktRef.current?.focus();
    }, 50);
  };

  // Submit decision
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeRound) {
      setErrorMsg('No active round open for decision entry.');
      return;
    }
    if (!selectedTeamId) {
      setErrorMsg('Please select a team.');
      return;
    }
    if (isOverspent) {
      setErrorMsg(`Planned cash outflow exceeds available cash by $${cashDeficit.toFixed(2)}. Press F8 to auto-scale.`);
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/decisions/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roundId: activeRound.id,
          teamId: selectedTeamId,
          marketingBudget: numMkt,
          rdBudget: numRd,
          productionUnits: numProd,
          unitPrice: numPrice,
          operationsBudget: numOps,
          investmentDecision: investmentDecision,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || 'Submission failed');
      }

      setSubmitSuccessReceipt({
        teamCode: selectedTeam?.team_code,
        companyName: selectedTeam?.company_name,
        outflow: totalPlannedOutflow,
        units: numProd,
        price: numPrice,
        receiptId: json.data?.decisionId || 'REC-' + Math.floor(100000 + Math.random() * 900000),
      });

      resetFormForNextSlip();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error submitting decision slip.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const autoScaleRef = React.useRef(handleAutoScale);
  autoScaleRef.current = handleAutoScale;
  const flagSlipRef = React.useRef(handleFlagSlip);
  flagSlipRef.current = handleFlagSlip;
  const submitRef = React.useRef(handleSubmit);
  submitRef.current = handleSubmit;

  // Global Keyboard Navigation (F8, F9, Ctrl+Enter)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F8') {
        e.preventDefault();
        autoScaleRef.current();
      } else if (e.key === 'F9') {
        e.preventDefault();
        flagSlipRef.current();
      } else if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        submitRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <VolunteerShell
      roundNumber={activeRound?.round_number || 1}
      roundStatus={activeRound?.status || 'open'}
    >
      <div className="space-y-6">
        {/* TOP STATUS RIBBON */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#0F172A] p-4 rounded-xl border border-slate-800">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold">
              10K
            </div>
            <div>
              <div className="text-xs font-mono text-indigo-400 uppercase tracking-wider font-semibold">
                Paper Slip Digitization Desk
              </div>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <span>Transcribing Round {activeRound?.round_number || 1}</span>
                <Badge variant={activeRound?.status === 'open' ? 'open' : 'locked'}>
                  {activeRound?.status || 'OPEN'}
                </Badge>
              </div>
            </div>
          </div>

          {/* TEAM SELECTION BAR */}
          <div className="w-full md:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
                Select Team Slip:
              </label>
              <select
                ref={teamSelectRef}
                value={selectedTeamId}
                disabled={isLoading}
                onChange={e => setSelectedTeamId(e.target.value)}
                className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm font-semibold text-white focus:border-indigo-500 focus:outline-none min-w-[260px] disabled:opacity-50"
              >
                {isLoading ? (
                  <option>Loading teams from database...</option>
                ) : (
                  teams.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.team_code} — {t.company_name} ({t.domains?.code})
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 text-right min-w-[170px]">
              <div className="text-[10px] font-mono text-slate-400 uppercase">Available Cash</div>
              <div className="text-base font-bold font-mono text-emerald-400">
                ${availableCash.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>

        {/* ERROR / OVERSPENT ALERT */}
        {isOverspent && (
          <div className="p-4 rounded-xl border border-rose-500/60 bg-rose-950/60 text-rose-200 flex items-center justify-between gap-4 animate-in fade-in duration-150">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-rose-400 shrink-0" />
              <div>
                <div className="font-bold text-sm text-rose-300">
                  OVERSPENDING DETECTED: Exceeds Liquid Cash by ${cashDeficit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-xs text-rose-300/80">
                  Total planned outflow is ${totalPlannedOutflow.toLocaleString('en-US', { minimumFractionDigits: 2 })}. Outflow cannot exceed treasury balance.
                </div>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAutoScale}
              className="border-rose-400/50 hover:bg-rose-500/20 text-rose-200 shrink-0 gap-1.5 font-mono text-xs"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              <span>[F8] Auto-Scale</span>
            </Button>
          </div>
        )}

        {errorMsg && !isOverspent && (
          <Alert variant="error" title="Submission Validation Blocker">
            {errorMsg}
          </Alert>
        )}

        {/* 10-KEY DATA ENTRY GRID */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="border-slate-800 bg-[#0C1322]">
            <CardHeader className="pb-3 border-b border-slate-800/80">
              <div className="flex justify-between items-center">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <span>Numeric Input Form</span>
                  <span className="text-xs font-normal text-slate-400">
                    ({selectedTeam?.domains?.name || 'Selected Domain'})
                  </span>
                </CardTitle>
                <div className="text-xs font-mono text-slate-400">
                  Base COGS: <span className="text-slate-200 font-bold">${baseUnitCogs.toFixed(2)}</span> / unit
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. MARKETING BUDGET */}
                <div className="space-y-1">
                  <Input
                    ref={mktRef}
                    label="1. Brand & Marketing Allocation ($)"
                    type="number"
                    step="1000"
                    min="0"
                    placeholder="180000"
                    isMonospace
                    prefixSymbol="$"
                    value={marketingBudget}
                    onChange={e => setMarketingBudget(e.target.value)}
                    helperText="Invests in market awareness and customer acquisition."
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        rdRef.current?.focus();
                      }
                    }}
                  />
                  {numMkt > 0 && (
                    <div className="text-[11px] font-mono text-slate-400">
                      Allocation: {((numMkt / availableCash) * 100).toFixed(1)}% of available treasury
                    </div>
                  )}
                </div>

                {/* 2. R&D BUDGET */}
                <div className="space-y-1">
                  <Input
                    ref={rdRef}
                    label="2. Research & Development Budget ($)"
                    type="number"
                    step="1000"
                    min="0"
                    placeholder="220000"
                    isMonospace
                    prefixSymbol="$"
                    value={rdBudget}
                    onChange={e => setRdBudget(e.target.value)}
                    helperText="Boosts product quality index and competitive attractiveness."
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        prodRef.current?.focus();
                      }
                    }}
                  />
                  {numRd > 0 && (
                    <div className="text-[11px] font-mono text-slate-400">
                      Allocation: {((numRd / availableCash) * 100).toFixed(1)}% of available treasury
                    </div>
                  )}
                </div>

                {/* 3. PRODUCTION UNITS */}
                <div className="space-y-1">
                  <Input
                    ref={prodRef}
                    label="3. Production Order Quantity (Units)"
                    type="number"
                    step="10"
                    min="0"
                    placeholder="1200"
                    isMonospace
                    suffixSymbol="units"
                    value={productionUnits}
                    onChange={e => setProductionUnits(e.target.value)}
                    helperText={`Mfg cost: ${numProd} × $${baseUnitCogs.toFixed(2)} = $${calculatedMfgCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        priceRef.current?.focus();
                      }
                    }}
                  />
                </div>

                {/* 4. UNIT SELLING PRICE */}
                <div className="space-y-1">
                  <Input
                    ref={priceRef}
                    label="4. Unit Selling Price ($)"
                    type="number"
                    step="1"
                    min="0"
                    placeholder="1350"
                    isMonospace
                    prefixSymbol="$"
                    value={unitPrice}
                    onChange={e => setUnitPrice(e.target.value)}
                    helperText={`Allowed: $${selectedTeam?.domains?.min_allowed_price || 100} - $${selectedTeam?.domains?.max_allowed_price || 2000}`}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        opsRef.current?.focus();
                      }
                    }}
                  />
                </div>

                {/* 5. OPERATIONS BUDGET */}
                <div className="space-y-1">
                  <Input
                    ref={opsRef}
                    label="5. Operations & Logistics Budget ($)"
                    type="number"
                    step="1000"
                    min="0"
                    placeholder="100000"
                    isMonospace
                    prefixSymbol="$"
                    value={operationsBudget}
                    onChange={e => setOperationsBudget(e.target.value)}
                    helperText="Applies efficiency discounts and operational cost mitigation."
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        submitButtonRef.current?.focus();
                      }
                    }}
                  />
                </div>

                {/* 6. INVESTMENT DECISION */}
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-300">
                    6. Strategic VC Investment Choice
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                    {[
                      { id: 'none', label: 'None / Skip' },
                      { id: 'offer_a', label: 'Offer A' },
                      { id: 'offer_b', label: 'Offer B' },
                      { id: 'reject_both', label: 'Reject Both' },
                    ].map(choice => (
                      <button
                        key={choice.id}
                        type="button"
                        onClick={() => setInvestmentDecision(choice.id)}
                        className={`h-11 px-3 rounded-lg border text-xs font-semibold font-mono transition-all ${
                          investmentDecision === choice.id
                            ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-900/30'
                            : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        {choice.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* BOTTOM TOTAL SUMMARY & ACTION DOCK */}
          <div className="p-4 sm:p-5 rounded-2xl border border-slate-800 bg-[#0E1528] flex flex-col md:flex-row items-center justify-between gap-4 sticky bottom-4 shadow-2xl backdrop-blur">
            {/* SPENDING METRICS */}
            <div className="flex flex-wrap items-center gap-6 text-xs font-mono">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Total Planned Outflow:</span>
                <span className={`text-xl font-bold ${isOverspent ? 'text-rose-400' : 'text-white'}`}>
                  ${totalPlannedOutflow.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Projected Net Cash Remaining:</span>
                <span className={`text-base font-bold ${isOverspent ? 'text-rose-400' : 'text-emerald-400'}`}>
                  ${(availableCash - totalPlannedOutflow).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* ACTION BUTTONS */}
            <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
              <Button
                type="button"
                variant="destructive"
                size="md"
                onClick={handleFlagSlip}
                className="gap-1.5"
                title="Press F9 to Flag"
              >
                <Flag className="h-4 w-4" />
                <span>[F9] Flag Slip</span>
              </Button>

              <Button
                ref={submitButtonRef}
                type="submit"
                variant={isOverspent ? 'secondary' : 'emerald'}
                size="md"
                disabled={isOverspent || isSubmitting}
                isLoading={isSubmitting}
                className="gap-2 font-bold px-6 shadow-emerald-900/40"
              >
                <span>[Ctrl+Enter] Commit Slip</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </form>

        {/* SUBMISSION RECEIPT MODAL */}
        <Modal
          isOpen={!!submitSuccessReceipt}
          onClose={() => setSubmitSuccessReceipt(null)}
          title="Decision Slip Committed"
          description="The paper decision sheet has been successfully transcribed into the database."
        >
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 text-xs font-mono space-y-2">
              <div className="flex justify-between items-center border-b border-emerald-500/20 pb-2">
                <span className="text-emerald-400 font-bold">Receipt Reference:</span>
                <span className="font-bold text-white">{submitSuccessReceipt?.receiptId}</span>
              </div>
              <div className="flex justify-between">
                <span>Team / Venture:</span>
                <span className="text-white font-semibold">
                  {submitSuccessReceipt?.teamCode} — {submitSuccessReceipt?.companyName}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Production Order:</span>
                <span className="text-white font-semibold">{submitSuccessReceipt?.units} units</span>
              </div>
              <div className="flex justify-between">
                <span>Unit Price:</span>
                <span className="text-white font-semibold">${submitSuccessReceipt?.price?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-emerald-500/20 font-bold text-sm">
                <span>Committed Outflow:</span>
                <span className="text-emerald-300">
                  ${submitSuccessReceipt?.outflow?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-400 text-center">
              The slip is now marked as <strong>ENTERED</strong> and awaiting peer dual-verification by a second operator.
            </p>

            <div className="flex justify-end pt-2">
              <Button
                variant="primary"
                onClick={() => setSubmitSuccessReceipt(null)}
                className="w-full"
              >
                Continue to Next Slip
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </VolunteerShell>
  );
}
