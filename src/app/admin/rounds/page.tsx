'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  PlayCircle,
  CheckCircle2,
  Lock,
  Unlock,
  AlertTriangle,
  RotateCcw,
  History,
  Eye,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  TrendingUp,
  RefreshCw,
  Building2,
  Clock,
  Sparkles,
  Award,
} from 'lucide-react';
import { AdminShell } from '@/components/layout/admin-shell';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';

interface RoundOverviewItem {
  id: string;
  round_number: number;
  type: string;
  status: 'draft' | 'open' | 'locked' | 'simulated' | 'reviewed' | 'published';
  opened_at?: string;
  locked_at?: string;
  simulated_at?: string;
  published_at?: string;
  decisionStats: {
    totalEligible: number;
    entered: number;
    verified: number;
    flagged: number;
    missing: number;
    locked: number;
  };
  marketEvents: Array<{
    domain: string;
    event_name: string;
    impact_description: string;
  }>;
  latestRun?: {
    id: string;
    run_number: number;
    status: string;
    completed_at?: string;
    input_hash?: string;
    created_by?: string;
  };
  allowedTransitions: string[];
  blockers: string[];
}

interface RoundsOverviewData {
  eventId?: string;
  rounds: RoundOverviewItem[];
  activeRoundNumber: number;
  organizerPolicies: {
    allApproved: boolean;
    pendingPolicies: string[];
  };
}

export default function AdminRoundsPage() {
  const [data, setData] = React.useState<RoundsOverviewData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = React.useState<string | null>(null);

  // Simulation execution modal state
  const [simModalOpen, setSimModalOpen] = React.useState(false);
  const [targetRound, setTargetRound] = React.useState<RoundOverviewItem | null>(null);
  const [simConfirmed, setSimConfirmed] = React.useState(false);
  const [isSimulating, setIsSimulating] = React.useState(false);
  const [simError, setSimError] = React.useState<string | null>(null);

  // Policy approval modal state
  const [policyModalOpen, setPolicyModalOpen] = React.useState(false);
  const [approverName, setApproverName] = React.useState('');
  const [isApproving, setIsApproving] = React.useState(false);
  const [policyError, setPolicyError] = React.useState<string | null>(null);

  // Void modal state
  const [voidModalOpen, setVoidModalOpen] = React.useState(false);
  const [voidRound, setVoidRound] = React.useState<RoundOverviewItem | null>(null);
  const [voidPassword, setVoidPassword] = React.useState('');
  const [voidReason, setVoidReason] = React.useState('');
  const [isVoiding, setIsVoiding] = React.useState(false);
  const [voidError, setVoidError] = React.useState<string | null>(null);

  // Action pending state
  const [isActionPending, setIsActionPending] = React.useState<string | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/rounds');
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to fetch rounds overview');
      }
      setData(json.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load tournament rounds');
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    fetchData();
  }, []);

  const handleOpenRound = async (round: RoundOverviewItem) => {
    setIsActionPending(round.id);
    setActionSuccess(null);
    setError(null);
    try {
      const res = await fetch(`/api/rounds/${round.id}/open`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to open round');
      }
      setActionSuccess(`Round ${round.round_number} is now OPEN for volunteer decision entry.`);
      await fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error opening round');
    } finally {
      setIsActionPending(null);
    }
  };

  const handleLockRound = async (round: RoundOverviewItem) => {
    setIsActionPending(round.id);
    setActionSuccess(null);
    setError(null);
    try {
      const res = await fetch(`/api/rounds/${round.id}/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrideMissing: false }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to lock round');
      }
      setActionSuccess(`Round ${round.round_number} is now LOCKED. Verified submissions are frozen.`);
      await fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error locking round');
    } finally {
      setIsActionPending(null);
    }
  };

  const handleExecuteSimulation = async () => {
    if (!targetRound || !simConfirmed) return;
    setIsSimulating(true);
    setSimError(null);
    try {
      const res = await fetch(`/api/rounds/${targetRound.id}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requireOrganizerApproval: true,
          isDryRun: false,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Simulation execution failed');
      }
      setSimModalOpen(false);
      setActionSuccess(`Simulation for Round ${targetRound.round_number} executed successfully (${json.data.companiesSimulated} companies). Please review financial reconciliation.`);
      await fetchData();
    } catch (err: unknown) {
      setSimError(err instanceof Error ? err.message : 'Simulation failed');
    } finally {
      setIsSimulating(false);
    }
  };

  const handleRecordPolicyApprovals = async () => {
    if (!approverName.trim()) {
      setPolicyError('Approver name or staff ID is mandatory for formal audit trail.');
      return;
    }
    setIsApproving(true);
    setPolicyError(null);
    try {
      const eventParam = data?.eventId ? `?eventId=${encodeURIComponent(data.eventId)}` : '';
      const res = await fetch(`/api/approvals${eventParam}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cashValuationPolicyApproved: true,
          corporateTaxationApproved: true,
          standardVCOffersApproved: true,
          strictSpendingRejectionApproved: true,
          proRataScalingApproved: true,
          approvedBy: approverName.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to record organizer approvals');
      }
      setPolicyModalOpen(false);
      setActionSuccess('All organizer tournament policies formally recorded and approved. Live simulations unlocked.');
      await fetchData();
    } catch (err: unknown) {
      setPolicyError(err instanceof Error ? err.message : 'Failed to approve policies');
    } finally {
      setIsApproving(false);
    }
  };

  const handleExecuteVoid = async () => {
    if (!voidRound) return;
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
      const res = await fetch(`/api/rounds/${voidRound.id}/void`, {
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
      setActionSuccess(`Simulation results for Round ${voidRound.round_number} voided and superseded. Round status reverted to LOCKED.`);
      await fetchData();
    } catch (err: unknown) {
      setVoidError(err instanceof Error ? err.message : 'Failed to void simulation');
    } finally {
      setIsVoiding(false);
    }
  };

  const getStatusBadgeVariant = (status: RoundOverviewItem['status']) => {
    switch (status) {
      case 'published':
        return 'success';
      case 'reviewed':
        return 'info';
      case 'simulated':
        return 'purple';
      case 'locked':
        return 'warning';
      case 'open':
        return 'blue';
      case 'draft':
      default:
        return 'secondary';
    }
  };

  const getRoundTypeLabel = (type: string, roundNumber: number) => {
    switch (type) {
      case 'investment_seed':
        return 'Round 2: Seed Investment';
      case 'investment_series_a':
        return 'Round 4: Series A Investment';
      case 'final_harvest':
        return 'Round 5: Harvest & Liquidation';
      default:
        return `Round ${roundNumber}: Core Operations`;
    }
  };

  const currentRound =
    data?.rounds.find((r) => (r.round_number ?? (r as unknown as { roundNumber?: number }).roundNumber) === data?.activeRoundNumber) ||
    data?.rounds[0];

  return (
    <AdminShell
      roundNumber={data?.activeRoundNumber || 1}
      roundStatus={currentRound?.status || 'draft'}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-sky-400 font-semibold uppercase">
                Tournament Orchestration
              </span>
              <span className="text-slate-600">•</span>
              <Badge variant="blue" className="font-mono text-xs">
                EVENT ROUND POINTER: {data?.activeRoundNumber ?? 1}
              </Badge>
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight mt-1 flex items-center gap-2">
              <PlayCircle className="h-6 w-6 text-sky-400" />
              <span>Round Control Center</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Lifecycle management, submission gates, simulation execution, and official publication
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
              disabled={isLoading}
              className="border-slate-700 text-slate-300 hover:text-white"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPolicyModalOpen(true)}
              className="border-slate-700"
            >
              {data?.organizerPolicies?.allApproved ? (
                <>
                  <ShieldCheck className="h-4 w-4 mr-2 text-emerald-400" />
                  Policies Approved
                </>
              ) : (
                <>
                  <ShieldAlert className="h-4 w-4 mr-2 text-amber-400" />
                  Review Policies
                </>
              )}
            </Button>
          </div>
        </div>
        {/* Policy Approval Banner */}
        {data && !data.organizerPolicies?.allApproved && (
          <Alert variant="warning" className="border-amber-500/40 bg-amber-500/10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-semibold text-amber-300">
                  <AlertTriangle className="h-4 w-4" />
                  Mandatory Organizer Policy Approvals Pending
                </div>
                <p className="text-xs text-amber-200/80">
                  Official tournament simulation is gated until the organizers formally record sign-off on valuation, tax, and standard VC investment mechanics.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {(data.organizerPolicies?.pendingPolicies || []).map((p, idx) => (
                    <span key={idx} className="text-[11px] font-mono bg-amber-950/60 text-amber-300 border border-amber-800/60 rounded px-2 py-0.5">
                      • {p}
                    </span>
                  ))}
                </div>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setPolicyModalOpen(true)}
                className="shrink-0 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold"
              >
                Inspect & Approve Policies
              </Button>
            </div>
          </Alert>
        )}

        {/* Global Notifications */}
        {actionSuccess && (
          <Alert variant="success" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-200">
            <CheckCircle2 className="h-4 w-4 inline mr-2 text-emerald-400" />
            {actionSuccess}
          </Alert>
        )}

        {error && (
          <Alert variant="error" className="border-rose-500/40 bg-rose-500/10 text-rose-200">
            <AlertTriangle className="h-4 w-4 inline mr-2 text-rose-400" />
            {error}
          </Alert>
        )}

        {/* Tournament Lifecycle Stages Card */}
        <Card className="bg-slate-900/60 border-slate-800">
          <CardHeader className="py-4 border-b border-slate-800">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Clock className="h-4 w-4 text-sky-400" />
                Tournament Round Lifecycle Pipeline
              </CardTitle>
              <span className="text-xs text-slate-500 font-mono">
                DRAFT → OPEN → LOCKED → SIMULATED → REVIEWED → PUBLISHED
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-center text-xs">
              <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-950/40">
                <span className="font-semibold text-slate-400 block mb-0.5">1. DRAFT</span>
                <span className="text-[11px] text-slate-500">Configured in schema</span>
              </div>
              <div className="p-2.5 rounded-lg border border-sky-800/40 bg-sky-950/20 text-sky-300">
                <span className="font-semibold block mb-0.5">2. OPEN</span>
                <span className="text-[11px] text-sky-400/80">Volunteers enter sheets</span>
              </div>
              <div className="p-2.5 rounded-lg border border-amber-800/40 bg-amber-950/20 text-amber-300">
                <span className="font-semibold block mb-0.5">3. LOCKED</span>
                <span className="text-[11px] text-amber-400/80">Submissions verified</span>
              </div>
              <div className="p-2.5 rounded-lg border border-purple-800/40 bg-purple-950/20 text-purple-300">
                <span className="font-semibold block mb-0.5">4. SIMULATED</span>
                <span className="text-[11px] text-purple-400/80">Deterministic engine run</span>
              </div>
              <div className="p-2.5 rounded-lg border border-indigo-800/40 bg-indigo-950/20 text-indigo-300">
                <span className="font-semibold block mb-0.5">5. REVIEWED</span>
                <span className="text-[11px] text-indigo-400/80">Reconciliation passed</span>
              </div>
              <div className="p-2.5 rounded-lg border border-emerald-800/40 bg-emerald-950/20 text-emerald-300">
                <span className="font-semibold block mb-0.5">6. PUBLISHED</span>
                <span className="text-[11px] text-emerald-400/80">Official leaderboard live</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Rounds Control Grid */}
        <div className="space-y-4">
          {isLoading && !data ? (
            <div className="p-12 text-center text-slate-400 bg-slate-900/40 border border-slate-800 rounded-xl">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-sky-400 mb-3" />
              Loading tournament round statuses and decision metrics...
            </div>
          ) : (
            (data?.rounds || []).map((round) => {
              const rNumber = round.round_number ?? (round as unknown as { roundNumber?: number }).roundNumber ?? 1;
              const isCurrent = rNumber === (data?.activeRoundNumber ?? 1);
              const decisionStats = round.decisionStats || ({} as RoundOverviewItem['decisionStats']);
              const totalEligible = decisionStats.totalEligible ?? (decisionStats as unknown as { total?: number }).total ?? 0;
              const verifiedPercent =
                totalEligible > 0
                  ? Math.round((decisionStats.verified / totalEligible) * 100)
                  : 0;

              return (
                <Card
                  key={round.id}
                  className={`bg-slate-900/80 border transition-colors ${
                    isCurrent ? 'border-sky-500/50 shadow-lg shadow-sky-950/20' : 'border-slate-800'
                  }`}
                >
                  <CardContent className="p-5">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                      {/* Left: Round Identification & Status */}
                      <div className="space-y-2 lg:max-w-md">
                        <div className="flex items-center gap-3">
                          <span className="text-xl font-bold font-mono text-white">
                            ROUND {rNumber}
                          </span>
                          <Badge variant={getStatusBadgeVariant(round.status)} className="uppercase text-xs font-semibold">
                            {round.status}
                          </Badge>
                          {isCurrent && (
                            <Badge variant="blue" className="text-[11px] animate-pulse">
                              CURRENT ACTIVE
                            </Badge>
                          )}
                          {round.type !== 'regular' && (
                            <Badge variant="secondary" className="text-[11px] border-slate-700">
                              <Sparkles className="h-3 w-3 mr-1 text-amber-400" />
                              {round.type === 'investment_seed'
                                ? 'Seed VC'
                                : round.type === 'investment_series_a'
                                ? 'Series A VC'
                                : 'Final Harvest'}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 font-medium">
                          {getRoundTypeLabel(round.type, rNumber)}
                        </p>

                        {/* Market Event Indicator */}
                        {(round.marketEvents || []).length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {(round.marketEvents || []).map((evt, idx) => (
                              <span
                                key={idx}
                                className="text-[11px] font-mono bg-slate-950 text-sky-300 border border-slate-800 rounded px-2 py-0.5 flex items-center gap-1.5"
                              >
                                <TrendingUp className="h-3 w-3 text-sky-400" />
                                {evt.domain}: {evt.event_name}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Blockers Alert if any */}
                        {(round.blockers || []).length > 0 && round.status !== 'published' && (
                          <div className="mt-2 text-[11px] text-amber-300 bg-amber-950/40 border border-amber-900/60 rounded px-2.5 py-1.5 space-y-0.5">
                            <span className="font-semibold block text-amber-400">Action Blockers:</span>
                            {(round.blockers || []).map((blocker, bIdx) => (
                              <p key={bIdx} className="leading-tight">• {blocker}</p>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Center: Submission Progress Metrics */}
                      <div className="space-y-2 lg:w-72">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400 flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-slate-400" />
                            Submissions Verified
                          </span>
                          <span className="font-mono font-bold text-slate-200">
                            {decisionStats.verified} / {decisionStats.totalEligible} ({verifiedPercent}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                          <div
                            className={`h-full transition-all duration-300 ${
                              verifiedPercent === 100
                                ? 'bg-emerald-500'
                                : verifiedPercent > 0
                                ? 'bg-sky-500'
                                : 'bg-slate-700'
                            }`}
                            style={{ width: `${verifiedPercent}%` }}
                          />
                        </div>
                        <div className="grid grid-cols-4 gap-1 text-[11px] text-center pt-1 font-mono">
                          <div className="bg-slate-950/60 rounded p-1 border border-slate-800/80">
                            <span className="text-slate-500 block text-[10px]">VERIFIED</span>
                            <span className="font-bold text-emerald-400">{decisionStats.verified}</span>
                          </div>
                          <div className="bg-slate-950/60 rounded p-1 border border-slate-800/80">
                            <span className="text-slate-500 block text-[10px]">ENTERED</span>
                            <span className="font-bold text-sky-400">{decisionStats.entered}</span>
                          </div>
                          <div className="bg-slate-950/60 rounded p-1 border border-slate-800/80">
                            <span className="text-slate-500 block text-[10px]">FLAGGED</span>
                            <span className="font-bold text-rose-400">{decisionStats.flagged}</span>
                          </div>
                          <div className="bg-slate-950/60 rounded p-1 border border-slate-800/80">
                            <span className="text-slate-500 block text-[10px]">MISSING</span>
                            <span className="font-bold text-amber-400">{decisionStats.missing}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right: State Action Controls */}
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                        {/* Draft State -> Open Round */}
                        {round.status === 'draft' && (
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={
                              !(round.allowedTransitions || []).includes('open') ||
                              isActionPending === round.id
                            }
                            onClick={() => handleOpenRound(round)}
                            className="bg-sky-600 hover:bg-sky-500 text-white font-semibold"
                          >
                            <Unlock className="h-4 w-4 mr-2" />
                            Open Round
                          </Button>
                        )}

                        {/* Open State -> Lock Round & View Readiness */}
                        {round.status === 'open' && (
                          <>
                            <Link href="/admin/readiness">
                              <Button variant="outline" size="sm" className="border-slate-700 text-slate-300 hover:text-white">
                                <Eye className="h-4 w-4 mr-1.5" />
                                Readiness
                              </Button>
                            </Link>
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={
                                !(round.allowedTransitions || []).includes('lock') ||
                                isActionPending === round.id
                              }
                              onClick={() => handleLockRound(round)}
                              className="bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold"
                            >
                              <Lock className="h-4 w-4 mr-1.5" />
                              Lock Round
                            </Button>
                          </>
                        )}

                        {/* Locked State -> Run Simulation */}
                        {round.status === 'locked' && (
                          <>
                            <Link href="/admin/readiness">
                              <Button variant="outline" size="sm" className="border-slate-700 text-slate-300 hover:text-white">
                                <Eye className="h-4 w-4 mr-1.5" />
                                Submissions
                              </Button>
                            </Link>
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={!(round.allowedTransitions || []).includes('simulate')}
                              onClick={() => {
                                setTargetRound(round);
                                setSimConfirmed(false);
                                setSimError(null);
                                setSimModalOpen(true);
                              }}
                              className="bg-purple-600 hover:bg-purple-500 text-white font-semibold shadow-lg shadow-purple-950/40"
                            >
                              <PlayCircle className="h-4 w-4 mr-1.5" />
                              Simulate Round
                            </Button>
                          </>
                        )}

                        {/* Simulated State -> Review Results / Void */}
                        {round.status === 'simulated' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setVoidRound(round);
                                setVoidPassword('');
                                setVoidReason('');
                                setVoidError(null);
                                setVoidModalOpen(true);
                              }}
                              className="border-slate-700 text-rose-300 hover:bg-rose-950/30"
                            >
                              <RotateCcw className="h-4 w-4 mr-1.5" />
                              Void
                            </Button>
                            <Link href={`/admin/rounds/${round.id}/results`}>
                              <Button
                                variant="primary"
                                size="sm"
                                className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
                              >
                                <Eye className="h-4 w-4 mr-1.5" />
                                Review Results
                                <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                              </Button>
                            </Link>
                          </>
                        )}

                        {/* Reviewed State -> Publish / Void */}
                        {round.status === 'reviewed' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setVoidRound(round);
                                setVoidPassword('');
                                setVoidReason('');
                                setVoidError(null);
                                setVoidModalOpen(true);
                              }}
                              className="border-slate-700 text-rose-300 hover:bg-rose-950/30"
                            >
                              <RotateCcw className="h-4 w-4 mr-1.5" />
                              Void
                            </Button>
                            <Link href={`/admin/rounds/${round.id}/results`}>
                              <Button
                                variant="primary"
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                              >
                                <Award className="h-4 w-4 mr-1.5" />
                                Publish Results
                                <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                              </Button>
                            </Link>
                          </>
                        )}

                        {/* Published State -> View Results */}
                        {round.status === 'published' && (
                          <Link href={`/admin/rounds/${round.id}/results`}>
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-emerald-600/50 text-emerald-300 hover:bg-emerald-950/30"
                            >
                              <Eye className="h-4 w-4 mr-1.5" />
                              View Official Results
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>

                    {/* Latest Simulation Run Metadata Bar */}
                    {round.latestRun && (
                      <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 font-mono">
                        <div className="flex items-center gap-4">
                          <span>
                            Active Run: <strong className="text-slate-200">v{round.latestRun.run_number}</strong>
                          </span>
                          {round.latestRun.input_hash && (
                            <span>
                              Hash: <code className="text-sky-300">{round.latestRun.input_hash.slice(0, 10)}...</code>
                            </span>
                          )}
                          {round.latestRun.completed_at && (
                            <span>
                              Simulated at: {new Date(round.latestRun.completed_at).toLocaleTimeString()}
                            </span>
                          )}
                        </div>
                        <Link
                          href={`/admin/rounds/${round.id}/results?tab=history`}
                          className="text-sky-400 hover:underline flex items-center gap-1 text-[11px]"
                        >
                          <History className="h-3 w-3" />
                          View Run History
                        </Link>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>

      {/* 1. SIMULATION EXECUTION MODAL */}
      <Modal
        isOpen={simModalOpen}
        onClose={() => setSimModalOpen(false)}
        title={targetRound ? `Execute Simulation: Round ${targetRound.round_number}` : 'Execute Simulation'}
        description="Verify pre-flight requirements before running the deterministic financial engine."
        maxWidth="lg"
      >
        {targetRound && (
          <div className="space-y-4">
            {simError && (
              <Alert variant="error" className="text-xs">
                {simError}
              </Alert>
            )}

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3 text-xs">
              <div className="flex justify-between border-b border-slate-800/60 pb-2">
                <span className="text-slate-400">Target Round:</span>
                <span className="font-mono font-bold text-white">Round {targetRound.round_number ?? (targetRound as unknown as { roundNumber?: number }).roundNumber} ({targetRound.type})</span>
              </div>
              <div className="flex justify-between border-b border-slate-800/60 pb-2">
                <span className="text-slate-400">Eligible Companies:</span>
                <span className="font-mono font-bold text-white">{targetRound.decisionStats?.totalEligible ?? (targetRound.decisionStats as unknown as { total?: number })?.total ?? 0} companies</span>
              </div>
              <div className="flex justify-between border-b border-slate-800/60 pb-2">
                <span className="text-slate-400">Verified Decisions:</span>
                <span className="font-mono font-bold text-emerald-400">
                  {targetRound.decisionStats?.verified ?? 0} / {targetRound.decisionStats?.totalEligible ?? (targetRound.decisionStats as unknown as { total?: number })?.total ?? 0} verified
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-800/60 pb-2">
                <span className="text-slate-400">Policy Gate:</span>
                <span className={`font-mono font-bold ${data?.organizerPolicies?.allApproved ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {data?.organizerPolicies?.allApproved ? 'Approved (4/4 policies)' : 'Approval Pending'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block mb-1">Active Market Events:</span>
                {(targetRound.marketEvents || []).length > 0 ? (
                  <div className="space-y-1">
                    {(targetRound.marketEvents || []).map((evt, idx) => (
                      <div key={idx} className="bg-slate-900 border border-slate-800 rounded p-2 text-slate-300">
                        <strong className="text-sky-300 font-mono">{evt.domain}:</strong> {evt.event_name}
                        <span className="text-slate-400 block text-[11px]">{evt.impact_description}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-slate-500 italic">No market events configured.</span>
                )}
              </div>
            </div>

            <div className="bg-amber-950/20 border border-amber-900/50 rounded-lg p-3 text-xs text-amber-200 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-amber-300">
                <AlertTriangle className="h-4 w-4" />
                Administrative Confirmation Required
              </div>
              <p>
                Executing this simulation will freeze verified decisions, compute market share, operational P&L, balance sheets, corporate taxes, and company valuations using the deterministic mathematical engine.
              </p>
              <label className="flex items-start gap-2.5 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={simConfirmed}
                  onChange={(e) => setSimConfirmed(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-sky-500"
                />
                <span className="text-xs text-slate-300 select-none">
                  I confirm that all official paper decision sheets for this round have been verified by volunteers and I am authorized to execute this simulation run.
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSimModalOpen(false)}
                disabled={isSimulating}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleExecuteSimulation}
                disabled={!simConfirmed || isSimulating || !data?.organizerPolicies?.allApproved}
                className="bg-purple-600 hover:bg-purple-500 text-white font-semibold"
              >
                {isSimulating ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Simulating Engine...
                  </>
                ) : (
                  <>
                    <PlayCircle className="h-4 w-4 mr-2" />
                    Execute Simulation
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 2. ORGANIZER POLICY APPROVAL MODAL */}
      <Modal
        isOpen={policyModalOpen}
        onClose={() => setPolicyModalOpen(false)}
        title="Organizer Tournament Policies"
        description="Formal review and recorded authorization of simulation financial policies."
        maxWidth="lg"
      >
        <div className="space-y-4">
          {policyError && (
            <Alert variant="error" className="text-xs">
              {policyError}
            </Alert>
          )}

          <div className="space-y-3">
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <strong className="text-slate-200">1. Cash Valuation Contribution Policy</strong>
                <Badge variant={data?.organizerPolicies?.allApproved ? 'success' : 'warning'} className="text-[10px]">
                  {data?.organizerPolicies?.allApproved ? 'APPROVED' : 'PENDING'}
                </Badge>
              </div>
              <p className="text-slate-400">
                Excess cash above $250,000 baseline contributes to company valuation at a 25% factor: <code className="text-sky-300">0.25 × max(0, Cash - $250k)</code>.
              </p>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <strong className="text-slate-200">2. Corporate Taxation Policy</strong>
                <Badge variant={data?.organizerPolicies?.allApproved ? 'success' : 'warning'} className="text-[10px]">
                  {data?.organizerPolicies?.allApproved ? 'APPROVED' : 'PENDING'}
                </Badge>
              </div>
              <p className="text-slate-400">
                Profitable companies incur 20% corporate tax on positive EBT. Net Operating Losses (NOL) carry forward indefinitely and deduct from subsequent taxable profits.
              </p>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <strong className="text-slate-200">3. Standardized Uniform VC Offers</strong>
                <Badge variant={data?.organizerPolicies?.allApproved ? 'success' : 'warning'} className="text-[10px]">
                  {data?.organizerPolicies?.allApproved ? 'APPROVED' : 'PENDING'}
                </Badge>
              </div>
              <p className="text-slate-400">
                Round 2 Seed ($400,000 for 25.0% or $200,000 for 12.5%). Round 4 Series A ($800,000 for 20.0% or $450,000 for 10.0%). Equity is strictly conserved.
              </p>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <strong className="text-slate-200">4. Strict Spending Solvency Policy</strong>
                <Badge variant={data?.organizerPolicies?.allApproved ? 'success' : 'warning'} className="text-[10px]">
                  {data?.organizerPolicies?.allApproved ? 'APPROVED' : 'PENDING'}
                </Badge>
              </div>
              <p className="text-slate-400">
                Strict rejection of overspending decisions. Total planned cash expenditures (marketing, R&amp;D, operations, production) must not exceed available liquid cash. Zero automatic paper scaling is permitted.
              </p>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-3 space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Authorized Approver Name or Staff ID:
              </label>
              <Input
                placeholder="e.g., Organizer Lead / Chief Arbiter"
                value={approverName}
                onChange={(e) => setApproverName(e.target.value)}
                className="bg-slate-950 border-slate-800 text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPolicyModalOpen(false)}
              disabled={isApproving}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleRecordPolicyApprovals}
              disabled={isApproving || !approverName.trim()}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
            >
              {isApproving ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Recording Approvals...
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  Record Formal Approval
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 3. VOID / RE-SIMULATE MODAL */}
      <Modal
        isOpen={voidModalOpen}
        onClose={() => setVoidModalOpen(false)}
        title={voidRound ? `Void Simulation: Round ${voidRound.round_number}` : 'Void Simulation'}
        description="Non-destructive rollback of active simulation run for corrections."
        maxWidth="md"
      >
        {voidRound && (
          <div className="space-y-4">
            {voidError && (
              <Alert variant="error" className="text-xs">
                {voidError}
              </Alert>
            )}

            <Alert variant="warning" className="text-xs border-amber-500/40 bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 inline mr-1 text-amber-400" />
              Voiding supersedes the current active run (Run v{voidRound.latestRun?.run_number ?? 1}) and reverts Round {voidRound.round_number} to <strong>LOCKED</strong>. Financial snapshots are preserved in audit history.
            </Alert>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Admin Confirmation Password (min 8 chars):
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
                  Mandatory Correction Reason (min 10 chars):
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g., Volunteer data entry error corrected on paper sheet for Team C04"
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
                    Voiding Run...
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Confirm Void & Unlock
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </AdminShell>
  );
}
