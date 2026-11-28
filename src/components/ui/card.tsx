import { cn } from "@/lib/cn";
import type { ReactNode } from "react";
import type { Tone } from "@/lib/labels";
import { toneTile } from "./badge";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("card", className)}>{children}</div>;
}
export function CardHeader({ title, subtitle, action, icon, tone }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode; tone?: Tone }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
      <div className="flex min-w-[min(100%,14rem)] flex-1 items-center gap-3">
        {icon && <span className={cn("tile h-9 w-9 [&_svg]:h-[18px] [&_svg]:w-[18px]", toneTile[tone ?? "neutral"])}>{icon}</span>}
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-ink-400">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}
