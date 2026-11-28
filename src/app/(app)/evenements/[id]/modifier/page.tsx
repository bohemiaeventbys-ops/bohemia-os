import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ActionForm, FormReset, SubmitButton } from "@/components/ui/action-form";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadEmployees } from "@/lib/queries";
import { getLang } from "@/lib/lang";
import type { EventRow } from "@/lib/types";
import { EventFields } from "../../event-form";
import { updateEvent } from "../../actions";

export default async function EditEvent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePerm("events.manage");
  const lang = await getLang();
  const supabase = await createClient();
  const { data: e } = await supabase.from("events").select("*").eq("id", id).maybeSingle<EventRow>();
  if (!e) notFound();
  const [employees, { data: clients }] = await Promise.all([loadEmployees(supabase), supabase.from("clients").select("id, name, phone").order("name")]);
  return (
    <>
      <PageHeader eyebrow={<Link href={`/evenements/${id}`} className="hover:underline">{e.name}</Link>} title={lang === "ar" ? "تعديل الحدث" : "Modifier l'événement"}
        actions={<div className="flex flex-wrap gap-2"><Link href={`/evenements/${id}#design`} className="rounded-xl bg-paper px-4 py-2.5 font-bold ring-1 ring-line-strong">{lang === "ar" ? "التصميم" : "Design"}</Link><Link href={`/evenements/${id}/materiel/choisir`} className="rounded-xl bg-paper px-4 py-2.5 font-bold ring-1 ring-line-strong">{lang === "ar" ? "إضافة من المخزون" : "Ajouter depuis le stock"}</Link></div>} />
      <Card className="max-w-5xl"><CardBody className="py-6">
        <ActionForm action={updateEvent}>
          <input type="hidden" name="id" value={id} />
          <EventFields e={e} employees={employees} clients={clients ?? []} lang={lang} />
          <div className="mt-6 flex flex-wrap justify-end gap-2"><FormReset mode="edit" label={lang === "ar" ? "إلغاء التعديلات" : undefined} /><SubmitButton>{lang === "ar" ? "حفظ" : "Enregistrer"}</SubmitButton></div>
        </ActionForm>
      </CardBody></Card>
    </>
  );
}
