'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Users,
  CheckCircle2,
  FileEdit,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Building2,
  Layers,
} from 'lucide-react';
import { AdminShell } from '@/components/layout/admin-shell';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

interface TournamentEvent {
  id: string;
  name: string;
  total_rounds?: number;
  status?: string;
}

interface TournamentRound {
  id: string;
  round_number: number;
  status: string;
}

interface OverviewStats {
  event: TournamentEvent | null;
  totalTeams: number;
  totalDomains: number;
  activeRound: TournamentRound | null;
  submittedCount: number;
  verifiedCount: number;
  missingCount: number;
  flaggedCount: number;
  eventStatus: string;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = React.useState<OverviewStats | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const fetchStats = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/overview');
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load tournament overview');
      setStats(data.data.stats);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error loading dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    fetchStats();
  }, []);

  const event = stats?.event;
  const activeRound = stats?.activeRound;
  const totalTeams = stats?.totalTeams || 0;
  const verifiedCount = stats?.verifiedCount || 0;
  const submittedCount = stats?.submittedCount || 0;
  const missingCount = stats?.missingCount || 0;
  const flaggedCount = stats?.flaggedCount || 0;

  const digitizationPct = totalTeams > 0 ? Math.round((verifiedCount / totalTeams) * 100) : 0;

  return (
    <AdminShell
      eventName={event?.name || 'Tournament Staging'}
      roundNumber={activeRound?.round_number || 1}
      roundStatus={activeRound?.status || 'open'}
    >
      <div className="space-y-8 animate-in fade-in duration-200">
        {/* TOP BANNER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-indigo-400 font-semibold tracking-wider uppercase">
                Executive Command Center
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-xs text-slate-400">Live Pulse</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
              {event?.name || 'Capital Quest Competition'}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Monitor team registrations, paper-slip digitization, and round simulation readiness.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href="/volunteer/entry">
              <Button variant="primary" size="sm" className="gap-1.5 shadow-indigo-900/40">
                <FileEdit className="h-4 w-4" />
                <span>Digitize Slips</span>
              </Button>
            </Link>

            <Link href="/volunteer/verify">
              <Button variant="emerald" size="sm" className="gap-1.5 shadow-emerald-900/40">
                <CheckCircle2 className="h-4 w-4" />
                <span>Dual-Verification</span>
              </Button>
            </Link>

            <Link href="/admin/readiness">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ShieldCheck className="h-4 w-4 text-amber-400" />
                <span>Readiness Audit</span>
              </Button>
            </Link>
          </div>
        </div>

        {errorMsg && (
          <Alert variant="error" title="Dashboard Telemetry Error">
            {errorMsg}
          </Alert>
        )}

        {/* EMPTY STATE WARNING */}
        {!isLoading && totalTeams === 0 && (
          <div className="p-8 rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mx-auto">
              <Users className="h-6 w-6" />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h3 className="text-base font-bold text-white">No Competing Teams Registered</h3>
              <p className="text-xs text-slate-400">
                Register student ventures and assign them to the 4 business domains to initialize competition operations.
              </p>
            </div>
            <Link href="/admin/teams">
              <Button variant="primary" size="sm" className="gap-2">
                <span>Go to Team Management</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        )}

        {/* 4-GRID EXECUTIVE KPI CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* CARD 1: TEAMS */}
          <Card className="border-slate-800 hover:border-slate-700 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-mono font-medium text-slate-400 uppercase tracking-wider">
                Competing Ventures
              </CardTitle>
              <Users className="h-4 w-4 text-indigo-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-white">
                {isLoading ? '...' : totalTeams}
              </div>
              <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                <span className="text-emerald-400 font-semibold">{totalTeams} Active</span>
                <span>across {stats?.totalDomains || 4} Domains</span>
              </p>
            </CardContent>
          </Card>

          {/* CARD 2: ROUND STATUS */}
          <Card className="border-slate-800 hover:border-slate-700 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-mono font-medium text-slate-400 uppercase tracking-wider">
                Current Round
              </CardTitle>
              <Layers className="h-4 w-4 text-amber-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-white flex items-center gap-2">
                <span>R{activeRound?.round_number || 1}</span>
                <Badge
                  variant={activeRound?.status === 'open' ? 'open' : activeRound?.status === 'locked' ? 'locked' : 'default'}
                  className="text-[10px] py-0 px-2"
                >
                  {activeRound?.status || 'OPEN'}
                </Badge>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {event?.total_rounds ? `Round ${activeRound?.round_number || 1} of ${event.total_rounds}` : 'Standard 5-Round Event'}
              </p>
            </CardContent>
          </Card>

          {/* CARD 3: DIGITIZATION PROGRESS */}
          <Card className="border-slate-800 hover:border-slate-700 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-mono font-medium text-slate-400 uppercase tracking-wider">
                Digitization Progress
              </CardTitle>
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-white flex items-baseline gap-2">
                <span>{isLoading ? '...' : `${verifiedCount} / ${totalTeams}`}</span>
                <span className="text-xs font-normal text-emerald-400">({digitizationPct}%)</span>
              </div>
              {/* MINI PROGRESS BAR */}
              <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-indigo-500 to-emerald-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, digitizationPct)}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">
                {submittedCount} submitted • {verifiedCount} verified
              </p>
            </CardContent>
          </Card>

          {/* CARD 4: FLAGGED SLIPS */}
          <Card className="border-slate-800 hover:border-slate-700 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-mono font-medium text-slate-400 uppercase tracking-wider">
                Discrepancies
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-rose-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-white">
                {isLoading ? '...' : flaggedCount}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {flaggedCount > 0 ? (
                  <span className="text-rose-400 font-semibold">{flaggedCount} Mismatched Slips</span>
                ) : (
                  <span className="text-emerald-400">Zero Flagged Slips</span>
                )}
                {' • '}
                <span>{missingCount} Missing</span>
              </p>
            </CardContent>
          </Card>
        </div>

        {/* DOMAIN QUICK-HEALTH GRID (4 DOMAINS) */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <Building2 className="h-4 w-4 text-indigo-400" />
              <span>Domain Division Overview</span>
            </h2>
            <Link href="/coordinator/dashboard" className="text-xs text-indigo-400 hover:underline">
              Open Coordinator Desk →
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { code: 'CLEAN', name: 'CleanTech Hardware', baseDemand: '10,000 units', cogs: '$200.00' },
              { code: 'HEALTH', name: 'HealthTech Devices', baseDemand: '8,000 units', cogs: '$250.00' },
              { code: 'SAAS', name: 'Enterprise SaaS', baseDemand: '12,000 licenses', cogs: '$40.00' },
              { code: 'D2C', name: 'D2C Consumer Goods', baseDemand: '25,000 units', cogs: '$30.00' },
            ].map(domain => (
              <div
                key={domain.code}
                className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-2"
              >
                <div className="flex justify-between items-start">
                  <Badge variant="domain">{domain.code}</Badge>
                  <span className="text-[10px] font-mono text-slate-400">COGS: {domain.cogs}</span>
                </div>
                <div className="font-semibold text-white text-sm">{domain.name}</div>
                <div className="text-xs text-slate-400">Base Demand: {domain.baseDemand}</div>
              </div>
            ))}
          </div>
        </div>

        {/* QUICK NAVIGATION TILES */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
          <Link href="/admin/teams" className="group">
            <Card className="h-full border-slate-800 group-hover:border-indigo-500/50 transition-all p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">
                    Team & Roster Management
                  </div>
                  <div className="text-xs text-slate-400">
                    Register companies, assign table stations, and enroll student team rosters.
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-slate-500 group-hover:text-indigo-400 transition-all group-hover:translate-x-1 shrink-0 ml-4" />
              </div>
            </Card>
          </Link>

          <Link href="/admin/decisions" className="group">
            <Card className="h-full border-slate-800 group-hover:border-emerald-500/50 transition-all p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors">
                    Admin Decision Console
                  </div>
                  <div className="text-xs text-slate-400">
                    Single-operator decision entry with solvency enforcement and instant verification.
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-slate-500 group-hover:text-emerald-400 transition-all group-hover:translate-x-1 shrink-0 ml-4" />
              </div>
            </Card>
          </Link>

          <Link href="/admin/readiness" className="group">
            <Card className="h-full border-slate-800 group-hover:border-amber-500/50 transition-all p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors">
                    Round Readiness Monitor
                  </div>
                  <div className="text-xs text-slate-400">
                    Audit submission verification completeness and inspect flagged slip discrepancies.
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-slate-500 group-hover:text-amber-400 transition-all group-hover:translate-x-1 shrink-0 ml-4" />
              </div>
            </Card>
          </Link>
        </div>
      </div>
    </AdminShell>
  );
}
