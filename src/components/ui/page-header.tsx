import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-taupe-500">{eyebrow}</p>}
        <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl text-ink">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-ink-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
