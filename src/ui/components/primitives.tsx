import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export function Btn({
  children,
  icon,
  onClick,
  title,
  variant = 'default',
  active,
  disabled,
  className = '',
  full,
}: {
  children?: ReactNode;
  icon?: IconName;
  onClick?: (event: React.MouseEvent) => void;
  title?: string;
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  active?: boolean;
  disabled?: boolean;
  className?: string;
  full?: boolean;
}) {
  const classes = ['btn'];
  if (variant !== 'default') classes.push(variant);
  if (active) classes.push('active');
  if (!children) classes.push('icon');
  if (full) classes.push('full');
  if (className) classes.push(className);
  return (
    <button type="button" className={classes.join(' ')} onClick={onClick} title={title} disabled={disabled} style={full ? { width: '100%' } : undefined}>
      {icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="panel-section">
      <div className="section-title">
        <span>{title}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

export function Field({ label, value, children }: { label: string; value?: ReactNode; children?: ReactNode }) {
  return (
    <div className="field">
      <div className="field-label">
        <span>{label}</span>
        {value !== undefined ? <span className="field-value">{value}</span> : null}
      </div>
      {children}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: ReactNode;
}) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
      {label ? <span className="switch-label">{label}</span> : null}
    </label>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
}) {
  return (
    <input
      className="slider"
      type="range"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
      onPointerUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
      onKeyUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
    />
  );
}

/** Number input that keeps the typed value while editing and commits on blur/Enter. */
export function NumberInput({
  value,
  onCommit,
  min = 0,
  max = 100000,
  className = 'input small',
  step = 1,
}: {
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  className?: string;
  step?: number;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.max(min, Math.min(max, parsed));
    setDraft(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };

  return (
    <input
      className={className}
      type="number"
      value={draft}
      step={step}
      min={min}
      max={max}
      onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setDraft(String(value));
      }}
    />
  );
}

export function TextInput({
  value,
  onCommit,
  placeholder,
  className = 'input',
  mono,
}: {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  className?: string;
  mono?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className={className}
      style={mono ? { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11 } : undefined}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setDraft(value);
      }}
    />
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title ?? option.label}
          className={option.value === value ? 'active' : undefined}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function ColorField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <div className="row">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      <span className="dim mono">{value}</span>
      {label ? <span className="dim">{label}</span> : null}
    </div>
  );
}

export function Chip({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'gold' | 'warn' | 'ok' | 'acc' }) {
  return <span className={tone === 'default' ? 'chip' : `chip ${tone}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

export function KeyValue({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="kv">
      {rows.map(([key, value], i) => (
        <div key={`${key}-${i}`} style={{ display: 'contents' }}>
          <dt>{key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
