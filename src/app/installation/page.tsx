import { redirect } from "next/navigation";
import { BrandPanel } from "@/components/layout/brand-panel";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/field";
import { createAdminClient } from "@/lib/supabase/admin";
import { installAdmin } from "./actions";

export const metadata = { title: "Installation" };
export const dynamic = "force-dynamic";

export default async function InstallationPage() {
  const admin = createAdminClient();
  const { count } = await admin.from("employees").select("id", { count: "exact", head: true }).eq("role", "admin").not("user_id", "is", null);
  if ((count ?? 0) > 0) redirect("/connexion");
  return (
    <BrandPanel title="Installation" subtitle="Créez le premier compte Administrateur / Direction. Cette page se désactive ensuite.">
      <ActionForm action={installAdmin} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prénom"><Input name="first_name" required /></Field>
          <Field label="Nom"><Input name="last_name" /></Field>
        </div>
        <Field label="Email"><Input name="email" type="email" required /></Field>
        <Field label="Mot de passe" hint="8 caractères minimum"><Input name="password" type="password" minLength={8} required /></Field>
        <SubmitButton className="w-full" size="lg">Créer le compte Direction</SubmitButton>
      </ActionForm>
    </BrandPanel>
  );
}
