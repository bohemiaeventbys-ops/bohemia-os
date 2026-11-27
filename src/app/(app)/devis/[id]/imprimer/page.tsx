import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
import { money2, type Client, type Company, type Quote, type QuoteLine } from "@/lib/clients";
import type { EventRow } from "@/lib/types";
import { ClientBlock, DocFooter, DocHeader, DocShell, LinesTable, Totals } from "../../doc";

export const metadata = { title: "Devis" };

export default async function PrintQuote({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePerm("finance.view");
  const supabase = await createClient();
  const { data: q } = await supabase.from("quotes").select("*").eq("id", id).maybeSingle<Quote>();
  if (!q) notFound();
  const [{ data: ln }, { data: company }, { data: client }, { data: event }] = await Promise.all([
    supabase.from("quote_lines").select("*").eq("quote_id", id).order("sort_order"),
    supabase.from("company_settings").select("*").single<Company>(),
    q.client_id ? supabase.from("clients").select("*").eq("id", q.client_id).maybeSingle<Client>() : Promise.resolve({ data: null }),
    q.event_id ? supabase.from("events").select("*").eq("id", q.event_id).maybeSingle<EventRow>() : Promise.resolve({ data: null }),
  ]);
  const lines = (ln ?? []) as QuoteLine[];
  const gross = lines.reduce((a, l) => a + Number(l.qty) * Number(l.unit_price), 0);
  const deposit = Math.round(Number(q.total_mad) * Number(q.deposit_pct)) / 100;

  return (
    <div>
      <div className="mx-auto mb-4 flex max-w-4xl items-center justify-between print:hidden">
        <Link href={`/devis/${id}`} className="link text-sm">← Retour au devis</Link>
        <PrintButton />
      </div>
      <DocShell>
        <DocHeader company={company} kind="Devis" number={q.number} date={q.issue_date}
          extra={q.valid_until && <p className="text-xs text-ink-400">Valable jusqu&apos;au {formatDate(q.valid_until)}</p>} />
        <ClientBlock client={client} event={event} />
        <section>
          <p className="mb-2 text-lg font-semibold">{q.title}</p>
          {q.intro && <p className="mb-4 whitespace-pre-line text-ink-600">{q.intro}</p>}
          <LinesTable lines={lines} />
        </section>
        <Totals rows={[
          ...(Number(q.discount_mad) > 0 ? [["Sous-total HT", gross], ["Remise", -Number(q.discount_mad)]] as [string, number][] : []),
          ...(Number(q.vat_rate) > 0
            ? [["Total HT", Number(q.subtotal_mad)], [`TVA ${Number(q.vat_rate)} %`, Number(q.vat_mad)], ["Total TTC", Number(q.total_mad), true]] as [string, number, boolean?][]
            : [["Total", Number(q.total_mad), true]] as [string, number, boolean?][]),
        ]} />
        <section className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Conditions</p>
            <p className="font-medium">Acompte à la commande : {Number(q.deposit_pct)} % soit {money2(deposit)}</p>
            {q.terms && <p className="mt-1 whitespace-pre-line text-ink-600">{q.terms}</p>}
          </div>
          <div className="rounded-xl border border-dashed border-line p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Bon pour accord</p>
            <p className="text-xs text-ink-400">Date, signature et mention « lu et approuvé »</p>
            <div className="h-20" />
          </div>
        </section>
        <DocFooter company={company} />
      </DocShell>
    </div>
  );
}
