import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadEmployees } from "@/lib/queries";
import { EventFields } from "../event-form";
import { createEvent } from "../actions";

export const metadata = { title: "Nouvel événement" };

export default async function NewEvent() {
  await requirePerm("events.manage");
  const supabase = await createClient();
  const employees = await loadEmployees(supabase);
  return (
    <>
      <PageHeader eyebrow="Événements" title="Nouvel événement" subtitle="L'événement apparaît immédiatement dans le calendrier et peut recevoir des tâches et une équipe." />
      <Card className="max-w-5xl"><CardBody className="py-6">
        <ActionForm action={createEvent}>
          <EventFields employees={employees} />
          <div className="mt-6 flex justify-end"><SubmitButton>Créer l&apos;événement</SubmitButton></div>
        </ActionForm>
      </CardBody></Card>
    </>
  );
}
