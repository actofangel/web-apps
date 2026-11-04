import { useEffect, useState, type ReactNode } from "react";
import { cn } from "../utils/cn";

function decimalsForStep(step: number) {
  if (step >= 1) return 0;
  return Math.min(4, Math.ceil(-Math.log10(step)));
}

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  defaultValue?: number;
  /** Physical unit (mm, m/s, s, m, °). Shown as a badge; controls without a unit are artistic. */
  unit?: string;
  tip?: string;
  disabled?: boolean;
  format?: (v: number) => string;
}

export function Slider({ label, value, min, max, step, onChange, defaultValue, unit, tip, disabled, format }: SliderProps) {
  const decimals = decimalsForStep(step);
  const [text, setText] = useState(value.toFixed(decimals));
  useEffect(() => setText(value.toFixed(decimals)), [value, decimals]);
  const isDefault = defaultValue === undefined || Math.abs(value - defaultValue) < 1e-9;
  const commit = (raw: string) => {
    const n = parseFloat(raw);
    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
    else setText(value.toFixed(decimals));
  };
  return (
    <div className={cn("slider-row", disabled && "opacity-40 pointer-events-none")} title={tip}>
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <span className="text-[12px] text-zinc-300 truncate">
          {label}
          {unit ? <span className="ml-1 text-[10px] text-sky-300/80">{unit}</span> : <span className="ml-1 text-[10px] text-zinc-500">art.</span>}
        </span>
        <div className="flex items-center gap-1">
          {format && <span className="text-[10px] text-zinc-500 tabular-nums">{format(value)}</span>}
          <input
            type="number"
            className="num-input"
            value={text}
            min={min}
            max={max}
            step={step}
            onChange={(e) => setText(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            aria-label={label}
          />
          <button
            type="button"
            className={cn("reset-btn", isDefault && "invisible")}
            title="Reset to default"
            onClick={() => defaultValue !== undefined && onChange(defaultValue)}
            tabIndex={-1}
          >
            ↺
          </button>
        </div>
      </div>
      <input
        type="range"
        className="range-input"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue)}
        aria-label={label}
      />
    </div>
  );
}

export function Toggle({ label, checked, onChange, tip, small }: { label: string; checked: boolean; onChange: (v: boolean) => void; tip?: string; small?: boolean }) {
  return (
    <label className={cn("flex items-center justify-between gap-2 cursor-pointer select-none", small ? "py-0.5" : "py-1")} title={tip}>
      <span className="text-[12px] text-zinc-300">{label}</span>
      <span
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            onChange(!checked);
          }
        }}
        onClick={() => onChange(!checked)}
        className={cn("relative inline-block h-4 w-7 rounded-full transition-colors", checked ? "bg-sky-500" : "bg-zinc-700")}
      >
        <span className={cn("absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all", checked ? "left-3.5" : "left-0.5")} />
      </span>
    </label>
  );
}

export function ColorField({ label, value, onChange, tip, defaultValue }: { label: string; value: string; onChange: (v: string) => void; tip?: string; defaultValue?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1" title={tip}>
      <span className="text-[12px] text-zinc-300">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-zinc-500 font-mono">{value.toUpperCase()}</span>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="color-input" aria-label={label} />
        <button
          type="button"
          className={cn("reset-btn", (!defaultValue || defaultValue.toLowerCase() === value.toLowerCase()) && "invisible")}
          title="Reset to default"
          onClick={() => defaultValue && onChange(defaultValue)}
        >
          ↺
        </button>
      </div>
    </div>
  );
}

export function Select<T extends string>({ label, value, options, onChange, tip }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; tip?: string }) {
  return (
    <label className="flex items-center justify-between gap-2 py-1" title={tip}>
      <span className="text-[12px] text-zinc-300">{label}</span>
      <select className="select-input" value={value} aria-label={label} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Section({
  title,
  children,
  enabled,
  onEnabledChange,
  defaultOpen = false,
  open,
  onOpenChange,
  badge,
}: {
  title: string;
  children: ReactNode;
  enabled?: boolean;
  onEnabledChange?: (v: boolean) => void;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  badge?: string;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = open ?? internalOpen;
  const setOpen = (v: boolean) => {
    setInternalOpen(v);
    onOpenChange?.(v);
  };
  return (
    <div className="border-b border-zinc-800/80">
      <div className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-800/40 cursor-pointer select-none" onClick={() => setOpen(!isOpen)}>
        <span className={cn("text-zinc-500 text-[10px] transition-transform", isOpen && "rotate-90")}>▶</span>
        <span className="text-[12px] font-medium tracking-wide text-zinc-200 flex-1">{title}</span>
        {badge && <span className="text-[10px] text-zinc-500">{badge}</span>}
        {enabled !== undefined && onEnabledChange && (
          <span onClick={(e) => e.stopPropagation()}>
            <Toggle label="" checked={enabled} onChange={onEnabledChange} small tip={`Enable ${title}`} />
          </span>
        )}
      </div>
      {isOpen && <div className="px-3 pb-3 space-y-1.5">{children}</div>}
    </div>
  );
}

export function Button({ children, onClick, title, variant = "default", disabled, className, active }: { children: ReactNode; onClick?: () => void; title?: string; variant?: "default" | "primary" | "ghost" | "danger"; disabled?: boolean; className?: string; active?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "btn",
        variant === "primary" && "btn-primary",
        variant === "ghost" && "btn-ghost",
        variant === "danger" && "btn-danger",
        active && "btn-active",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Note({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "warn" }) {
  return <p className={cn("text-[11px] leading-snug", tone === "warn" ? "text-amber-300/90" : "text-zinc-500")}>{children}</p>;
}

export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex items-center gap-1.5 flex-wrap", className)}>{children}</div>;
}
