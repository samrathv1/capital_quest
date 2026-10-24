import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle2, Info, AlertTriangle } from 'lucide-react';

const alertVariants = cva(
  'relative w-full rounded-xl border p-4 text-sm [&>svg~*]:pl-7 [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground',
  {
    variants: {
      variant: {
        default: 'border-slate-800 bg-slate-900/80 text-slate-200 [&>svg]:text-slate-400',
        error: 'border-rose-500/40 bg-rose-950/40 text-rose-200 [&>svg]:text-rose-400',
        warning: 'border-amber-500/40 bg-amber-950/40 text-amber-200 [&>svg]:text-amber-400',
        success: 'border-emerald-500/40 bg-emerald-950/40 text-emerald-200 [&>svg]:text-emerald-400',
        info: 'border-indigo-500/40 bg-indigo-950/40 text-indigo-200 [&>svg]:text-indigo-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  title?: string;
}

export function Alert({ className, variant, title, children, ...props }: AlertProps) {
  const Icon = {
    default: Info,
    error: AlertCircle,
    warning: AlertTriangle,
    success: CheckCircle2,
    info: Info,
  }[variant || 'default'];

  return (
    <div role="alert" className={cn(alertVariants({ variant }), className)} {...props}>
      <Icon className="h-4 w-4" />
      {title && <h5 className="mb-1 font-semibold leading-none tracking-tight">{title}</h5>}
      <div className="text-xs [&_p]:leading-relaxed opacity-90">{children}</div>
    </div>
  );
}
