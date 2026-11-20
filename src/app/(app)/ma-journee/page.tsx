import Link from "next/link";
import { AlertTriangle, Bell, CalendarDays, Clock, FileText, Flame, Sun } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadSchedules } from "@/lib/queries";
import { scheduleFor } from "@/lib/attendance";
import { signedUrls } from "@/lib/storage";
import { addDays, formatDate, formatDayLong, formatDayShort, formatMinutes, hhmm, relativeTime, todayISO, toLocalTime } from "@/lib/dates";
import { DAY_STATUS, EVENT_TYPE, PRIORITY, TASK_STATUS } from "@/lib/labels";
import { isDone, isOverdue, sortTasks } from "@/lib/tasks";
import type { AttendanceDay, EventRow, NotificationRow, Task } from "@/lib/types";
import { changeStatus } from "../taches/actions";

export const metadata = { title: "Ma journée" };

export default async function MaJournee({ searchParams }: { searchParams: Promise<{ acces?: string }> }) {
  const sp = await searchParams;
  const s = await requireSession();
  const me = s.employee;
  const supabase = await createClient();
  const today = todayISO();
  const in7 = addDays(today, 7);

  const { data: collabRows } = await supabase.from("task_collaborators").select("task_id").eq("employee_id", me.id);
  const collabIds = (collabRows ?? []).map((c) => c.task_id);
  const orFilter = collabIds.length ? `assignee_id.eq.${me.id},id.in.(${collabIds.join(",")})` : `assignee_id.eq.${me.id}`;

  const [{ data: taskData }, { data: day }, schedules, { data: teamRows }, { data: notifs }] = await Promise.all([
    supabase.from("tasks").select("*").or(orFilter).not("status", "in", "(valide,termine)").limit(300),
    supabase.from("attendance_days").select("*").eq("employee_id", me.id).eq("work_date", today).maybeSingle<AttendanceDay>(),
    loadSchedules(supabase),
    supabase.from("event_team").select("event_id").eq("employee_id", me.id),
    supabase.from("notifications").select("*").is("read_at", null).order("created_at", { ascending: false }).limit(6),
  ]);
  const tasks = (taskData ?? []) as Task[];
  const evIds = Array.from(new Set([...(teamRows ?? []).map((r) => r.event_id as string), ...tasks.map((t) => t.event_id).filter((x): x is string => !!x)]));
  const { data: evData } = await supabase.from("events").select("*")
    .or(`manager_id.eq.${me.id}${evIds.length ? `,id.in.(${evIds.join(",")})` : ""}`).gte("event_date", today).lte("event_date", addDays(today, 21)).order("event_date");
  const events = (evData ?? []) as EventRow[];
  const evName = new Map(events.map((e) => [e.id, e.name]));
  const taskIds = tasks.map((t) => t.id);
  const { data: docs } = taskIds.length
    ? await supabase.from("task_attachments").select("*").in("task_id", taskIds).order("created_at", { ascending: false }).limit(8)
    : { data: [] as { id: string; task_id: string; storage_path: string; file_name: string; created_at: string }[] };
  const docUrls = await signedUrls(supabase, "task-files", (docs ?? []).map((d) => d.storage_path));

  const overdue = sortTasks(tasks.filter((t) => isOverdue(t)));
  const todayTasks = sortTasks(tasks.filter((t) => !isOverdue(t) && (t.planned_date === today || t.due_date === today)));
  const urgent = sortTasks(tasks.filter((t) => !isOverdue(t) && (t.priority === "urgente" || t.priority === "haute") && !todayTasks.includes(t)));
  const upcoming = sortTasks(tasks.filter((t) => !isOverdue(t) && !todayTasks.includes(t) && !urgent.includes(t) && ((t.planned_date ?? t.due_date ?? "") > today) && ((t.planned_date ?? t.due_date ?? "") <= in7)));
  const waiting = tasks.filter((t) => t.status === "a_verifier");
  const sched = scheduleFor(me, schedules, today);

  return (
    <>
      {sp.acces === "refuse" && <p className="mb-6 rounded-lg bg-ochre-100 px-4 py-2.5 text-sm text-ochre-700">Cette page n&apos;est pas accessible avec votre profil.</p>}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-taupe-500 capitalize">{formatDayLong(today)}</p>
          <h1 className="font-display text-4xl font-medium">Bonjour {me.first_name}</h1>
          <p className="mt-1.5 text-sm text-ink-400">
            {todayTasks.length + overdue.length === 0 ? "Rien de prévu aujourd'hui pour l'instant." : `${todayTasks.length} tâche(s) aujourd'hui${overdue.length ? ` · ${overdue.length} en retard` : ""}.`}
          </p>
        </div>
        <div className="card flex items-center gap-6 px-5 py-3.5 text-sm">
          <div className="flex items-center gap-2 text-ink-500"><Clock className="h-4 w-4 text-taupe-400" strokeWidth={1.5} />{sched ? `Horaire : ${sched.start} – ${sched.end}` : "Jour de repos"}</div>
          <div className="border-l border-line pl-6">
            {day ? (
              <span className="flex items-center gap-2"><Badge tone={DAY_STATUS[day.status].tone}>{DAY_STATUS[day.status].label}</Badge>
                <span className="text-ink-500">Arrivée {toLocalTime(day.first_in)}{day.last_out ? ` · Départ ${toLocalTime(day.last_out)} · ${formatMinutes(day.worked_minutes)}` : ""}</span></span>
            ) : <span className="text-ink-400">Pas encore pointé · <span className="text-ink-300">pointage sur le kiosque</span></span>}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {overdue.length > 0 && (
            <Section title="En retard" icon={<AlertTriangle className="h-4 w-4 text-clay-500" />} tasks={overdue} evName={evName} tone="alert" />
          )}
          <Section title="Mes tâches du jour" icon={<Sun className="h-4 w-4" />} tasks={todayTasks} evName={evName} empty="Aucune tâche planifiée aujourd'hui." />
          {urgent.length > 0 && <Section title="Urgentes et prioritaires" icon={<Flame className="h-4 w-4" />} tasks={urgent} evName={evName} />}
          <Section title="À venir (7 jours)" icon={<CalendarDays className="h-4 w-4" />} tasks={upcoming} evName={evName} empty="Rien de planifié cette semaine." compact />
          {waiting.length > 0 && <Section title="En attente de validation" icon={<Clock className="h-4 w-4" />} tasks={waiting} evName={evName} compact />}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Mes événements" subtitle="3 prochaines semaines" icon={<CalendarDays className="h-4 w-4" />} />
            {events.length === 0 ? <Empty title="Aucun événement à venir." /> : (
              <ul className="divide-y divide-line">
                {events.map((e) => (
                  <li key={e.id}>
                    <Link href={`/evenements/${e.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-sand-50">
                      <div className="w-12 text-center"><p className="font-display text-2xl leading-none">{e.event_date.slice(8, 10)}</p><p className="text-2xs uppercase text-ink-400">{formatDayShort(e.event_date).split(" ")[0]}</p></div>
                      <div className="min-w-0"><p className="truncate text-sm font-medium">{e.name}</p><p className="truncate text-xs text-ink-400">{EVENT_TYPE[e.event_type]} · {e.address ?? "Lieu à préciser"}</p></div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Mes notifications" icon={<Bell className="h-4 w-4" />} action={<Link href="/notifications" className="link text-xs">Tout voir</Link>} />
            {!notifs?.length ? <Empty title="Aucune notification non lue." /> : (
              <ul className="divide-y divide-line">
                {(notifs as NotificationRow[]).map((n) => (
                  <li key={n.id} className="px-5 py-3">
                    <Link href={`/notifications/${n.id}`} className="block">
                      <p className="text-sm font-medium hover:underline">{n.title}</p>
                      <p className="text-xs text-ink-400">{n.body ? `${n.body} · ` : ""}{relativeTime(n.created_at)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Mes documents" subtitle="Fichiers joints à mes tâches" icon={<FileText className="h-4 w-4" />} />
            {!docs?.length ? <Empty title="Aucun document." /> : (
              <ul className="divide-y divide-line">
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <a href={docUrls.get(d.storage_path)} target="_blank" rel="noreferrer" className="min-w-0 truncate link">{d.file_name}</a>
                    <Link href={`/taches/${d.task_id}`} className="shrink-0 text-xs text-ink-400 hover:underline">Tâche</Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function Section({ title, icon, tasks, evName, empty, tone, compact }: { title: string; icon: React.ReactNode; tasks: Task[]; evName: Map<string, string>; empty?: string; tone?: "alert"; compact?: boolean }) {
  return (
    <Card className={tone === "alert" ? "border-clay-500/25" : undefined}>
      <CardHeader title={title} icon={icon} subtitle={`${tasks.length} tâche(s)`} />
      {tasks.length === 0 ? <Empty title={empty ?? "Rien ici."} /> : (
        <ul className="divide-y divide-line">
          {tasks.map((t) => <TaskItem key={t.id} t={t} evName={evName} compact={compact} />)}
        </ul>
      )}
    </Card>
  );
}

function TaskItem({ t, evName, compact }: { t: Task; evName: Map<string, string>; compact?: boolean }) {
  const late = isOverdue(t);
  const next = t.status === "en_cours"
    ? t.requires_validation ? { s: "a_verifier", l: "Soumettre" } : { s: "termine", l: "Terminer" }
    : ["a_faire", "en_attente", "a_corriger", "bloque"].includes(t.status) ? { s: "en_cours", l: t.status === "a_faire" ? "Démarrer" : "Reprendre" } : null;
  return (
    <li className="flex items-start gap-4 px-5 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/taches/${t.id}`} className="font-medium hover:underline">{t.title}</Link>
          {t.priority !== "normale" && <Badge tone={PRIORITY[t.priority].tone} dot={false}>{PRIORITY[t.priority].label}</Badge>}
          <Badge tone={TASK_STATUS[t.status].tone}>{TASK_STATUS[t.status].label}</Badge>
        </div>
        <p className="mt-1 text-xs text-ink-400">
          {t.event_id && evName.get(t.event_id) ? <span className="text-taupe-600">{evName.get(t.event_id)} · </span> : null}
          {t.planned_time ? `À ${hhmm(t.planned_time)} · ` : ""}
          <span className={late ? "font-medium text-clay-700" : ""}>{t.due_date ? `Pour le ${formatDate(t.due_date)}${t.due_time ? ` ${hhmm(t.due_time)}` : ""}` : "Sans deadline"}</span>
        </p>
        {!compact && t.expected_result && <p className="mt-1.5 text-sm text-ink-500"><span className="text-ink-400">Résultat attendu :</span> {t.expected_result}</p>}
        {t.status === "a_corriger" && <p className="mt-1 text-xs text-clay-700">Correction demandée : voir les commentaires.</p>}
      </div>
      {next && !isDone(t) && (
        <ActionForm action={changeStatus}>
          <input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value={next.s} />
          <SubmitButton size="sm" variant={next.s === "en_cours" ? "secondary" : "primary"}>{next.l}</SubmitButton>
        </ActionForm>
      )}
    </li>
  );
}
