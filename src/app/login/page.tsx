'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { createClient } from '@/lib/supabase/client';
import { getDefaultRedirectForRole } from '@/lib/auth/role-routes';
import { UserRole } from '@/types/database';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo');

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMsg(error.message || 'Invalid email or password.');
        setIsLoading(false);
        return;
      }

      if (data.user) {
        // Fetch role from profiles
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .single();

        const role = (profile?.role || 'volunteer') as UserRole;
        const redirectPath = returnTo || getDefaultRedirectForRole(role);
        router.push(redirectPath);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'An unexpected connection error occurred.');
      setIsLoading(false);
    }
  };

  // Demo Credentials Quick-Fill for Development Testing
  const handleDemoFill = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('CapitalQuest2026!');
    setErrorMsg(null);
  };

  return (
    <div className="min-h-screen bg-[#080C16] text-slate-100 flex flex-col justify-center items-center p-4">
      {/* BACKGROUND ACCENTS */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* LOGO & HEADING */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 text-white font-extrabold text-xl shadow-lg shadow-indigo-900/40 mx-auto">
            CQ
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">
            CAPITAL <span className="text-emerald-400">QUEST</span>
          </h1>
          <p className="text-xs text-slate-400 font-mono">
            STAFF & OPERATOR AUTHENTICATION PORTAL
          </p>
        </div>

        {/* LOGIN CARD */}
        <Card className="border-slate-800 bg-[#0F172A]/90 backdrop-blur-xl shadow-2xl">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg">Staff Sign In</CardTitle>
            <CardDescription>
              Enter your competition credentials to access your workspace.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {errorMsg && (
              <Alert variant="error" title="Authentication Error">
                {errorMsg}
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Email Address"
                type="email"
                required
                placeholder="operator@capitalquest.dev"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                prefixSymbol="@"
              />

              <Input
                label="Password"
                type="password"
                required
                placeholder="••••••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
              />

              <Button
                type="submit"
                className="w-full h-11 text-sm font-semibold"
                isLoading={isLoading}
              >
                <span>Authenticate Workspace</span>
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </form>

            {/* DEVELOPMENT PREVIEW / DEMO ACCOUNT HELPER */}
            {process.env.NODE_ENV === 'development' && (
              <div className="pt-4 border-t border-slate-800/80 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400">
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                  <span>Development Quick-Fill:</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => handleDemoFill('admin@capitalquest.dev')}
                    className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-left transition-colors"
                  >
                    <div className="font-semibold text-indigo-300">Super Admin</div>
                    <div className="text-[10px] text-slate-400 truncate">admin@capitalquest.dev</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDemoFill('volunteer@capitalquest.dev')}
                    className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-left transition-colors"
                  >
                    <div className="font-semibold text-emerald-300">Volunteer Operator</div>
                    <div className="text-[10px] text-slate-400 truncate">volunteer@capitalquest.dev</div>
                  </button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* SECURITY FOOTER */}
        <div className="flex items-center justify-center gap-2 text-[11px] font-mono text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
          <span>PostgreSQL RLS Protected • Zero Secret Key Client Leaks</span>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense fallback={<div className="min-h-screen bg-[#080C16] text-slate-400 flex items-center justify-center font-mono text-xs">Loading authentication portal...</div>}>
      <LoginContent />
    </React.Suspense>
  );
}
