import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { vatOf } from "./suppliers";

/**
 * Calcul automatique d'un événement, à partir des documents déjà saisis (rien à retaper) :
 * - vendu : devis acceptés (le 1er = devis, les suivants = suppléments). Sans devis accepté : factures émises.
 * - coûts : dépenses rattachées à l'événement (prestataires, achats, charges). Une commande fournisseur
 *   n'a qu'une seule dépense (même si elle est facturée ensuite) : pas de double comptage.
 * - encaissé : paiements réellement enregistrés.
 * La marge se calcule en HT des deux côtés (ventes HT − coûts HT).
 */
export type EventCalc = {
  soldHT: number; soldVAT: number; soldTTC: number; source: "devis" | "factures" | "aucun";
  lines: { label: string; ht: number; ttc: number }[];
  costHT: number; costTTC: number; costs: { label: string; ttc: number; ht: number; paid: number }[];
  received: number; remaining: number; margin: number; marginPct: number | null;
  showTTC: boolean; clientKind: string | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function eventCalc(supabase: SupabaseClient, eventId: string, clientId: string | null): Promise<EventCalc> {
  const [{ data: quotes }, { data: invoices }, { data: expenses }, { data: pays }, { data: client }, { data: co }] = await Promise.all([
    supabase.from("quotes").select("number, title, subtotal_mad, vat_mad, total_mad, status, decided_at, created_at").eq("event_id", eventId).eq("status", "accepte").order("created_at"),
    supabase.from("invoices").select("id, number, subtotal_mad, vat_mad, total_mad, status").eq("event_id", eventId).neq("status", "annulee"),
    supabase.from("expenses").select("label, amount_mad, paid_mad, vat_rate").eq("event_id", eventId),
    supabase.from("payments").select("id, amount_mad").eq("event_id", eventId),
    clientId ? supabase.from("clients").select("kind").eq("id", clientId).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("company_settings").select("ttc_client_kinds").limit(1).maybeSingle(),
  ]);

  let lines: EventCalc["lines"];
  let source: EventCalc["source"];
  if (quotes?.length) {
    source = "devis";
    lines = quotes.map((q, i) => ({ label: `${i === 0 ? "Devis" : "Supplément"} ${q.number}${q.title ? ` · ${q.title}` : ""}`, ht: Number(q.subtotal_mad), ttc: Number(q.total_mad) }));
  } else if (invoices?.length) {
    source = "factures";
    lines = invoices.map((f) => ({ label: `Facture ${f.number}`, ht: Number(f.subtotal_mad), ttc: Number(f.total_mad) }));
  } else {
    source = "aucun";
    lines = [];
  }
  const soldHT = r2(lines.reduce((a, l) => a + l.ht, 0));
  const soldTTC = r2(lines.reduce((a, l) => a + l.ttc, 0));

  const costs = (expenses ?? []).map((x) => {
    const ttc = Number(x.amount_mad);
    return { label: x.label as string, ttc, ht: r2(ttc - vatOf(ttc, Number(x.vat_rate ?? 0))), paid: Number(x.paid_mad ?? 0) };
  });
  const costTTC = r2(costs.reduce((a, c) => a + c.ttc, 0));
  const costHT = r2(costs.reduce((a, c) => a + c.ht, 0));

  // Paiements de l'événement, directs ou via ses factures (chaque paiement compté une seule fois)
  const invIds = (invoices ?? []).map((f) => f.id as string);
  const { data: viaInv } = invIds.length ? await supabase.from("payments").select("id, amount_mad").in("invoice_id", invIds) : { data: [] };
  const seen = new Map<string, number>();
  for (const p of [...(pays ?? []), ...(viaInv ?? [])]) seen.set(p.id as string, Number(p.amount_mad));
  const received = r2([...seen.values()].reduce((a, v) => a + v, 0));

  const kinds = (co?.ttc_client_kinds as string[] | undefined) ?? ["entreprise"];
  const clientKind = (client?.kind as string | undefined) ?? null;
  const margin = r2(soldHT - costHT);
  return {
    soldHT, soldVAT: r2(soldTTC - soldHT), soldTTC, source, lines, costHT, costTTC, costs,
    received, remaining: r2(Math.max(0, soldTTC - received)), margin, marginPct: soldHT > 0 ? Math.round((margin / soldHT) * 1000) / 10 : null,
    showTTC: clientKind ? kinds.includes(clientKind) : false, clientKind,
  };
}
