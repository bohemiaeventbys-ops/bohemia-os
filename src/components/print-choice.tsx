import Link from "next/link";
import { Printer } from "lucide-react";
import { cn } from "@/lib/cn";

/** « Imprimer / PDF » : trois formats de la fiche technique (Français, العربية, Bilingue). */
export function PrintChoice({ eventId, className, compact, direction }: { eventId: string; className?: string; compact?: boolean; direction?: boolean }) {
  const base = `/evenements/${eventId}/fiche`;
  const q = (l: string) => `${base}?langue=${l}${direction ? "&version=direction" : ""}`;
  const opts = [{ l: "fr", t: "Français" }, { l: "ar", t: "العربية" }, { l: "bi", t: "Bilingue" }];
  return (
    <details className={cn("group relative", className)}>
      <summary className={cn("flex cursor-pointer list-none items-center justify-center gap-2 rounded-xl bg-olive-700 font-bold text-white shadow-card transition hover:bg-olive-800 [&::-webkit-details-marker]:hidden",
        compact ? "h-10 px-3 text-sm" : "min-h-12 px-5 text-[15px]")}>
        <Printer className={compact ? "h-4 w-4" : "h-5 w-5"} /> Imprimer / PDF
      </summary>
      <div className="absolute end-0 z-20 mt-2 grid w-56 gap-1 rounded-2xl bg-paper p-2 shadow-pop ring-1 ring-line">
        {opts.map((o) => (
          <Link key={o.l} href={q(o.l)} className="flex h-12 items-center justify-between rounded-xl px-4 font-semibold hover:bg-sand-100">
            <span lang={o.l === "ar" ? "ar" : undefined}>{o.t}</span><span className="text-xs text-ink-400">{o.l === "bi" ? "FR + ع" : o.l.toUpperCase()}</span>
          </Link>
        ))}
      </div>
    </details>
  );
}
