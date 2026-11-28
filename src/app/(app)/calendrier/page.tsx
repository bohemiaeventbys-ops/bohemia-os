import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { addAgenda, deleteAgenda } from "./actions";
import { Empty } from "@/components/ui/empty";
import { buttonClass } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadDepartments, loadEmployees } from "@/lib/queries";
import { addDays, addMonths, endOfMonth, formatDate, formatDayLong, formatDayShort, formatMonth, hhmm, isValidISODate, isoWeekday, startOfMonth, startOfWeek, todayISO, toLocalISODate, toLocalTime } from "@/lib/dates";
import { fullName } from "@/lib/format";
import { EVENT_STATUS, EVENT_TYPE, LEAVE_TYPE, TASK_STATUS, WEEKDAYS } from "@/lib/labels";
import { cn } from "@/lib/cn";
import type { EventRow, LeaveRequest, Task } from "@/lib/types";

export const metadata = { title: "Calendrier" };

type Kind = "evenement" | "livraison" | "installation" | "demontage" | "tache" | "conge" | "rdv" | "appel" | "note" | "rappel";
interface Item { date: string; time?: string; end?: string; kind: Kind; title: string; href?: string; meta?: string; agendaId?: string; canDelete?: boolean; phone?: string | null }
type SP = { vue?: string; date?: string; employe?: string; departement?: string; type?: string; statut?: string; afficher?: string };

const KIND_STYLE: Record<Kind, { label: string; cls: string }> = {
  evenement: { label: "Événement", cls: "bg-rose-500 text-white" },
  livraison: { label: "Livraison", cls: "bg-teal-100 text-teal-700" },
  installation: { label: "Installation", cls: "bg-ochre-100 text-ochre-700" },
  demontage: { label: "Démontage", cls: "bg-plum-100 text-plum-700" },
  tache: { label: "Tâche", cls: "bg-sage-50 text-sage-700 border border-sage-200" },
  conge: { label: "Congé", cls: "bg-mist-100 text-mist-700" },
  rdv: { label: "Rendez-vous", cls: "bg-olive-100 text-olive-800" },
  appel: { label: "Appel", cls: "bg-clay-100 text-clay-700" },
  note: { label: "Note", cls: "bg-sand-200 text-ink-600" },
  rappel: { label: "Rappel", cls: "bg-ochre-200 text-ochre-700" },
};
const DOT: Record<Kind, string> = {
  evenement: "bg-rose-500", livraison: "bg-teal-500", installation: "bg-ochre-500", demontage: "bg-plum-500", tache: "bg-sage-500", conge: "bg-mist-500",
  rdv: "bg-olive-600", appel: "bg-clay-500", note: "bg-taupe-400", rappel: "bg-ochre-600",
};
const AGENDA_KINDS = ["rdv", "appel", "note", "rappel"] as const;
const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const session = await requireSession();
  const supabase = await createClient();
  const today = todayISO();
  const vue = ["jour", "semaine", "mois", "annee", "weekend"].includes(sp.vue ?? "") ? sp.vue! : "mois";
  const ref = isValidISODate(sp.date) ? sp.date : today;
  const show = new Set((sp.afficher ?? "evenements,taches,conges,logistique,agenda").split(","));

  let from: string, to: string, prev: string, next: string, label: string;
  if (vue === "jour") { from = to = ref; prev = addDays(ref, -1); next = addDays(ref, 1); label = formatDayLong(ref); }
  else if (vue === "semaine") { from = startOfWeek(ref); to = addDays(from, 6); prev = addDays(from, -7); next = addDays(from, 7); label = `Semaine du ${formatDate(from)}`; }
  else if (vue === "weekend") { from = startOfWeek(ref); to = addDays(from, 27); prev = addDays(from, -28); next = addDays(from, 28); label = `Week-ends du ${formatDate(addDays(from, 4))} au ${formatDate(to)}`; }
  else if (vue === "annee") { const y = ref.slice(0, 4); from = `${y}-01-01`; to = `${y}-12-31`; prev = `${Number(y) - 1}${ref.slice(4)}`; next = `${Number(y) + 1}${ref.slice(4)}`; label = y; }
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
  const [{ data: evData }, { data: tData }, { data: lData }, { data: teamRows }, { data: agData }] = await Promise.all([
    show.has("evenements") || show.has("logistique") ? evQ : Promise.resolve({ data: [] }),
    show.has("taches") ? tQ : Promise.resolve({ data: [] }),
    show.has("conges") ? lQ : Promise.resolve({ data: [] }),
    sp.employe ? supabase.from("event_team").select("event_id").eq("employee_id", sp.employe) : Promise.resolve({ data: null }),
    show.has("agenda") ? supabase.from("agenda_entries").select("*").gte("day", from).lte("day", to).order("start_time", { nullsFirst: true }).limit(2000) : Promise.resolve({ data: [] }),
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
    const href = `/evenements/${e.id}/fiche`;
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
  for (const a of (agData ?? []) as { id: string; day: string; start_time: string | null; end_time: string | null; kind: Kind; title: string; details: string | null; phone: string | null; created_by: string | null }[]) {
    if (sp.employe && a.created_by !== sp.employe) continue;
    items.push({ date: a.day, time: a.start_time ? hhmm(a.start_time) : undefined, end: a.end_time ? hhmm(a.end_time) : undefined, kind: a.kind, title: a.title, agendaId: a.id, phone: a.phone,
      canDelete: a.created_by === session.employee.id || session.isAdmin,
      meta: [a.details, a.created_by ? `écrit par ${fullName(people.get(a.created_by))}` : null].filter(Boolean).join(" · ") });
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
          <Link href={`${qs({ vue: "jour", date: vue === "jour" ? ref : today })}#ajouter`} className={buttonClass("primary", "sm")}>+ Ajouter</Link>
        </>} />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex overflow-x-auto rounded-lg border border-line bg-paper p-0.5">
          {[["jour", "Jour"], ["semaine", "Semaine"], ["mois", "Mois"], ["annee", "Année"], ["weekend", "Week-ends"]].map(([k, l]) => (
            <Link key={k} href={qs({ vue: k })} className={cn("rounded-md px-3 py-1.5 text-sm", vue === k ? "bg-ink text-ivory" : "text-ink-500 hover:bg-sand-100")}>{l}</Link>
          ))}
        </div>
        <p className="text-xl font-bold">{label}</p>
        <div className="flex flex-wrap gap-1.5 text-xs sm:ms-auto">
          {[["evenements", "Événements"], ["logistique", "Livraisons / installations"], ["taches", "Tâches"], ["conges", "Congés"], ["agenda", "Agenda (rdv, appels, notes)"]].map(([k, l]) => (
            <Link key={k} href={toggle(k)} className={cn("rounded-full border px-3 py-1", show.has(k) ? "border-ink bg-ink text-ivory" : "border-line bg-paper text-ink-400")}>{l}</Link>
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
            {WEEKDAYS.map((d, i) => <p key={d} className={cn("px-1 py-2 text-center text-2xs font-semibold uppercase tracking-wider text-ink-400 sm:px-3 sm:text-start", i >= 5 && "text-taupe-600")}><span className="sm:hidden">{d.slice(0, 1)}</span><span className="hidden sm:inline">{d}</span></p>)}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1 }, (_, i) => addDays(from, i)).map((d) => {
              const list = byDate(d);
              const inMonth = d.slice(0, 7) === ref.slice(0, 7);
              return (
                <div key={d} className={cn("relative min-h-[64px] border-b border-r border-line p-1 sm:min-h-[120px] sm:p-1.5", !inMonth && "bg-sand-50/60", isoWeekday(d) >= 6 && inMonth && "bg-nude-100/30")}>
                  {/* Téléphone : on touche le jour pour voir les heures */}
                  <Link href={qs({ vue: "jour", date: d })} className="absolute inset-0 sm:hidden" aria-label={formatDayLong(d)} />
                  <Link href={qs({ vue: "jour", date: d })} className={cn("mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs", d === today ? "bg-ink text-ivory" : inMonth ? "text-ink" : "text-ink-300")}>{Number(d.slice(8))}</Link>
                  <div className="flex flex-wrap gap-0.5 sm:hidden">{list.slice(0, 6).map((it, k) => <span key={k} className={cn("h-2 w-2 rounded-full", DOT[it.kind])} />)}</div>
                  <div className="hidden space-y-0.5 sm:block">
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
        <div className="grid gap-3 sm:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((d) => (
            <div key={d} className={cn("card p-2 sm:min-h-[420px]", d === today && "ring-2 ring-nude-200")}>
              <Link href={qs({ vue: "jour", date: d })} className="mb-2 block px-1 text-xs font-semibold hover:underline">{formatDayShort(d)}</Link>
              <div className="space-y-1">{byDate(d).map((it, k) => <Chip key={k} it={it} full />)}</div>
            </div>
          ))}
        </div>
      )}

      {vue === "jour" && (() => {
        const list = byDate(ref);
        const timed = list.filter((i) => i.time);
        const untimed = list.filter((i) => !i.time);
        const hours = Array.from({ length: 17 }, (_, i) => i + 7); // 7 h → 23 h
        const early = timed.filter((i) => Number(i.time!.slice(0, 2)) < 7);
        return (
          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title={<span>{formatDayLong(ref)}</span>} subtitle={`${list.length} élément(s)`} />
              {untimed.length > 0 && (
                <div className="space-y-1.5 border-b border-line px-5 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Toute la journée</p>
                  {untimed.map((it, k) => <Row key={k} it={it} />)}
                </div>
              )}
              <ol>
                {early.length > 0 && <li className="flex gap-3 border-b border-line px-5 py-2"><span className="w-12 shrink-0 text-sm font-semibold text-ink-400">Tôt</span><div className="flex-1 space-y-1.5">{early.map((it, k) => <Row key={k} it={it} />)}</div></li>}
                {hours.map((h) => {
                  const at = timed.filter((i) => Number(i.time!.slice(0, 2)) === h);
                  return (
                    <li key={h} className={cn("flex min-h-[48px] gap-3 border-b border-line/70 px-5 py-1.5", ref === today && Number(new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Africa/Casablanca" })) === h && "bg-olive-50")}>
                      <span className="w-12 shrink-0 pt-1 text-sm font-semibold tabular-nums text-ink-400">{String(h).padStart(2, "0")}:00</span>
                      <div className="flex-1 space-y-1.5">{at.map((it, k) => <Row key={k} it={it} />)}</div>
                    </li>
                  );
                })}
              </ol>
            </Card>
            <div id="ajouter" className="scroll-mt-24">
              <Card>
                <CardHeader title="Ajouter à l'agenda" subtitle="Rendez-vous, appel, note… Toute l'équipe le voit." />
                <CardBody>
                  <ActionForm action={addAgenda} resetOnSuccess className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      {AGENDA_KINDS.map((k, i) => (
                        <label key={k} className={cn("flex h-12 cursor-pointer items-center justify-center rounded-xl text-sm font-bold ring-1 ring-line has-[:checked]:ring-2 has-[:checked]:ring-ink", KIND_STYLE[k].cls)}>
                          <input type="radio" name="kind" value={k} defaultChecked={i === 0} className="sr-only" />{KIND_STYLE[k].label}
                        </label>
                      ))}
                    </div>
                    <Input name="title" required placeholder="Quoi ? ex. Appeler Mme Alami pour le devis" className="h-12" />
                    <Input name="day" type="date" defaultValue={ref} required className="h-12" aria-label="Jour" />
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs font-semibold text-ink-500">Début<Input name="start_time" type="time" className="mt-1 h-12" /></label>
                      <label className="text-xs font-semibold text-ink-500">Fin<Input name="end_time" type="time" className="mt-1 h-12" /></label>
                    </div>
                    <Input name="phone" type="tel" inputMode="tel" placeholder="Téléphone (facultatif)" className="h-12" />
                    <Textarea name="details" rows={2} placeholder="Détails (facultatif)" />
                    <SubmitButton size="lg" className="w-full">Ajouter</SubmitButton>
                  </ActionForm>
                </CardBody>
              </Card>
            </div>
          </div>
        );
      })()}

      {vue === "annee" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {MONTHS.map((m, mi) => {
            const first = `${label}-${String(mi + 1).padStart(2, "0")}-01`;
            const start = startOfWeek(first);
            const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
            const count = items.filter((i) => i.date.slice(0, 7) === first.slice(0, 7) && i.kind === "evenement").length;
            return (
              <div key={m} className="card p-3">
                <Link href={qs({ vue: "mois", date: first })} className="mb-2 flex items-baseline justify-between font-bold hover:underline">{m}<span className="text-xs font-semibold text-ink-400">{count ? `${count} événement(s)` : ""}</span></Link>
                <div className="grid grid-cols-7 gap-0.5 text-center text-[11px]">
                  {WEEKDAYS.map((d) => <span key={d} className="text-ink-300">{d.slice(0, 1)}</span>)}
                  {days.map((d) => {
                    const inM = d.slice(0, 7) === first.slice(0, 7);
                    const l = inM ? byDate(d) : [];
                    const top = l.find((i) => i.kind === "evenement") ?? l[0];
                    return (
                      <Link key={d} href={qs({ vue: "jour", date: d })} className={cn("relative grid h-7 place-items-center rounded-md tabular-nums", !inM && "invisible", d === today ? "bg-ink font-bold text-ivory" : top ? "font-bold" : "text-ink-500", "hover:bg-sand-100")}>
                        {Number(d.slice(8))}
                        {top && d !== today && <span className={cn("absolute bottom-0.5 h-1 w-3 rounded-full", DOT[top.kind])} />}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
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

function Row({ it }: { it: Item }) {
  return (
    <div className={cn("flex items-start gap-2 rounded-xl px-3 py-2", KIND_STYLE[it.kind].cls)}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-tight">
          {it.time && <span className="me-1.5 tabular-nums">{it.time}{it.end ? `–${it.end}` : ""}</span>}
          {it.href ? <Link href={it.href} className="hover:underline">{it.title}</Link> : it.title}
        </p>
        <p className="text-xs opacity-80">{KIND_STYLE[it.kind].label}{it.meta ? ` · ${it.meta}` : ""}</p>
        {it.phone && <a href={`tel:${it.phone.replace(/\s/g, "")}`} className="text-xs font-bold underline" dir="ltr">{it.phone}</a>}
      </div>
      {it.agendaId && it.canDelete && (
        <ActionForm action={deleteAgenda}><input type="hidden" name="id" value={it.agendaId} /><button className="rounded-lg px-2 py-1 text-xs font-semibold underline opacity-70">Supprimer</button></ActionForm>
      )}
    </div>
  );
}

function Chip({ it, full }: { it: Item; full?: boolean }) {
  const body = (
    <span className={cn("block truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4", KIND_STYLE[it.kind].cls)} title={`${KIND_STYLE[it.kind].label} · ${it.title}${it.meta ? ` · ${it.meta}` : ""}`}>
      {it.time && <span className="mr-1 opacity-70">{it.time}</span>}
      {it.kind !== "evenement" && it.kind !== "tache" && <span className="mr-1 opacity-70">{KIND_STYLE[it.kind].label} ·</span>}
      {it.title}
      {full && it.meta && <span className="block truncate opacity-60">{it.meta}</span>}
    </span>
  );
  return it.href ? <Link href={it.href} className="block hover:opacity-80">{body}</Link> : body;
}
