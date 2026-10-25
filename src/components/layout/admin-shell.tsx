'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  FileSpreadsheet,
  ShieldAlert,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Sliders,
  PlayCircle,
  Trophy,
  MonitorPlay,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';

interface AdminShellProps {
  children: React.ReactNode;
  userRole?: string;
  userEmail?: string;
  eventName?: string;
  roundNumber?: number;
  roundStatus?: string;
}

export function AdminShell({
  children,
  userRole = 'super_admin',
  userEmail = 'admin@capitalquest.dev',
  eventName = 'Capital Quest 2026',
  roundNumber = 1,
  roundStatus = 'open',
}: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const [isMobileOpen, setIsMobileOpen] = React.useState(false);
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push('/login');
    } catch {
      router.push('/login');
    }
  };

  const navItems = [
    {
      title: 'Command Center',
      href: '/admin/dashboard',
      icon: LayoutDashboard,
      roles: ['super_admin', 'judge'],
    },
    {
      title: 'Round Control',
      href: '/admin/rounds',
      icon: PlayCircle,
      roles: ['super_admin'],
    },
    {
      title: 'Teams & Rosters',
      href: '/admin/teams',
      icon: Users,
      roles: ['super_admin', 'domain_coordinator'],
    },
    {
      title: 'Admin Decisions',
      href: '/admin/decisions',
      icon: FileSpreadsheet,
      roles: ['super_admin'],
    },
    {
      title: 'Round Readiness',
      href: '/admin/readiness',
      icon: CheckSquare,
      roles: ['super_admin', 'domain_coordinator'],
    },
    {
      title: 'Coordinator Desk',
      href: '/coordinator/dashboard',
      icon: Sliders,
      roles: ['super_admin', 'domain_coordinator'],
    },
    {
      title: 'Volunteer 10-Key',
      href: '/volunteer/entry',
      icon: FileSpreadsheet,
      roles: ['super_admin', 'domain_coordinator', 'volunteer'],
    },
    {
      title: 'Dual-Verification',
      href: '/volunteer/verify',
      icon: ShieldAlert,
      roles: ['super_admin', 'domain_coordinator', 'volunteer'],
    },
    {
      title: 'Public Leaderboard',
      href: '/leaderboard',
      icon: Trophy,
      roles: ['super_admin', 'judge', 'domain_coordinator', 'volunteer'],
    },
    {
      title: 'Stage Controller',
      href: '/admin/presentation',
      icon: MonitorPlay,
      roles: ['super_admin', 'judge'],
    },
  ];

  const filteredNav = navItems.filter(item => item.roles.includes(userRole));

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 flex flex-col">
      {/* TOP BAR */}
      <header className="h-16 border-b border-slate-800 bg-[#0E1526]/90 backdrop-blur sticky top-0 z-40 px-4 lg:px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            className="lg:hidden h-9 w-9 text-slate-400"
            aria-label="Toggle navigation menu"
          >
            {isMobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>

          <Link href="/admin/dashboard" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center font-bold text-white shadow-md shadow-indigo-900/40">
              CQ
            </div>
            <div className="hidden sm:block">
              <span className="font-extrabold tracking-tight text-white text-base">CAPITAL</span>
              <span className="font-extrabold tracking-tight text-emerald-400 text-base ml-1">QUEST</span>
            </div>
          </Link>

          <span className="text-slate-700 hidden sm:inline">|</span>

          {/* ACTIVE TOURNAMENT PILL */}
          <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-xs">
            <span className="text-slate-400">Event:</span>
            <span className="font-semibold text-slate-200">{eventName}</span>
          </div>
        </div>

        {/* STATUS & USER CONTROLS */}
        <div className="flex items-center gap-3">
          {/* ROUND STATUS BADGE */}
          <Badge
            variant={
              roundStatus === 'open'
                ? 'open'
                : roundStatus === 'locked'
                ? 'locked'
                : roundStatus === 'simulated'
                ? 'simulated'
                : roundStatus === 'published'
                ? 'published'
                : 'default'
            }
            indicator
            className="text-xs py-1"
          >
            R{roundNumber} • {roundStatus.toUpperCase()}
          </Badge>

          {/* ROLE INDICATOR */}
          <Badge variant="domain" className="hidden sm:inline-flex text-[11px] py-1">
            {userRole.replace('_', ' ').toUpperCase()}
          </Badge>

          {/* USER INFO & LOGOUT */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
            <span className="text-xs text-slate-400 hidden xl:inline max-w-[150px] truncate">
              {userEmail}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              isLoading={isLoggingOut}
              className="text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 h-8 px-2.5 text-xs gap-1.5"
              title="Sign out of Capital Quest"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* DESKTOP SIDEBAR */}
        <aside
          className={cn(
            'hidden lg:flex flex-col border-r border-slate-800 bg-[#0B101E] transition-all duration-200 z-30 sticky top-16 h-[calc(100vh-4rem)]',
            isSidebarOpen ? 'w-64' : 'w-20'
          )}
        >
          <div className="p-4 flex-1 space-y-1">
            {filteredNav.map(item => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all group select-none',
                    isActive
                      ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30 font-semibold'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                  )}
                  title={!isSidebarOpen ? item.title : undefined}
                >
                  <Icon className={cn('h-4 w-4 shrink-0 transition-colors', isActive ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-200')} />
                  {isSidebarOpen && <span>{item.title}</span>}
                </Link>
              );
            })}
          </div>

          {/* TOGGLE EXPAND BUTTON */}
          <div className="p-3 border-t border-slate-800/80">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="w-full justify-center text-slate-500 hover:text-slate-300 h-8"
              aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {isSidebarOpen ? (
                <>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  <span className="text-xs">Collapse</span>
                </>
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          </div>
        </aside>

        {/* MOBILE DRAWER */}
        {isMobileOpen && (
          <div className="fixed inset-0 top-16 z-50 lg:hidden bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="w-64 h-full bg-[#0E1526] border-r border-slate-800 p-4 space-y-1">
              {filteredNav.map(item => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3.5 py-3 rounded-lg text-sm font-medium transition-all',
                      isActive
                        ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30 font-semibold'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.title}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* MAIN VIEWPORT */}
        <main className="flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
