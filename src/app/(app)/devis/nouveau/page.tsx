import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input, Select } from "@/components/ui/field";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDate, todayISO } from "@/lib/dates";
import type { EventRow } from "@/lib/types";
import { createQuote } from "../actions";

export const metadata = { title: "Nouveau devis" };

export default async function NewQuote({ searchParams }: { searchParams: Promise<{ evenement?: string; client?: string }> }) {
  const sp = await searchParams;
  await requirePerm("finance.view");
  const supabase = await createClient();
  const [{ data: ev }, { data: cl }] = await Promise.all([
    supabase.from("events").select("id, name, event_date, client_id").gte("event_date", addDays(todayISO(), -30)).neq("status", "annule").order("event_date").limit(100),
    supabase.from("clients").select("id, name").order("name"),
  ]);
  const events = (ev ?? []) as Pick<EventRow, "id" | "name" | "event_date" | "client_id">[];
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow={<Link href="/devis" className="hover:underline">Devis & factures</Link>} title="Nouveau devis" subtitle="Choisissez l'événement : le client et le titre sont repris automatiquement. Vous pouvez aussi joindre un devis déjà fait." />
      <Card><CardBody className="py-6">
        <ActionForm action={createQuote} className="space-y-4">
          <Field label="Pour quel événement ?">
            <Select name="event_id" defaultValue={sp.evenement ?? ""}><option value="">Pas encore d&apos;événement (demande de prix)</option>{events.map((e) => <option key={e.id} value={e.id}>{formatDate(e.event_date)} · {e.name}</option>)}</Select>
          </Field>
          <Field label="Client (si pas d'événement)" hint={<Link className="link" href="/clients/nouveau?retour=/devis/nouveau">+ Nouveau client</Link>}>
            <Select name="client_id" defaultValue={sp.client ?? ""}><option value="">—</option>{(cl ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          </Field>
          <Field label="Titre (facultatif)"><Input name="title" placeholder="Ex. Décoration mariage, Anniversaire 1 an" /></Field>
          <div className="rounded-xl border border-dashed border-line bg-sand-50 p-4">
            <p className="mb-3 text-sm font-medium">Devis déjà fait ailleurs ? (facultatif)</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Fichier du devis (PDF ou photo)"><Input type="file" name="file" accept="application/pdf,image/*" /></Field>
              <Field label="Montant HT (DH)"><Input name="amount_ht" inputMode="decimal" placeholder="Ex. 12000" /></Field>
            </div>
          </div>
          <SubmitButton size="lg">Créer le devis</SubmitButton>
        </ActionForm>
      </CardBody></Card>
    </div>
  );
}
