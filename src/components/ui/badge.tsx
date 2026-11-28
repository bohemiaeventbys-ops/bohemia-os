import { cn } from "@/lib/cn";
import type { Tone } from "@/lib/labels";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Info } from "lucide-react";

/** Icône claire selon le sens : validé, attention, en attente, information */
const TONE_ICON: Partial<Record<Tone, typeof Info>> = { sage: CheckCircle2, clay: AlertTriangle, ochre: Clock3, mist: Info };

export const toneBg: Record<Tone, string> = {
  neutral: "bg-sand-100 text-ink-500 ring-line",
  sand: "bg-nude-100 text-taupe-700 ring-nude-200",
  sage: "bg-sage-100 text-sage-700 ring-sage-200",
  clay: "bg-clay-100 text-clay-700 ring-clay-200",
  ochre: "bg-ochre-100 text-ochre-700 ring-ochre-200",
  mist: "bg-mist-100 text-mist-700 ring-mist-200",
  rose: "bg-rose-100 text-rose-700 ring-rose-200",
  plum: "bg-plum-100 text-plum-700 ring-plum-200",
  teal: "bg-teal-100 text-teal-700 ring-teal-200",
  ink: "bg-ink text-ivory ring-ink",
};
export const toneDot: Record<Tone, string> = {
  neutral: "bg-ink-300", sand: "bg-taupe-400", sage: "bg-sage-500", clay: "bg-clay-500", ochre: "bg-ochre-500", mist: "bg-mist-500",
  rose: "bg-rose-500", plum: "bg-plum-500", teal: "bg-teal-500", ink: "bg-ivory",
};
/** Pastille d'icône colorée (fond clair + icône foncée). */
export const toneTile: Record<Tone, string> = {
  neutral: "bg-sand-100 text-taupe-600", sand: "bg-nude-100 text-taupe-700", sage: "bg-sage-100 text-sage-700", clay: "bg-clay-100 text-clay-700",
  ochre: "bg-ochre-100 text-ochre-700", mist: "bg-mist-100 text-mist-700", rose: "bg-rose-100 text-rose-700", plum: "bg-plum-100 text-plum-700",
  teal: "bg-teal-100 text-teal-700", ink: "bg-ink text-ivory",
};

export function Badge({ tone = "neutral", dot = true, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset whitespace-nowrap", toneBg[tone], className)}>
      {dot && (() => { const I = TONE_ICON[tone]; return I ? <I className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <span className={cn("h-2 w-2 rounded-full", toneDot[tone])} />; })()}
      {children}
    </span>
  );
}
