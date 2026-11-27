import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDate, todayISO } from "@/lib/dates";
import type { Company } from "@/lib/clients";
import type { EventRow } from "@/lib/types";
import { createInvoice } from "../../devis/actions";

export const metadata = { title: "Nouvelle facture" };

export default async function NewInvoice({ searchParams }: { searchParams: Promise<{ evenement?: string; client?: string }> }) {
  const sp = await searchParams;
  await requirePerm("finance.view");
  const supabase = await createClient();
  const [{ data: ev }, { data: cl }, { data: co }] = await Promise.all([
    supabase.from("events").select("id, name, event_date").gte("event_date", addDays(todayISO(), -120)).neq("status", "annule").order("event_date").limit(200),
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("company_settings").select("vat_rate").maybeSingle<Pick<Company, "vat_rate">>(),
  ]);
  const events = (ev ?? []) as Pick<EventRow, "id" | "name" | "event_date">[];
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow={<Link href="/devis?vue=factures" className="hover:underline">Devis & factures</Link>} title="Nouvelle facture"
        subtitle="Facture directe, sans devis. Le numéro (FA-…) est donné automatiquement." />
      <Card><CardBody className="py-6">
        <ActionForm action={createInvoice} className="space-y-4">
          <Field label="Événement (facultatif)">
            <Select name="event_id" defaultValue={sp.evenement ?? ""}><option value="">—</option>{events.map((e) => <option key={e.id} value={e.id}>{formatDate(e.event_date)} · {e.name}</option>)}</Select>
          </Field>
          <Field label="Client" hint={<Link className="link" href="/clients/nouveau?retour=/factures/nouvelle">+ Nouveau client</Link>}>
            <Select name="client_id" defaultValue={sp.client ?? ""}><option value="">(celui de l&apos;événement)</option>{(cl ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          </Field>
          <Field label="Objet de la facture"><Input name="label" defaultValue="Décoration événement" required /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Montant HT (DH)"><Input name="amount_ht" inputMode="decimal" placeholder="Ex. 10000" required /></Field>
            <Field label="TVA (%)"><Input name="vat_rate" inputMode="decimal" defaultValue={String(co?.vat_rate ?? 20)} /></Field>
            <Field label="Date"><Input type="date" name="issue_date" defaultValue={todayISO()} /></Field>
          </div>
          <Field label="Note (facultatif)"><Textarea name="notes" rows={2} /></Field>
          <SubmitButton size="lg">Créer la facture</SubmitButton>
        </ActionForm>
      </CardBody></Card>
    </div>
  );
}
