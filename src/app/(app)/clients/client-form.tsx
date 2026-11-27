import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { Client } from "@/lib/clients";
import { saveClient } from "./actions";

export const SOURCES = ["Instagram", "Bouche-à-oreille", "Site internet", "Ancien client", "Salon", "Autre"];

export function ClientForm({ c, back }: { c?: Client; back?: string }) {
  return (
    <ActionForm action={saveClient} className="space-y-5">
      {c && <input type="hidden" name="id" value={c.id} />}
      {back && <input type="hidden" name="back" value={back} />}
      <div className="grid grid-cols-2 gap-2">
        {(["particulier", "entreprise"] as const).map((k) => (
          <label key={k} className="cursor-pointer rounded-xl bg-white px-3 py-3 text-center text-sm font-semibold ring-1 ring-line has-[:checked]:bg-rose-500 has-[:checked]:text-white has-[:checked]:ring-rose-500">
            <input type="radio" name="kind" value={k} defaultChecked={(c?.kind ?? "particulier") === k} className="sr-only" />{k === "particulier" ? "Particulier" : "Entreprise"}
          </label>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nom (ou société)"><Input name="name" required defaultValue={c?.name} placeholder="Ex. Famille Alaoui, Société X" className="h-12 text-base" /></Field>
        <Field label="Personne à contacter"><Input name="contact_name" defaultValue={c?.contact_name ?? ""} placeholder="Ex. Mme Salma Alaoui" /></Field>
        <Field label="Téléphone"><Input name="phone" type="tel" defaultValue={c?.phone ?? ""} placeholder="06 00 00 00 00" /></Field>
        <Field label="WhatsApp" hint="Vide : même numéro"><Input name="whatsapp" type="tel" defaultValue={c?.whatsapp ?? ""} /></Field>
        <Field label="Email"><Input name="email" type="email" defaultValue={c?.email ?? ""} /></Field>
        <Field label="Comment nous a-t-il connus ?">
          <Select name="source" defaultValue={c?.source ?? ""}><option value="">—</option>{SOURCES.map((x) => <option key={x}>{x}</option>)}</Select>
        </Field>
        <Field label="Adresse"><Input name="address" defaultValue={c?.address ?? ""} /></Field>
        <Field label="Ville"><Input name="city" defaultValue={c?.city ?? "Casablanca"} /></Field>
        <Field label="ICE (entreprise, pour la facture)"><Input name="ice" defaultValue={c?.ice ?? ""} inputMode="numeric" /></Field>
      </div>
      <Field label="Notes (goûts, allergies, budget annoncé…)"><Textarea name="notes" defaultValue={c?.notes ?? ""} /></Field>
      <SubmitButton size="lg">{c ? "Enregistrer" : "Ajouter le client"}</SubmitButton>
    </ActionForm>
  );
}
