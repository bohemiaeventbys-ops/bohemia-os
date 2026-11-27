import Link from "next/link";
import { notFound } from "next/navigation";
import { Banknote, Trash2 } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input, Select } from "@/components/ui/field";
import { PrintButton } from "@/components/print-button";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, todayISO } from "@/lib/dates";
import { INVOICE_KIND, INVOICE_STATUS, PAY_METHODS, money2, type Client, type Company, type Invoice, type InvoiceLine, type Payment, type Quote } from "@/lib/clients";
import type { EventRow } from "@/lib/types";
import { addPayment, cancelInvoice, deletePayment } from "../../devis/actions";
import { ClientBlock, DocFooter, DocHeader, DocShell, LinesTable, Totals } from "../../devis/doc";

export const metadata = { title: "Facture" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePerm("finance.view");
  const supabase = await createClient();
  const { data: i } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle<Invoice>();
  if (!i) notFound();
  const [{ data: ln }, { data: pay }, { data: company }, { data: client }, { data: event }, { data: quote }] = await Promise.all([
    supabase.from("invoice_lines").select("*").eq("invoice_id", id).order("sort_order"),
    supabase.from("payments").select("*").eq("invoice_id", id).order("paid_on"),
    supabase.from("company_settings").select("*").single<Company>(),
    i.client_id ? supabase.from("clients").select("*").eq("id", i.client_id).maybeSingle<Client>() : Promise.resolve({ data: null }),
    i.event_id ? supabase.from("events").select("*").eq("id", i.event_id).maybeSingle<EventRow>() : Promise.resolve({ data: null }),
    i.quote_id ? supabase.from("quotes").select("id, number").eq("id", i.quote_id).maybeSingle<Pick<Quote, "id" | "number">>() : Promise.resolve({ data: null }),
  ]);
  const lines = (ln ?? []) as InvoiceLine[];
  const payments = (pay ?? []) as Payment[];
  const rest = Math.max(Number(i.total_mad) - Number(i.paid_mad), 0);

  return (
    <div className="space-y-6">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 print:hidden">
        <span className="flex items-center gap-3 text-sm">
          <Link href={quote ? `/devis/${quote.id}` : "/devis?vue=factures"} className="link">← {quote ? `Devis ${quote.number}` : "Factures"}</Link>
          <Badge tone={INVOICE_STATUS[i.status].tone}>{INVOICE_STATUS[i.status].label}</Badge>
        </span>
        <PrintButton />
      </div>

      {i.status !== "annulee" && (
        <Card className="mx-auto max-w-4xl border-sage-200 print:hidden">
          <CardHeader icon={<Banknote />} tone="sage" title={rest > 0 ? `Reste à encaisser : ${money2(rest)}` : "Facture entièrement payée"} subtitle="Chaque paiement met à jour la facture et le « déjà payé » de l'événement." />
          {payments.length > 0 && (
            <ul className="divide-y divide-line">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <span className="flex-1">{formatDate(p.paid_on)} · {p.method}{p.reference ? ` · ${p.reference}` : ""}</span>
                  <b className="tabular-nums">{money2(p.amount_mad)}</b>
                  <ActionForm action={deletePayment}><input type="hidden" name="id" value={p.id} /><button className="rounded p-1 text-ink-300 hover:text-clay-700" aria-label="Supprimer"><Trash2 className="h-4 w-4" /></button></ActionForm>
                </li>
              ))}
            </ul>
          )}
          {rest > 0 && (
            <CardBody className="border-t border-line">
              <ActionForm action={addPayment} resetOnSuccess className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] sm:items-end">
                <input type="hidden" name="invoice_id" value={i.id} />
                <Field label="Montant reçu (DH)"><Input name="amount_mad" inputMode="decimal" defaultValue={String(rest)} required /></Field>
                <Field label="Le"><Input name="paid_on" type="date" defaultValue={todayISO()} /></Field>
                <Field label="Par"><Select name="method" defaultValue="Virement">{PAY_METHODS.map((m) => <option key={m}>{m}</option>)}</Select></Field>
                <Field label="Réf. (chèque, virement)"><Input name="reference" /></Field>
                <SubmitButton variant="success">Encaisser</SubmitButton>
              </ActionForm>
            </CardBody>
          )}
        </Card>
      )}

      <DocShell>
        <DocHeader company={company} kind={INVOICE_KIND[i.kind]} number={i.number} date={i.issue_date}
          extra={<>{quote && <p className="text-xs text-ink-400">Selon devis {quote.number}</p>}{i.due_date && <p className="text-xs text-ink-400">À régler avant le {formatDate(i.due_date)}</p>}</>} />
        {i.status === "annulee" && <p className="rounded-lg bg-clay-50 p-3 text-center font-bold uppercase tracking-widest text-clay-700">Facture annulée</p>}
        <ClientBlock client={client} event={event} />
        <LinesTable lines={lines} />
        <Totals rows={[
          ...(Number(i.vat_rate) > 0
            ? [["Total HT", Number(i.subtotal_mad)], [`TVA ${Number(i.vat_rate)} %`, Number(i.vat_mad)], ["Total TTC", Number(i.total_mad), true]] as [string, number, boolean?][]
            : [["Total", Number(i.total_mad), true]] as [string, number, boolean?][]),
          ...(Number(i.paid_mad) > 0 ? [["Déjà réglé", Number(i.paid_mad)], ["Reste à payer", rest, true]] as [string, number, boolean?][] : []),
        ]} />
        {company?.rib && <p className="text-ink-600">Règlement par virement : {company.bank_name ? `${company.bank_name}, ` : ""}RIB {company.rib}</p>}
        <DocFooter company={company} signature />
      </DocShell>

      {i.status !== "annulee" && Number(i.paid_mad) === 0 && (
        <div className="mx-auto max-w-4xl print:hidden">
          <ActionForm action={cancelInvoice}><input type="hidden" name="id" value={i.id} /><SubmitButton variant="ghost" size="sm">Annuler cette facture</SubmitButton></ActionForm>
        </div>
      )}
    </div>
  );
}
