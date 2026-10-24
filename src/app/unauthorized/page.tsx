'use client';

import * as React from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ShieldAlert, ArrowLeft, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';

function UnauthorizedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requiredRole = searchParams.get('required');
  const currentRole = searchParams.get('current');
  const reason = searchParams.get('reason');

  const handleSignOut = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push('/login');
    } catch {
      router.push('/login');
    }
  };

  return (
    <div className="min-h-screen bg-[#080C16] text-slate-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md space-y-6">
        <Card className="border-rose-900/40 bg-[#0F172A]/90 backdrop-blur shadow-2xl">
          <CardHeader className="text-center space-y-3 pb-2">
            <div className="mx-auto h-12 w-12 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl text-rose-300">Access Restricted</CardTitle>
            <CardDescription>
              Your authenticated role does not have authorization to view this operational screen.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 pt-2">
            <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono space-y-2">
              {requiredRole && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Required Role:</span>
                  <span className="text-emerald-400 font-semibold uppercase">{requiredRole}</span>
                </div>
              )}
              {currentRole && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Your Current Role:</span>
                  <span className="text-amber-400 font-semibold uppercase">{currentRole}</span>
                </div>
              )}
              {reason === 'inactive_or_missing' && (
                <div className="text-rose-400 font-medium">
                  Your staff profile has not been provisioned or is currently inactive. Please contact the Lead Organizer.
                </div>
              )}
            </div>

            <p className="text-xs text-slate-400 text-center">
              If you believe this is in error, verify your assigned competition credentials with the Super Admin.
            </p>
          </CardContent>

          <CardFooter className="flex flex-col sm:flex-row gap-2 pt-4">
            <Button
              variant="outline"
              className="w-full text-xs h-9"
              onClick={() => router.back()}
            >
              <ArrowLeft className="mr-2 h-3.5 w-3.5" />
              <span>Go Back</span>
            </Button>

            <Button
              variant="destructive"
              className="w-full text-xs h-9"
              onClick={handleSignOut}
            >
              <LogOut className="mr-2 h-3.5 w-3.5" />
              <span>Switch Account</span>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

export default function UnauthorizedPage() {
  return (
    <React.Suspense fallback={<div className="min-h-screen bg-[#080C16] text-slate-400 flex items-center justify-center font-mono text-xs">Loading...</div>}>
      <UnauthorizedContent />
    </React.Suspense>
  );
}
