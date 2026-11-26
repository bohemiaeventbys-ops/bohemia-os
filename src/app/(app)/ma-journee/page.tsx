import Link from "next/link";
import { AlertTriangle, Bell, CalendarDays, Check, Clock, FileText, Flame, ListChecks, Plane, Play, Send, Sun, Warehouse } from "lucide-react";
import { cn } from "@/lib/cn";
import { toneTile } from "@/components/ui/badge";
import type { Tone } from "@/lib/labels";
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
      <div className="mb-6 overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-rose-50 via-ivory to-ochre-50 px-6 py-6 sm:px-8">
        <p className="mb-1 text-sm font-medium text-rose-600">{formatDayLong(today)}</p>
        <h1 className="font-display text-4xl font-semibold sm:text-5xl">Bonjour {me.first_name}</h1>
        <p className="mt-2 text-base text-ink-500">
          {todayTasks.length + overdue.length === 0 ? "Rien de prévu aujourd'hui pour l'instant." : `Vous avez ${todayTasks.length} tâche(s) aujourd'hui${overdue.length ? ` et ${overdue.length} en retard` : ""}.`}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3.5 py-2 text-ink-600 ring-1 ring-line"><Clock className="h-4 w-4 text-teal-600" />{sched ? `Mon horaire : ${sched.start} – ${sched.end}` : "Jour de repos"}</span>
          {day ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3.5 py-2 ring-1 ring-line"><Badge tone={DAY_STATUS[day.status].tone}>{DAY_STATUS[day.status].label}</Badge>
              <span className="text-ink-600">Arrivée {toLocalTime(day.first_in)}{day.last_out ? ` · Départ ${toLocalTime(day.last_out)} · ${formatMinutes(day.worked_minutes)}` : ""}</span></span>
          ) : <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3.5 py-2 text-ink-500 ring-1 ring-line">Pas encore pointé : pointez sur l&apos;ordinateur de l&apos;entreprise</span>}
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <QuickTile href="/taches?vue=miennes" tone="sage" icon={<ListChecks />} label="Mes tâches" hint={`${tasks.length} en cours`} />
        <QuickTile href="/conges?nouveau=1" tone="clay" icon={<Plane />} label="Demander un congé" hint="Congé, maladie, absence…" />
        <QuickTile href="/pointage" tone="teal" icon={<Clock />} label="Mon pointage" hint="Mes heures" />
        {s.can("stock.move") || s.can("stock.manage")
          ? <QuickTile href="/stock?vue=sorties" tone="ochre" icon={<Warehouse />} label="Matériel" hint="À préparer, charger, faire revenir" />
          : <QuickTile href="/calendrier" tone="mist" icon={<CalendarDays />} label="Calendrier" hint={`${events.length} événement(s) à venir`} />}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {overdue.length > 0 && (
            <Section title="En retard" icon={<AlertTriangle />} tone="clay" tasks={overdue} evName={evName} alert />
          )}
          <Section title="Mes tâches du jour" icon={<Sun />} tone="ochre" tasks={todayTasks} evName={evName} empty="Aucune tâche planifiée aujourd'hui." />
          {urgent.length > 0 && <Section title="Urgentes et prioritaires" icon={<Flame />} tone="rose" tasks={urgent} evName={evName} />}
          <Section title="Cette semaine" icon={<CalendarDays />} tone="mist" tasks={upcoming} evName={evName} empty="Rien de planifié cette semaine." compact />
          {waiting.length > 0 && <Section title="En attente de validation" icon={<Clock />} tone="plum" tasks={waiting} evName={evName} compact />}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Mes événements" subtitle="3 prochaines semaines" icon={<CalendarDays />} tone="rose" />
            {events.length === 0 ? <Empty title="Aucun événement à venir." /> : (
              <ul className="divide-y divide-line">
                {events.map((e) => (
                  <li key={e.id}>
                    <Link href={`/evenements/${e.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-sand-50">
                      <div className="w-12 shrink-0 rounded-xl bg-rose-50 py-1.5 text-center text-rose-700"><p className="font-display text-2xl font-semibold leading-none">{e.event_date.slice(8, 10)}</p><p className="text-2xs uppercase">{formatDayShort(e.event_date).split(" ")[0]}</p></div>
                      <div className="min-w-0"><p className="truncate text-sm font-medium">{e.name}</p><p className="truncate text-xs text-ink-400">{EVENT_TYPE[e.event_type]} · {e.address ?? "Lieu à préciser"}</p></div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Mes notifications" icon={<Bell />} tone="clay" action={<Link href="/notifications" className="link text-xs">Tout voir</Link>} />
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
            <CardHeader title="Mes documents" subtitle="Fichiers joints à mes tâches" icon={<FileText />} tone="mist" />
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

function QuickTile({ href, tone, icon, label, hint }: { href: string; tone: Tone; icon: React.ReactNode; label: string; hint: string }) {
  return (
    <Link href={href} className="card flex items-center gap-3 px-4 py-4 transition hover:-translate-y-0.5 hover:shadow-pop">
      <span className={cn("tile h-12 w-12 [&_svg]:h-6 [&_svg]:w-6", toneTile[tone])}>{icon}</span>
      <span className="min-w-0"><span className="block text-[15px] font-semibold leading-tight">{label}</span><span className="block truncate text-xs text-ink-400">{hint}</span></span>
    </Link>
  );
}

function Section({ title, icon, tone, tasks, evName, empty, alert, compact }: { title: string; icon: React.ReactNode; tone: Tone; tasks: Task[]; evName: Map<string, string>; empty?: string; alert?: boolean; compact?: boolean }) {
  return (
    <Card className={alert ? "border-clay-200 ring-1 ring-clay-100" : undefined}>
      <CardHeader title={title} icon={icon} tone={tone} subtitle={`${tasks.length} tâche(s)`} />
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
  // Un seul gros bouton, la prochaine étape évidente : Commencer → J'ai terminé (ou Envoyer pour vérification)
  const next = t.status === "en_cours"
    ? t.requires_validation ? { s: "a_verifier", l: "Envoyer pour vérification", icon: <Send className="h-4 w-4" />, v: "warning" as const } : { s: "termine", l: "J'ai terminé", icon: <Check className="h-4 w-4" />, v: "success" as const }
    : ["a_faire", "en_attente", "a_corriger", "bloque"].includes(t.status) ? { s: "en_cours", l: t.status === "a_faire" ? "Commencer" : "Reprendre", icon: <Play className="h-4 w-4" />, v: "primary" as const } : null;
  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/taches/${t.id}`} className="text-[15px] font-semibold hover:underline">{t.title}</Link>
          {t.priority !== "normale" && <Badge tone={PRIORITY[t.priority].tone} dot={false}>{PRIORITY[t.priority].label}</Badge>}
          <Badge tone={TASK_STATUS[t.status].tone}>{TASK_STATUS[t.status].label}</Badge>
        </div>
        <p className="mt-1 text-[13px] text-ink-400">
          {t.event_id && evName.get(t.event_id) ? <span className="font-medium text-rose-600">{evName.get(t.event_id)} · </span> : null}
          {t.planned_time ? `À ${hhmm(t.planned_time)} · ` : ""}
          <span className={late ? "font-semibold text-clay-700" : ""}>{t.due_date ? `Pour le ${formatDate(t.due_date)}${t.due_time ? ` ${hhmm(t.due_time)}` : ""}` : "Sans deadline"}</span>
        </p>
        {!compact && t.expected_result && <p className="mt-1.5 text-sm text-ink-500"><span className="text-ink-400">Résultat attendu :</span> {t.expected_result}</p>}
        {t.status === "a_corriger" && <p className="mt-1 text-sm font-medium text-clay-700">Correction demandée : voir les commentaires.</p>}
      </div>
      {next && !isDone(t) && (
        <ActionForm action={changeStatus}>
          <input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value={next.s} />
          <SubmitButton variant={next.v} className="w-full sm:w-auto">{next.icon}{next.l}</SubmitButton>
        </ActionForm>
      )}
    </li>
  );
}
