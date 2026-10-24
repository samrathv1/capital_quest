import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  isMonospace?: boolean;
  prefixSymbol?: string;
  suffixSymbol?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, helperText, error, isMonospace, prefixSymbol, suffixSymbol, id, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-medium text-slate-300">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {prefixSymbol && (
            <span className="absolute left-3 text-slate-400 font-mono text-sm pointer-events-none select-none">
              {prefixSymbol}
            </span>
          )}
          <input
            id={inputId}
            type={type}
            className={cn(
              'flex h-11 w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 transition-colors',
              'focus:border-indigo-500 focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30',
              'disabled:cursor-not-allowed disabled:opacity-50',
              isMonospace && 'font-mono text-base tracking-wider',
              prefixSymbol && 'pl-8',
              suffixSymbol && 'pr-12',
              error && 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/30',
              className
            )}
            ref={ref}
            {...props}
          />
          {suffixSymbol && (
            <span className="absolute right-3 text-slate-400 font-mono text-xs pointer-events-none select-none">
              {suffixSymbol}
            </span>
          )}
        </div>
        {error ? (
          <p className="text-xs text-rose-400 font-medium">{error}</p>
        ) : helperText ? (
          <p className="text-xs text-slate-400">{helperText}</p>
        ) : null}
      </div>
    );
  }
);
Input.displayName = 'Input';
