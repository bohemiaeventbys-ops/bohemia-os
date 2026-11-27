import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input, Textarea } from "@/components/ui/field";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Company } from "@/lib/clients";
import { saveCompany } from "./actions";

export default async function CompanySettings() {
  await requirePerm("settings.manage");
  const supabase = await createClient();
  const { data } = await supabase.from("company_settings").select("*").single();
  const c = data as (Company & { timezone: string; currency: string; overdue_notify_management: boolean }) | null;
  return (
    <ActionForm action={saveCompany} className="max-w-3xl space-y-6">
      <Card>
        <CardHeader title="Entreprise" subtitle="Fuseau horaire Africa/Casablanca et devise MAD (DH) appliqués à toute la plateforme." />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nom affiché"><Input name="company_name" defaultValue={c?.company_name} /></Field>
            <Field label="Raison sociale (sur les documents)"><Input name="legal_name" defaultValue={c?.legal_name} /></Field>
            <Field label="Téléphone"><Input name="phone" defaultValue={c?.phone ?? ""} /></Field>
            <Field label="Email"><Input name="email" type="email" defaultValue={c?.email ?? ""} /></Field>
            <Field label="Adresse" className="sm:col-span-2"><Textarea name="address" rows={2} defaultValue={c?.address ?? ""} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="overdue_notify_management" defaultChecked={c?.overdue_notify_management} className="h-4 w-4 accent-ink" /> Informer la direction et les responsables des tâches en retard</label>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Mentions légales et banque" subtitle="Imprimées en bas des devis, factures et contrats." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="ICE"><Input name="ice" defaultValue={c?.ice ?? ""} inputMode="numeric" /></Field>
          <Field label="RC"><Input name="rc" defaultValue={c?.rc ?? ""} /></Field>
          <Field label="IF"><Input name="if_number" defaultValue={c?.if_number ?? ""} /></Field>
          <Field label="Patente"><Input name="patente" defaultValue={c?.patente ?? ""} /></Field>
          <Field label="Banque"><Input name="bank_name" defaultValue={c?.bank_name ?? ""} /></Field>
          <Field label="RIB (24 chiffres)"><Input name="rib" defaultValue={c?.rib ?? ""} inputMode="numeric" /></Field>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Devis et contrats" subtitle="Valeurs proposées à chaque nouveau devis (modifiables devis par devis)." />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="TVA (%)"><Input name="vat_rate" inputMode="decimal" defaultValue={String(c?.vat_rate ?? 20)} /></Field>
            <Field label="Acompte (%)"><Input name="deposit_pct" inputMode="decimal" defaultValue={String(c?.deposit_pct ?? 50)} /></Field>
            <Field label="Devis valable (jours)"><Input name="quote_validity_days" inputMode="numeric" defaultValue={String(c?.quote_validity_days ?? 15)} /></Field>
          </div>
          <Field label="Conditions du devis"><Textarea name="quote_terms" rows={4} defaultValue={c?.quote_terms ?? ""} /></Field>
          <Field label="Modèle de contrat" hint="Les mots entre {{ }} sont remplis automatiquement : {{devis}}, {{total}}, {{acompte}}, {{installation}}, {{demontage}}.">
            <Textarea name="contract_terms" rows={14} defaultValue={c?.contract_terms ?? ""} className="font-mono text-xs" />
          </Field>
        </CardBody>
      </Card>
      <SubmitButton size="lg">Enregistrer</SubmitButton>
    </ActionForm>
  );
}
