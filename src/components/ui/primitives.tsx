import { cn } from '../../utils/cn';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export function Button({
  className,
  variant = 'default',
  size = 'md',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'ghost' | 'primary' | 'danger' | 'outline' | 'subtle';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors',
        'disabled:pointer-events-none disabled:opacity-40',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30',
        size === 'sm' && 'h-7 px-2 text-xs',
        size === 'md' && 'h-8 px-3 text-xs',
        size === 'lg' && 'h-9 px-4 text-sm',
        size === 'icon' && 'h-8 w-8 p-0',
        variant === 'default' && 'bg-white/10 text-white/90 hover:bg-white/15',
        variant === 'ghost' && 'bg-transparent text-white/70 hover:bg-white/8 hover:text-white',
        variant === 'primary' && 'bg-emerald-500/90 text-black hover:bg-emerald-400',
        variant === 'danger' && 'bg-red-500/20 text-red-300 hover:bg-red-500/30',
        variant === 'outline' && 'border border-white/12 bg-transparent text-white/80 hover:bg-white/8',
        variant === 'subtle' && 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80',
        className
      )}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-8 w-full rounded-md border border-white/10 bg-black/40 px-2.5 text-xs text-white/90',
        'placeholder:text-white/30 focus:border-white/25 focus:outline-none',
        className
      )}
      {...props}
    />
  );
}

export function NumberInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Input
      type="number"
      className={cn('tabular-nums', className)}
      {...props}
    />
  );
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-1 text-[10px] font-medium uppercase tracking-wider text-white/40', className)}>
      {children}
    </div>
  );
}

export function Section({
  title,
  children,
  action,
  className,
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-2">
          {title ? <Label className="mb-0">{title}</Label> : <span />}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn('my-3 h-px bg-white/8', className)} />;
}

export function Checkbox({
  checked,
  onChange,
  label,
  count,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  count?: number;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-white/5">
      <input
        type="checkbox"
        className="h-3.5 w-3.5 rounded border-white/20 bg-black accent-emerald-500"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="flex-1 truncate text-xs text-white/80">{label}</span>
      {count != null && (
        <span className="tabular-nums text-[10px] text-white/35">{count}</span>
      )}
    </label>
  );
}

export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  className,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  className?: string;
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn('h-1.5 w-full cursor-pointer accent-emerald-500', className)}
    />
  );
}

export function Select({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'h-8 w-full rounded-md border border-white/10 bg-black/40 px-2 text-xs text-white/90',
        'focus:border-white/25 focus:outline-none',
        className
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-zinc-900">
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Badge({
  children,
  className,
  tone = 'default',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'accent';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
        tone === 'default' && 'bg-white/10 text-white/70',
        tone === 'success' && 'bg-emerald-500/20 text-emerald-300',
        tone === 'warning' && 'bg-amber-500/20 text-amber-300',
        tone === 'danger' && 'bg-red-500/20 text-red-300',
        tone === 'accent' && 'bg-sky-500/20 text-sky-300',
        className
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center">
      <div className="text-xs text-white/50">{title}</div>
      {hint && <div className="mt-1 text-[10px] text-white/30">{hint}</div>}
    </div>
  );
}
