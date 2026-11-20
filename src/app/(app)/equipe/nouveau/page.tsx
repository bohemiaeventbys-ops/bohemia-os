import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadDepartments, loadSchedules } from "@/lib/queries";
import { EmployeeFields } from "../employee-form";
import { createEmployee } from "../actions";

export const metadata = { title: "Nouvel employé" };

export default async function NewEmployee() {
  const s = await requirePerm("employees.manage");
  const supabase = await createClient();
  const [departments, schedules] = await Promise.all([loadDepartments(supabase), loadSchedules(supabase)]);
  return (
    <>
      <PageHeader eyebrow="Équipe" title="Nouvel employé" subtitle="L'accès à la plateforme (email + mot de passe) se crée ensuite depuis la fiche." />
      <Card className="max-w-3xl">
        <CardBody className="py-6">
          <ActionForm action={createEmployee}>
            <EmployeeFields departments={departments} schedules={schedules} showRole={s.isAdmin} showPin />
            <div className="mt-6 flex justify-end"><SubmitButton>Créer l&apos;employé</SubmitButton></div>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
