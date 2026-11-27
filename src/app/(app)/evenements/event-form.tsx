import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { fullName } from "@/lib/format";
import { toLocalISODate, toLocalTime } from "@/lib/dates";
import { EVENT_STATUS, EVENT_TYPE } from "@/lib/labels";
import type { Employee, EventRow } from "@/lib/types";

function t(v: string | null | undefined) {
  return v ? toLocalTime(v) : "";
}
function d(v: string | null | undefined, fallback?: string) {
  return v ? toLocalISODate(v) : fallback ?? "";
}

export function EventFields({ e, employees, clients = [], clientId }: { e?: EventRow; employees: Employee[]; clients?: { id: string; name: string; phone: string | null }[]; clientId?: string }) {
  const moments: [string, string, string | null | undefined][] = [
    ["load", "Chargement au dépôt", e?.load_at], ["delivery", "Livraison", e?.delivery_at], ["setup", "Installation", e?.setup_at], ["start", "Début", e?.start_at],
    ["end", "Fin", e?.end_at], ["teardown", "Démontage", e?.teardown_at],
  ];
  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <Field label="Nom de l'événement" className="md:col-span-2"><Input name="name" defaultValue={e?.name} required placeholder="Ex. Mariage Salma & Youssef" /></Field>
        <Field label="Type"><Select name="event_type" defaultValue={e?.event_type ?? "mariage"}>{Object.entries(EVENT_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Client (fiche existante)">
          <Select name="client_id" defaultValue={clientId ?? e?.client_id ?? ""}>
            <option value="">Nouveau client : remplir à droite</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>)}
          </Select>
        </Field>
        <Field label="Ou nom du nouveau client" hint="Une fiche client est créée automatiquement"><Input name="client_name" defaultValue={e?.client_id ? "" : e?.client_name ?? ""} placeholder="Ex. Famille Alaoui" /></Field>
        <Field label="Téléphone du nouveau client"><Input name="client_phone" type="tel" defaultValue={e?.client_id ? "" : e?.client_phone ?? ""} /></Field>
        <Field label="Statut"><Select name="status" defaultValue={e?.status ?? "confirme"}>{Object.entries(EVENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        <Field label="Date"><Input type="date" name="event_date" defaultValue={e?.event_date} required /></Field>
        <Field label="Adresse / lieu" className="md:col-span-2"><Input name="address" defaultValue={e?.address ?? ""} /></Field>
        <Field label="Responsable"><Select name="manager_id" defaultValue={e?.manager_id ?? ""}><option value="">—</option>{employees.map((x) => <option key={x.id} value={x.id}>{fullName(x)}</option>)}</Select></Field>
      </section>
      <section>
        <p className="label">Horaires (heure de Casablanca)</p>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          {moments.map(([k, label, v]) => (
            <div key={k} className="rounded-xl border border-line bg-sand-50 p-3">
              <p className="mb-2 text-xs font-medium text-ink-500">{label}</p>
              <label className="block text-[11px] text-ink-500">Jour (vide = jour de l&apos;événement)
                <Input type="date" name={`${k}_date`} defaultValue={d(v, e?.event_date)} className="mb-2 mt-0.5 h-10 py-1 text-sm" />
              </label>
              <label className="block text-[11px] text-ink-500">Heure
                <Input type="time" name={k} defaultValue={t(v)} className="mt-0.5 h-10 py-1 text-sm" />
              </label>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-400">Laissez la date vide pour utiliser la date de l&apos;événement (utile pour une livraison la veille, ou un démontage le lendemain, indiquez la date).</p>
      </section>
      <section className="rounded-2xl border border-teal-200 bg-teal-50/40 p-4">
        <p className="label">Pour l&apos;équipe terrain (chauffeur, installation)</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Contact sur place"><Input name="site_contact_name" defaultValue={e?.site_contact_name ?? ""} placeholder="Ex. M. Bennani, wedding planner" /></Field>
          <Field label="Téléphone du contact sur place"><Input name="site_contact_phone" type="tel" defaultValue={e?.site_contact_phone ?? ""} /></Field>
          <Field label="Consignes d'accès" className="md:col-span-2"><Textarea name="access_notes" defaultValue={e?.access_notes ?? ""} rows={2} placeholder="Ex. Entrée camion par la rue arrière, 2e étage sans ascenseur, prise électrique côté jardin" /></Field>
        </div>
      </section>
      <Field label="Notes"><Textarea name="notes" defaultValue={e?.notes ?? ""} rows={4} /></Field>
    </div>
  );
}
