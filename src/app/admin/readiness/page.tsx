'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  CheckSquare,
  AlertTriangle,
  Lock,
  RefreshCw,
  FileSpreadsheet,
} from 'lucide-react';
import { AdminShell } from '@/components/layout/admin-shell';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

interface RoundItem {
  id: string;
  round_number: number;
  status: string;
}

interface EventItem {
  id: string;
  name: string;
  rounds?: RoundItem[];
}

interface TeamRecord {
  id: string;
  team_code: string;
  company_name: string;
  table_station?: string;
  domains?: { code: string; name: string };
}

interface DecisionRecord {
  team_id: string;
  status: 'missing' | 'entered' | 'verified' | 'flagged' | 'locked';
  entered_at?: string;
  verified_at?: string;
}

interface TeamDecisionStatus {
  id: string;
  team_code: string;
  company_name: string;
  domain_code: string;
  table_station?: string;
  status: 'missing' | 'entered' | 'verified' | 'flagged' | 'locked';
  entered_at?: string;
  verified_at?: string;
}

export default function RoundReadinessPage() {
  const [activeRound, setActiveRound] = React.useState<RoundItem | null>(null);
  const [activeEvent, setActiveEvent] = React.useState<EventItem | null>(null);
  const [teamsStatus, setTeamsStatus] = React.useState<TeamDecisionStatus[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isLocking, setIsLocking] = React.useState(false);
  const [lockError, setLockError] = React.useState<string | null>(null);
  const [lockSuccess, setLockSuccess] = React.useState<string | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    setLockError(null);
    try {
      const eventRes = await fetch('/api/events/active');
      const eventJson = await eventRes.json();
      const event = eventJson.data?.event as EventItem | undefined;

      if (event) {
        setActiveEvent(event);
        const rounds = [...(event.rounds || [])];
        rounds.sort((a, b) => a.round_number - b.round_number);
        const current = rounds.find(r => r.status === 'open' || r.status === 'locked') || rounds[0];
        setActiveRound(current || null);

        const teamsRes = await fetch(`/api/teams?eventId=${event.id}`);
        const teamsJson = await teamsRes.json();
        const teams = (teamsJson.data?.teams || []) as TeamRecord[];

        let decisions: DecisionRecord[] = [];
        if (current) {
          const decRes = await fetch(`/api/decisions?roundId=${current.id}`);
          const decJson = await decRes.json();
          decisions = (decJson.data?.decisions || []) as DecisionRecord[];
        }

        const decisionMap = new Map(decisions.map(d => [d.team_id, d]));

        const statuses: TeamDecisionStatus[] = teams.map(t => {
          const dec = decisionMap.get(t.id);
          return {
            id: t.id,
            team_code: t.team_code,
            company_name: t.company_name,
            domain_code: t.domains?.code || 'TECH',
            table_station: t.table_station,
            status: dec ? dec.status : 'missing',
            entered_at: dec?.entered_at,
            verified_at: dec?.verified_at,
          };
        });

        setTeamsStatus(statuses);
      }
    } catch {
      // Fallback
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    fetchData();
  }, []);

  const total = teamsStatus.length;
  const verified = teamsStatus.filter(t => t.status === 'verified' || t.status === 'locked').length;
  const entered = teamsStatus.filter(t => t.status === 'entered').length;
  const missing = teamsStatus.filter(t => t.status === 'missing').length;
  const flagged = teamsStatus.filter(t => t.status === 'flagged').length;

  const blockers = [
    ...(missing > 0 ? [`${missing} teams have not submitted physical decision sheets.`] : []),
    ...(flagged > 0 ? [`${flagged} slips have entry discrepancies that must be reconciled.`] : []),
    ...(entered > 0 ? [`${entered} slips are awaiting second-operator dual-verification.`] : []),
  ];

  const isReadyToLock = total > 0 && verified === total;

  const handleLockRound = async (override = false) => {
    if (!activeRound) return;
    setIsLocking(true);
    setLockError(null);
    setLockSuccess(null);

    try {
      const res = await fetch(`/api/rounds/${activeRound.id}/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrideMissing: override }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || 'Failed to lock round');
      }

      setLockSuccess(`Round ${activeRound.round_number} has been officially LOCKED. Data entry is now closed.`);
      await fetchData();
    } catch (err: unknown) {
      setLockError(err instanceof Error ? err.message : 'Error locking round.');
    } finally {
      setIsLocking(false);
    }
  };

  return (
    <AdminShell
      eventName={activeEvent?.name}
      roundNumber={activeRound?.round_number || 1}
      roundStatus={activeRound?.status || 'open'}
    >
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-amber-400 font-semibold uppercase">
                Round Pre-Flight Check
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-xs text-slate-400">Simulation Readiness</span>
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight mt-1 flex items-center gap-2">
              <CheckSquare className="h-6 w-6 text-amber-400" />
              <span>Round Readiness & Audit Monitor</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Verify that 100% of physical decision slips are entered and peer-verified before freezing the round.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/admin/decisions">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-emerald-800 text-emerald-400 hover:bg-emerald-950/40"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>Admin Decision Entry</span>
              </Button>
            </Link>

            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
              isLoading={isLoading}
              className="gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Refresh</span>
            </Button>

            {activeRound?.status === 'open' && (
              <Button
                variant={isReadyToLock ? 'emerald' : 'secondary'}
                size="sm"
                onClick={() => handleLockRound(false)}
                isLoading={isLocking}
                className="gap-1.5 font-bold shadow-md"
              >
                <Lock className="h-4 w-4" />
                <span>Lock Round Submissions</span>
              </Button>
            )}
          </div>
        </div>

        {lockError && (
          <Alert variant="error" title="Lock Operation Rejected">
            {lockError}
          </Alert>
        )}

        {lockSuccess && (
          <Alert variant="success" title="Round Locked Successfully">
            {lockSuccess}
          </Alert>
        )}

        {/* STATUS GAUGES */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-slate-800 bg-[#0C1322]">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-mono text-slate-400 uppercase">
                Total Teams
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-white">{total}</div>
              <p className="text-[11px] text-slate-400 mt-1">Expected decision sheets</p>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-[#0C1322]">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-mono text-slate-400 uppercase">
                Verified
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-emerald-400">{verified}</div>
              <p className="text-[11px] text-slate-400 mt-1">
                {total > 0 ? Math.round((verified / total) * 100) : 0}% Dual-verified
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-[#0C1322]">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-mono text-slate-400 uppercase">
                Pending Verification
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-blue-400">{entered}</div>
              <p className="text-[11px] text-slate-400 mt-1">Awaiting 2nd operator</p>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-[#0C1322]">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-mono text-slate-400 uppercase">
                Blockers / Issues
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-rose-400">
                {missing + flagged}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {missing} Missing • {flagged} Flagged
              </p>
            </CardContent>
          </Card>
        </div>

        {/* BLOCKER SUMMARY ALERT */}
        {blockers.length > 0 && activeRound?.status === 'open' && (
          <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-950/30 text-amber-200 space-y-2">
            <div className="flex items-center gap-2 font-bold text-amber-300 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <span>Round Simulation Blockers ({blockers.length})</span>
            </div>
            <ul className="list-disc list-inside text-xs space-y-1 font-mono text-amber-200/90 pl-1">
              {blockers.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
            <div className="pt-1 flex gap-2 text-xs">
              <Link href="/volunteer/entry" className="underline font-semibold text-amber-300 hover:text-white">
                Open 10-Key Digitization →
              </Link>
              <span>•</span>
              <Link href="/volunteer/verify" className="underline font-semibold text-amber-300 hover:text-white">
                Open Dual-Verification →
              </Link>
            </div>
          </div>
        )}

        {/* ALL TEAMS STATUS TABLE */}
        <Card className="border-slate-800 p-0 overflow-hidden">
          <CardHeader className="p-4 bg-slate-900/60 border-b border-slate-800/80">
            <CardTitle className="text-sm font-bold flex items-center justify-between">
              <span>All Teams Decision Status — Round {activeRound?.round_number || 1}</span>
              <span className="text-xs font-mono text-slate-400">
                {verified} / {total} Ready
              </span>
            </CardTitle>
          </CardHeader>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Code</TableHead>
                <TableHead>Company Name</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Station</TableHead>
                <TableHead className="text-center">Verification Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teamsStatus.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-xs text-slate-500 font-mono">
                    No teams found for the active tournament.
                  </TableCell>
                </TableRow>
              ) : (
                teamsStatus.map(t => (
                  <TableRow key={t.id} className="hover:bg-slate-800/40 transition-colors">
                    <TableCell className="font-mono font-bold text-indigo-400">
                      {t.team_code}
                    </TableCell>
                    <TableCell className="font-semibold text-white">
                      {t.company_name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="domain">{t.domain_code}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-400">
                      {t.table_station ? `Table ${t.table_station}` : 'Unassigned'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={
                          t.status === 'verified' || t.status === 'locked'
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
                        <Link href={`/admin/decisions?teamId=${t.id}`}>
                          <Button variant="outline" size="sm" className="h-7 text-xs">
                            Enter Slip
                          </Button>
                        </Link>
                      )}
                      {t.status === 'entered' && (
                        <Link href={`/admin/decisions?teamId=${t.id}`}>
                          <Button variant="emerald" size="sm" className="h-7 text-xs">
                            Confirm
                          </Button>
                        </Link>
                      )}
                      {t.status === 'flagged' && (
                        <Link href={`/admin/decisions?teamId=${t.id}`}>
                          <Button variant="destructive" size="sm" className="h-7 text-xs">
                            Resolve
                          </Button>
                        </Link>
                      )}
                      {(t.status === 'verified' || t.status === 'locked') && (
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
