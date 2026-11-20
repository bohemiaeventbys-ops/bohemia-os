import Link from "next/link";
import { Bell, LogOut, Search } from "lucide-react";
import { signOut } from "@/app/actions";
import { Avatar } from "@/components/ui/avatar";
import { formatDayLong, todayISO } from "@/lib/dates";
import { fullName } from "@/lib/format";
import { ROLE } from "@/lib/labels";
import type { Employee } from "@/lib/types";

export function Topbar({ employee, unread, photoUrl }: { employee: Employee; unread: number; photoUrl: string | null }) {
  const today = formatDayLong(todayISO());
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-6 border-b border-line bg-ivory/85 px-8 backdrop-blur">
      <form action="/recherche" className="relative w-full max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" strokeWidth={1.5} />
        <input name="q" placeholder="Rechercher un employé, une tâche, un événement…" className="field h-10 border-line bg-white/70 pl-9" />
      </form>
      <p className="hidden text-sm capitalize text-ink-400 xl:block">{today}</p>
      <div className="ml-auto flex items-center gap-4">
        <Link href="/notifications" className="relative rounded-lg p-2 text-ink-400 transition hover:bg-sand-100 hover:text-ink" aria-label="Notifications">
          <Bell className="h-5 w-5" strokeWidth={1.5} />
          {unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-clay-500 ring-2 ring-ivory" />}
        </Link>
        <div className="flex items-center gap-3 border-l border-line pl-4">
          <Avatar person={employee} url={photoUrl} size={34} />
          <div className="leading-tight">
            <p className="text-sm font-medium text-ink">{fullName(employee)}</p>
            <p className="text-xs text-ink-400">{employee.job_title ?? ROLE[employee.role]}</p>
          </div>
          <form action={signOut}>
            <button className="rounded-lg p-2 text-ink-300 transition hover:bg-sand-100 hover:text-ink" title="Se déconnecter" aria-label="Se déconnecter">
              <LogOut className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
