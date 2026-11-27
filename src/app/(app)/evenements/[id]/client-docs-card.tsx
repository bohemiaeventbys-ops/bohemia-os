import Link from "next/link";
import { Palette, Plus, Receipt, ScrollText, UserRound } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import type { Session } from "@/lib/auth";
import { formatMAD } from "@/lib/format";
import { INVOICE_KIND, INVOICE_STATUS, PROOF_STATUS, QUOTE_STATUS, type DesignProof, type Invoice, type Quote } from "@/lib/clients";

export async function ClientDocsCard({ eventId, clientId, s }: { eventId: string; clientId: string | null; s: Session }) {
  const supabase = await createClient();
  const money = s.can("finance.view");
  const [{ data: client }, { data: proofs }, quotesRes, invoicesRes] = await Promise.all([
    clientId ? supabase.from("clients").select("id, name, phone").eq("id", clientId).maybeSingle<{ id: string; name: string; phone: string | null }>() : Promise.resolve({ data: null }),
    supabase.from("design_proofs").select("id, title, version, status").eq("event_id", eventId).neq("status", "annule").order("created_at", { ascending: false }).returns<Pick<DesignProof, "id" | "title" | "version" | "status">[]>(),
    money ? supabase.from("quotes").select("id, number, title, status, total_mad").eq("event_id", eventId).order("created_at", { ascending: false }).returns<Pick<Quote, "id" | "number" | "title" | "status" | "total_mad">[]>() : Promise.resolve({ data: [] as Pick<Quote, "id" | "number" | "title" | "status" | "total_mad">[] }),
    money ? supabase.from("invoices").select("id, number, kind, status, total_mad, paid_mad").eq("event_id", eventId).order("created_at", { ascending: false }).returns<Pick<Invoice, "id" | "number" | "kind" | "status" | "total_mad" | "paid_mad">[]>() : Promise.resolve({ data: [] as Pick<Invoice, "id" | "number" | "kind" | "status" | "total_mad" | "paid_mad">[] }),
  ]);
  const quotes = quotesRes.data ?? [];
  const invoices = invoicesRes.data ?? [];
  const toValidate = (proofs ?? []).filter((p) => p.status === "a_valider").length;

  return (
    <Card>
      <CardHeader title="Client & documents" />
      <CardBody className="space-y-4 text-sm">
        {client ? (
          <Link href={`/clients/${client.id}`} className="flex items-center gap-3 rounded-xl bg-rose-50 px-3 py-2.5 hover:bg-rose-100">
            <UserRound className="h-5 w-5 text-rose-700" />
            <span className="min-w-0 flex-1"><span className="block font-semibold">{client.name}</span>{client.phone && <span className="block text-ink-500">{client.phone}</span>}</span>
          </Link>
        ) : <p className="text-ink-500">Aucun client lié. Choisissez-le dans « Modifier ».</p>}

        <div className="grid grid-cols-2 gap-2">
          <Link href={`/evenements/${eventId}/conception`} className={buttonClass("secondary", "md") + " justify-center"}>
            <Palette className="h-4 w-4" /> Maquettes{toValidate ? ` (${toValidate})` : ""}
          </Link>
          <Link href={`/evenements/${eventId}/recap`} className={buttonClass("secondary", "md") + " justify-center"}>
            <ScrollText className="h-4 w-4" /> Récap client
          </Link>
        </div>
        {(proofs ?? []).length > 0 && (
          <ul className="space-y-1">
            {(proofs ?? []).slice(0, 3).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2"><span className="truncate">{p.title} · v{p.version}</span><Badge tone={PROOF_STATUS[p.status].tone}>{PROOF_STATUS[p.status].label}</Badge></li>
            ))}
          </ul>
        )}

        {money && (
          <div className="space-y-2 border-t border-line pt-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-semibold"><Receipt className="h-4 w-4 text-ochre-700" /> Devis & factures</span>
              <span className="flex gap-2"><Link href={`/devis/nouveau?evenement=${eventId}`} className={buttonClass("primary", "sm")}><Plus className="h-3.5 w-3.5" /> Devis</Link><Link href={`/factures/nouvelle?evenement=${eventId}`} className={buttonClass("secondary", "sm")}><Plus className="h-3.5 w-3.5" /> Facture</Link></span>
            </div>
            {quotes.length === 0 && invoices.length === 0 && <p className="text-ink-500">Pas encore de devis.</p>}
            {quotes.map((q) => (
              <Link key={q.id} href={`/devis/${q.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-sand-50">
                <span className="truncate">{q.number}</span>
                <span className="flex items-center gap-2"><span className="tabular-nums">{formatMAD(q.total_mad)}</span><Badge tone={QUOTE_STATUS[q.status].tone}>{QUOTE_STATUS[q.status].label}</Badge></span>
              </Link>
            ))}
            {invoices.map((f) => (
              <Link key={f.id} href={`/factures/${f.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-sand-50">
                <span className="truncate">{f.number} · {INVOICE_KIND[f.kind]}</span>
                <span className="flex items-center gap-2"><span className="tabular-nums">{formatMAD(f.total_mad)}</span><Badge tone={INVOICE_STATUS[f.status].tone}>{INVOICE_STATUS[f.status].label}</Badge></span>
              </Link>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
