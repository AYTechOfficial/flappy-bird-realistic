/* The shared UI kit — harness-owned, like the scaffold around it.

Parallel workers negotiate interfaces badly: one screen asks for
variant="outline" while the kit only defines three variants, and the app dies
in type check. These signatures are fixed and every screen is told them
exactly, so a prop name never costs a fix round. */

import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "outline" | "ghost" | "link";
export type ButtonSize = "sm" | "md" | "lg";
export type Tone = "brand" | "pass" | "warn" | "bad" | "neutral";

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
}) {
  const base = "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50";
  const sizes: Record<ButtonSize, string> = {
    sm: "h-8 px-3 text-xs",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-6 text-[15px]",
  };
  const variants: Record<ButtonVariant, string> = {
    primary: "bg-[var(--accent)] text-black hover:opacity-90",
    secondary: "bg-[var(--surface)] text-[var(--primary)] border border-white/10 hover:border-white/25",
    danger: "bg-red-500/15 text-red-300 border border-red-500/40 hover:bg-red-500/25",
    outline: "border border-white/25 text-[var(--primary)] hover:border-white/45 hover:bg-white/5",
    ghost: "text-[var(--primary)] hover:bg-white/10",
    link: "text-[var(--accent)] underline underline-offset-4 hover:opacity-80",
  };

  return (
    <button
      type="button"
      className={base + " " + sizes[size] + " " + variants[variant] + " " + className}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({ children, className = "", ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) {
  return (
    <div className={"rounded-xl border border-white/10 bg-[var(--surface)] p-4 " + className} {...props}>
      {children}
    </div>
  );
}

export function Badge({ children, tone = "neutral", className = "" }: { children?: ReactNode; tone?: Tone; className?: string }) {
  const tones: Record<Tone, string> = {
    brand: "bg-[var(--accent)]/15 text-[var(--accent)] border-[var(--accent)]/30",
    pass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    warn: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    bad: "bg-red-500/15 text-red-300 border-red-500/30",
    neutral: "bg-white/5 text-white/60 border-white/10",
  };
  return (
    <span className={"inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium " + tones[tone] + " " + className}>
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  message,
  description,
  icon,
  action,
  className = "",
}: {
  title?: ReactNode;
  message?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const heading = title ?? message ?? "Nothing here yet";
  const body = description ?? (title != null && message != null && message !== title ? message : null);
  return (
    <div className={"flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-10 text-center " + className}>
      {icon ? <div className="text-white/50">{icon}</div> : null}
      <p className="text-sm font-medium text-white/80">{heading}</p>
      {body ? <p className="max-w-sm text-xs text-white/50">{body}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export function ListRow({
  record,
  title,
  subtitle,
  trailing,
  children,
  className = "",
}: {
  record?: Record<string, unknown>;
  title?: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const pick = (keys: string[]): string | null => {
    if (!record) return null;
    for (const k of keys) {
      const v = record[k];
      if (typeof v === "string" || typeof v === "number") return String(v);
    }
    return null;
  };
  const heading = title ?? pick(["title", "name", "label"]) ?? "Untitled";
  const sub = subtitle ?? pick(["notes", "description", "subtitle", "createdAt"]);
  const aside = trailing ?? children;
  return (
    <div className={"flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5 " + className}>
      <div className="min-w-0">
        <p className="truncate text-sm text-white/85">{heading}</p>
        {sub ? <p className="truncate text-xs text-white/45">{sub}</p> : null}
      </div>
      {aside ? <div className="shrink-0 text-xs text-white/50">{aside}</div> : null}
    </div>
  );
}
