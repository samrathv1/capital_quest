'use client';

import * as React from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Lock,
  EyeOff,
} from 'lucide-react';
import { VolunteerShell } from '@/components/layout/volunteer-shell';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Modal } from '@/components/ui/modal';

interface PendingDecision {
  id: string;
  round_id: string;
  team_id: string;
  status: string;
  marketing_budget: number;
  rd_budget: number;
  production_units: number;
  unit_price: number;
  operations_budget: number;
  investment_decision: string;
  entered_by?: string;
  teams?: {
    id: string;
    team_code: string;
    company_name: string;
    table_station?: string;
    domains?: { code: string; name: string };
  };
}

interface RoundItem {
  id: string;
  round_number: number;
  status: string;
}

interface VerificationResult {
  status: 'mismatch' | 'verified';
  teamCode?: string;
  companyName?: string;
  discrepancies?: string[];
  verifiedAt?: string;
}

export default function DualVerificationPage() {
  const [activeRound, setActiveRound] = React.useState<RoundItem | null>(null);
  const [pendingDecisions, setPendingDecisions] = React.useState<PendingDecision[]>([]);
  const [selectedDecision, setSelectedDecision] = React.useState<PendingDecision | null>(null);

  // Blind Second Operator Verification Form Inputs
  const [verifyMkt, setVerifyMkt] = React.useState('');
  const [verifyRd, setVerifyRd] = React.useState('');
  const [verifyProd, setVerifyProd] = React.useState('');
  const [verifyPrice, setVerifyPrice] = React.useState('');
  const [verifyOps, setVerifyOps] = React.useState('');
  const [verifyInvestment, setVerifyInvestment] = React.useState('none');

  const [isLoading, setIsLoading] = React.useState(true);
  const [isVerifying, setIsVerifying] = React.useState(false);
  const [verificationResult, setVerificationResult] = React.useState<VerificationResult | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const fetchDecisions = async () => {
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

        if (current) {
          const decRes = await fetch(`/api/decisions?roundId=${current.id}`);
          const decJson = await decRes.json();
          const list = (decJson.data?.decisions || []) as PendingDecision[];
          setPendingDecisions(list);

          const firstPending = list.find(d => d.status === 'entered') || list[0] || null;
          setSelectedDecision(firstPending);
        }
      }
    } catch {
      // Fallback
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    fetchDecisions();
  }, []);

  const handleSelectDecision = (dec: PendingDecision) => {
    setSelectedDecision(dec);
    setVerifyMkt('');
    setVerifyRd('');
    setVerifyProd('');
    setVerifyPrice('');
    setVerifyOps('');
    setVerifyInvestment('none');
    setErrorMsg(null);
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDecision || !activeRound) return;

    setIsVerifying(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/decisions/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roundId: activeRound.id,
          teamId: selectedDecision.team_id,
          marketingBudget: parseFloat(verifyMkt) || 0,
          rdBudget: parseFloat(verifyRd) || 0,
          productionUnits: parseInt(verifyProd, 10) || 0,
          unitPrice: parseFloat(verifyPrice) || 0,
          operationsBudget: parseFloat(verifyOps) || 0,
          investmentDecision: verifyInvestment,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        // Discrepancy mismatch
        setVerificationResult({
          status: 'mismatch',
          teamCode: selectedDecision.teams?.team_code,
          companyName: selectedDecision.teams?.company_name,
          discrepancies: json.details?.discrepancies || ['Values did not match first entry'],
        });
      } else {
        // 100% Match!
        setVerificationResult({
          status: 'verified',
          teamCode: selectedDecision.teams?.team_code,
          companyName: selectedDecision.teams?.company_name,
          verifiedAt: json.data?.verifiedAt,
        });
      }

      await fetchDecisions();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Verification execution failed.');
    } finally {
      setIsVerifying(false);
    }
  };

  const enteredCount = pendingDecisions.filter(d => d.status === 'entered').length;
  const verifiedCount = pendingDecisions.filter(d => d.status === 'verified').length;
  const flaggedCount = pendingDecisions.filter(d => d.status === 'flagged').length;

  return (
    <VolunteerShell
      roundNumber={activeRound?.round_number || 1}
      roundStatus={activeRound?.status || 'open'}
    >
      <div className="space-y-6">
        {/* BANNER */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#0F172A] p-4 rounded-xl border border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-emerald-400 uppercase font-semibold">
                Dual-Key Peer Verification Desk
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-xs text-slate-400">Zero-Leak Blind Entry</span>
            </div>
            <h1 className="text-lg font-bold text-white mt-1">
              Independent Second Operator Verification
            </h1>
            <p className="text-xs text-slate-400">
              Enter values directly from the paper sheet. System confirms 100% exact match against Operator A.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            <Badge variant="entered">{enteredCount} Pending</Badge>
            <Badge variant="verified">{verifiedCount} Verified</Badge>
            {flaggedCount > 0 && <Badge variant="flagged">{flaggedCount} Flagged</Badge>}
          </div>
        </div>

        {errorMsg && (
          <Alert variant="error" title="Verification Blocker">
            {errorMsg}
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT: SLIP QUEUE */}
          <Card className="border-slate-800 bg-[#0C1322] lg:col-span-1 p-0 overflow-hidden flex flex-col h-[580px]">
            <CardHeader className="p-4 border-b border-slate-800/80 bg-slate-900/40">
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <span>Decision Slip Queue</span>
                <span className="text-xs font-mono text-slate-400">{pendingDecisions.length} Slips</span>
              </CardTitle>
            </CardHeader>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80 p-2 space-y-1">
              {isLoading ? (
                <div className="p-8 text-center text-xs text-slate-500 font-mono">
                  Loading decision slips for verification...
                </div>
              ) : pendingDecisions.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 font-mono">
                  No decision slips entered yet for Round {activeRound?.round_number || 1}.
                </div>
              ) : (
                pendingDecisions.map(dec => {
                  const isSelected = selectedDecision?.id === dec.id;
                  return (
                    <button
                      key={dec.id}
                      type="button"
                      onClick={() => handleSelectDecision(dec)}
                      className={`w-full text-left p-3 rounded-lg transition-all flex items-center justify-between ${
                        isSelected
                          ? 'bg-indigo-600/20 border border-indigo-500/40 shadow-sm'
                          : 'hover:bg-slate-800/60 border border-transparent'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-indigo-300">
                            {dec.teams?.team_code || 'UNKNOWN'}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {dec.teams?.table_station ? `Station ${dec.teams.table_station}` : ''}
                          </span>
                        </div>
                        <div className="text-xs text-slate-300 truncate max-w-[170px]">
                          {dec.teams?.company_name}
                        </div>
                      </div>

                      <Badge
                        variant={
                          dec.status === 'verified'
                            ? 'verified'
                            : dec.status === 'flagged'
                            ? 'flagged'
                            : 'entered'
                        }
                        className="text-[10px] py-0 px-2"
                      >
                        {dec.status.toUpperCase()}
                      </Badge>
                    </button>
                  );
                })
              )}
            </div>
          </Card>

          {/* RIGHT: BLIND VERIFICATION CONSOLE */}
          <Card className="border-slate-800 bg-[#0C1322] lg:col-span-2">
            <CardHeader className="pb-3 border-b border-slate-800/80">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-indigo-400 font-semibold uppercase">
                      Target Slip: {selectedDecision?.teams?.team_code || 'SELECT SLIP'}
                    </span>
                    <Badge variant="domain">{selectedDecision?.teams?.domains?.code || 'DOMAIN'}</Badge>
                  </div>
                  <CardTitle className="text-base font-bold text-white mt-1">
                    {selectedDecision?.teams?.company_name || 'Select a team from the queue'}
                  </CardTitle>
                </div>

                <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-slate-900 border border-slate-800 text-xs font-mono text-slate-400">
                  <EyeOff className="h-3.5 w-3.5 text-amber-400" />
                  <span>Blind Entry Active</span>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-6">
              {!selectedDecision ? (
                <div className="p-12 text-center text-xs text-slate-500 font-mono">
                  Select a team slip on the left to begin dual-entry verification.
                </div>
              ) : selectedDecision.status === 'verified' ? (
                <div className="p-8 text-center space-y-3">
                  <div className="h-12 w-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <div className="text-sm font-bold text-emerald-300">
                    Slip Already 100% Verified
                  </div>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    This decision slip has already been matched and verified by an authorized second operator.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleVerifySubmit} className="space-y-6">
                  <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 flex items-center gap-2">
                    <Lock className="h-4 w-4 shrink-0 text-indigo-400" />
                    <span>
                      Operator A values are hidden to ensure unbiased second entry. Transcribe values directly from physical sheet.
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <Input
                      label="Marketing Allocation ($) *"
                      type="number"
                      required
                      placeholder="Enter value on paper slip"
                      isMonospace
                      prefixSymbol="$"
                      value={verifyMkt}
                      onChange={e => setVerifyMkt(e.target.value)}
                    />

                    <Input
                      label="R&D Budget ($) *"
                      type="number"
                      required
                      placeholder="Enter value on paper slip"
                      isMonospace
                      prefixSymbol="$"
                      value={verifyRd}
                      onChange={e => setVerifyRd(e.target.value)}
                    />

                    <Input
                      label="Production Quantity (Units) *"
                      type="number"
                      required
                      placeholder="Enter units on slip"
                      isMonospace
                      suffixSymbol="units"
                      value={verifyProd}
                      onChange={e => setVerifyProd(e.target.value)}
                    />

                    <Input
                      label="Unit Selling Price ($) *"
                      type="number"
                      required
                      placeholder="Enter price on slip"
                      isMonospace
                      prefixSymbol="$"
                      value={verifyPrice}
                      onChange={e => setVerifyPrice(e.target.value)}
                    />

                    <Input
                      label="Operations Budget ($) *"
                      type="number"
                      required
                      placeholder="Enter operations on slip"
                      isMonospace
                      prefixSymbol="$"
                      value={verifyOps}
                      onChange={e => setVerifyOps(e.target.value)}
                    />

                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-300">
                        VC Investment Decision *
                      </label>
                      <select
                        value={verifyInvestment}
                        onChange={e => setVerifyInvestment(e.target.value)}
                        className="w-full h-11 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 font-mono focus:border-indigo-500 focus:outline-none"
                      >
                        <option value="none">None / Skip</option>
                        <option value="offer_a">Offer A</option>
                        <option value="offer_b">Offer B</option>
                        <option value="reject_both">Reject Both</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                    <Button
                      type="submit"
                      variant="emerald"
                      size="md"
                      isLoading={isVerifying}
                      className="gap-2 font-bold px-6 shadow-emerald-900/30"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      <span>Execute Dual Verification</span>
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>

        {/* VERIFICATION RESULT MODAL */}
        <Modal
          isOpen={!!verificationResult}
          onClose={() => setVerificationResult(null)}
          title={verificationResult?.status === 'verified' ? 'Slip Successfully Verified' : 'Discrepancy Detected — Slip Flagged'}
          description={`Verification outcome for ${verificationResult?.teamCode} (${verificationResult?.companyName}).`}
        >
          {verificationResult?.status === 'verified' ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 text-center space-y-2">
                <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto" />
                <div className="text-base font-bold text-white">100% Match Confirmed!</div>
                <div className="text-xs text-slate-300 font-mono">
                  All 6 input fields matched Operator A entries exactly. Status upgraded to <strong>VERIFIED</strong>.
                </div>
              </div>

              <Button
                variant="emerald"
                className="w-full"
                onClick={() => setVerificationResult(null)}
              >
                Proceed to Next Slip
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200 space-y-3">
                <div className="flex items-center gap-2 font-bold text-rose-300">
                  <AlertTriangle className="h-5 w-5 text-rose-400" />
                  <span>Entry Discrepancy Found</span>
                </div>
                <p className="text-xs text-slate-300">
                  The values entered by Operator B did not match Operator A in the following field(s):
                </p>
                <div className="flex flex-wrap gap-1.5 font-mono text-xs">
                  {verificationResult?.discrepancies?.map((f: string) => (
                    <span key={f} className="px-2 py-1 rounded bg-rose-900/60 border border-rose-700/60 text-rose-200">
                      {f}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400">
                  The slip has been automatically marked as <strong>FLAGGED</strong>. A Domain Coordinator or Super Admin must inspect the physical sheet to resolve the discrepancy.
                </p>
              </div>

              <Button
                variant="destructive"
                className="w-full"
                onClick={() => setVerificationResult(null)}
              >
                Acknowledge Discrepancy
              </Button>
            </div>
          )}
        </Modal>
      </div>
    </VolunteerShell>
  );
}
