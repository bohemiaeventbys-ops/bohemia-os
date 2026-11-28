import { ActionForm, FormReset, SubmitButton } from "@/components/ui/action-form";
import { Field, Input, Textarea } from "@/components/ui/field";
import { SUPPLIER_CATEGORIES, SUPPLIER_KIND, type Supplier } from "@/lib/suppliers";
import { saveSupplier } from "./actions";

const chip = "cursor-pointer rounded-full bg-paper px-3.5 py-2 text-sm ring-1 ring-line has-[:checked]:bg-ink has-[:checked]:text-ivory has-[:checked]:ring-ink";

export function SupplierForm({ s }: { s?: Supplier }) {
  const extra = (s?.categories ?? []).filter((c) => !SUPPLIER_CATEGORIES.includes(c));
  return (
    <ActionForm action={saveSupplier} className="space-y-5">
      {s && <input type="hidden" name="id" value={s.id} />}
      <fieldset>
        <legend className="label">C&apos;est un…</legend>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(SUPPLIER_KIND).map(([k, v]) => (
            <label key={k} className="cursor-pointer rounded-xl bg-paper px-3 py-3 text-center text-sm font-semibold ring-1 ring-line has-[:checked]:bg-rose-500 has-[:checked]:text-white has-[:checked]:ring-rose-500">
              <input type="radio" name="kind" value={k} defaultChecked={(s?.kind ?? "fournisseur") === k} className="sr-only" />{v.label}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-ink-400">Fournisseur : on lui achète (bois, vinyle, fleurs…). Prestataire : il vient travailler sur l&apos;événement (moquette, animation…). Sous-traitant : il fabrique pour nous (impression…).</p>
      </fieldset>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nom"><Input name="name" required defaultValue={s?.name} placeholder="Ex. Mouna Animation" /></Field>
        <Field label="Personne à contacter"><Input name="contact_name" defaultValue={s?.contact_name ?? ""} /></Field>
        <Field label="Téléphone"><Input name="phone" type="tel" defaultValue={s?.phone ?? ""} placeholder="06 00 00 00 00" /></Field>
        <Field label="WhatsApp" hint="Vide : même numéro que le téléphone"><Input name="whatsapp" type="tel" defaultValue={s?.whatsapp ?? ""} /></Field>
        <Field label="Email"><Input name="email" type="email" defaultValue={s?.email ?? ""} /></Field>
        <Field label="Adresse"><Input name="address" defaultValue={s?.address ?? ""} placeholder="Ex. Derb Omar, Casablanca" /></Field>
      </div>
      <fieldset>
        <legend className="label">Ce qu&apos;il fait</legend>
        <div className="flex flex-wrap gap-2">
          {SUPPLIER_CATEGORIES.map((c) => (
            <label key={c} className={chip}><input type="checkbox" name="categories" value={c} defaultChecked={s?.categories.includes(c)} className="sr-only" />{c}</label>
          ))}
        </div>
        <Input name="categories_extra" defaultValue={extra.join(", ")} placeholder="Autre (séparer par des virgules)" className="mt-2" />
      </fieldset>
      <fieldset>
        <legend className="label">Votre avis</legend>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer rounded-xl bg-paper px-4 py-2 text-lg ring-1 ring-line has-[:checked]:bg-ochre-400 has-[:checked]:text-white has-[:checked]:ring-ochre-400">
              <input type="radio" name="rating" value={n} defaultChecked={s?.rating === n} className="sr-only" />{"★".repeat(n)}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Notes (tarifs, délais, conditions…)"><Textarea name="notes" defaultValue={s?.notes ?? ""} /></Field>
      {s && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="archived" defaultChecked={!s.is_active} className="h-5 w-5 accent-ink" /> Ne plus travailler avec lui (archiver)</label>}
      <div className="flex flex-wrap gap-2"><SubmitButton size="lg">{s ? "Enregistrer" : "Ajouter"}</SubmitButton><FormReset mode={s ? "edit" : "new"} /></div>
    </ActionForm>
  );
}
