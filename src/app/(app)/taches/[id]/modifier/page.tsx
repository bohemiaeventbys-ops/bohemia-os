import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadDepartments, loadEmployees } from "@/lib/queries";
import { addDays, todayISO } from "@/lib/dates";
import type { Task } from "@/lib/types";
import { TaskFields } from "../../task-form";
import { updateTask } from "../../actions";

export default async function EditTask({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireSession();
  const supabase = await createClient();
  const { data: t } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle<Task>();
  if (!t) notFound();
  const [employees, departments, { data: events }, { data: collab }] = await Promise.all([
    loadEmployees(supabase), loadDepartments(supabase),
    supabase.from("events").select("id, name, event_date").or(`event_date.gte.${addDays(todayISO(), -30)}${t.event_id ? `,id.eq.${t.event_id}` : ""}`).order("event_date").limit(150),
    supabase.from("task_collaborators").select("employee_id").eq("task_id", id),
  ]);
  return (
    <>
      <PageHeader eyebrow={<Link href={`/taches/${id}`} className="hover:underline">Tâche</Link>} title="Modifier la tâche" subtitle="Chaque modification est historisée et le responsable est notifié." />
      <Card className="max-w-4xl">
        <CardBody className="py-6">
          <ActionForm action={updateTask}>
            <input type="hidden" name="id" value={id} />
            <TaskFields t={t} employees={employees} departments={departments} events={events ?? []} collaborators={(collab ?? []).map((c) => c.employee_id)} />
            <div className="mt-6 flex justify-end"><SubmitButton>Enregistrer</SubmitButton></div>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
