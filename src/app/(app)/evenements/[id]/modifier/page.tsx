import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ActionForm, FormReset, SubmitButton } from "@/components/ui/action-form";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadEmployees } from "@/lib/queries";
import type { EventRow } from "@/lib/types";
import { EventFields } from "../../event-form";
import { updateEvent } from "../../actions";

export default async function EditEvent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePerm("events.manage");
  const supabase = await createClient();
  const { data: e } = await supabase.from("events").select("*").eq("id", id).maybeSingle<EventRow>();
  if (!e) notFound();
  const [employees, { data: clients }] = await Promise.all([loadEmployees(supabase), supabase.from("clients").select("id, name, phone").order("name")]);
  return (
    <>
      <PageHeader eyebrow={<Link href={`/evenements/${id}`} className="hover:underline">{e.name}</Link>} title="Modifier l'événement" />
      <Card className="max-w-5xl"><CardBody className="py-6">
        <ActionForm action={updateEvent}>
          <input type="hidden" name="id" value={id} />
          <EventFields e={e} employees={employees} clients={clients ?? []} />
          <div className="mt-6 flex flex-wrap justify-end gap-2"><FormReset mode="edit" /><SubmitButton>Enregistrer</SubmitButton></div>
        </ActionForm>
      </CardBody></Card>
    </>
  );
}
