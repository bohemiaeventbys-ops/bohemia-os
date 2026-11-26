import { CalendarClock, Repeat, Plus } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadDepartments, loadEmployees } from "@/lib/queries";
import { fullName } from "@/lib/format";
import { hhmm } from "@/lib/dates";
import { EVENT_TYPE, PRIORITY, WEEKDAYS } from "@/lib/labels";
import type { Department, Employee } from "@/lib/types";
import { deleteRecurring, deleteTemplate, saveRecurring, saveTemplate } from "./actions";

export const metadata = { title: "Tâches automatiques" };

interface Template {
  id: string; title: string; description: string | null; department_id: string | null; assignee_id: string | null; event_types: string[];
  offset_days: number; due_time: string | null; priority: string; requires_validation: boolean; is_active: boolean; sort_order: number;
}
interface Recurring { id: string; title: string; description: string | null; department_id: string | null; assignee_id: string | null; weekday: number; due_time: string | null; priority: string; is_active: boolean }

function when(o: number) {
  if (o === 0) return "Jour J";
  return o < 0 ? `J-${-o}` : `J+${o}`;
}

export default async function AutoTasksSettings() {
  await requirePerm("settings.manage");
  const supabase = await createClient();
  const [departments, employees, { data: tpl }, { data: rec }] = await Promise.all([
    loadDepartments(supabase), loadEmployees(supabase),
    supabase.from("task_templates").select("*").order("offset_days").order("sort_order"),
    supabase.from("recurring_tasks").select("*").order("weekday"),
  ]);
  const templates = (tpl ?? []) as Template[];
  const recurring = (rec ?? []) as Recurring[];
  const dep = new Map(departments.map((d) => [d.id, d]));
  const emp = new Map(employees.map((e) => [e.id, e]));
  const who = (d: string | null, a: string | null) => (a ? fullName(emp.get(a)) : d ? `Responsable ${dep.get(d)?.name ?? ""}` : "Non attribuée");

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader icon={<CalendarClock />} tone="rose" title="Tâches de chaque événement"
          subtitle="Dès qu'un événement est saisi ou confirmé, ces tâches sont créées et envoyées à chacun. Si la date de l'événement change, les dates suivent." />
        <ul className="divide-y divide-line">
          {templates.map((t) => (
            <li key={t.id}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3.5">
                  <span className={`w-16 shrink-0 rounded-lg py-1 text-center text-sm font-bold ${t.offset_days < 0 ? "bg-rose-50 text-rose-700" : t.offset_days === 0 ? "bg-ochre-100 text-ochre-700" : "bg-plum-50 text-plum-700"}`}>{when(t.offset_days)}</span>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.department_id ? dep.get(t.department_id)?.color : "#ccc" }} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[15px] font-semibold ${!t.is_active ? "text-ink-300 line-through" : ""}`}>{t.title}</span>
                    <span className="block truncate text-xs text-ink-400">{who(t.department_id, t.assignee_id)} · {t.event_types.length ? t.event_types.map((x) => EVENT_TYPE[x as keyof typeof EVENT_TYPE]).join(", ") : "Tous les événements"}</span>
                  </span>
                  {t.priority !== "normale" && <Badge tone={PRIORITY[t.priority as keyof typeof PRIORITY].tone} dot={false}>{PRIORITY[t.priority as keyof typeof PRIORITY].label}</Badge>}
                  <span className="text-xs text-taupe-600 group-open:hidden">Modifier</span>
                </summary>
                <div className="border-t border-line bg-sand-50/60 px-5 py-4">
                  <TemplateForm t={t} departments={departments} employees={employees} />
                  <ActionForm action={deleteTemplate} className="mt-2"><input type="hidden" name="id" value={t.id} /><SubmitButton size="sm" variant="ghost">Supprimer ce modèle</SubmitButton></ActionForm>
                </div>
              </details>
            </li>
          ))}
        </ul>
        <details className="border-t border-line">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-semibold text-rose-700"><Plus className="h-4 w-4" /> Ajouter une tâche automatique</summary>
          <CardBody className="border-t border-line bg-sand-50/60"><TemplateForm departments={departments} employees={employees} /></CardBody>
        </details>
      </Card>

      <Card>
        <CardHeader icon={<Repeat />} tone="sage" title="Tâches de la semaine (hors événements)"
          subtitle="Créées chaque lundi matin pour la semaine : ranger, réparer, trier, nettoyer…" />
        <ul className="divide-y divide-line">
          {recurring.map((r) => (
            <li key={r.id}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3.5">
                  <span className="w-20 shrink-0 rounded-lg bg-sage-50 py-1 text-center text-sm font-bold text-sage-700">{WEEKDAYS[r.weekday - 1]}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[15px] font-semibold ${!r.is_active ? "text-ink-300 line-through" : ""}`}>{r.title}</span>
                    <span className="block truncate text-xs text-ink-400">{who(r.department_id, r.assignee_id)}{r.due_time ? ` · avant ${hhmm(r.due_time)}` : ""}</span>
                  </span>
                  <span className="text-xs text-taupe-600 group-open:hidden">Modifier</span>
                </summary>
                <div className="border-t border-line bg-sand-50/60 px-5 py-4">
                  <RecurringForm r={r} departments={departments} employees={employees} />
                  <ActionForm action={deleteRecurring} className="mt-2"><input type="hidden" name="id" value={r.id} /><SubmitButton size="sm" variant="ghost">Supprimer</SubmitButton></ActionForm>
                </div>
              </details>
            </li>
          ))}
        </ul>
        <details className="border-t border-line">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-semibold text-sage-700"><Plus className="h-4 w-4" /> Ajouter une tâche de la semaine</summary>
          <CardBody className="border-t border-line bg-sand-50/60"><RecurringForm departments={departments} employees={employees} /></CardBody>
        </details>
      </Card>
    </div>
  );
}

function People({ departments, employees, d, a }: { departments: Department[]; employees: Employee[]; d?: string | null; a?: string | null }) {
  return (
    <>
      <Field label="Département">
        <Select name="department_id" defaultValue={d ?? ""}><option value="">—</option>{departments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
      </Field>
      <Field label="Personne" hint="Vide : le responsable du département">
        <Select name="assignee_id" defaultValue={a ?? ""}><option value="">Responsable du département</option>{employees.map((x) => <option key={x.id} value={x.id}>{fullName(x)}</option>)}</Select>
      </Field>
    </>
  );
}

function TemplateForm({ t, departments, employees }: { t?: Template; departments: Department[]; employees: Employee[] }) {
  const o = t?.offset_days ?? -3;
  return (
    <ActionForm action={saveTemplate} resetOnSuccess={!t} className="space-y-4">
      {t && <input type="hidden" name="id" value={t.id} />}
      <Field label="La tâche"><Input name="title" required defaultValue={t?.title} placeholder="Ex. Commander les ballons" /></Field>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Combien de jours"><Input name="days" type="number" min={0} max={120} defaultValue={Math.abs(o)} className="text-center" /></Field>
        <Field label="Quand"><Select name="when" defaultValue={o < 0 ? "avant" : o > 0 ? "apres" : "jour"}><option value="avant">avant l&apos;événement</option><option value="jour">le jour même</option><option value="apres">après l&apos;événement</option></Select></Field>
        <People departments={departments} employees={employees} d={t?.department_id} a={t?.assignee_id} />
      </div>
      <fieldset>
        <legend className="label">Pour quels événements ? (rien coché = tous)</legend>
        <div className="flex flex-wrap gap-2">
          {Object.entries(EVENT_TYPE).map(([k, v]) => (
            <label key={k} className="cursor-pointer rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-line has-[:checked]:bg-rose-500 has-[:checked]:text-white has-[:checked]:ring-rose-500">
              <input type="checkbox" name="event_types" value={k} defaultChecked={t?.event_types.includes(k)} className="sr-only" />{v}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Priorité"><Select name="priority" defaultValue={t?.priority ?? "normale"}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        <Field label="Avant quelle heure (facultatif)"><Input name="due_time" type="time" defaultValue={t?.due_time?.slice(0, 5) ?? ""} /></Field>
        <div className="flex flex-col justify-end gap-2 pb-1 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="requires_validation" defaultChecked={t?.requires_validation} className="h-5 w-5 accent-ink" /> À faire vérifier</label>
          {t && <label className="flex items-center gap-2"><input type="checkbox" name="is_active" value="off" defaultChecked={!t.is_active} className="h-5 w-5 accent-ink" /> Désactivée</label>}
        </div>
      </div>
      <Field label="Consignes (facultatif)"><Textarea name="description" rows={2} defaultValue={t?.description ?? ""} /></Field>
      <SubmitButton>{t ? "Enregistrer" : "Ajouter"}</SubmitButton>
    </ActionForm>
  );
}

function RecurringForm({ r, departments, employees }: { r?: Recurring; departments: Department[]; employees: Employee[] }) {
  return (
    <ActionForm action={saveRecurring} resetOnSuccess={!r} className="space-y-4">
      {r && <input type="hidden" name="id" value={r.id} />}
      <Field label="La tâche"><Input name="title" required defaultValue={r?.title} placeholder="Ex. Nettoyer le camion" /></Field>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Chaque"><Select name="weekday" defaultValue={String(r?.weekday ?? 1)}>{WEEKDAYS.map((w, i) => <option key={w} value={i + 1}>{w}</option>)}</Select></Field>
        <Field label="Avant quelle heure"><Input name="due_time" type="time" defaultValue={r?.due_time?.slice(0, 5) ?? ""} /></Field>
        <People departments={departments} employees={employees} d={r?.department_id} a={r?.assignee_id} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Priorité"><Select name="priority" defaultValue={r?.priority ?? "normale"}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        {r && <label className="flex items-center gap-2 self-end pb-3 text-sm"><input type="checkbox" name="is_active" value="off" defaultChecked={!r.is_active} className="h-5 w-5 accent-ink" /> Désactivée</label>}
      </div>
      <Field label="Consignes (facultatif)"><Textarea name="description" rows={2} defaultValue={r?.description ?? ""} /></Field>
      <SubmitButton>{r ? "Enregistrer" : "Ajouter"}</SubmitButton>
    </ActionForm>
  );
}
