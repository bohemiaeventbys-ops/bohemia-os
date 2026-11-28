import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Stat } from "@/components/ui/stat";
import { DataTable } from "@/components/ui/data-table";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import { formatMAD } from "@/lib/format";
import { INVOICE_KIND, type Client, type Invoice } from "@/lib/clients";
import { vatOf, type Expense, type Supplier } from "@/lib/suppliers";

export const metadata = { title: "TVA" };

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** Période : mois (2026-11), trimestre (2026-T4) ou année (2026). */
function range(p: string) {
  const y = Number(p.slice(0, 4));
  if (/^\d{4}-\d{2}$/.test(p)) {
    const m = Number(p.slice(5, 7));
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    return { from: `${p}-01`, to: end, label: `${MONTHS[m - 1]} ${y}` };
  }
  if (/^\d{4}-T[1-4]$/.test(p)) {
    const q = Number(p.slice(6));
    const m1 = (q - 1) * 3 + 1;
    return { from: `${y}-${String(m1).padStart(2, "0")}-01`, to: new Date(Date.UTC(y, m1 + 2, 0)).toISOString().slice(0, 10), label: `${q}e trimestre ${y}` };
  }
  return { from: `${y}-01-01`, to: `${y}-12-31`, label: `année ${y}` };
}

export default async function VatPage({ searchParams }: { searchParams: Promise<{ periode?: string }> }) {
  const sp = await searchParams;
  await requirePerm("finance.view");
  const today = todayISO();
  const p = sp.periode && /^\d{4}(-\d{2}|-T[1-4])?$/.test(sp.periode) ? sp.periode : today.slice(0, 7);
  const { from, to, label } = range(p);
  const supabase = await createClient();
  const [{ data: inv }, { data: exp }, { data: cl }, { data: su }] = await Promise.all([
    supabase.from("invoices").select("*").neq("status", "annulee").gte("issue_date", from).lte("issue_date", to).order("issue_date").order("number"),
    supabase.from("expenses").select("*").gte("invoice_date", from).lte("invoice_date", to).order("invoice_date"),
    supabase.from("clients").select("id, name"),
    supabase.from("suppliers").select("id, name"),
  ]);
  const invoices = (inv ?? []) as Invoice[];
  const expenses = (exp ?? []) as Expense[];
  const clients = new Map(((cl ?? []) as Pick<Client, "id" | "name">[]).map((c) => [c.id, c.name]));
  const suppliers = new Map(((su ?? []) as Pick<Supplier, "id" | "name">[]).map((c) => [c.id, c.name]));
  const collected = invoices.reduce((a, i) => a + Number(i.vat_mad), 0);
  const deductible = expenses.reduce((a, e) => a + vatOf(Number(e.amount_mad), Number(e.vat_rate ?? 0)), 0);
  const y = Number(p.slice(0, 4));
  const m = today.slice(0, 7);
  const periods = [
    ...Array.from({ length: 6 }, (_, k) => { const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 - k, 1)); const v = d.toISOString().slice(0, 7); return { v, l: `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` }; }),
    ...[1, 2, 3, 4].map((q) => ({ v: `${y}-T${q}`, l: `T${q} ${y}` })),
    { v: String(y), l: `Année ${y}` },
  ];

  return (
    <>
      <PageHeader title="TVA" subtitle={`TVA collectée sur nos factures et TVA payée aux fournisseurs : ${label}. À vérifier avec le comptable.`} />
      <div className="mb-4 flex flex-wrap gap-2">
        {periods.map((x) => <Link key={x.v} href={`/tva?periode=${x.v}`} className={`rounded-full px-3.5 py-1.5 text-sm ring-1 ${x.v === p ? "bg-ink text-ivory ring-ink" : "bg-paper ring-line"}`}>{x.l}</Link>)}
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="TVA collectée (ventes)" value={formatMAD(collected)} tone="mist" />
        <Stat label="TVA payée (achats)" value={formatMAD(deductible)} tone="ochre" />
        <Stat label={collected - deductible >= 0 ? "TVA à reverser (estimation)" : "Crédit de TVA (estimation)"} value={formatMAD(Math.abs(collected - deductible))} tone={collected - deductible > 0 ? "clay" : "sage"} />
      </div>
      <h2 className="mb-2 font-display text-xl font-semibold">Factures de vente</h2>
      <div className="mb-8">
        <DataTable exportName={`ventes-${p}`} empty="Aucune facture sur la période."
          columns={[
            { key: "date", label: "Date", type: "date" }, { key: "number", label: "N° facture", filter: "text" },
            { key: "client", label: "Client", filter: "select" }, { key: "kind", label: "Type", filter: "select" },
            { key: "ht", label: "HT", type: "money", sum: true }, { key: "tva", label: "TVA", type: "money", sum: true }, { key: "ttc", label: "TTC", type: "money", sum: true },
          ]}
          rows={invoices.map((i) => ({ id: i.id, href: `/factures/${i.id}`, view: `/factures/${i.id}`,
            cells: { date: i.issue_date, number: i.number, client: i.client_id ? clients.get(i.client_id) : null, kind: INVOICE_KIND[i.kind], ht: Number(i.subtotal_mad), tva: Number(i.vat_mad), ttc: Number(i.total_mad) } }))} />
      </div>
      <h2 className="mb-2 font-display text-xl font-semibold">Factures d&apos;achat</h2>
      <DataTable exportName={`achats-${p}`} empty="Aucune facture fournisseur datée sur la période (saisissez-les sur la fiche du fournisseur)."
        columns={[
          { key: "date", label: "Date", type: "date" }, { key: "number", label: "N° facture", filter: "text" },
          { key: "supplier", label: "Fournisseur", filter: "select" }, { key: "label", label: "Objet", filter: "text" },
          { key: "ht", label: "HT", type: "money", sum: true }, { key: "tva", label: "TVA", type: "money", sum: true }, { key: "ttc", label: "TTC", type: "money", sum: true },
        ]}
        rows={expenses.map((e) => { const ttc = Number(e.amount_mad), tva = vatOf(ttc, Number(e.vat_rate ?? 0)); return { id: e.id, href: e.supplier_id ? `/fournisseurs/${e.supplier_id}` : undefined,
          cells: { date: e.invoice_date, number: e.invoice_number, supplier: e.supplier_id ? suppliers.get(e.supplier_id) : null, label: e.label, ht: ttc - tva, tva, ttc } }; })} />
    </>
  );
}
