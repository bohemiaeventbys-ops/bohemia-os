export function BrandPanel({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-sand-100 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,#EFE2D6_0%,transparent_55%),radial-gradient(ellipse_at_bottom_right,#DCCDBA_0%,transparent_60%)]" />
        <div className="relative flex h-full flex-col justify-between p-14">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-3xl font-semibold tracking-[0.16em] text-ink">BOHEMIA</span>
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-taupe-500">OS</span>
          </div>
          <div className="max-w-md">
            <p className="font-display text-5xl leading-[1.05] text-ink">Chaque détail, chaque équipe, chaque événement.</p>
            <p className="mt-5 text-sm leading-relaxed text-ink-500">La plateforme de gestion interne de Bohemia Events — Casablanca.</p>
          </div>
          <p className="text-xs text-ink-400">© Bohemia Events</p>
        </div>
      </div>
      <div className="flex items-center justify-center bg-ivory px-6 py-12">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-4xl text-ink">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-ink-400">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
