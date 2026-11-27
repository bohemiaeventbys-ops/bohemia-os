import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Stat } from "@/components/ui/stat";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { diffDays, formatDate, todayISO } from "@/lib/dates";
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
  const who = (c: string | null, e: string | null) => [c ? clients.get(c) : null, e ? events.get(e)?.name : null].filter(Boolean).join(" · ");

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
      {vue === "devis" && (quotes.length === 0 ? <Card><Empty title="Aucun devis.">Créez-le depuis un événement ou avec « Nouveau devis ».</Empty></Card> : (
        <Card><ul className="divide-y divide-line">
          {quotes.map((q) => (
            <li key={q.id}><Link href={`/devis/${q.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3.5 hover:bg-sand-50">
              <span className="min-w-0 flex-1"><span className="block font-semibold">{q.number} · {q.title}</span><span className="block text-sm text-ink-500">{who(q.client_id, q.event_id) || "—"} · {formatDate(q.issue_date)}</span></span>
              <span className="font-semibold tabular-nums">{formatMAD(q.total_mad)}</span>
              <Badge tone={QUOTE_STATUS[q.status].tone}>{QUOTE_STATUS[q.status].label}</Badge>
            </Link></li>
          ))}
        </ul></Card>
      ))}
      {vue !== "devis" && ((vue === "factures" ? invoices : open).length === 0 ? <Card><Empty title={vue === "encaisser" ? "Tout est encaissé." : "Aucune facture."}>Les factures se créent depuis un devis accepté.</Empty></Card> : (
        <Card><ul className="divide-y divide-line">
          {(vue === "factures" ? invoices : open).map((i) => {
            const late = i.due_date && i.status !== "payee" && i.status !== "annulee" && diffDays(i.due_date, today) < 0;
            return (
              <li key={i.id}><Link href={`/factures/${i.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3.5 hover:bg-sand-50">
                <span className="min-w-0 flex-1"><span className="block font-semibold">{i.number} · {INVOICE_KIND[i.kind]}</span><span className="block text-sm text-ink-500">{who(i.client_id, i.event_id) || "—"} · {formatDate(i.issue_date)}{late ? <b className="text-clay-700"> · échue le {formatDate(i.due_date)}</b> : ""}</span></span>
                <span className="text-right tabular-nums"><span className="block font-semibold">{formatMAD(i.total_mad)}</span>{i.status === "partielle" && <span className="block text-xs text-ink-500">reste {formatMAD(Number(i.total_mad) - Number(i.paid_mad))}</span>}</span>
                <Badge tone={INVOICE_STATUS[i.status].tone}>{INVOICE_STATUS[i.status].label}</Badge>
              </Link></li>
            );
          })}
        </ul></Card>
      ))}
    </>
  );
}
