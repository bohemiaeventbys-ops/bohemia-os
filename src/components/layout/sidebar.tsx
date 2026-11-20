"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import type { NavItem } from "@/lib/navigation";
import { toneTile } from "@/components/ui/badge";
import { NavIcon } from "./icon";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function Item({ item, pathname, badge }: { item: NavItem; pathname: string; badge?: number }) {
  const active = isActive(pathname, item.href);
  return (
    <Link href={item.href}
      className={cn("group flex items-center gap-3 rounded-xl px-2.5 py-2 text-[14px] font-medium transition",
        active ? "bg-white text-ink shadow-card ring-1 ring-line" : item.phase ? "text-ink-300 hover:text-ink-500" : "text-ink-500 hover:bg-white/70 hover:text-ink")}>
      <span className={cn("tile h-8 w-8 transition", item.phase ? "bg-sand-100 text-ink-300" : toneTile[item.tone ?? "neutral"], !active && !item.phase && "opacity-90 group-hover:opacity-100")}>
        <NavIcon name={item.icon} className="h-[17px] w-[17px]" />
      </span>
      <span className="flex-1 truncate">{item.label}</span>
      {item.phase && <span className="rounded-full border border-line px-1.5 text-[10px] text-ink-300">P{item.phase}</span>}
      {!!badge && <span className="rounded-full bg-clay-500 px-2 text-[11px] font-semibold leading-5 text-white">{badge > 99 ? "99+" : badge}</span>}
    </Link>
  );
}

export function Sidebar({ main, upcoming, bottom, unread }: { main: NavItem[]; upcoming: NavItem[]; bottom: NavItem[]; unread: number }) {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:flex flex-col border-r border-line bg-sand-50">
      <Link href="/" className="flex items-baseline gap-2 px-6 pb-6 pt-7">
        <span className="font-display text-2xl font-semibold tracking-[0.14em] text-ink">BOHEMIA</span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-rose-500">OS</span>
      </Link>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {main.map((i) => <Item key={i.key} item={i} pathname={pathname} />)}
        {upcoming.length > 0 && (
          <>
            <p className="px-3 pb-1.5 pt-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-300">Modules à venir</p>
            {upcoming.map((i) => <Item key={i.key} item={i} pathname={pathname} />)}
          </>
        )}
      </nav>
      <div className="space-y-1 border-t border-line px-3 py-3">
        {bottom.map((i) => <Item key={i.key} item={i} pathname={pathname} badge={i.key === "notifications" ? unread : undefined} />)}
      </div>
    </aside>
  );
}

/** Sur téléphone et tablette : grosse barre d'onglets en bas de l'écran, avec icônes et noms. */
export function MobileNav({ main, bottom, unread }: { main: NavItem[]; bottom: NavItem[]; unread: number }) {
  const pathname = usePathname();
  const SHORT: Record<string, string> = { dashboard: "Accueil", "ma-journee": "Ma journée", calendrier: "Agenda", evenements: "Événements", taches: "Tâches", equipe: "Équipe", pointage: "Pointage", conges: "Congés" };
  const items = main;
  void bottom; void unread;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t border-line bg-white/95 px-1 pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5 backdrop-blur lg:hidden">
      {items.map((i) => {
        const active = isActive(pathname, i.href);
        return (
          <Link key={i.key} href={i.href} className="relative flex min-w-[60px] flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1 text-[11px] font-medium text-ink-500">
            <span className={cn("tile h-9 w-9", active ? toneTile[i.tone ?? "neutral"] : "text-ink-300")}><NavIcon name={i.icon} className="h-5 w-5" /></span>
            <span className={cn("truncate", active && "text-ink")}>{SHORT[i.key] ?? i.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
