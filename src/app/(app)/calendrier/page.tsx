import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { buttonClass } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadDepartments, loadEmployees } from "@/lib/queries";
import { addDays, addMonths, endOfMonth, formatDate, formatDayLong, formatDayShort, formatMonth, hhmm, isValidISODate, isoWeekday, startOfMonth, startOfWeek, todayISO, toLocalISODate, toLocalTime } from "@/lib/dates";
import { fullName } from "@/lib/format";
import { EVENT_STATUS, EVENT_TYPE, LEAVE_TYPE, TASK_STATUS, WEEKDAYS } from "@/lib/labels";
import { cn } from "@/lib/cn";
import type { EventRow, LeaveRequest, Task } from "@/lib/types";

export const metadata = { title: "Calendrier" };

type Kind = "evenement" | "livraison" | "installation" | "demontage" | "tache" | "conge";
interface Item { date: string; time?: string; kind: Kind; title: string; href?: string; meta?: string; }
type SP = { vue?: string; date?: string; employe?: string; departement?: string; type?: string; statut?: string; afficher?: string };

const KIND_STYLE: Record<Kind, { label: string; cls: string }> = {
  evenement: { label: "Événement", cls: "bg-ink text-ivory" },
  livraison: { label: "Livraison", cls: "bg-nude-200 text-taupe-700" },
  installation: { label: "Installation", cls: "bg-ochre-100 text-ochre-700" },
  demontage: { label: "Démontage", cls: "bg-sand-200 text-ink-500" },
  tache: { label: "Tâche", cls: "bg-white text-ink border border-line" },
  conge: { label: "Congé", cls: "bg-mist-100 text-mist-700" },
};

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  await requireSession();
  const supabase = await createClient();
  const today = todayISO();
  const vue = ["jour", "semaine", "mois", "weekend"].includes(sp.vue ?? "") ? sp.vue! : "mois";
  const ref = isValidISODate(sp.date) ? sp.date : today;
  const show = new Set((sp.afficher ?? "evenements,taches,conges,logistique").split(","));

  let from: string, to: string, prev: string, next: string, label: string;
  if (vue === "jour") { from = to = ref; prev = addDays(ref, -1); next = addDays(ref, 1); label = formatDayLong(ref); }
  else if (vue === "semaine") { from = startOfWeek(ref); to = addDays(from, 6); prev = addDays(from, -7); next = addDays(from, 7); label = `Semaine du ${formatDate(from)}`; }
  else if (vue === "weekend") { from = startOfWeek(ref); to = addDays(from, 27); prev = addDays(from, -28); next = addDays(from, 28); label = `Week-ends du ${formatDate(addDays(from, 4))} au ${formatDate(to)}`; }
  else { from = startOfWeek(startOfMonth(ref)); to = addDays(startOfWeek(endOfMonth(ref)), 6); prev = addMonths(ref, -1); next = addMonths(ref, 1); label = formatMonth(ref); }

  const [employees, departments] = await Promise.all([loadEmployees(supabase), loadDepartments(supabase)]);
  let evQ = supabase.from("events").select("*").gte("event_date", addDays(from, -1)).lte("event_date", addDays(to, 1));
  if (sp.type) evQ = evQ.eq("event_type", sp.type);
  if (sp.statut) evQ = evQ.eq("status", sp.statut);
  let tQ = supabase.from("tasks").select("*").or(`and(planned_date.gte.${from},planned_date.lte.${to}),and(planned_date.is.null,due_date.gte.${from},due_date.lte.${to})`);
  if (sp.employe) tQ = tQ.eq("assignee_id", sp.employe);
  if (sp.departement) tQ = tQ.eq("department_id", sp.departement);
  let lQ = supabase.from("leave_requests").select("*").eq("status", "validee").lte("start_date", to).gte("end_date", from);
  if (sp.employe) lQ = lQ.eq("employee_id", sp.employe);
  const [{ data: evData }, { data: tData }, { data: lData }, { data: teamRows }] = await Promise.all([
    show.has("evenements") || show.has("logistique") ? evQ : Promise.resolve({ data: [] }),
    show.has("taches") ? tQ : Promise.resolve({ data: [] }),
    show.has("conges") ? lQ : Promise.resolve({ data: [] }),
    sp.employe ? supabase.from("event_team").select("event_id").eq("employee_id", sp.employe) : Promise.resolve({ data: null }),
  ]);
  let events = (evData ?? []) as EventRow[];
  if (sp.employe && teamRows) {
    const ids = new Set(teamRows.map((r) => r.event_id));
    events = events.filter((e) => ids.has(e.id) || e.manager_id === sp.employe);
  }
  const people = new Map(employees.map((e) => [e.id, e]));
  const deptEmp = sp.departement ? new Set(employees.filter((e) => e.department_id === sp.departement).map((e) => e.id)) : null;

  const items: Item[] = [];
  for (const e of events) {
    const href = `/evenements/${e.id}`;
    if (show.has("evenements")) items.push({ date: e.event_date, time: e.start_at ? toLocalTime(e.start_at) : undefined, kind: "evenement", title: e.name, href, meta: `${EVENT_TYPE[e.event_type]} · ${EVENT_STATUS[e.status].label}${e.address ? ` · ${e.address}` : ""}` });
    if (show.has("logistique")) {
      if (e.delivery_at) items.push({ date: toLocalISODate(e.delivery_at), time: toLocalTime(e.delivery_at), kind: "livraison", title: e.name, href });
      if (e.setup_at) items.push({ date: toLocalISODate(e.setup_at), time: toLocalTime(e.setup_at), kind: "installation", title: e.name, href });
      if (e.teardown_at) items.push({ date: toLocalISODate(e.teardown_at), time: toLocalTime(e.teardown_at), kind: "demontage", title: e.name, href });
    }
  }
  for (const t of (tData ?? []) as Task[]) {
    const d = t.planned_date ?? t.due_date;
    if (!d) continue;
    items.push({ date: d, time: t.planned_time ? hhmm(t.planned_time) : t.due_time ? hhmm(t.due_time) : undefined, kind: "tache", title: t.title, href: `/taches/${t.id}`,
      meta: `${t.assignee_id ? fullName(people.get(t.assignee_id)) : "Non assignée"} · ${TASK_STATUS[t.status].label}` });
  }
  for (const l of (lData ?? []) as LeaveRequest[]) {
    if (deptEmp && !deptEmp.has(l.employee_id)) continue;
    for (let d = l.start_date < from ? from : l.start_date; d <= l.end_date && d <= to; d = addDays(d, 1)) {
      items.push({ date: d, kind: "conge", title: fullName(people.get(l.employee_id)), meta: LEAVE_TYPE[l.leave_type] });
    }
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === "evenement" ? -1 : 0) - (b.kind === "evenement" ? -1 : 0) || (a.time ?? "99").localeCompare(b.time ?? "99"));
  const byDate = (d: string) => items.filter((i) => i.date === d);

  const qs = (o: Partial<SP>) => "?" + new URLSearchParams(Object.entries({ ...sp, vue, date: ref, ...o }).filter(([, v]) => v) as [string, string][]).toString();
  const toggle = (k: string) => {
    const n = new Set(show);
    if (n.has(k)) n.delete(k); else n.add(k);
    return qs({ afficher: Array.from(n).join(",") || "aucun" });
  };

  return (
    <>
      <PageHeader eyebrow="Planification" title="Calendrier" subtitle="Événements, installations, livraisons, démontages, tâches et congés au même endroit."
        actions={<>
          <Link href={qs({ date: prev })} className={buttonClass("secondary", "sm")}>←</Link>
          <Link href={qs({ date: today })} className={buttonClass("secondary", "sm")}>Aujourd&apos;hui</Link>
          <Link href={qs({ date: next })} className={buttonClass("secondary", "sm")}>→</Link>
        </>} />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-line bg-white p-0.5">
          {[["jour", "Jour"], ["semaine", "Semaine"], ["mois", "Mois"], ["weekend", "Week-ends"]].map(([k, l]) => (
            <Link key={k} href={qs({ vue: k })} className={cn("rounded-md px-3 py-1.5 text-sm", vue === k ? "bg-ink text-ivory" : "text-ink-500 hover:bg-sand-100")}>{l}</Link>
          ))}
        </div>
        <p className="font-display text-2xl ">{label}</p>
        <div className="ml-auto flex flex-wrap gap-1.5 text-xs">
          {[["evenements", "Événements"], ["logistique", "Livraisons / installations"], ["taches", "Tâches"], ["conges", "Congés"]].map(([k, l]) => (
            <Link key={k} href={toggle(k)} className={cn("rounded-full border px-3 py-1", show.has(k) ? "border-ink bg-ink text-ivory" : "border-line bg-white text-ink-400")}>{l}</Link>
          ))}
        </div>
      </div>
      <form className="mb-5 flex flex-wrap items-center gap-2">
        <input type="hidden" name="vue" value={vue} /><input type="hidden" name="date" value={ref} />{sp.afficher && <input type="hidden" name="afficher" value={sp.afficher} />}
        <Select name="employe" defaultValue={sp.employe ?? ""} className="h-9 w-48 py-1"><option value="">Tous les employés</option>{employees.map((e) => <option key={e.id} value={e.id}>{fullName(e)}</option>)}</Select>
        <Select name="departement" defaultValue={sp.departement ?? ""} className="h-9 w-56 py-1"><option value="">Tous les départements</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
        <Select name="type" defaultValue={sp.type ?? ""} className="h-9 w-44 py-1"><option value="">Tous types</option>{Object.entries(EVENT_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Select name="statut" defaultValue={sp.statut ?? ""} className="h-9 w-44 py-1"><option value="">Tous statuts</option>{Object.entries(EVENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
        <button className={buttonClass("secondary", "sm")}>Filtrer</button>
        <span className="text-xs text-ink-300">Le filtre véhicule arrivera avec le module Transport (Phase 5).</span>
      </form>

      {vue === "mois" && (
        <div className="card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-line bg-sand-50">
            {WEEKDAYS.map((d, i) => <p key={d} className={cn("px-3 py-2 text-2xs font-semibold uppercase tracking-wider text-ink-400", i >= 5 && "text-taupe-600")}>{d}</p>)}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1 }, (_, i) => addDays(from, i)).map((d) => {
              const list = byDate(d);
              const inMonth = d.slice(0, 7) === ref.slice(0, 7);
              return (
                <div key={d} className={cn("min-h-[120px] border-b border-r border-line p-1.5", !inMonth && "bg-sand-50/60", isoWeekday(d) >= 6 && inMonth && "bg-nude-100/30")}>
                  <Link href={qs({ vue: "jour", date: d })} className={cn("mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs", d === today ? "bg-ink text-ivory" : inMonth ? "text-ink" : "text-ink-300")}>{Number(d.slice(8))}</Link>
                  <div className="space-y-0.5">
                    {list.slice(0, 4).map((it, k) => <Chip key={k} it={it} />)}
                    {list.length > 4 && <Link href={qs({ vue: "jour", date: d })} className="block px-1 text-[10px] text-ink-400 hover:underline">+ {list.length - 4} autre(s)</Link>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {vue === "semaine" && (
        <div className="grid grid-cols-7 gap-3">
          {Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((d) => (
            <div key={d} className={cn("card min-h-[420px] p-2", d === today && "ring-2 ring-nude-200")}>
              <Link href={qs({ vue: "jour", date: d })} className="mb-2 block px-1 text-xs font-semibold hover:underline">{formatDayShort(d)}</Link>
              <div className="space-y-1">{byDate(d).map((it, k) => <Chip key={k} it={it} full />)}</div>
            </div>
          ))}
        </div>
      )}

      {vue === "jour" && (
        <Card>
          <CardHeader title={<span>{formatDayLong(ref)}</span>} subtitle={`${byDate(ref).length} élément(s)`} />
          {byDate(ref).length === 0 ? <Empty title="Rien de prévu ce jour." /> : (
            <ul className="divide-y divide-line">
              {byDate(ref).map((it, k) => (
                <li key={k} className="flex items-start gap-4 px-5 py-3">
                  <span className="w-14 shrink-0 pt-0.5 text-sm tabular-nums text-ink-400">{it.time ?? "—"}</span>
                  <span className={cn("shrink-0 rounded px-2 py-0.5 text-2xs font-medium", KIND_STYLE[it.kind].cls)}>{KIND_STYLE[it.kind].label}</span>
                  <div className="min-w-0">
                    {it.href ? <Link href={it.href} className="text-sm font-medium hover:underline">{it.title}</Link> : <p className="text-sm font-medium">{it.title}</p>}
                    {it.meta && <p className="text-xs text-ink-400">{it.meta}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {vue === "weekend" && (
        <div className="grid gap-5 lg:grid-cols-2">
          {[0, 1, 2, 3].map((w) => {
            const fri = addDays(from, w * 7 + 4);
            const wdays = [fri, addDays(fri, 1), addDays(fri, 2)];
            const evs = wdays.flatMap((d) => byDate(d).filter((i) => i.kind !== "tache"));
            return (
              <Card key={w}>
                <CardHeader title={`Week-end du ${formatDate(fri)}`} subtitle={`${evs.filter((e) => e.kind === "evenement").length} événement(s)`} />
                <div className="grid grid-cols-3 divide-x divide-line">
                  {wdays.map((d) => (
                    <div key={d} className="min-h-[160px] p-3">
                      <p className="mb-2 text-xs font-semibold text-ink-500">{formatDayShort(d)}</p>
                      <div className="space-y-1.5">{byDate(d).filter((i) => i.kind !== "tache").map((it, k) => <Chip key={k} it={it} full />)}</div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function Chip({ it, full }: { it: Item; full?: boolean }) {
  const body = (
    <span className={cn("block truncate rounded px-1.5 py-0.5 text-[11px] leading-4", KIND_STYLE[it.kind].cls)} title={`${KIND_STYLE[it.kind].label} · ${it.title}${it.meta ? ` · ${it.meta}` : ""}`}>
      {it.time && <span className="mr-1 opacity-70">{it.time}</span>}
      {it.kind !== "evenement" && it.kind !== "tache" && <span className="mr-1 opacity-70">{KIND_STYLE[it.kind].label} ·</span>}
      {it.title}
      {full && it.meta && <span className="block truncate opacity-60">{it.meta}</span>}
    </span>
  );
  return it.href ? <Link href={it.href} className="block hover:opacity-80">{body}</Link> : body;
}
