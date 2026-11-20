import { cn } from "@/lib/cn";
import Link from "next/link";

export function Tabs({ items, active }: { items: { href: string; label: string; key: string; count?: number }[]; active: string }) {
  return (
    <div className="mb-6 flex max-w-full flex-wrap gap-1 rounded-xl border border-line bg-white p-1 w-fit">
      {items.map((it) => (
        <Link key={it.key} href={it.href}
          className={cn("rounded-lg px-4 py-2 text-sm font-medium transition", active === it.key ? "bg-ink text-ivory" : "text-ink-500 hover:bg-sand-100 hover:text-ink")}>
          {it.label}
          {it.count !== undefined && <span className={cn("ml-1.5 text-xs", active === it.key ? "text-ivory/70" : "text-ink-300")}>{it.count}</span>}
        </Link>
      ))}
    </div>
  );
}
