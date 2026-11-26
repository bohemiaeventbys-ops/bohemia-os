import Link from "next/link";
import { Plus, Repeat } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { buttonClass } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input, Select } from "@/components/ui/field";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadDepartments, loadEmployees } from "@/lib/queries";
import { addDays, formatDate, formatDayShort, hhmm, isValidISODate, startOfWeek, todayISO } from "@/lib/dates";
import { fullName } from "@/lib/format";
import { TASK_STATUS } from "@/lib/labels";
import { isOverdue, sortTasks } from "@/lib/tasks";
import { cn } from "@/lib/cn";
import type { Task } from "@/lib/types";
import { duplicateWeek } from "../actions";
import { generateWeek } from "../../parametres/taches-auto/actions";

export const metadata = { title: "Planning hebdomadaire" };

const toneBorder: Record<string, string> = {
  neutral: "border-l-ink-300", sand: "border-l-taupe-400", sage: "border-l-sage-500", clay: "border-l-clay-500", ochre: "border-l-ochre-500", mist: "border-l-mist-500", ink: "border-l-ink",
};

export default async function PlanningPage({ searchParams }: { searchParams: Promise<{ semaine?: string; departement?: string; par?: string }> }) {
  const sp = await searchParams;
  const s = await requireSession();
  const supabase = await createClient();
  const monday = startOfWeek(isValidISODate(sp.semaine) ? sp.semaine : todayISO());
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const par = sp.par === "departement" ? "departement" : "employe";
  const [employees, departments, { data }, { data: events }] = await Promise.all([
    loadEmployees(supabase), loadDepartments(supabase),
    supabase.from("tasks").select("*").gte("planned_date", monday).lte("planned_date", days[6]),
    supabase.from("events").select("id, name, event_date").gte("event_date", monday).lte("event_date", days[6]),
  ]);
  let tasks = (data ?? []) as Task[];
  if (sp.departement) tasks = tasks.filter((t) => t.department_id === sp.departement);
  const empList = employees.filter((e) => (!sp.departement || e.department_id === sp.departement));
  const rows = par === "employe"
    ? [...empList.map((e) => ({ key: e.id, label: fullName(e), person: e, filter: (t: Task) => t.assignee_id === e.id })),
       { key: "none", label: "Non assignées", person: null, filter: (t: Task) => !t.assignee_id }]
    : departments.filter((d) => d.is_active && (!sp.departement || d.id === sp.departement)).map((d) => ({ key: d.id, label: d.name, person: null, filter: (t: Task) => t.department_id === d.id }));
  const visibleRows = rows.filter((r) => r.key !== "none" || tasks.some(r.filter));
  const canCreate = s.can("tasks.create");
  const today = todayISO();
  const qs = (o: Record<string, string | undefined>) => "?" + new URLSearchParams(Object.entries({ semaine: monday, departement: sp.departement, par, ...o }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHeader eyebrow={<Link href="/taches" className="hover:underline">Tâches</Link>} title="Planning de la semaine"
        subtitle={`Du ${formatDate(monday)} au ${formatDate(days[6])} · ${tasks.length} tâche(s) planifiée(s)`}
        actions={<>
          <Link href={qs({ semaine: addDays(monday, -7) })} className={buttonClass("secondary", "sm")}>← Semaine précédente</Link>
          <Link href={qs({ semaine: startOfWeek(today) })} className={buttonClass("secondary", "sm")}>Cette semaine</Link>
          <Link href={qs({ semaine: addDays(monday, 7) })} className={buttonClass("secondary", "sm")}>Semaine suivante →</Link>
          {s.can("tasks.create") && (
            <ActionForm action={generateWeek}>
              <input type="hidden" name="week" value={monday} />
              <SubmitButton size="sm" variant="success"><Repeat className="h-3.5 w-3.5" /> Tâches de la semaine</SubmitButton>
            </ActionForm>
          )}
        </>} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-line bg-white p-0.5">
          <Link href={qs({ par: "employe" })} className={cn("rounded-md px-3 py-1.5 text-sm", par === "employe" ? "bg-ink text-ivory" : "text-ink-500")}>Par employé</Link>
          <Link href={qs({ par: "departement" })} className={cn("rounded-md px-3 py-1.5 text-sm", par === "departement" ? "bg-ink text-ivory" : "text-ink-500")}>Par département</Link>
        </div>
        <form className="flex items-center gap-2">
          <input type="hidden" name="semaine" value={monday} /><input type="hidden" name="par" value={par} />
          <Select name="departement" defaultValue={sp.departement ?? ""} className="h-9 w-56 py-1"><option value="">Tous les départements</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
          <button className={buttonClass("secondary", "sm")}>Filtrer</button>
        </form>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[1100px] table-fixed border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-48 border-b border-line bg-sand-50 px-3 py-2 text-left text-2xs font-semibold uppercase tracking-wider text-ink-400">{par === "employe" ? "Employé" : "Département"}</th>
              {days.map((d) => {
                const evs = (events ?? []).filter((e) => e.event_date === d);
                return (
                  <th key={d} className={cn("border-b border-l border-line px-2 py-2 text-left align-top", d === today ? "bg-nude-100" : "bg-sand-50", d >= days[5] && "bg-sand-100")}>
                    <p className="text-xs font-semibold text-ink">{formatDayShort(d)}</p>
                    {evs.map((e) => <Link key={e.id} href={`/evenements/${e.id}`} className="mt-1 block truncate rounded bg-ink px-1.5 py-0.5 text-[10px] font-medium text-ivory">{e.name}</Link>)}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => (
              <tr key={r.key} className="align-top">
                <td className="border-b border-line px-3 py-2.5">
                  <div className="flex items-center gap-2">{r.person && <Avatar person={r.person} size={24} />}<span className="truncate font-medium">{r.label}</span></div>
                </td>
                {days.map((d) => {
                  const cell = sortTasks(tasks.filter((t) => r.filter(t) && t.planned_date === d));
                  return (
                    <td key={d} className={cn("group border-b border-l border-line px-1.5 py-1.5", d === today && "bg-nude-100/40")}>
                      <div className="space-y-1">
                        {cell.map((t) => (
                          <Link key={t.id} href={`/taches/${t.id}`}
                            className={cn("block rounded-md border border-line border-l-[3px] bg-white px-2 py-1.5 text-xs shadow-card transition hover:border-taupe-300", toneBorder[TASK_STATUS[t.status].tone], isOverdue(t) && "bg-clay-100/50")}>
                            <p className="line-clamp-2 font-medium leading-snug text-ink">{t.title}</p>
                            <p className="mt-0.5 text-[10px] text-ink-400">{t.planned_time ? hhmm(t.planned_time) + " · " : ""}{TASK_STATUS[t.status].label}</p>
                          </Link>
                        ))}
                        {canCreate && par === "employe" && r.person && (
                          <Link href={`/taches/nouvelle?date=${d}&responsable=${r.key}`} className="flex items-center justify-center rounded-md py-1 text-ink-300 opacity-0 transition hover:bg-sand-100 hover:text-ink group-hover:opacity-100" aria-label="Ajouter">
                            <Plus className="h-3.5 w-3.5" />
                          </Link>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canCreate && (
        <Card className="mt-6 max-w-3xl">
          <CardHeader title="Planning récurrent" subtitle="Dupliquer toutes les tâches planifiées de cette semaine vers une autre semaine (dates décalées, statuts remis à « À faire »)." />
          <CardBody>
            <ActionForm action={duplicateWeek} className="grid items-end gap-3 md:grid-cols-4">
              <input type="hidden" name="week_start" value={monday} />
              <Field label="Semaine cible (lundi)"><Input type="date" name="target_start" defaultValue={addDays(monday, 7)} required /></Field>
              <Field label="Département"><Select name="department_id" defaultValue={sp.departement ?? ""}><option value="">Tous</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
              <Field label="Employé"><Select name="employee_id" defaultValue=""><option value="">Tous</option>{empList.map((e) => <option key={e.id} value={e.id}>{fullName(e)}</option>)}</Select></Field>
              <SubmitButton variant="secondary">Dupliquer la semaine</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
      )}
    </>
  );
}
