"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu } from "lucide-react";
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
        active ? "bg-butter text-olive-800 shadow-card" : item.phase ? "text-white/40 hover:text-white/60" : "text-ivory/85 hover:bg-white/10 hover:text-white")}>
      <span className={cn("tile h-8 w-8 transition", item.phase ? "bg-white/5 text-white/40" : active ? "bg-rose-300 text-olive-800" : "bg-white/10 text-butter group-hover:bg-white/15")}>
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
    <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 print:!hidden lg:flex flex-col bg-olive-700 text-ivory">
      <Link href="/" className="flex items-baseline gap-2 px-6 pb-6 pt-7">
        <span className="font-display text-2xl font-semibold tracking-[0.14em] text-butter">BOHEMIA</span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-rose-300">OS</span>
      </Link>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {main.map((i) => <Item key={i.key} item={i} pathname={pathname} />)}
        {upcoming.length > 0 && (
          <>
            <p className="px-3 pb-1.5 pt-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">Modules à venir</p>
            {upcoming.map((i) => <Item key={i.key} item={i} pathname={pathname} />)}
          </>
        )}
      </nav>
      <div className="space-y-1 border-t border-white/10 px-3 py-3">
        {bottom.map((i) => <Item key={i.key} item={i} pathname={pathname} badge={i.key === "notifications" ? unread : undefined} />)}
      </div>
    </aside>
  );
}

/** Sur téléphone et tablette : grosse barre d'onglets en bas (4 raccourcis + « Plus »). */
export function MobileNav({ main, bottom, unread, moreLabel = "Plus" }: { main: NavItem[]; bottom: NavItem[]; unread: number; moreLabel?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const SHORT: Record<string, string> = { dashboard: "Accueil", "ma-journee": "Ma journée", calendrier: "Agenda", evenements: "Événements", taches: "Tâches", equipe: "Équipe", pointage: "Pointage", stock: "Stock", conges: "Congés", achats: "Achats", fournisseurs: "Fournisseurs", clients: "Clients", devis: "Devis", tva: "TVA" };
  const PRIORITY = ["semaine", "terrain", "dashboard", "ma-journee", "taches", "stock", "evenements", "calendrier", "conges", "pointage", "equipe"];
  const rank = (k: string) => (PRIORITY.includes(k) ? PRIORITY.indexOf(k) : 99);
  const sorted = [...main].sort((a, b) => rank(a.key) - rank(b.key));
  const visible = sorted.slice(0, 4);
  const rest = [...sorted.slice(4), ...bottom];
  const restActive = rest.some((i) => isActive(pathname, i.href));
  const tab = (i: NavItem, active: boolean) => (
    <>
      <span className={cn("tile h-9 w-9", active ? "bg-rose-300 text-olive-800" : "text-ivory/70")}><NavIcon name={i.icon} className="h-5 w-5" /></span>
      <span className={cn("truncate", active && "font-bold text-butter")}>{i.short ?? SHORT[i.key] ?? i.label}</span>
    </>
  );
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-ink/30 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-ivory p-4 pb-[max(env(safe-area-inset-bottom),16px)] shadow-pop" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line-strong" />
            <div className="grid grid-cols-3 gap-2">
              {rest.map((i) => (
                <Link key={i.key} href={i.href} onClick={() => setOpen(false)} className="relative flex flex-col items-center gap-1.5 rounded-2xl bg-paper px-2 py-3 text-xs font-semibold text-ink-600 ring-1 ring-line">
                  <span className={cn("tile h-11 w-11", toneTile[i.tone ?? "neutral"])}><NavIcon name={i.icon} className="h-6 w-6" /></span>
                  <span className="text-center leading-tight">{i.label}</span>
                  {i.key === "notifications" && unread > 0 && <span className="absolute end-3 top-2 rounded-full bg-clay-500 px-1.5 text-[10px] font-bold text-white">{unread}</span>}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex print:hidden bg-olive-700 px-1 pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5 lg:hidden">
        {visible.map((i) => (
          <Link key={i.key} href={i.href} className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1 text-[11px] font-medium text-ivory/75">
            {tab(i, isActive(pathname, i.href))}
          </Link>
        ))}
        <button type="button" onClick={() => setOpen(true)} className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1 text-[11px] font-medium text-ivory/75">
          <span className={cn("tile h-9 w-9", restActive ? "bg-rose-300 text-olive-800" : "text-ivory/70")}><Menu className="h-5 w-5" /></span>
          <span className={cn(restActive && "font-bold text-butter")}>{moreLabel}</span>
        </button>
      </nav>
    </>
  );
}
