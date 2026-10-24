import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider transition-colors select-none font-mono',
  {
    variants: {
      variant: {
        default: 'border border-slate-700 bg-slate-800 text-slate-300',
        open: 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-400',
        locked: 'border border-amber-500/30 bg-amber-500/15 text-amber-400',
        simulated: 'border border-indigo-500/30 bg-indigo-500/15 text-indigo-400',
        published: 'border border-teal-500/30 bg-teal-500/15 text-teal-300',
        verified: 'border border-emerald-500/40 bg-emerald-500/20 text-emerald-300',
        entered: 'border border-blue-500/30 bg-blue-500/15 text-blue-400',
        flagged: 'border border-rose-500/40 bg-rose-500/20 text-rose-300 animate-pulse',
        missing: 'border border-slate-700 bg-slate-800/80 text-slate-400',
        draft: 'border border-slate-700 bg-slate-800/60 text-slate-400',
        domain: 'border border-indigo-500/30 bg-indigo-500/10 text-indigo-300',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  indicator?: boolean;
}

export function Badge({ className, variant, indicator, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {indicator && (
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            variant === 'open' && 'bg-emerald-400',
            variant === 'locked' && 'bg-amber-400',
            variant === 'simulated' && 'bg-indigo-400',
            variant === 'published' && 'bg-teal-400',
            variant === 'verified' && 'bg-emerald-400',
            variant === 'flagged' && 'bg-rose-400',
            variant === 'entered' && 'bg-blue-400',
            (!variant || variant === 'default' || variant === 'missing' || variant === 'draft') && 'bg-slate-400'
          )}
        />
      )}
      {children}
    </div>
  );
}
