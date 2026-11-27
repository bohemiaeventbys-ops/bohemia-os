import { FileText, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { ButtonLink } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Stat } from "@/components/ui/stat";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { diffDays, todayISO } from "@/lib/dates";
import { formatMAD } from "@/lib/format";
import { INVOICE_KIND, INVOICE_STATUS, QUOTE_STATUS, type Client, type Invoice, type Quote } from "@/lib/clients";
import type { EventRow } from "@/lib/types";

export const metadata = { title: "Devis & factures" };

export default async function DocsPage({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const sp = await searchParams;
  await requirePerm("finance.view");
  const supabase = await createClient();
  const vue = sp.vue === "factures" || sp.vue === "encaisser" ? sp.vue : "devis";
  const [{ data: qu }, { data: inv }, { data: cl }, { data: ev }] = await Promise.all([
    supabase.from("quotes").select("*").order("created_at", { ascending: false }).limit(500),
    supabase.from("invoices").select("*").order("created_at", { ascending: false }).limit(500),
    supabase.from("clients").select("id, name"),
    supabase.from("events").select("id, name, event_date"),
  ]);
  const quotes = (qu ?? []) as Quote[];
  const invoices = (inv ?? []) as Invoice[];
  const clients = new Map(((cl ?? []) as Pick<Client, "id" | "name">[]).map((c) => [c.id, c.name]));
  const events = new Map(((ev ?? []) as Pick<EventRow, "id" | "name" | "event_date">[]).map((e) => [e.id, e]));
  const today = todayISO();
  const open = invoices.filter((i) => i.status === "emise" || i.status === "partielle");
  const toCollect = open.reduce((a, i) => a + Number(i.total_mad) - Number(i.paid_mad), 0);
  const pending = quotes.filter((q) => q.status === "envoye");
  const month = today.slice(0, 7);
  const signed = quotes.filter((q) => q.status === "accepte" && (q.decided_at ?? "").slice(0, 7) === month).reduce((a, q) => a + Number(q.total_mad), 0);

  return (
    <>
      <PageHeader title="Devis & factures" subtitle="Confidentiel : visible par la Direction et la commerciale uniquement."
        actions={<><ButtonLink href="/devis/nouveau" size="lg"><Plus className="h-5 w-5" /> Nouveau devis</ButtonLink><ButtonLink href="/factures/nouvelle" size="lg" variant="secondary"><Plus className="h-5 w-5" /> Nouvelle facture</ButtonLink></>} />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Devis en attente de réponse" value={pending.length} tone="mist" icon={<FileText />} />
        <Stat label="Signé ce mois-ci" value={formatMAD(signed)} tone="sage" />
        <Stat label="Reste à encaisser" value={formatMAD(toCollect)} tone={toCollect > 0 ? "clay" : "sage"} />
      </div>
      <Tabs active={vue} items={[
        { key: "devis", label: "Devis", href: "/devis", count: quotes.length },
        { key: "factures", label: "Factures", href: "/devis?vue=factures", count: invoices.length },
        { key: "encaisser", label: "À encaisser", href: "/devis?vue=encaisser", count: open.length },
      ]} />
      {vue === "devis" && (
        <DataTable exportName="devis" empty="Aucun devis. Créez-le depuis un événement ou avec « Nouveau devis »."
          columns={[
            { key: "number", label: "N°", filter: "text" },
            { key: "date", label: "Date", type: "date" },
            { key: "client", label: "Client", filter: "select" },
            { key: "event", label: "Événement", filter: "select" },
            { key: "title", label: "Objet", filter: "text" },
            { key: "ht", label: "HT", type: "money", sum: true },
            { key: "ttc", label: "TTC", type: "money", sum: true },
            { key: "status", label: "Statut", type: "badge", filter: "select" },
          ]}
          rows={quotes.map((q) => ({
            id: q.id, href: `/devis/${q.id}`, view: `/devis/${q.id}/imprimer`,
            cells: { number: q.number, date: q.issue_date, client: q.client_id ? clients.get(q.client_id) : null, event: q.event_id ? events.get(q.event_id)?.name : null,
              title: q.title, ht: Number(q.subtotal_mad), ttc: Number(q.total_mad), status: QUOTE_STATUS[q.status].label },
            tones: { status: QUOTE_STATUS[q.status].tone },
          }))} />
      )}
      {vue !== "devis" && (
        <DataTable exportName={vue === "factures" ? "factures" : "a-encaisser"} empty={vue === "encaisser" ? "Tout est encaissé." : "Aucune facture."}
          columns={[
            { key: "number", label: "N°", filter: "text" },
            { key: "date", label: "Date", type: "date" },
            { key: "client", label: "Client", filter: "select" },
            { key: "event", label: "Événement", filter: "select" },
            { key: "kind", label: "Type", filter: "select" },
            { key: "ht", label: "HT", type: "money", sum: true },
            { key: "ttc", label: "TTC", type: "money", sum: true },
            { key: "rest", label: "Reste", type: "money", sum: true },
            { key: "status", label: "Statut", type: "badge", filter: "select" },
            { key: "due", label: "Échéance", type: "date" },
          ]}
          rows={(vue === "factures" ? invoices : open).map((i) => {
            const late = i.due_date && i.status !== "payee" && i.status !== "annulee" && diffDays(i.due_date, today) < 0;
            return {
              id: i.id, href: `/factures/${i.id}`, view: `/factures/${i.id}`,
              cells: { number: i.number, date: i.issue_date, client: i.client_id ? clients.get(i.client_id) : null, event: i.event_id ? events.get(i.event_id)?.name : null,
                kind: INVOICE_KIND[i.kind], ht: Number(i.subtotal_mad), ttc: Number(i.total_mad),
                rest: i.status === "annulee" ? 0 : Math.max(0, Number(i.total_mad) - Number(i.paid_mad)),
                status: late ? "En retard" : INVOICE_STATUS[i.status].label, due: i.due_date },
              tones: { status: late ? "clay" : INVOICE_STATUS[i.status].tone },
            };
          })} />
      )}
    </>
  );
}
