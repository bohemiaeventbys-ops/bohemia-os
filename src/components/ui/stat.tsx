import { cn } from "@/lib/cn";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Tone } from "@/lib/labels";
import { toneTile } from "./badge";

const legacy = { alert: "clay", warn: "ochre", ok: "sage" } as const;

export function Stat({ label, value, hint, href, tone, icon }: {
  label: string; value: ReactNode; hint?: ReactNode; href?: string; tone?: "alert" | "warn" | "ok" | Tone; icon?: ReactNode;
}) {
  const t: Tone = (tone && tone in legacy ? legacy[tone as keyof typeof legacy] : (tone as Tone)) ?? "neutral";
  const body = (
    <div className={cn("card flex h-full items-start gap-4 px-5 py-4 transition", href && "hover:-translate-y-0.5 hover:shadow-pop")}>
      {icon && <span className={cn("tile h-11 w-11", toneTile[t])}>{icon}</span>}
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-ink-500">{label}</p>
        <p className="mt-1 font-display text-4xl font-semibold leading-none text-ink">{value}</p>
        {hint && <p className="mt-1.5 text-xs text-ink-400">{hint}</p>}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}
