"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import type { NavItem } from "@/lib/navigation";
import { NavIcon } from "./icon";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function Item({ item, pathname, badge }: { item: NavItem; pathname: string; badge?: number }) {
  const active = isActive(pathname, item.href);
  return (
    <Link href={item.href}
      className={cn("group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition",
        active ? "bg-white text-ink shadow-card ring-1 ring-line" : item.phase ? "text-ink-300 hover:text-ink-500" : "text-ink-500 hover:bg-sand-100 hover:text-ink")}>
      <NavIcon name={item.icon} className={cn("h-[18px] w-[18px]", active ? "text-taupe-600" : "text-ink-300 group-hover:text-taupe-500")} />
      <span className="flex-1 truncate">{item.label}</span>
      {item.phase && <span className="rounded-full border border-line px-1.5 text-[10px] text-ink-300">P{item.phase}</span>}
      {!!badge && <span className="rounded-full bg-clay-500 px-1.5 text-[10px] font-semibold leading-4 text-white">{badge > 99 ? "99+" : badge}</span>}
    </Link>
  );
}

export function Sidebar({ main, upcoming, bottom, unread }: { main: NavItem[]; upcoming: NavItem[]; bottom: NavItem[]; unread: number }) {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-line bg-sand-50">
      <Link href="/" className="flex items-baseline gap-2 px-6 pb-6 pt-7">
        <span className="font-display text-2xl font-semibold tracking-[0.14em] text-ink">BOHEMIA</span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-taupe-500">OS</span>
      </Link>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {main.map((i) => <Item key={i.key} item={i} pathname={pathname} />)}
        {upcoming.length > 0 && (
          <>
            <p className="px-3 pb-1.5 pt-6 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-300">Modules à venir</p>
            {upcoming.map((i) => <Item key={i.key} item={i} pathname={pathname} />)}
          </>
        )}
      </nav>
      <div className="space-y-0.5 border-t border-line px-3 py-3">
        {bottom.map((i) => <Item key={i.key} item={i} pathname={pathname} badge={i.key === "notifications" ? unread : undefined} />)}
      </div>
    </aside>
  );
}
