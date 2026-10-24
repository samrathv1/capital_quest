'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Sliders,
  ArrowRight,
} from 'lucide-react';
import { AdminShell } from '@/components/layout/admin-shell';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Alert } from '@/components/ui/alert';

interface Domain {
  id: string;
  code: string;
  name: string;
  base_demand?: number;
  base_unit_cogs?: number;
}

interface RoundItem {
  id: string;
  round_number: number;
  status: string;
}

interface TeamReadiness {
  teamId: string;
  teamCode: string;
  companyName: string;
  tableStation?: string;
  status: string;
  decision?: Record<string, unknown> | null;
}

interface DomainReadinessData {
  totalTeams: number;
  verifiedCount: number;
  missingCount: number;
  flaggedCount: number;
  enteredCount: number;
  isReady: boolean;
  teams: TeamReadiness[];
}

export default function CoordinatorDashboardPage() {
  const [domains, setDomains] = React.useState<Domain[]>([]);
  const [selectedDomainId, setSelectedDomainId] = React.useState<string>('');
  const [activeRound, setActiveRound] = React.useState<RoundItem | null>(null);
  const [readiness, setReadiness] = React.useState<DomainReadinessData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const fetchDomainsAndEvent = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/events/active');
      const json = await res.json();
      const event = json.data?.event;

      if (event) {
        const dList = (event.domains || []) as Domain[];
        setDomains(dList);

        const rounds = [...(event.rounds || [])] as RoundItem[];
        rounds.sort((a, b) => a.round_number - b.round_number);
        const current = rounds.find(r => r.status === 'open' || r.status === 'locked') || rounds[0];
        setActiveRound(current || null);

        if (dList.length > 0 && !selectedDomainId) {
          setSelectedDomainId(dList[0].id);
        }
      }
    } catch {
      // Fallback
    } finally {
      setIsLoading(false);
    }
  }, [selectedDomainId]);

  const fetchDomainReadiness = React.useCallback(async (domainId: string, roundId: string) => {
    try {
      const res = await fetch(`/api/coordinator/readiness?roundId=${roundId}&domainId=${domainId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to load readiness data');
      setReadiness(json.data?.readiness);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error fetching domain readiness');
    }
  }, []);

  React.useEffect(() => {
    fetchDomainsAndEvent();
  }, [fetchDomainsAndEvent]);

  React.useEffect(() => {
    if (selectedDomainId && activeRound?.id) {
      fetchDomainReadiness(selectedDomainId, activeRound.id);
    }
  }, [selectedDomainId, activeRound, fetchDomainReadiness]);

  const selectedDomain = domains.find(d => d.id === selectedDomainId);
  const teams = (readiness?.teams || []) as TeamReadiness[];
  const total = readiness?.totalTeams || 0;
  const verified = readiness?.verifiedCount || 0;
  const missing = readiness?.missingCount || 0;
  const flagged = readiness?.flaggedCount || 0;
  const entered = readiness?.enteredCount || 0;
  const isReady = readiness?.isReady;

  return (
    <AdminShell
      roundNumber={activeRound?.round_number || 1}
      roundStatus={activeRound?.status || 'open'}
    >
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-indigo-400 font-semibold uppercase">
                Floor Operations
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-xs text-slate-400">Industry Division Lead</span>
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight mt-1 flex items-center gap-2">
              <Sliders className="h-6 w-6 text-indigo-400" />
              <span>Domain Coordinator Desk</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Supervise paper-slip collection, audit flagged discrepancies, and verify floor readiness.
            </p>
          </div>

          {/* DOMAIN SWITCHER TABS */}
          <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
            {domains.map(d => (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedDomainId(d.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all ${
                  selectedDomainId === d.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {d.code}
              </button>
            ))}
          </div>
        </div>

        {errorMsg && (
          <Alert variant="error" title="Readiness Status Alert">
            {errorMsg}
          </Alert>
        )}

        {/* DOMAIN STATS & READINESS GAUGE */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-slate-800 bg-[#0C1322]">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-mono text-slate-400 uppercase">
                Active Domain
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-white flex items-center gap-2">
                <span>{selectedDomain?.name || 'Selected Domain'}</span>
              </div>
              <Badge variant="domain" className="mt-2 text-[10px]">
                CODE: {selectedDomain?.code}
              </Badge>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-[#0C1322]">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-mono text-slate-400 uppercase">
                Slip Completion
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold font-mono text-white flex items-baseline gap-2">
                <span>{verified} / {total}</span>
                <span className="text-xs text-emerald-400 font-normal">
                  ({total > 0 ? Math.round((verified / total) * 100) : 0}%)
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Verified dual-entry slips</p>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-[#0C1322]">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-mono text-slate-400 uppercase">
                Missing / Pending
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold font-mono text-amber-400">
                {missing} Missing • {entered} Pending
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Awaiting physical slips</p>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-[#0C1322]">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-mono text-slate-400 uppercase">
                Domain Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {isReady ? (
                  <Badge variant="verified" indicator className="text-xs py-1">
                    100% READY
                  </Badge>
                ) : (
                  <Badge variant="flagged" indicator className="text-xs py-1">
                    {flagged > 0 ? `${flagged} FLAGGED` : 'IN PROGRESS'}
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {isReady ? 'All slips verified for simulation' : `${missing + flagged} issues pending resolution`}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* DOMAIN TEAMS ROSTER & VERIFICATION TABLE */}
        <Card className="border-slate-800 p-0 overflow-hidden">
          <CardHeader className="p-4 bg-slate-900/60 border-b border-slate-800/80">
            <CardTitle className="text-sm font-bold flex items-center justify-between">
              <span>Domain Companies ({teams.length})</span>
              <div className="flex gap-2">
                <Link href="/volunteer/entry">
                  <Button variant="ghost" size="sm" className="text-xs text-indigo-400 h-7">
                    <span>Quick Entry</span>
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardTitle>
          </CardHeader>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Team Code</TableHead>
                <TableHead>Company Name</TableHead>
                <TableHead>Table Station</TableHead>
                <TableHead className="text-center">Slip Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-xs text-slate-500 font-mono">
                    Loading domain companies from database...
                  </TableCell>
                </TableRow>
              ) : teams.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-xs text-slate-500 font-mono">
                    No companies assigned to this domain yet.
                  </TableCell>
                </TableRow>
              ) : (
                teams.map(t => (
                  <TableRow key={t.teamId} className="hover:bg-slate-800/50 transition-colors">
                    <TableCell className="font-mono font-bold text-indigo-400 text-sm">
                      {t.teamCode}
                    </TableCell>
                    <TableCell className="font-semibold text-white">
                      {t.companyName}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-300">
                      {t.tableStation ? `Table ${t.tableStation}` : 'Unassigned'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={
                          t.status === 'verified'
                            ? 'verified'
                            : t.status === 'entered'
                            ? 'entered'
                            : t.status === 'flagged'
                            ? 'flagged'
                            : 'missing'
                        }
                        indicator
                      >
                        {t.status.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {t.status === 'missing' && (
                        <Link href="/volunteer/entry">
                          <Button variant="primary" size="sm" className="h-7 text-xs">
                            Enter Slip
                          </Button>
                        </Link>
                      )}
                      {t.status === 'entered' && (
                        <Link href="/volunteer/verify">
                          <Button variant="emerald" size="sm" className="h-7 text-xs">
                            Verify
                          </Button>
                        </Link>
                      )}
                      {t.status === 'flagged' && (
                        <Link href="/volunteer/verify">
                          <Button variant="destructive" size="sm" className="h-7 text-xs">
                            Resolve
                          </Button>
                        </Link>
                      )}
                      {t.status === 'verified' && (
                        <span className="text-xs text-emerald-400 font-mono">Verified ✓</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </AdminShell>
  );
}
