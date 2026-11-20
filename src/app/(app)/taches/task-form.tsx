import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { fullName } from "@/lib/format";
import { formatDate } from "@/lib/dates";
import { PRIORITY } from "@/lib/labels";
import type { Department, Employee, EventRow, Task } from "@/lib/types";

export function TaskFields({ t, employees, departments, events, collaborators = [], defaults = {} }: {
  t?: Task; employees: Employee[]; departments: Department[]; events: Pick<EventRow, "id" | "name" | "event_date">[]; collaborators?: string[];
  defaults?: { assignee_id?: string; planned_date?: string; event_id?: string; department_id?: string };
}) {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2">
        <Field label="Titre" className="md:col-span-2"><Input name="title" defaultValue={t?.title} required placeholder="Ex. Imprimer le panneau de bienvenue 120×180" /></Field>
        <Field label="Ce qu'il faut faire" className="md:col-span-2"><Textarea name="description" defaultValue={t?.description ?? ""} rows={3} /></Field>
        <Field label="Instructions"><Textarea name="instructions" defaultValue={t?.instructions ?? ""} rows={3} placeholder="Matériaux, dimensions, consignes…" /></Field>
        <Field label="Résultat attendu"><Textarea name="expected_result" defaultValue={t?.expected_result ?? ""} rows={3} placeholder="Ex. Panneau découpé, contrôlé, emballé au dépôt" /></Field>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        <Field label="Responsable">
          <Select name="assignee_id" defaultValue={t?.assignee_id ?? defaults.assignee_id ?? ""}>
            <option value="">— Non assignée —</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{fullName(e)}</option>)}
          </Select>
        </Field>
        <Field label="Département" hint="Par défaut : celui du responsable">
          <Select name="department_id" defaultValue={t?.department_id ?? defaults.department_id ?? ""}>
            <option value="">— Automatique —</option>
            {departments.filter((d) => d.is_active).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </Field>
        <Field label="Événement associé">
          <Select name="event_id" defaultValue={t?.event_id ?? defaults.event_id ?? ""}>
            <option value="">— Aucun —</option>
            {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name} · {formatDate(ev.event_date)}</option>)}
          </Select>
        </Field>
        <Field label="Priorité">
          <Select name="priority" defaultValue={t?.priority ?? "normale"}>
            {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </Field>
        <Field label="Jour de réalisation"><Input type="date" name="planned_date" defaultValue={t?.planned_date ?? defaults.planned_date ?? ""} /></Field>
        <Field label="Heure de réalisation"><Input type="time" name="planned_time" defaultValue={t?.planned_time?.slice(0, 5) ?? ""} /></Field>
        <Field label="Date limite"><Input type="date" name="due_date" defaultValue={t?.due_date ?? ""} /></Field>
        <Field label="Heure limite"><Input type="time" name="due_time" defaultValue={t?.due_time?.slice(0, 5) ?? ""} /></Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink-500">
          <input type="checkbox" name="requires_validation" defaultChecked={t?.requires_validation ?? true} className="h-4 w-4 accent-ink" />
          Validation par la direction requise
        </label>
      </section>
      <details className="rounded-xl border border-line bg-sand-50 px-4 py-3" open={collaborators.length > 0}>
        <summary className="cursor-pointer text-sm font-medium text-ink-500">Collaborateurs {collaborators.length ? `(${collaborators.length})` : ""}</summary>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          {employees.map((e) => (
            <label key={e.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="collaborators" value={e.id} defaultChecked={collaborators.includes(e.id)} className="h-4 w-4 accent-ink" />
              {fullName(e)}
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}
