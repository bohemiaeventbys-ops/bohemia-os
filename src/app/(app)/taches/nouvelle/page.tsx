import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/field";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadDepartments, loadEmployees } from "@/lib/queries";
import { addDays, todayISO } from "@/lib/dates";
import { TaskFields } from "../task-form";
import { createTask } from "../actions";

export const metadata = { title: "Nouvelle tâche" };

export default async function NewTask({ searchParams }: { searchParams: Promise<{ date?: string; responsable?: string; evenement?: string }> }) {
  const sp = await searchParams;
  const s = await requirePerm("tasks.create");
  const supabase = await createClient();
  const [employees, departments, { data: events }] = await Promise.all([
    loadEmployees(supabase), loadDepartments(supabase),
    supabase.from("events").select("id, name, event_date").gte("event_date", addDays(todayISO(), -7)).order("event_date").limit(100),
  ]);
  // Un responsable de département n'attribue qu'à son équipe (sauf permission étendue)
  const assignable = s.can("tasks.manage") || s.can("tasks.assign_any") ? employees
    : employees.filter((e) => e.id === s.employee.id || (e.department_id && s.managedDepartmentIds.includes(e.department_id)));
  return (
    <>
      <PageHeader eyebrow="Tâches" title="Nouvelle tâche" subtitle="La tâche apparaît immédiatement dans le planning et « Ma journée » du responsable, qui est notifié." />
      <Card className="max-w-4xl">
        <CardBody className="py-6">
          <ActionForm action={createTask} resetOnSuccess>
            <TaskFields employees={assignable} departments={departments} events={events ?? []}
              defaults={{ assignee_id: sp.responsable, planned_date: sp.date, event_id: sp.evenement }} />
            <Field label="Fichiers joints" className="mt-6"><Input type="file" name="files" multiple /></Field>
            <div className="mt-6 flex justify-end gap-2">
              <SubmitButton variant="secondary" name="another" value="1">Créer et en saisir une autre</SubmitButton>
              <SubmitButton>Créer la tâche</SubmitButton>
            </div>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
