import { Lock } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { savePrivate } from "./actions";

export interface EmployeePrivate {
  employee_id: string; cin: string | null; birth_date: string | null; address: string | null; emergency_name: string | null;
  emergency_phone: string | null; contract_type: string | null; contract_end: string | null; cnss_number: string | null; bank_rib: string | null;
}
export const CONTRACTS = ["CDI", "CDD", "ANAPEC", "Stage", "Journalier", "Freelance"];

/** Carte réservée à la Direction : la base refuse ces données à tout autre profil. */
export function PrivateCard({ id, p }: { id: string; p: EmployeePrivate | null }) {
  return (
    <Card>
      <CardHeader icon={<Lock />} tone="clay" title="Données personnelles" subtitle="Visible par la Direction seulement" />
      <CardBody>
        <ActionForm action={savePrivate} className="space-y-4">
          <input type="hidden" name="id" value={id} />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="CIN"><Input name="cin" defaultValue={p?.cin ?? ""} placeholder="BE123456" autoComplete="off" className="uppercase" /></Field>
            <Field label="Date de naissance"><Input name="birth_date" type="date" defaultValue={p?.birth_date ?? ""} /></Field>
            <Field label="Contrat">
              <Select name="contract_type" defaultValue={p?.contract_type ?? ""}><option value="">—</option>{CONTRACTS.map((c) => <option key={c}>{c}</option>)}</Select>
            </Field>
            <Field label="Fin du contrat (si CDD, stage…)"><Input name="contract_end" type="date" defaultValue={p?.contract_end ?? ""} /></Field>
            <Field label="N° CNSS"><Input name="cnss_number" defaultValue={p?.cnss_number ?? ""} inputMode="numeric" autoComplete="off" /></Field>
            <Field label="RIB"><Input name="bank_rib" defaultValue={p?.bank_rib ?? ""} inputMode="numeric" autoComplete="off" /></Field>
            <Field label="Personne à prévenir"><Input name="emergency_name" defaultValue={p?.emergency_name ?? ""} placeholder="Ex. Fatima (mère)" /></Field>
            <Field label="Son téléphone"><Input name="emergency_phone" type="tel" defaultValue={p?.emergency_phone ?? ""} placeholder="06 00 00 00 00" /></Field>
            <Field label="Adresse" className="md:col-span-2"><Textarea name="address" rows={2} defaultValue={p?.address ?? ""} /></Field>
          </div>
          <div className="flex justify-end"><SubmitButton>Enregistrer</SubmitButton></div>
        </ActionForm>
      </CardBody>
    </Card>
  );
}
