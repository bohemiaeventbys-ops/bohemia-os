import { cn } from "@/lib/cn";
import type { Tone } from "@/lib/labels";
import type { ReactNode } from "react";

const tones: Record<Tone, string> = {
  neutral: "bg-sand-100 text-ink-500 ring-line",
  sand: "bg-nude-100 text-taupe-700 ring-nude-200",
  sage: "bg-sage-100 text-sage-700 ring-sage-500/20",
  clay: "bg-clay-100 text-clay-700 ring-clay-500/20",
  ochre: "bg-ochre-100 text-ochre-700 ring-ochre-500/20",
  mist: "bg-mist-100 text-mist-700 ring-mist-500/20",
  ink: "bg-ink text-ivory ring-ink",
};
const dots: Record<Tone, string> = {
  neutral: "bg-ink-300", sand: "bg-taupe-400", sage: "bg-sage-500", clay: "bg-clay-500", ochre: "bg-ochre-500", mist: "bg-mist-500", ink: "bg-ivory",
};

export function Badge({ tone = "neutral", dot = true, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap", tones[tone], className)}>
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dots[tone])} />}
      {children}
    </span>
  );
}
