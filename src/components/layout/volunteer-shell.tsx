'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FileSpreadsheet, ShieldCheck, LogOut, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';

interface VolunteerShellProps {
  children: React.ReactNode;
  userEmail?: string;
  roundNumber?: number;
  roundStatus?: string;
}

export function VolunteerShell({
  children,
  userEmail = 'volunteer@capitalquest.dev',
  roundNumber = 1,
  roundStatus = 'open',
}: VolunteerShellProps) {
  const pathname = usePathname();
  const router = useRouter();
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

  const isEntryActive = pathname === '/volunteer/entry';
  const isVerifyActive = pathname === '/volunteer/verify';

  return (
    <div className="min-h-screen bg-[#080C15] text-slate-100 flex flex-col font-sans">
      {/* CONSOLE HEADER */}
      <header className="h-16 border-b border-slate-800 bg-[#0C1220]/95 backdrop-blur sticky top-0 z-40 px-4 sm:px-6 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <Link href="/admin/dashboard" className="text-slate-400 hover:text-white transition-colors" title="Back to Main Hub">
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <div className="flex items-center gap-2">
            <span className="font-extrabold tracking-tight text-white text-base">CAPITAL QUEST</span>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              VOLUNTEER CONSOLE
            </span>
          </div>

          <div className="hidden md:flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
            <Link
              href="/volunteer/entry"
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all',
                isEntryActive
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              )}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>10-Key Digitization</span>
            </Link>

            <Link
              href="/volunteer/verify"
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all',
                isVerifyActive
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              )}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Dual-Verification</span>
            </Link>
          </div>
        </div>

        {/* STATUS & USER */}
        <div className="flex items-center gap-3">
          <Badge
            variant={roundStatus === 'open' ? 'open' : roundStatus === 'locked' ? 'locked' : 'default'}
            indicator
            className="text-xs py-1"
          >
            ROUND {roundNumber} • {roundStatus.toUpperCase()}
          </Badge>

          <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
            <span className="text-xs text-slate-400 hidden sm:inline max-w-[140px] truncate">
              {userEmail}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              isLoading={isLoggingOut}
              className="text-slate-400 hover:text-rose-400 h-8 px-2 text-xs gap-1"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      {/* KEYBOARD HOTKEYS LEGEND BAR */}
      <div className="bg-[#0D1527] border-b border-slate-800/80 px-4 py-1.5 text-[11px] font-mono text-slate-400 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-4 overflow-x-auto">
          <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Hotkeys:</span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">Tab / Enter</kbd> Next Field</span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">Shift + Tab</kbd> Previous Field</span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-rose-300 border border-rose-700">F9</kbd> Flag Illegible Slip</span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-emerald-300 border border-emerald-700">Ctrl + Enter</kbd> Submit & Next</span>
        </div>
        <div className="hidden lg:block text-slate-500 text-[10px]">
          10-Key Rapid Transcription Mode
        </div>
      </div>

      {/* WORKSPACE CONTENT */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
