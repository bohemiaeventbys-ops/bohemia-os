import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { buttonClass } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input, Select } from "@/components/ui/field";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadSchedules } from "@/lib/queries";
import { scheduleFor } from "@/lib/attendance";
import { addDays, formatDateTime, formatDayLong, formatMinutes, isValidISODate, todayISO, toLocalTime } from "@/lib/dates";
import { fullName } from "@/lib/format";
import { DAY_STATUS, MANUAL_DAY_STATUSES, PUNCH_KIND } from "@/lib/labels";
import type { AttendanceDay, Employee, Punch } from "@/lib/types";
import { correctPunch, setDayStatus } from "../actions";

export default async function EmployeeAttendance({ params, searchParams }: { params: Promise<{ employeeId: string }>; searchParams: Promise<{ date?: string }> }) {
  const { employeeId } = await params;
  const sp = await searchParams;
  const session = await requireSession();
  const supabase = await createClient();
  const date = isValidISODate(sp.date) ? sp.date : todayISO();
  const { data: emp } = await supabase.from("employees").select("*").eq("id", employeeId).maybeSingle<Employee>();
  if (!emp) notFound();

  const [{ data: punches }, { data: day }, { data: corrections }, schedules, { data: staff }] = await Promise.all([
    supabase.from("time_punches").select("*").eq("employee_id", employeeId).eq("work_date", date).order("punched_at"),
    supabase.from("attendance_days").select("*").eq("employee_id", employeeId).eq("work_date", date).maybeSingle<AttendanceDay>(),
    supabase.from("attendance_corrections").select("*").eq("employee_id", employeeId).eq("work_date", date).order("corrected_at", { ascending: false }),
    loadSchedules(supabase),
    supabase.from("employees").select("id, first_name, last_name"),
  ]);
  const visible = (punches ?? []) as Punch[];
  if (employeeId !== session.employee.id && !day && visible.length === 0 && !session.can("attendance.view_all") && !session.managedDepartmentIds.length) notFound();
  const canCorrect = session.can("attendance.correct") && (employeeId !== session.employee.id || session.isAdmin);
  const sched = scheduleFor(emp, schedules, date);
  const names = new Map((staff ?? []).map((s) => [s.id, fullName(s)]));
  const active = visible.filter((p) => !p.voided);

  return (
    <>
      <PageHeader eyebrow={<Link href="/pointage" className="hover:underline">Pointage</Link>} title={fullName(emp)}
        subtitle={<span className="capitalize">{formatDayLong(date)}{sched ? ` · horaire prévu ${sched.start} – ${sched.end} (tolérance ${sched.grace} min)` : " · jour non travaillé"}</span>}
        actions={<>
          <Link href={`?date=${addDays(date, -1)}`} className={buttonClass("secondary", "sm")}>← Veille</Link>
          <Link href={`?date=${todayISO()}`} className={buttonClass("secondary", "sm")}>Aujourd&apos;hui</Link>
          <Link href={`?date=${addDays(date, 1)}`} className={buttonClass("secondary", "sm")}>Lendemain →</Link>
        </>} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Info label="Statut" value={day ? <Badge tone={DAY_STATUS[day.status].tone}>{DAY_STATUS[day.status].label}</Badge> : <span className="text-ink-300">Aucun pointage</span>} />
            <Info label="Arrivée" value={toLocalTime(day?.first_in)} />
            <Info label="Départ" value={toLocalTime(day?.last_out)} />
            <Info label="Travaillé" value={day ? formatMinutes(day.worked_minutes) : "—"} sub={day?.overtime_minutes ? `dont ${formatMinutes(day.overtime_minutes)} sup.` : day?.late_minutes ? `${day.late_minutes} min de retard` : undefined} />
          </div>
          {day?.note && <p className="rounded-xl bg-sand-100 px-4 py-3 text-sm text-ink-500">Note : {day.note}</p>}

          <Card>
            <CardHeader title="Pointages de la journée" subtitle="Les pointages d'origine ne sont jamais effacés : une correction les annule et les remplace." />
            {visible.length === 0 ? <Empty title="Aucun pointage." /> : (
              <table className="table-base">
                <thead><tr><th>Heure</th><th>Type</th><th>Source</th><th>État</th>{canCorrect && <th>Corriger</th>}</tr></thead>
                <tbody>
                  {visible.map((p) => (
                    <tr key={p.id} className={p.voided ? "opacity-50" : ""}>
                      <td className={`tabular-nums font-medium ${p.voided ? "line-through" : ""}`}>{toLocalTime(p.punched_at)}</td>
                      <td>{PUNCH_KIND[p.kind]}</td>
                      <td className="text-ink-400">{p.source === "kiosque" ? "Kiosque" : "Correction"}</td>
                      <td>{p.voided ? <Badge tone="neutral">Annulé</Badge> : <Badge tone="sage">Valide</Badge>}</td>
                      {canCorrect && (
                        <td>
                          {!p.voided && (
                            <details className="group">
                              <summary className="cursor-pointer text-xs text-taupe-600 hover:underline">Modifier / annuler</summary>
                              <ActionForm action={correctPunch} className="mt-3 w-80 space-y-2 rounded-xl border border-line bg-sand-50 p-3">
                                <input type="hidden" name="employee_id" value={emp.id} /><input type="hidden" name="work_date" value={date} /><input type="hidden" name="punch_id" value={p.id} />
                                <div className="grid grid-cols-2 gap-2">
                                  <Select name="kind" defaultValue={p.kind}>{Object.entries(PUNCH_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                                  <Input type="time" name="time" defaultValue={toLocalTime(p.punched_at)} />
                                </div>
                                <Input name="reason" placeholder="Motif (obligatoire)" required minLength={3} />
                                <div className="flex gap-2">
                                  <SubmitButton size="sm" name="action" value="modification">Corriger</SubmitButton>
                                  <SubmitButton size="sm" variant="danger" name="action" value="annulation">Annuler ce pointage</SubmitButton>
                                </div>
                              </ActionForm>
                            </details>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card>
            <CardHeader title="Historique des corrections" />
            {!corrections?.length ? <Empty title="Aucune correction pour cette journée." /> : (
              <ul className="divide-y divide-line">
                {corrections.map((c) => (
                  <li key={c.id} className="px-5 py-3 text-sm">
                    <p><span className="font-medium capitalize">{c.action}</span> par {names.get(c.corrected_by) ?? "—"} · <span className="text-ink-400">{formatDateTime(c.corrected_at)}</span></p>
                    <p className="mt-0.5 text-ink-500">Motif : {c.reason}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {canCorrect && (
          <div className="space-y-6">
            <Card>
              <CardHeader title="Ajouter un pointage oublié" subtitle="Enregistré comme correction, avec motif." />
              <CardBody>
                <ActionForm action={correctPunch} className="space-y-3">
                  <input type="hidden" name="employee_id" value={emp.id} /><input type="hidden" name="work_date" value={date} /><input type="hidden" name="action" value="ajout" />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Type"><Select name="kind" defaultValue={active.length ? "depart" : "arrivee"}>{Object.entries(PUNCH_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
                    <Field label="Heure"><Input type="time" name="time" required /></Field>
                  </div>
                  <Field label="Motif"><Input name="reason" required minLength={3} placeholder="Ex. oubli de pointage, panne du poste…" /></Field>
                  <SubmitButton size="sm">Ajouter</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Statut de la journée" subtitle="Absence, congé, maladie, récupération, sortie autorisée." />
              <CardBody>
                <ActionForm action={setDayStatus} className="space-y-3">
                  <input type="hidden" name="employee_id" value={emp.id} /><input type="hidden" name="work_date" value={date} />
                  <Field label="Statut">
                    <Select name="status" defaultValue={day?.manual_status ? day.status : "absent"}>
                      {MANUAL_DAY_STATUSES.map((s) => <option key={s} value={s}>{DAY_STATUS[s].label}</option>)}
                      {day?.manual_status && <option value="auto">Revenir au statut automatique</option>}
                    </Select>
                  </Field>
                  <Field label="Motif"><Input name="reason" required minLength={3} /></Field>
                  <SubmitButton size="sm" variant="secondary">Enregistrer le statut</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}

function Info({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-2xs font-semibold uppercase tracking-wider text-ink-400">{label}</p>
      <div className="mt-1.5 text-lg font-medium tabular-nums">{value}</div>
      {sub && <p className="text-xs text-ink-400">{sub}</p>}
    </div>
  );
}
