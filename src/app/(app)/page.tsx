import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Empty } from "@/components/ui/empty";
import { ButtonLink } from "@/components/ui/button";
import { AutoRefresh } from "@/components/auto-refresh";
import { requireSession, isManagerish } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { attendanceScope, loadEmployees, loadSchedules } from "@/lib/queries";
import { liveStatus, scheduleFor } from "@/lib/attendance";
import { addDays, diffDays, formatDate, formatDayLong, formatDayShort, hhmm, isoWeekday, startOfWeek, todayISO, toLocalTime } from "@/lib/dates";
import { fullName } from "@/lib/format";
import { DONE_STATUSES, EVENT_STATUS, EVENT_TYPE, LEAVE_TYPE, TASK_STATUS } from "@/lib/labels";
import { isOverdue, sortTasks } from "@/lib/tasks";
import type { AttendanceDay, EventRow, LeaveRequest, Task } from "@/lib/types";

export const metadata = { title: "Dashboard" };

interface Urgent { level: "critique" | "attention"; title: string; detail: string; href: string; who?: string }

export default async function Dashboard() {
  const s = await requireSession();
  if (!(s.can("dashboard.direction") || isManagerish(s))) redirect("/ma-journee");
  const supabase = await createClient();
  const today = todayISO();
  const weekEnd = addDays(startOfWeek(today), 6);
  const friday = isoWeekday(today) <= 5 ? addDays(today, 5 - isoWeekday(today)) : addDays(startOfWeek(today), 4);
  const sunday = addDays(friday, 2);

  const [employees, schedules, { data: days }, { data: leaves }, { data: taskData }, { data: evData }] = await Promise.all([
    loadEmployees(supabase), loadSchedules(supabase),
    supabase.from("attendance_days").select("*").eq("work_date", today),
    supabase.from("leave_requests").select("*").eq("status", "validee").lte("start_date", today).gte("end_date", today),
    supabase.from("tasks").select("*").not("status", "in", `(${DONE_STATUSES.join(",")})`).limit(1000),
    supabase.from("events").select("*").gte("event_date", today).lte("event_date", addDays(today, 14)).neq("status", "annule").order("event_date"),
  ]);
  const scope = attendanceScope(s, employees);
  const people = new Map(employees.map((e) => [e.id, e]));
  const dayMap = new Map(((days ?? []) as AttendanceDay[]).map((d) => [d.employee_id, d]));
  const leaveMap = new Map(((leaves ?? []) as LeaveRequest[]).map((l) => [l.employee_id, LEAVE_TYPE[l.leave_type]]));
  const live = scope.map((e) => ({ e, st: liveStatus(dayMap.get(e.id), leaveMap.get(e.id) ?? null, scheduleFor(e, schedules, today)), day: dayMap.get(e.id) }));
  const present = live.filter((l) => ["present", "late", "out"].includes(l.st.key));
  const late = live.filter((l) => ["late", "missing"].includes(l.st.key));
  const absent = live.filter((l) => l.st.key === "absent");
  const notYet = live.filter((l) => ["not_yet", "missing"].includes(l.st.key));

  const tasks = (taskData ?? []) as Task[];
  const events = (evData ?? []) as EventRow[];
  const overdue = sortTasks(tasks.filter((t) => isOverdue(t)));
  const blocked = tasks.filter((t) => t.status === "bloque");
  const toVerify = tasks.filter((t) => t.status === "a_verifier");
  const todayTasks = tasks.filter((t) => t.planned_date === today || t.due_date === today);
  const weekEvents = events.filter((e) => e.event_date <= weekEnd);
  const weekendEvents = events.filter((e) => e.event_date >= friday && e.event_date <= sunday);

  const evIds = events.map((e) => e.id);
  const { data: teamRows } = evIds.length ? await supabase.from("event_team").select("event_id").in("event_id", evIds) : { data: [] };
  const teamCount = new Map<string, number>();
  for (const r of teamRows ?? []) teamCount.set(r.event_id, (teamCount.get(r.event_id) ?? 0) + 1);

  // --- Urgences remontées automatiquement ---
  const urgent: Urgent[] = [];
  for (const e of events.filter((x) => diffDays(x.event_date, today) <= 2)) {
    const open = tasks.filter((t) => t.event_id === e.id);
    const when = diffDays(e.event_date, today) === 0 ? "aujourd'hui" : diffDays(e.event_date, today) === 1 ? "demain" : "dans 48 h";
    if (open.length) urgent.push({ level: "critique", title: `${e.name} ${when} : ${open.length} tâche(s) non terminée(s)`, detail: open.slice(0, 3).map((t) => t.title).join(" · "), href: `/evenements/${e.id}`, who: e.manager_id ? fullName(people.get(e.manager_id)) : undefined });
    if (!teamCount.get(e.id)) urgent.push({ level: "critique", title: `${e.name} ${when} : aucune équipe assignée`, detail: `${EVENT_TYPE[e.event_type]} · ${e.address ?? "lieu à préciser"}`, href: `/evenements/${e.id}` });
    if (!e.setup_at) urgent.push({ level: "attention", title: `${e.name} : heure d'installation non renseignée`, detail: "Fiche événement incomplète", href: `/evenements/${e.id}/modifier` });
    if (["prospect", "devis_envoye"].includes(e.status)) urgent.push({ level: "attention", title: `${e.name} : devis pas encore confirmé`, detail: EVENT_STATUS[e.status].label, href: `/evenements/${e.id}` });
  }
  for (const t of overdue.slice(0, 8)) urgent.push({ level: "critique", title: `Deadline dépassée : ${t.title}`, detail: `Prévu le ${formatDate(t.due_date)}${t.due_time ? ` ${hhmm(t.due_time)}` : ""}`, href: `/taches/${t.id}`, who: t.assignee_id ? fullName(people.get(t.assignee_id)) : "Non assignée" });
  for (const t of blocked) urgent.push({ level: "critique", title: `Tâche bloquée : ${t.title}`, detail: t.blocked_reason ?? "", href: `/taches/${t.id}`, who: t.assignee_id ? fullName(people.get(t.assignee_id)) : undefined });
  for (const t of toVerify.filter((x) => x.submitted_at && Date.now() - Date.parse(x.submitted_at) > 24 * 3600e3)) urgent.push({ level: "attention", title: `En attente de validation depuis plus de 24 h : ${t.title}`, detail: "", href: `/taches/${t.id}` });
  for (const l of live.filter((x) => x.st.key === "missing")) urgent.push({ level: "attention", title: `${fullName(l.e)} n'est pas arrivé(e)`, detail: l.st.label, href: `/pointage/${l.e.id}` });
  urgent.sort((a, b) => (a.level === b.level ? 0 : a.level === "critique" ? -1 : 1));

  return (
    <>
      <AutoRefresh seconds={60} />
      <PageHeader eyebrow={<span className="capitalize">{formatDayLong(today)}</span>} title="Tableau de bord" subtitle="Ce qui demande votre attention aujourd'hui."
        actions={<>
          {s.can("tasks.create") && <ButtonLink href="/taches/nouvelle" variant="secondary">Nouvelle tâche</ButtonLink>}
          {s.can("events.manage") && <ButtonLink href="/evenements/nouveau">Nouvel événement</ButtonLink>}
        </>} />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Présents" value={`${present.length}/${live.filter((l) => l.st.key !== "off").length}`} href="/pointage" tone="ok" />
        <Stat label="Retards" value={late.length} href="/pointage" tone={late.length ? "alert" : undefined} />
        <Stat label="Absents" value={absent.length} href="/pointage" tone={absent.length ? "alert" : undefined} />
        <Stat label="Non arrivés" value={notYet.length} href="/pointage" />
        <Stat label="Tâches du jour" value={todayTasks.length} href="/taches?vue=ouvertes" />
        <Stat label="En retard" value={overdue.length} href="/taches?vue=retard" tone={overdue.length ? "alert" : undefined} />
        <Stat label="Bloquées" value={blocked.length} href="/taches?vue=bloquees" tone={blocked.length ? "warn" : undefined} />
        <Stat label="À vérifier" value={toVerify.length} href="/taches?vue=verifier" tone={toVerify.length ? "warn" : undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card className={urgent.length ? "border-clay-500/25" : undefined}>
            <CardHeader title={<span className="flex items-center gap-2 tracking-wide"><AlertTriangle className="h-4 w-4 text-clay-500" />URGENT</span>}
              subtitle={urgent.length ? `${urgent.length} point(s) remonté(s) automatiquement` : "Rien d'urgent pour le moment"} />
            {urgent.length === 0 ? <Empty title="Tout est sous contrôle." /> : (
              <ul className="divide-y divide-line">
                {urgent.slice(0, 14).map((u, i) => (
                  <li key={i}>
                    <Link href={u.href} className="group flex items-start gap-3 px-5 py-3 hover:bg-sand-50">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${u.level === "critique" ? "bg-clay-500" : "bg-ochre-500"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{u.title}</p>
                        {(u.detail || u.who) && <p className="truncate text-xs text-ink-400">{u.who ? `Responsable : ${u.who}` : ""}{u.who && u.detail ? " · " : ""}{u.detail}</p>}
                      </div>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-ink-300 opacity-0 transition group-hover:opacity-100" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <EventList title="Événements de la semaine" events={weekEvents} teamCount={teamCount} today={today} empty="Aucun événement cette semaine." />
            <EventList title={`Week-end du ${formatDate(friday)}`} events={weekendEvents} teamCount={teamCount} today={today} empty="Aucun événement ce week-end." href="/calendrier?vue=weekend" />
          </div>

          <Card>
            <CardHeader title="Tâches en retard" subtitle="Par ordre d'échéance" action={<Link href="/taches?vue=retard" className="link text-xs">Tout voir</Link>} />
            {overdue.length === 0 ? <Empty title="Aucune tâche en retard." /> : (
              <ul className="divide-y divide-line">
                {overdue.slice(0, 8).map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-4 px-5 py-2.5 text-sm">
                    <Link href={`/taches/${t.id}`} className="min-w-0 truncate font-medium hover:underline">{t.title}</Link>
                    <span className="flex shrink-0 items-center gap-3 text-xs text-ink-400">
                      {t.assignee_id ? fullName(people.get(t.assignee_id)) : "Non assignée"}
                      <Badge tone={TASK_STATUS[t.status].tone}>{TASK_STATUS[t.status].label}</Badge>
                      <span className="text-clay-700">{formatDate(t.due_date)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Présence en direct" subtitle={`${present.length} présent(s)`} action={<Link href="/pointage" className="link text-xs">Détail</Link>} />
            <ul className="divide-y divide-line">
              {live.filter((l) => l.st.key !== "off").sort((a, b) => ["missing", "late", "absent", "not_yet", "out", "present", "leave", "done"].indexOf(a.st.key) - ["missing", "late", "absent", "not_yet", "out", "present", "leave", "done"].indexOf(b.st.key)).slice(0, 12).map(({ e, st, day }) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <span className="flex min-w-0 items-center gap-2.5"><Avatar person={e} size={26} /><span className="truncate">{fullName(e)}</span></span>
                  <span className="flex shrink-0 items-center gap-2"><span className="text-xs tabular-nums text-ink-400">{toLocalTime(day?.first_in)}</span><Badge tone={st.tone}>{st.label.replace("Présent · ", "")}</Badge></span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="À valider" subtitle="Tâches soumises par l'équipe" />
            {toVerify.length === 0 ? <Empty title="Rien à valider." /> : (
              <ul className="divide-y divide-line">
                {toVerify.slice(0, 8).map((t) => (
                  <li key={t.id} className="px-5 py-2.5 text-sm">
                    <Link href={`/taches/${t.id}`} className="font-medium hover:underline">{t.title}</Link>
                    <p className="text-xs text-ink-400">{t.assignee_id ? fullName(people.get(t.assignee_id)) : ""}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Bientôt sur ce tableau de bord" />
            <p className="px-5 py-4 text-xs leading-relaxed text-ink-400">Designs à valider, fiches techniques incomplètes, achats en attente, stock faible, matériel à préparer, véhicules disponibles, commissions et dépenses s&apos;ajouteront ici avec leurs modules (phases 3 à 6).</p>
          </Card>
        </div>
      </div>
    </>
  );
}

function EventList({ title, events, teamCount, today, empty, href = "/evenements" }: { title: string; events: EventRow[]; teamCount: Map<string, number>; today: string; empty: string; href?: string }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={`${events.length} événement(s)`} action={<Link href={href} className="link text-xs">Voir</Link>} />
      {events.length === 0 ? <Empty title={empty} /> : (
        <ul className="divide-y divide-line">
          {events.map((e) => {
            const d = diffDays(e.event_date, today);
            return (
              <li key={e.id}>
                <Link href={`/evenements/${e.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-sand-50">
                  <div className="w-14 shrink-0"><p className="text-xs font-semibold capitalize">{formatDayShort(e.event_date)}</p><p className={`text-2xs ${d <= 2 ? "text-clay-700" : "text-ink-400"}`}>{d === 0 ? "Aujourd'hui" : `J-${d}`}</p></div>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{e.name}</p><p className="truncate text-xs text-ink-400">{EVENT_TYPE[e.event_type]} · {teamCount.get(e.id) ?? 0} pers. {e.setup_at ? `· install. ${toLocalTime(e.setup_at)}` : ""}</p></div>
                  <Badge tone={EVENT_STATUS[e.status].tone}>{EVENT_STATUS[e.status].label}</Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
