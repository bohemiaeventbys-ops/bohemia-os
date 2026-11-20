import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadDepartments, loadEmployees } from "@/lib/queries";
import { fullName } from "@/lib/format";
import type { Department, Employee } from "@/lib/types";
import { deleteDepartment, saveDepartment } from "../actions";

export default async function DepartmentsSettings() {
  await requirePerm("settings.manage");
  const supabase = await createClient();
  const [departments, employees, { data: managers }] = await Promise.all([loadDepartments(supabase), loadEmployees(supabase), supabase.from("department_managers").select("*")]);
  const count = (id: string) => employees.filter((e) => e.department_id === id).length;
  return (
    <div className="space-y-4">
      {departments.map((d) => (
        <details key={d.id} className="card group">
          <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4">
            <span className="h-3 w-3 rounded-full" style={{ background: d.color }} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{d.name} {!d.is_active && <Badge tone="neutral">Inactif</Badge>}</p>
              <p className="truncate text-xs text-ink-400">
                Responsable(s) : {(managers ?? []).filter((m) => m.department_id === d.id).map((m) => fullName(employees.find((e) => e.id === m.employee_id))).join(", ") || "—"} · {count(d.id)} employé(s)
              </p>
            </div>
            <span className="text-xs text-taupe-600 group-open:hidden">Modifier</span>
          </summary>
          <div className="border-t border-line px-5 py-5">
            <DeptForm d={d} employees={employees} managerIds={(managers ?? []).filter((m) => m.department_id === d.id).map((m) => m.employee_id)} />
            <ActionForm action={deleteDepartment} className="mt-4 border-t border-line pt-4">
              <input type="hidden" name="id" value={d.id} />
              <SubmitButton size="sm" variant="danger">Supprimer le département</SubmitButton>
            </ActionForm>
          </div>
        </details>
      ))}
      <Card>
        <CardHeader title="Nouveau département" />
        <CardBody><DeptForm employees={employees} managerIds={[]} /></CardBody>
      </Card>
    </div>
  );
}

function DeptForm({ d, employees, managerIds }: { d?: Department; employees: Employee[]; managerIds: string[] }) {
  return (
    <ActionForm action={saveDepartment} className="space-y-4">
      {d && <input type="hidden" name="id" value={d.id} />}
      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Nom" className="md:col-span-2"><Input name="name" defaultValue={d?.name} required /></Field>
        <Field label="Code"><Input name="code" defaultValue={d?.code ?? ""} maxLength={6} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Couleur"><Input type="color" name="color" defaultValue={d?.color ?? "#A39382"} className="h-10 p-1" /></Field>
          <Field label="Ordre"><Input type="number" name="sort_order" defaultValue={d?.sort_order ?? 100} /></Field>
        </div>
      </div>
      <Field label="Description"><Input name="description" defaultValue={d?.description ?? ""} /></Field>
      <Field label="Domaines gérés" hint="Séparés par des virgules"><Textarea name="scope" defaultValue={d?.scope.join(", ") ?? ""} rows={2} /></Field>
      <div>
        <p className="label">Responsable(s)</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {employees.map((e) => (
            <label key={e.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="managers" value={e.id} defaultChecked={managerIds.includes(e.id)} className="h-4 w-4 accent-ink" />{fullName(e)}</label>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm"><input type="hidden" name="is_active" value="off" /><input type="checkbox" name="is_active" value="on" defaultChecked={d?.is_active ?? true} className="h-4 w-4 accent-ink" /> Actif</label>
        <SubmitButton size="sm">{d ? "Enregistrer" : "Créer le département"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
