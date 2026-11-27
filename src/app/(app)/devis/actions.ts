"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { fail, str, type ActionResult } from "@/lib/action";
import { addDays, formatDateTime, todayISO } from "@/lib/dates";
import { CLIENT_DOCS_BUCKET, money2, type Company, type Quote } from "@/lib/clients";
import type { EventRow } from "@/lib/types";

async function guard() {
  const s = await requireSession();
  if (!s.can("finance.view")) throw new Error("Réservé à la direction et à la commerciale.");
  return s;
}
function num(v: string | null | undefined) {
  if (v == null || v.trim() === "") return null;
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}
function refresh(...paths: (string | null | undefined)[]) {
  revalidatePath("/devis");
  for (const p of paths) if (p) revalidatePath(p);
}

export async function createQuote(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try { await guard(); } catch (e) { return { error: (e as Error).message }; }
  const supabase = await createClient();
  const eventId = str(fd, "event_id");
  let clientId = str(fd, "client_id");
  let title = str(fd, "title") ?? "Décoration";
  if (eventId) {
    const { data: e } = await supabase.from("events").select("*").eq("id", eventId).maybeSingle<EventRow>();
    if (e) { clientId = clientId ?? e.client_id ?? null; title = str(fd, "title") ?? e.name; }
  }
  const { data: c } = await supabase.from("company_settings").select("*").single<Company>();
  const { data, error } = await supabase.from("quotes").insert({
    event_id: eventId, client_id: clientId, title,
    vat_rate: c?.vat_rate ?? 20, deposit_pct: c?.deposit_pct ?? 50, terms: c?.quote_terms ?? null,
    valid_until: addDays(todayISO(), c?.quote_validity_days ?? 15),
  }).select("id").single();
  if (error) return fail(error);
  // Devis déjà fait ailleurs : on joint le fichier et on reprend le montant HT en une ligne.
  const file = fd.get("file");
  if (file instanceof File && file.size > 0) {
    const up = await upload(supabase, `quotes/${data.id}`, file);
    if (up.error) return { error: `Devis créé, mais le fichier n'a pas pu être joint : ${up.error}` };
    const ht = num(str(fd, "amount_ht"));
    if (ht != null && !Number.isNaN(ht) && ht > 0) {
      await supabase.from("quote_lines").insert({ quote_id: data.id, label: "Selon devis joint", qty: 1, unit_price: money2(ht), sort_order: 0 });
    }
  }
  refresh(eventId ? `/evenements/${eventId}` : null);
  return { redirect: `/devis/${data.id}` };
}

/** Joint (ou remplace) le fichier PDF / photo d'un devis fait hors de l'application. */
export async function attachQuoteFile(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try { await guard(); } catch (e) { return { error: (e as Error).message }; }
  const id = str(fd, "id");
  if (!id) return { error: "Devis introuvable." };
  const supabase = await createClient();
  const up = await upload(supabase, `quotes/${id}`, fd.get("file"));
  if (up.error) return { error: up.error };
  if (!up.path) return { error: "Choisissez un fichier." };
  revalidatePath(`/devis/${id}`);
  return { ok: "Fichier joint." };
}

/** Enregistre l'en-tête et toutes les lignes du devis (remplacement complet, simple et sûr). */
export async function saveQuote(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try { await guard(); } catch (e) { return { error: (e as Error).message }; }
  const id = str(fd, "id");
  if (!id) return { error: "Devis introuvable." };
  const supabase = await createClient();
  const { data: q } = await supabase.from("quotes").select("status, event_id").eq("id", id).single();
  if (q && (q.status === "accepte" || q.status === "annule")) return { error: "Ce devis est accepté : dupliquez-le pour le modifier." };
  const sections = fd.getAll("line_section").map(String);
  const labels = fd.getAll("line_label").map(String);
  const details = fd.getAll("line_details").map(String);
  const qtys = fd.getAll("line_qty").map(String);
  const prices = fd.getAll("line_price").map(String);
  const lines = [];
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i].trim();
    if (!label) continue;
    const qty = num(qtys[i]) ?? 1;
    const price = num(prices[i]) ?? 0;
    if (Number.isNaN(qty) || qty <= 0 || Number.isNaN(price) || price < 0) return { error: `Quantité ou prix invalide pour « ${label} ».` };
    lines.push({ quote_id: id, section: sections[i]?.trim() || null, label, details: details[i]?.trim() || null, qty, unit_price: price, sort_order: i });
  }
  const discount = num(str(fd, "discount_mad")) ?? 0;
  const vat = num(str(fd, "vat_rate")) ?? 20;
  const deposit = num(str(fd, "deposit_pct")) ?? 50;
  if ([discount, vat, deposit].some((n) => Number.isNaN(n))) return { error: "Remise, TVA ou acompte invalide." };
  const { error } = await supabase.from("quotes").update({
    title: str(fd, "title") ?? "Décoration", client_id: str(fd, "client_id"), intro: str(fd, "intro"), terms: str(fd, "terms"),
    valid_until: str(fd, "valid_until"), discount_mad: discount, vat_rate: vat, deposit_pct: deposit,
  }).eq("id", id);
  if (error) return fail(error);
  const { error: e1 } = await supabase.from("quote_lines").delete().eq("quote_id", id);
  if (e1) return fail(e1);
  if (lines.length) {
    const { error: e2 } = await supabase.from("quote_lines").insert(lines);
    if (e2) return fail(e2);
  }
  refresh(`/devis/${id}`, q?.event_id ? `/evenements/${q.event_id}` : null);
  return { ok: "Devis enregistré." };
}

export async function setQuoteStatus(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try { await guard(); } catch (e) { return { error: (e as Error).message }; }
  const id = str(fd, "id");
  const status = str(fd, "status") as Quote["status"] | null;
  if (!id || !status || !["brouillon", "envoye", "accepte", "refuse", "annule"].includes(status)) return { error: "Action invalide." };
  const supabase = await createClient();
  const { count } = await supabase.from("quote_lines").select("id", { count: "exact", head: true }).eq("quote_id", id);
  if ((status === "envoye" || status === "accepte") && !count) return { error: "Ajoutez au moins une ligne au devis." };
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("quotes").update({
    status, ...(status === "envoye" ? { sent_at: now } : {}), ...(status === "accepte" || status === "refuse" ? { decided_at: now } : {}),
  }).eq("id", id).select("event_id").single();
  if (error) return fail(error);
  refresh(`/devis/${id}`, data.event_id ? `/evenements/${data.event_id}` : null, "/evenements");
  return { ok: status === "accepte" ? "Devis accepté : le montant est reporté sur l'événement, qui passe en « Confirmé »." : "Statut mis à jour." };
}

export async function duplicateQuote(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try { await guard(); } catch (e) { return { error: (e as Error).message }; }
  const id = str(fd, "id");
  const supabase = await createClient();
  const { data: q } = await supabase.from("quotes").select("*").eq("id", id!).single<Quote>();
  if (!q) return { error: "Devis introuvable." };
  const { data: lines } = await supabase.from("quote_lines").select("*").eq("quote_id", q.id);
  const { data: nq, error } = await supabase.from("quotes").insert({
    event_id: q.event_id, client_id: q.client_id, title: q.title, vat_rate: q.vat_rate, discount_mad: q.discount_mad, deposit_pct: q.deposit_pct,
    intro: q.intro, terms: q.terms, valid_until: q.valid_until,
  }).select("id").single();
  if (error) return fail(error);
  if (lines?.length) await supabase.from("quote_lines").insert(lines.map((l) => ({ quote_id: nq.id, section: l.section, label: l.label, details: l.details, qty: l.qty, unit_price: l.unit_price, sort_order: l.sort_order })));
  refresh();
  return { redirect: `/devis/${nq.id}` };
}

export async function makeInvoice(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try { await guard(); } catch (e) { return { error: (e as Error).message }; }
  const id = str(fd, "quote_id");
  const kind = str(fd, "kind");
  if (!id || !kind) return { error: "Données incomplètes." };
  const pct = num(str(fd, "pct"));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("invoice_from_quote", { p_quote: id, p_kind: kind, p_pct: Number.isNaN(pct) ? null : pct });
  if (error) return fail(error);
  refresh(`/devis/${id}`);
  return { redirect: `/factures/${data}` };
}

function fillTerms(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? `{{${k}}}`);
}

export async function makeContract(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try { await guard(); } catch (e) { return { error: (e as Error).message }; }
  const id = str(fd, "quote_id");
  const supabase = await createClient();
  const { data: q } = await supabase.from("quotes").select("*").eq("id", id!).single<Quote>();
  if (!q) return { error: "Devis introuvable." };
  const [{ data: c }, { data: e }] = await Promise.all([
    supabase.from("company_settings").select("*").single<Company>(),
    q.event_id ? supabase.from("events").select("*").eq("id", q.event_id).maybeSingle<EventRow>() : Promise.resolve({ data: null }),
  ]);
  const body = fillTerms(c?.contract_terms ?? "", {
    devis: q.number, total: money2(q.total_mad), acompte: `${money2(Math.round(q.total_mad * q.deposit_pct) / 100)} (${q.deposit_pct} %)`,
    installation: e?.setup_at ? formatDateTime(e.setup_at) : "à convenir", demontage: e?.teardown_at ? formatDateTime(e.teardown_at) : "à convenir",
  });
  const { data, error } = await supabase.from("contracts").insert({ quote_id: q.id, event_id: q.event_id, client_id: q.client_id, body }).select("id").single();
  if (error) return fail(error);
  refresh(`/devis/${q.id}`);
  return { redirect: `/contrats/${data.id}` };
}

export async function saveContract(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try { await guard(); } catch (e) { return { error: (e as Error).message }; }
  const id = str(fd, "id");
  const body = str(fd, "body");
  if (!id || !body) return { error: "Le texte du contrat est vide." };
  const supabase = await createClient();
  const { error } = await supabase.from("contracts").update({ body }).eq("id", id);
  if (error) return fail(error);
  revalidatePath(`/contrats/${id}`);
  return { ok: "Contrat enregistré." };
}

async function upload(supabase: SupabaseClient, prefix: string, f: FormDataEntryValue | null) {
  if (!(f instanceof File) || f.size === 0) return { path: null as string | null };
  if (!f.type.startsWith("image/") && f.type !== "application/pdf") return { path: null, error: "Photo ou PDF uniquement." };
  if (f.size > 15 * 1024 * 1024) return { path: null, error: "Fichier trop lourd (15 Mo max)." };
  const ext = f.type === "application/pdf" ? "pdf" : "jpg";
  const path = `${prefix}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(CLIENT_DOCS_BUCKET).upload(path, f, { contentType: f.type });
  return error ? { path: null, error: error.message } : { path };
}

export async function setContractStatus(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try { await guard(); } catch (e) { return { error: (e as Error).message }; }
  const id = str(fd, "id");
  const status = str(fd, "status");
  if (!id || !status) return { error: "Action invalide." };
  const supabase = await createClient();
  const up = await upload(supabase, `contracts/${id}`, fd.get("file"));
  if (up.error) return { error: up.error };
  const { error } = await supabase.from("contracts").update({
    status, ...(status === "signe" ? { signed_at: todayISO() } : {}), ...(up.path ? { signed_file_path: up.path } : {}),
  }).eq("id", id);
  if (error) return fail(error);
  revalidatePath(`/contrats/${id}`);
  return { ok: status === "signe" ? "Contrat marqué signé." : "Statut mis à jour." };
}

export async function addPayment(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try { await guard(); } catch (e) { return { error: (e as Error).message }; }
  const invoiceId = str(fd, "invoice_id");
  const amount = num(str(fd, "amount_mad"));
  if (!invoiceId || amount === null || Number.isNaN(amount) || amount <= 0) return { error: "Indiquez le montant reçu." };
  const supabase = await createClient();
  const { data: inv } = await supabase.from("invoices").select("event_id").eq("id", invoiceId).single();
  const { error } = await supabase.from("payments").insert({
    invoice_id: invoiceId, event_id: inv?.event_id ?? null, amount_mad: amount, paid_on: str(fd, "paid_on") ?? todayISO(),
    method: str(fd, "method") ?? "Virement", reference: str(fd, "reference"),
  });
  if (error) return fail(error);
  refresh(`/factures/${invoiceId}`, inv?.event_id ? `/evenements/${inv.event_id}` : null);
  return { ok: "Paiement enregistré : la facture et l'événement sont à jour." };
}

export async function deletePayment(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try { await guard(); } catch (e) { return { error: (e as Error).message }; }
  const id = str(fd, "id");
  const supabase = await createClient();
  const { data, error } = await supabase.from("payments").delete().eq("id", id!).select("invoice_id").single();
  if (error) return fail(error);
  refresh(`/factures/${data.invoice_id}`);
  return { ok: "Paiement supprimé." };
}

export async function cancelInvoice(_: ActionResult, fd: FormData): Promise<ActionResult> {
  try { await guard(); } catch (e) { return { error: (e as Error).message }; }
  const id = str(fd, "id");
  const supabase = await createClient();
  const { count } = await supabase.from("payments").select("id", { count: "exact", head: true }).eq("invoice_id", id!);
  if (count) return { error: "Supprimez d'abord les paiements de cette facture." };
  const { error } = await supabase.from("invoices").update({ status: "annulee" }).eq("id", id!);
  if (error) return fail(error);
  refresh(`/factures/${id}`);
  return { ok: "Facture annulée (le numéro reste réservé)." };
}
