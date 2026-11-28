import Link from "next/link";
import { Bell, LogOut, Search } from "lucide-react";
import { signOut } from "@/app/actions";
import { Avatar } from "@/components/ui/avatar";
import { formatDayLong, todayISO } from "@/lib/dates";
import { fullName } from "@/lib/format";
import { ROLE } from "@/lib/labels";
import type { Employee } from "@/lib/types";
import { t, type Lang } from "@/lib/i18n";
import { LangSwitch } from "./lang-switch";

export function Topbar({ employee, unread, photoUrl, lang = "fr" }: { employee: Employee; unread: number; photoUrl: string | null; lang?: Lang }) {
  const today = formatDayLong(todayISO());
  return (
    <header className="sticky top-0 z-20 flex print:hidden h-16 items-center gap-3 border-b border-line bg-ivory/85 px-4 sm:gap-6 sm:px-8 backdrop-blur">
      <Link href="/" className="font-display text-xl font-semibold tracking-[0.12em] lg:hidden">BOHEMIA</Link>
      <form action="/recherche" className="relative hidden w-full max-w-md md:block">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" strokeWidth={1.5} />
        <input name="q" placeholder={t(lang, "top.search")} className="field h-11 border-line bg-white/70 ps-9" />
      </form>
      <p className="hidden text-sm text-ink-400 xl:block">{today}</p>
      <div className="ms-auto flex items-center gap-2 sm:gap-4">
        <LangSwitch lang={lang} compact />
        <Link href="/notifications" className="relative rounded-lg p-2 text-ink-400 transition hover:bg-sand-100 hover:text-ink" aria-label="Notifications">
          <Bell className="h-5 w-5" strokeWidth={1.5} />
          {unread > 0 && <span className="absolute end-1 top-1 h-2 w-2 rounded-full bg-clay-500 ring-2 ring-ivory" />}
        </Link>
        <div className="flex items-center gap-3 sm:border-s sm:border-line sm:ps-4">
          <Avatar person={employee} url={photoUrl} size={34} />
          <div className="hidden leading-tight sm:block">
            <p className="text-sm font-medium text-ink">{fullName(employee)}</p>
            <p className="text-xs text-ink-400">{employee.job_title ?? ROLE[employee.role]}</p>
          </div>
          <form action={signOut}>
            <button className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium text-ink-400 transition hover:bg-sand-100 hover:text-ink" title="Se déconnecter">
              <LogOut className="h-4 w-4" strokeWidth={1.8} /> <span className="hidden sm:inline">{t(lang, "top.logout")}</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
