'use client';

import * as React from 'react';
import {
  Users,
  Plus,
  Filter,
  UserPlus,
  CheckCircle2,
} from 'lucide-react';
import { AdminShell } from '@/components/layout/admin-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Alert } from '@/components/ui/alert';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';

interface TeamMember {
  id: string;
  team_id?: string;
  full_name: string;
  email?: string;
  role_title: string;
}

interface Team {
  id: string;
  event_id: string;
  domain_id: string;
  team_code: string;
  company_name: string;
  table_station?: string;
  is_disqualified: boolean;
  domains?: { code: string; name: string };
  team_members?: TeamMember[];
}

interface Domain {
  id: string;
  code: string;
  name: string;
}

export default function AdminTeamsPage() {
  const [teams, setTeams] = React.useState<Team[]>([]);
  const [domains, setDomains] = React.useState<Domain[]>([]);
  const [activeEventId, setActiveEventId] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedDomainFilter, setSelectedDomainFilter] = React.useState<string>('ALL');

  // Register Modal state
  const [isRegisterOpen, setIsRegisterOpen] = React.useState(false);
  const [newTeamCode, setNewTeamCode] = React.useState('');
  const [newCompanyName, setNewCompanyName] = React.useState('');
  const [newDomainId, setNewDomainId] = React.useState('');
  const [newTableStation, setNewTableStation] = React.useState('');
  const [isRegistering, setIsRegistering] = React.useState(false);
  const [registerError, setRegisterError] = React.useState<string | null>(null);

  // Roster Modal state
  const [selectedTeamForRoster, setSelectedTeamForRoster] = React.useState<Team | null>(null);
  const [isRosterOpen, setIsRosterOpen] = React.useState(false);
  const [members, setMembers] = React.useState<TeamMember[]>([]);
  const [newMemberName, setNewMemberName] = React.useState('');
  const [newMemberEmail, setNewMemberEmail] = React.useState('');
  const [newMemberRole, setNewMemberRole] = React.useState('Co-Founder');
  const [isAddingMember, setIsAddingMember] = React.useState(false);
  const [memberError, setMemberError] = React.useState<string | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const eventRes = await fetch('/api/events/active');
      const eventJson = await eventRes.json();
      const event = eventJson.data?.event;

      if (event) {
        setActiveEventId(event.id);
        setDomains(event.domains || []);

        const teamsRes = await fetch(`/api/teams?eventId=${event.id}`);
        const teamsJson = await teamsRes.json();
        setTeams(teamsJson.data?.teams || []);
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

  // Handle Team Registration
  const handleRegisterTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEventId) {
      setRegisterError('No active tournament event available.');
      return;
    }
    if (!newDomainId) {
      setRegisterError('Please select a business domain.');
      return;
    }

    setIsRegistering(true);
    setRegisterError(null);

    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: activeEventId,
          domainId: newDomainId,
          teamCode: newTeamCode.trim().toUpperCase(),
          companyName: newCompanyName.trim(),
          tableStation: newTableStation.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || 'Failed to register team');
      }

      setIsRegisterOpen(false);
      setNewTeamCode('');
      setNewCompanyName('');
      setNewTableStation('');
      await fetchData();
    } catch (err: unknown) {
      setRegisterError(err instanceof Error ? err.message : 'Error registering team.');
    } finally {
      setIsRegistering(false);
    }
  };

  // Open Roster Modal
  const handleOpenRoster = async (team: Team) => {
    setSelectedTeamForRoster(team);
    setIsRosterOpen(true);
    setMemberError(null);
    try {
      const res = await fetch(`/api/teams/${team.id}/members`);
      const json = await res.json();
      setMembers(json.data?.members || []);
    } catch {
      setMembers([]);
    }
  };

  // Add Member
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeamForRoster) return;

    setIsAddingMember(true);
    setMemberError(null);

    try {
      const res = await fetch(`/api/teams/${selectedTeamForRoster.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: newMemberName.trim(),
          email: newMemberEmail.trim() || undefined,
          roleTitle: newMemberRole.trim() || 'Co-Founder',
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to add member');

      setNewMemberName('');
      setNewMemberEmail('');
      setNewMemberRole('Co-Founder');

      // Refresh members
      const ref = await fetch(`/api/teams/${selectedTeamForRoster.id}/members`);
      const refJson = await ref.json();
      setMembers(refJson.data?.members || []);
    } catch (err: unknown) {
      setMemberError(err instanceof Error ? err.message : 'Error adding team member.');
    } finally {
      setIsAddingMember(false);
    }
  };

  // Filtered teams list
  const filteredTeams = teams.filter(team => {
    const matchesDomain =
      selectedDomainFilter === 'ALL' ||
      team.domains?.code?.toUpperCase() === selectedDomainFilter;

    const query = searchQuery.toLowerCase();
    const matchesSearch =
      team.team_code.toLowerCase().includes(query) ||
      team.company_name.toLowerCase().includes(query) ||
      (team.table_station && team.table_station.toLowerCase().includes(query));

    return matchesDomain && matchesSearch;
  });

  return (
    <AdminShell>
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* HEADER & ACTIONS */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-800">
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
              <Users className="h-6 w-6 text-indigo-400" />
              <span>Team & Roster Management</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Enroll participating student companies, assign industry divisions, and configure physical stations.
            </p>
          </div>

          <Button
            variant="primary"
            onClick={() => {
              setIsRegisterOpen(true);
              setRegisterError(null);
            }}
            className="gap-2 shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Register New Team</span>
          </Button>
        </div>

        {/* SEARCH & FILTER TOOLBAR */}
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* SEARCH BAR */}
          <div className="w-full md:w-80">
            <Input
              placeholder="Search code, company, or table..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              prefixSymbol="🔍"
              className="h-10 text-xs"
            />
          </div>

          {/* DOMAIN FILTER PILLS */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            <span className="text-xs font-mono text-slate-500 mr-1 flex items-center gap-1">
              <Filter className="h-3 w-3" />
              <span>Filter:</span>
            </span>
            {['ALL', 'CLEAN', 'HEALTH', 'SAAS', 'D2C'].map(code => (
              <button
                key={code}
                type="button"
                onClick={() => setSelectedDomainFilter(code)}
                className={`px-3 py-1 rounded-lg text-xs font-mono font-medium transition-colors ${
                  selectedDomainFilter === code
                    ? 'bg-indigo-600 text-white font-bold'
                    : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {code}
              </button>
            ))}
          </div>
        </div>

        {/* TEAMS DATA TABLE */}
        <Card className="border-slate-800 p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Team Code</TableHead>
                <TableHead>Company Name</TableHead>
                <TableHead>Industry Domain</TableHead>
                <TableHead>Table Station</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Roster</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-slate-400 text-xs font-mono">
                    Loading registered teams from database...
                  </TableCell>
                </TableRow>
              ) : filteredTeams.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 space-y-2 text-slate-400">
                    <div className="text-sm font-semibold text-slate-300">No teams found</div>
                    <div className="text-xs text-slate-500">
                      {searchQuery
                        ? 'No teams match your current search criteria.'
                        : 'No teams are registered in this domain yet.'}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredTeams.map(team => (
                  <TableRow key={team.id} className="hover:bg-slate-800/50 transition-colors">
                    <TableCell className="font-mono font-bold text-indigo-400 text-sm">
                      {team.team_code}
                    </TableCell>
                    <TableCell className="font-semibold text-white">
                      {team.company_name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="domain">
                        {team.domains?.code || 'TECH'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-300">
                      {team.table_station ? `Station ${team.table_station}` : 'Unassigned'}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-mono">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Active</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenRoster(team)}
                        className="text-xs h-8 text-indigo-400 hover:text-indigo-300 gap-1.5"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        <span>Roster</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        {/* REGISTER TEAM MODAL */}
        <Modal
          isOpen={isRegisterOpen}
          onClose={() => setIsRegisterOpen(false)}
          title="Register Competing Team"
          description="Enrolls a new company in the tournament and binds it to a business domain."
        >
          {registerError && (
            <Alert variant="error" className="mb-4">
              {registerError}
            </Alert>
          )}

          <form onSubmit={handleRegisterTeam} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Industry Domain *
              </label>
              <select
                required
                value={newDomainId}
                onChange={e => setNewDomainId(e.target.value)}
                className="w-full h-11 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
              >
                <option value="">Select Domain...</option>
                {domains.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.code} — {d.name}
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="Team Identifier Code (e.g. CT-05) *"
              required
              placeholder="CT-05"
              isMonospace
              value={newTeamCode}
              onChange={e => setNewTeamCode(e.target.value.toUpperCase())}
            />

            <Input
              label="Company Name *"
              required
              placeholder="HelioGrid Dynamics"
              value={newCompanyName}
              onChange={e => setNewCompanyName(e.target.value)}
            />

            <Input
              label="Table / Floor Station Identifier"
              placeholder="Table 4A"
              value={newTableStation}
              onChange={e => setNewTableStation(e.target.value)}
              helperText="Physical desk location in the tournament room."
            />

            <div className="pt-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsRegisterOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={isRegistering}
              >
                Confirm Registration
              </Button>
            </div>
          </form>
        </Modal>

        {/* ROSTER MODAL */}
        <Modal
          isOpen={isRosterOpen}
          onClose={() => setIsRosterOpen(false)}
          title={`Team Roster: ${selectedTeamForRoster?.team_code || ''}`}
          description={`Student founders enrolled for ${selectedTeamForRoster?.company_name || ''}.`}
          maxWidth="lg"
        >
          {memberError && (
            <Alert variant="error" className="mb-4">
              {memberError}
            </Alert>
          )}

          {/* EXISTING MEMBERS LIST */}
          <div className="space-y-2">
            <h4 className="text-xs font-mono text-slate-400 uppercase tracking-wider">
              Enrolled Founders ({members.length})
            </h4>

            {members.length === 0 ? (
              <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 text-center text-xs text-slate-500">
                No team members enrolled yet. Add founders below.
              </div>
            ) : (
              <div className="divide-y divide-slate-800 rounded-lg bg-slate-900 border border-slate-800 max-h-48 overflow-y-auto">
                {members.map(m => (
                  <div key={m.id} className="p-3 flex justify-between items-center text-xs">
                    <div>
                      <div className="font-semibold text-white">{m.full_name}</div>
                      <div className="text-slate-400 text-[11px]">{m.email || 'No email registered'}</div>
                    </div>
                    <Badge variant="default" className="text-[10px]">
                      {m.role_title}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ADD MEMBER FORM */}
          <form onSubmit={handleAddMember} className="pt-3 border-t border-slate-800 space-y-3">
            <h4 className="text-xs font-mono text-slate-300 font-semibold uppercase tracking-wider">
              Add New Founder
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Full Name *"
                required
                placeholder="Jane Doe"
                value={newMemberName}
                onChange={e => setNewMemberName(e.target.value)}
              />

              <Input
                label="Role Title"
                placeholder="Co-Founder & CEO"
                value={newMemberRole}
                onChange={e => setNewMemberRole(e.target.value)}
              />
            </div>

            <Input
              label="Student Email Address"
              type="email"
              placeholder="jane.doe@university.edu"
              value={newMemberEmail}
              onChange={e => setNewMemberEmail(e.target.value)}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="submit"
                variant="emerald"
                size="sm"
                isLoading={isAddingMember}
              >
                Add Founder
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </AdminShell>
  );
}
