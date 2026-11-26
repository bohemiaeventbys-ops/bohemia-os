import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Copy, FileSignature, Printer, Receipt, Send, X } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
import { formatMAD } from "@/lib/format";
import { CONTRACT_STATUS, INVOICE_KIND, INVOICE_STATUS, QUOTE_STATUS, type Client, type Contract, type Invoice, type Quote, type QuoteLine } from "@/lib/clients";
import type { EventRow } from "@/lib/types";
import { duplicateQuote, makeContract, makeInvoice, saveQuote, setQuoteStatus } from "../actions";
import { QuoteLines } from "./quote-lines";

export const metadata = { title: "Devis" };

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePerm("finance.view");
  const supabase = await createClient();
  const { data: q } = await supabase.from("quotes").select("*").eq("id", id).maybeSingle<Quote>();
  if (!q) notFound();
  const [{ data: ln }, { data: cl }, { data: ev }, { data: inv }, { data: ct }] = await Promise.all([
    supabase.from("quote_lines").select("*").eq("quote_id", id).order("sort_order"),
    supabase.from("clients").select("id, name, phone, whatsapp").order("name"),
    q.event_id ? supabase.from("events").select("*").eq("id", q.event_id).maybeSingle<EventRow>() : Promise.resolve({ data: null }),
    supabase.from("invoices").select("*").eq("quote_id", id).order("created_at"),
    supabase.from("contracts").select("*").eq("quote_id", id).order("created_at"),
  ]);
  const lines = (ln ?? []) as QuoteLine[];
  const clients = (cl ?? []) as Pick<Client, "id" | "name" | "phone" | "whatsapp">[];
  const event = ev as EventRow | null;
  const invoices = (inv ?? []) as Invoice[];
  const contracts = (ct ?? []) as Contract[];
  const locked = q.status === "accepte" || q.status === "annule";
  const invoiced = invoices.filter((i) => i.status !== "annulee").reduce((a, i) => a + Number(i.subtotal_mad), 0);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow={<Link href="/devis" className="hover:underline">Devis & factures</Link>} title={`Devis ${q.number}`}
        subtitle={<span className="flex flex-wrap items-center gap-2"><Badge tone={QUOTE_STATUS[q.status].tone}>{QUOTE_STATUS[q.status].label}</Badge>
          {event && <Link className="link" href={`/evenements/${event.id}`}>{event.name} · {formatDate(event.event_date)}</Link>}
          <span className="font-semibold tabular-nums">{formatMAD(q.total_mad)} TTC</span></span>}
        actions={<>
          <Link href={`/devis/${id}/imprimer`} className={buttonClass("secondary", "lg")}><Printer className="h-4 w-4" /> PDF / Imprimer</Link>
          <ActionForm action={duplicateQuote}><input type="hidden" name="id" value={id} /><SubmitButton variant="ghost" size="lg"><Copy className="h-4 w-4" /> Dupliquer</SubmitButton></ActionForm>
        </>} />

      {/* Étapes : envoyer → réponse → contrat & factures */}
      <Card className="mb-6">
        <CardBody className="flex flex-wrap items-center gap-3">
          {q.status === "brouillon" && (
            <ActionForm action={setQuoteStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="envoye" />
              <SubmitButton size="lg"><Send className="h-4 w-4" /> Je l&apos;ai envoyé au client</SubmitButton></ActionForm>
          )}
          {(q.status === "brouillon" || q.status === "envoye") && <>
            <ActionForm action={setQuoteStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="accepte" />
              <SubmitButton size="lg" variant="success"><Check className="h-4 w-4" /> Le client accepte</SubmitButton></ActionForm>
            <ActionForm action={setQuoteStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="refuse" />
              <SubmitButton size="lg" variant="danger"><X className="h-4 w-4" /> Refusé</SubmitButton></ActionForm>
          </>}
          {q.status === "accepte" && <>
            <p className="w-full text-sm text-ink-500">Accepté le {formatDate(q.decided_at?.slice(0, 10))}. Le montant est reporté sur l&apos;événement. Étape suivante : le contrat, puis les factures.</p>
            <ActionForm action={makeContract}><input type="hidden" name="quote_id" value={id} />
              <SubmitButton size="lg" variant="secondary"><FileSignature className="h-4 w-4" /> Créer le contrat</SubmitButton></ActionForm>
            <ActionForm action={makeInvoice} className="flex items-center gap-2"><input type="hidden" name="quote_id" value={id} /><input type="hidden" name="kind" value="acompte" />
              <Input name="pct" defaultValue={String(Number(q.deposit_pct))} inputMode="decimal" className="h-14 w-20 text-center" aria-label="Pourcentage d'acompte" />
              <SubmitButton size="lg" variant="secondary"><Receipt className="h-4 w-4" /> Facture d&apos;acompte (%)</SubmitButton></ActionForm>
            <ActionForm action={makeInvoice}><input type="hidden" name="quote_id" value={id} /><input type="hidden" name="kind" value={invoiced > 0 ? "solde" : "totale"} />
              <SubmitButton size="lg" variant="secondary"><Receipt className="h-4 w-4" /> {invoiced > 0 ? "Facture de solde" : "Facture totale"}</SubmitButton></ActionForm>
          </>}
          {(q.status === "refuse" || q.status === "envoye") && (
            <ActionForm action={setQuoteStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="brouillon" />
              <SubmitButton variant="ghost">Remettre en brouillon</SubmitButton></ActionForm>
          )}
        </CardBody>
        {(contracts.length > 0 || invoices.length > 0) && (
          <ul className="divide-y divide-line border-t border-line">
            {contracts.map((c) => (
              <li key={c.id}><Link href={`/contrats/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-sand-50">
                <FileSignature className="h-4 w-4 text-ink-400" /><span className="flex-1 font-medium">Contrat {c.number}</span><Badge tone={CONTRACT_STATUS[c.status].tone}>{CONTRACT_STATUS[c.status].label}</Badge>
              </Link></li>
            ))}
            {invoices.map((i) => (
              <li key={i.id}><Link href={`/factures/${i.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-sand-50">
                <Receipt className="h-4 w-4 text-ink-400" /><span className="flex-1 font-medium">{INVOICE_KIND[i.kind]} {i.number}</span>
                <span className="font-semibold tabular-nums">{formatMAD(i.total_mad)}</span><Badge tone={INVOICE_STATUS[i.status].tone}>{INVOICE_STATUS[i.status].label}</Badge>
              </Link></li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Contenu du devis" subtitle={locked ? "Devis accepté : il n'est plus modifiable (dupliquez-le si besoin)." : "Les prix sont hors taxes ; la TVA et le total se calculent seuls."} />
        <CardBody>
          <ActionForm action={saveQuote} className="space-y-5">
            <input type="hidden" name="id" value={id} />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Titre" className="sm:col-span-2"><Input name="title" defaultValue={q.title} disabled={locked} /></Field>
              <Field label="Valable jusqu'au"><Input name="valid_until" type="date" defaultValue={q.valid_until ?? ""} disabled={locked} /></Field>
              <Field label="Client" className="sm:col-span-3">
                <Select name="client_id" defaultValue={q.client_id ?? ""} disabled={locked}><option value="">—</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
              </Field>
            </div>
            <Field label="Mot d'introduction (facultatif)"><Textarea name="intro" rows={2} defaultValue={q.intro ?? ""} disabled={locked} placeholder="Ex. Suite à notre rendez-vous, voici notre proposition pour votre mariage…" /></Field>
            <QuoteLines initial={lines} vat={Number(q.vat_rate)} discount={Number(q.discount_mad)} deposit={Number(q.deposit_pct)} locked={locked} />
            <Field label="Conditions"><Textarea name="terms" rows={4} defaultValue={q.terms ?? ""} disabled={locked} /></Field>
            {!locked && <SubmitButton size="lg">Enregistrer le devis</SubmitButton>}
          </ActionForm>
        </CardBody>
      </Card>
    </div>
  );
}
