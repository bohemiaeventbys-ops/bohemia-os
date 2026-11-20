import { cn } from "@/lib/cn";
import Link from "next/link";
import type { ReactNode } from "react";

export function Stat({ label, value, hint, href, tone }: { label: string; value: ReactNode; hint?: ReactNode; href?: string; tone?: "alert" | "warn" | "ok" }) {
  const body = (
    <div className={cn("card h-full px-5 py-4 transition", href && "hover:border-taupe-300")}>
      <p className="text-2xs font-semibold uppercase tracking-wider text-ink-400">{label}</p>
      <p className={cn("mt-2 font-display text-4xl leading-none",
        tone === "alert" ? "text-clay-700" : tone === "warn" ? "text-ochre-700" : tone === "ok" ? "text-sage-700" : "text-ink")}>{value}</p>
      {hint && <p className="mt-2 text-xs text-ink-400">{hint}</p>}
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}
