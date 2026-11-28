import Link from "next/link";
import { PrintChoice } from "@/components/print-choice";
import { ChevronLeft, ChevronRight, Clock, FileText, MapPin } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, startOfWeek, toLocalISODate, toLocalTime, todayISO, isValidISODate } from "@/lib/dates";
import { getLang } from "@/lib/lang";
import { ROLES, type Assignment, type RoleKey } from "@/lib/team";
import type { EventRow } from "@/lib/types";
import { cn } from "@/lib/cn";

export const metadata = { title: "Cette semaine" };
export const dynamic = "force-dynamic";

const firstTime = (e: EventRow) => e.load_at ?? e.delivery_at ?? e.setup_at ?? e.start_at ?? null;

/** Cette semaine : les événements jour par jour (heure, nom, lieu) et mes missions. Un toucher ouvre la fiche technique. */
export default async function Semaine({ searchParams }: { searchParams: Promise<{ du?: string }> }) {
  const sp = await searchParams;
  const s = await requireSession();
  const lang = await getLang();
  const ar = lang === "ar";
  const today = todayISO();
  const monday = startOfWeek(isValidISODate(sp.du) ? sp.du : today);
  const sunday = addDays(monday, 6);
  const supabase = await createClient();

  const seesAll = s.isAdmin || s.can("events.manage") || s.can("stock.move") || s.can("stock.manage");
  const [{ data: evData }, { data: mineData }] = await Promise.all([
    supabase.from("events").select("*").gte("event_date", addDays(monday, -1)).lte("event_date", addDays(sunday, 1)).not("status", "in", "(annule,prospect)").order("event_date"),
    supabase.from("event_assignments").select("*").eq("employee_id", s.employee.id),
  ]);
  const mine = (mineData ?? []) as Assignment[];
  const mineEvents = new Set(mine.map((a) => a.event_id));
  const events = ((evData ?? []) as EventRow[]).filter((e) => seesAll || mineEvents.has(e.id));
  const evMap = new Map(events.map((e) => [e.id, e]));
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const dayName = (d: string) => new Intl.DateTimeFormat(ar ? "ar-MA" : "fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));

  // Ce qui tombe chaque jour : l'événement lui-même + mes missions (chargement la veille, démontage le lendemain…)
  const myMissionsOn = (d: string) => mine.filter((a) => (a.start_at ? toLocalISODate(a.start_at) : evMap.get(a.event_id)?.event_date) === d)
    .sort((a, b) => (a.start_at ?? "").localeCompare(b.start_at ?? ""));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{ar ? "هاد السيمانة" : "Cette semaine"}</h1>
        <div className="flex items-center gap-1" dir="ltr">
          <Link href={`/semaine?du=${addDays(monday, -7)}`} className="grid h-11 w-11 place-items-center rounded-xl bg-paper ring-1 ring-line" aria-label="Semaine précédente"><ChevronLeft className="h-5 w-5" /></Link>
          <Link href="/semaine" className="h-11 rounded-xl bg-paper px-3 text-sm font-semibold leading-[44px] ring-1 ring-line">{ar ? "اليوم" : "Aujourd'hui"}</Link>
          <Link href={`/semaine?du=${addDays(monday, 7)}`} className="grid h-11 w-11 place-items-center rounded-xl bg-paper ring-1 ring-line" aria-label="Semaine suivante"><ChevronRight className="h-5 w-5" /></Link>
        </div>
      </div>

      {days.map((d) => {
        const evs = events.filter((e) => e.event_date === d).sort((a, b) => (firstTime(a) ?? "").localeCompare(firstTime(b) ?? ""));
        const missions = myMissionsOn(d);
        if (!evs.length && !missions.length && d !== today) return (
          <p key={d} className="px-1 text-sm text-ink-300">{dayName(d)} · {ar ? "والو" : "rien"}</p>
        );
        return (
          <section key={d} className={cn("rounded-3xl p-4 ring-1", d === today ? "bg-rose-50 ring-rose-200" : "bg-paper ring-line")}>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-rose-700">{dayName(d)}{d === today ? (ar ? " · اليوم" : " · aujourd'hui") : ""}</h2>
            {missions.length > 0 && (
              <ul className="mb-2 space-y-2">
                {missions.map((a) => {
                  const e = evMap.get(a.event_id);
                  const r = ROLES[a.role as RoleKey];
                  return (
                    <li key={a.id}>
                      <Link href={`/evenements/${a.event_id}/fiche`} className="flex items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-ivory">
                        <span className="text-2xl font-bold tabular-nums" dir="ltr">{a.start_at ? toLocalTime(a.start_at) : "—"}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold leading-tight">{ar ? "مهمتي" : "Ma mission"} : {a.mission ?? (ar ? r?.ar : r?.fr)}</span>
                          <span className="block truncate text-sm opacity-80" dir="auto">{e?.name ?? ""}{e?.address ? ` · ${e.address}` : ""}</span>
                        </span>
                        <FileText className="h-5 w-5 shrink-0" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {evs.length === 0 ? <p className="text-sm text-ink-400">{ar ? "ما كاين حتى حفلة" : "Aucun événement"}</p> : (
              <ul className="space-y-2">
                {evs.map((e) => (
                  <li key={e.id} className="flex items-stretch gap-2">
                    <Link href={`/evenements/${e.id}/fiche`} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl bg-sand-50 px-4 py-3 ring-1 ring-line hover:bg-paper">
                      <span className="flex w-14 shrink-0 flex-col items-center text-ink-500"><Clock className="h-4 w-4" /><span className="text-lg font-bold tabular-nums text-ink" dir="ltr">{firstTime(e) ? toLocalTime(firstTime(e)) : "—"}</span></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[16px] font-bold leading-tight" dir="auto">{e.name}</span>
                        <span className="flex items-center gap-1 truncate text-sm text-ink-500"><MapPin className="h-3.5 w-3.5 shrink-0" /><span dir="auto" className="truncate">{e.address ?? "—"}</span></span>
                        {e.guests ? <span className="text-xs text-ink-500">{e.guests} {ar ? "شخص" : "personnes"}</span> : null}
                      </span>
                    </Link>
                    <PrintChoice eventId={e.id} compact className="self-center" />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
