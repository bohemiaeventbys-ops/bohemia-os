import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/field";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { saveCompany } from "./actions";

export default async function CompanySettings() {
  await requirePerm("settings.manage");
  const supabase = await createClient();
  const { data: c } = await supabase.from("company_settings").select("*").single();
  return (
    <Card className="max-w-2xl">
      <CardHeader title="Entreprise" subtitle="Fuseau horaire Africa/Casablanca et devise MAD (DH) appliqués à toute la plateforme." />
      <CardBody>
        <ActionForm action={saveCompany} className="space-y-4">
          <Field label="Nom de l'entreprise"><Input name="company_name" defaultValue={c?.company_name} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Fuseau horaire"><Input value={c?.timezone} disabled /></Field>
            <Field label="Devise"><Input value={`${c?.currency} · DH`} disabled /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="overdue_notify_management" defaultChecked={c?.overdue_notify_management} className="h-4 w-4 accent-ink" /> Informer la direction et les responsables des tâches en retard</label>
          <SubmitButton>Enregistrer</SubmitButton>
        </ActionForm>
      </CardBody>
    </Card>
  );
}
