import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Stat } from "@/components/ui/stat";
import { Empty } from "@/components/ui/empty";
import { Select } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/button";
import { AutoRefresh } from "@/components/auto-refresh";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { attendanceScope, canFollowTeam, loadDepartments, loadEmployees, loadSchedules } from "@/lib/queries";
import { liveStatus, scheduleFor, type LiveKey } from "@/lib/attendance";
import { addDays, addMonths, endOfMonth, formatDate, formatDayLong, formatDayShort, formatDateTime, formatMinutes, formatMonth, hhmm, isValidISODate, startOfMonth, startOfWeek, todayISO, toLocalTime } from "@/lib/dates";
import { fullName } from "@/lib/format";
import { DAY_STATUS, LEAVE_TYPE, PUNCH_KIND } from "@/lib/labels";
import type { AttendanceDay, Employee, LeaveRequest } from "@/lib/types";

export const metadata = { title: "Pointage" };

type SP = { vue?: string; periode?: string; date?: string; employe?: string; departement?: string };

export default async function PointagePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const session = await requireSession();
  const team = canFollowTeam(session);
  const vue = team ? sp.vue ?? "direct" : "historique";
  const supabase = await createClient();
  const [allEmployees, departments, schedules] = await Promise.all([loadEmployees(supabase), loadDepartments(supabase), loadSchedules(supabase)]);
  const scope = attendanceScope(session, allEmployees);

  const tabs = team
    ? [
        { key: "direct", label: "En direct", href: "/pointage" },
        { key: "historique", label: "Historique", href: "/pointage?vue=historique" },
        { key: "corrections", label: "Corrections", href: "/pointage?vue=corrections" },
      ]
    : [];

  return (
    <>
      <PageHeader eyebrow="Présences" title={team ? "Pointage" : "Mon pointage"}
        subtitle={team ? "Suivi des arrivées et départs, enregistrés uniquement depuis le kiosque." : "Vos arrivées, départs et heures travaillées."}
        actions={session.can("settings.manage") ? <Link href="/parametres/kiosques" className={buttonClass("secondary", "sm")}>Postes de pointage</Link> : undefined} />
      {tabs.length > 0 && <Tabs items={tabs} active={vue} />}
      {vue === "direct" && <Live employees={scope} departments={departments} schedules={schedules} dept={sp.departement} />}
      {vue === "historique" && <History sp={sp} employees={scope} team={team} />}
      {vue === "corrections" && <Corrections employees={allEmployees} />}
    </>
  );
}

async function Live({ employees, departments, schedules, dept }: { employees: Employee[]; departments: { id: string; name: string }[]; schedules: Awaited<ReturnType<typeof loadSchedules>>; dept?: string }) {
  const supabase = await createClient();
  const today = todayISO();
  const list = dept ? employees.filter((e) => e.department_id === dept) : employees;
  const [{ data: days }, { data: leaves }] = await Promise.all([
    supabase.from("attendance_days").select("*").eq("work_date", today),
    supabase.from("leave_requests").select("*").eq("status", "validee").lte("start_date", today).gte("end_date", today),
  ]);
  const dayMap = new Map((days as AttendanceDay[] ?? []).map((d) => [d.employee_id, d]));
  const leaveMap = new Map((leaves as LeaveRequest[] ?? []).map((l) => [l.employee_id, LEAVE_TYPE[l.leave_type] ?? "Congé"]));
  const rows = list.map((e) => {
    const sched = scheduleFor(e, schedules, today);
    return { e, sched, day: dayMap.get(e.id), live: liveStatus(dayMap.get(e.id), leaveMap.get(e.id) ?? null, sched) };
  });
  const count = (keys: LiveKey[]) => rows.filter((r) => keys.includes(r.live.key)).length;
  const order: LiveKey[] = ["missing", "late", "present", "out", "not_yet", "absent", "leave", "done", "off"];
  rows.sort((a, b) => order.indexOf(a.live.key) - order.indexOf(b.live.key) || a.e.first_name.localeCompare(b.e.first_name));
  const deptName = new Map(departments.map((d) => [d.id, d.name]));

  return (
    <>
      <AutoRefresh seconds={30} />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Présents" value={count(["present", "late", "out"])} tone="ok" />
        <Stat label="En retard" value={count(["late", "missing"])} tone={count(["late", "missing"]) ? "alert" : undefined} />
        <Stat label="Pas encore arrivés" value={count(["not_yet", "missing"])} />
        <Stat label="Absents" value={count(["absent"])} tone={count(["absent"]) ? "alert" : undefined} />
        <Stat label="Congés" value={count(["leave"])} />
        <Stat label="Partis" value={count(["done"])} />
      </div>
      <Card>
        <CardHeader title={<span>{formatDayLong(today)}</span>} subtitle="Mise à jour automatique toutes les 30 secondes"
          action={
            <form className="flex items-center gap-2">
              <Select name="departement" defaultValue={dept ?? ""} className="h-9 w-56 py-1">
                <option value="">Tous les départements</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
              <button className={buttonClass("secondary", "sm")}>Filtrer</button>
            </form>
          } />
        {rows.length === 0 ? <Empty title="Aucun employé dans ce périmètre." /> : (
          <table className="table-base">
            <thead><tr><th>Employé</th><th>Statut</th><th>Horaire prévu</th><th>Arrivée</th><th>Départ</th><th>Durée travaillée</th><th /></tr></thead>
            <tbody>
              {rows.map(({ e, sched, day, live }) => (
                <tr key={e.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar person={e} size={30} />
                      <div><p className="font-medium">{fullName(e)}</p><p className="text-xs text-ink-400">{e.department_id ? deptName.get(e.department_id) : "—"}</p></div>
                    </div>
                  </td>
                  <td><Badge tone={live.tone}>{live.label}</Badge></td>
                  <td className="text-ink-500">{sched ? `${sched.start} – ${sched.end}` : "—"}</td>
                  <td className="tabular-nums">{toLocalTime(day?.first_in)}</td>
                  <td className="tabular-nums">{toLocalTime(day?.last_out)}</td>
                  <td className="tabular-nums">{day ? formatMinutes(day.worked_minutes) : "—"}{day?.overtime_minutes ? <span className="ml-2 text-xs text-sage-700">+{formatMinutes(day.overtime_minutes)}</span> : null}</td>
                  <td className="text-right"><Link href={`/pointage/${e.id}?date=${today}`} className="link text-xs">Détail</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

async function History({ sp, employees, team }: { sp: SP; employees: Employee[]; team: boolean }) {
  const supabase = await createClient();
  const periode = sp.periode === "jour" || sp.periode === "mois" ? sp.periode : "semaine";
  const ref = isValidISODate(sp.date) ? sp.date : todayISO();
  const from = periode === "jour" ? ref : periode === "semaine" ? startOfWeek(ref) : startOfMonth(ref);
  const to = periode === "jour" ? ref : periode === "semaine" ? addDays(from, 6) : endOfMonth(ref);
  const prev = periode === "jour" ? addDays(ref, -1) : periode === "semaine" ? addDays(from, -7) : addMonths(ref, -1);
  const next = periode === "jour" ? addDays(ref, 1) : periode === "semaine" ? addDays(from, 7) : addMonths(ref, 1);
  const selectedEmp = team ? sp.employe : employees[0]?.id;
  const list = selectedEmp ? employees.filter((e) => e.id === selectedEmp) : employees;

  let q = supabase.from("attendance_days").select("*").gte("work_date", from).lte("work_date", to).order("work_date", { ascending: false });
  if (selectedEmp) q = q.eq("employee_id", selectedEmp);
  else q = q.in("employee_id", list.map((e) => e.id));
  const { data } = await q;
  const days = (data ?? []) as AttendanceDay[];
  const byEmp = new Map(list.map((e) => [e.id, e]));

  const totals = list.map((e) => {
    const d = days.filter((x) => x.employee_id === e.id);
    return {
      e, worked: d.reduce((s, x) => s + x.worked_minutes, 0), overtime: d.reduce((s, x) => s + x.overtime_minutes, 0),
      lates: d.filter((x) => x.late_minutes > 0).length, lateMin: d.reduce((s, x) => s + x.late_minutes, 0),
      present: d.filter((x) => x.first_in).length, absent: d.filter((x) => x.status === "absent").length,
    };
  });
  const label = periode === "jour" ? formatDayLong(ref) : periode === "semaine" ? `Semaine du ${formatDate(from)} au ${formatDate(to)}` : formatMonth(ref);
  const base = (o: Partial<SP>) => {
    const p = new URLSearchParams({ vue: "historique", periode, date: ref, ...(selectedEmp && team ? { employe: selectedEmp } : {}), ...o } as Record<string, string>);
    return `/pointage?${p.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-line bg-white p-0.5">
          {(["jour", "semaine", "mois"] as const).map((p) => (
            <Link key={p} href={base({ periode: p })} className={`rounded-md px-3 py-1.5 text-sm capitalize ${p === periode ? "bg-ink text-ivory" : "text-ink-500 hover:bg-sand-100"}`}>{p}</Link>
          ))}
        </div>
        <Link href={base({ date: prev })} className={buttonClass("secondary", "sm")}>←</Link>
        <span className="min-w-[220px] text-center text-sm font-medium ">{label}</span>
        <Link href={base({ date: next })} className={buttonClass("secondary", "sm")}>→</Link>
        {team && (
          <form className="ml-auto flex items-center gap-2">
            <input type="hidden" name="vue" value="historique" /><input type="hidden" name="periode" value={periode} /><input type="hidden" name="date" value={ref} />
            <Select name="employe" defaultValue={selectedEmp ?? ""} className="h-9 w-56 py-1">
              <option value="">Toute l&apos;équipe</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{fullName(e)}</option>)}
            </Select>
            <button className={buttonClass("secondary", "sm")}>Afficher</button>
          </form>
        )}
      </div>

      {team && !selectedEmp && (
        <Card>
          <CardHeader title="Synthèse par employé" subtitle={label} />
          <table className="table-base">
            <thead><tr><th>Employé</th><th>Jours présents</th><th>Retards</th><th>Minutes de retard</th><th>Absences</th><th>Heures travaillées</th><th>Heures sup.</th></tr></thead>
            <tbody>
              {totals.map((t) => (
                <tr key={t.e.id}>
                  <td><Link className="font-medium hover:underline" href={base({ employe: t.e.id })}>{fullName(t.e)}</Link></td>
                  <td>{t.present}</td>
                  <td className={t.lates ? "text-clay-700" : ""}>{t.lates}</td>
                  <td>{t.lateMin}</td>
                  <td>{t.absent}</td>
                  <td className="tabular-nums">{formatMinutes(t.worked)}</td>
                  <td className="tabular-nums">{formatMinutes(t.overtime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card>
        <CardHeader title="Détail des journées" subtitle={`${days.length} journée(s) enregistrée(s)`} />
        {days.length === 0 ? <Empty title="Aucun pointage sur cette période." /> : (
          <table className="table-base">
            <thead><tr><th>Date</th>{(team && !selectedEmp) && <th>Employé</th>}<th>Statut</th><th>Prévu</th><th>Arrivée</th><th>Départ</th><th>Retard</th><th>Travaillé</th><th>Heures sup.</th><th /></tr></thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.employee_id + d.work_date}>
                  <td>{formatDayShort(d.work_date)}</td>
                  {(team && !selectedEmp) && <td>{fullName(byEmp.get(d.employee_id))}</td>}
                  <td><Badge tone={DAY_STATUS[d.status].tone}>{DAY_STATUS[d.status].label}</Badge>{d.manual_status && <span className="ml-1 text-2xs text-ink-300">manuel</span>}</td>
                  <td className="text-ink-400">{d.scheduled_start ? `${hhmm(d.scheduled_start)} – ${hhmm(d.scheduled_end)}` : "—"}</td>
                  <td className="tabular-nums">{toLocalTime(d.first_in)}</td>
                  <td className="tabular-nums">{toLocalTime(d.last_out)}</td>
                  <td className={d.late_minutes ? "text-clay-700" : "text-ink-300"}>{d.late_minutes ? `${d.late_minutes} min` : "—"}</td>
                  <td className="tabular-nums">{formatMinutes(d.worked_minutes)}</td>
                  <td className="tabular-nums">{d.overtime_minutes ? formatMinutes(d.overtime_minutes) : "—"}</td>
                  <td className="text-right"><Link className="link text-xs" href={`/pointage/${d.employee_id}?date=${d.work_date}`}>Détail</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

async function Corrections({ employees }: { employees: Employee[] }) {
  const supabase = await createClient();
  const { data } = await supabase.from("attendance_corrections").select("*").order("corrected_at", { ascending: false }).limit(200);
  const byId = new Map(employees.map((e) => [e.id, e]));
  const describe = (v: Record<string, string> | null) => {
    if (!v) return "—";
    if (v.status) return v.status === "automatique" ? "Statut automatique" : DAY_STATUS[v.status as keyof typeof DAY_STATUS]?.label ?? v.status;
    return `${PUNCH_KIND[v.kind as keyof typeof PUNCH_KIND] ?? v.kind} ${toLocalTime(v.at)}`;
  };
  return (
    <Card>
      <CardHeader title="Journal des corrections" subtitle="Chaque modification de pointage est conservée avec son auteur, sa date et son motif." />
      {!data?.length ? <Empty title="Aucune correction enregistrée." /> : (
        <table className="table-base">
          <thead><tr><th>Date de correction</th><th>Employé</th><th>Journée</th><th>Action</th><th>Avant</th><th>Après</th><th>Motif</th><th>Par</th></tr></thead>
          <tbody>
            {data.map((c) => (
              <tr key={c.id}>
                <td className="text-ink-500">{formatDateTime(c.corrected_at)}</td>
                <td>{fullName(byId.get(c.employee_id))}</td>
                <td><Link className="link" href={`/pointage/${c.employee_id}?date=${c.work_date}`}>{formatDate(c.work_date)}</Link></td>
                <td>{c.action}</td>
                <td className="text-ink-400">{describe(c.old_value)}</td>
                <td>{describe(c.new_value)}</td>
                <td className="max-w-xs">{c.reason}</td>
                <td>{fullName(byId.get(c.corrected_by))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
