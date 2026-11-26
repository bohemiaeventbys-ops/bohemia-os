"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { fail, str, type ActionResult } from "@/lib/action";
import { PURCHASE_BUCKET } from "@/lib/suppliers";

async function upload(supabase: SupabaseClient, prefix: string, f: FormDataEntryValue | null): Promise<{ path: string | null; error?: string }> {
  if (!(f instanceof File) || f.size === 0) return { path: null };
  if (!f.type.startsWith("image/") && f.type !== "application/pdf") return { path: null, error: "Le fichier doit être une photo ou un PDF." };
  if (f.size > 15 * 1024 * 1024) return { path: null, error: "Fichier trop lourd (15 Mo max)." };
  const ext = f.type === "application/pdf" ? "pdf" : f.type === "image/png" ? "png" : "jpg";
  const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(PURCHASE_BUCKET).upload(path, f, { contentType: f.type });
  if (error) return { path: null, error: `Envoi impossible : ${error.message}` };
  return { path };
}

function refresh(id?: string, eventId?: string | null) {
  revalidatePath("/achats");
  if (id) revalidatePath(`/achats/${id}`);
  if (eventId) revalidatePath(`/evenements/${eventId}`);
}

/** Lignes du formulaire : line_label[], line_qty[], line_unit[], line_item[] */
function readLines(fd: FormData) {
  const labels = fd.getAll("line_label").map(String);
  const qtys = fd.getAll("line_qty").map(String);
  const units = fd.getAll("line_unit").map(String);
  const items = fd.getAll("line_item").map(String);
  const out: { label: string; qty: number; unit: string; stock_item_id: string | null; sort_order: number }[] = [];
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i].trim();
    if (!label) continue;
    const qty = Number((qtys[i] ?? "1").replace(",", "."));
    if (!Number.isFinite(qty) || qty <= 0) return { error: `Quantité invalide pour « ${label} ».` };
    out.push({ label, qty, unit: units[i] || "pièce", stock_item_id: items[i] || null, sort_order: i });
  }
  return { lines: out };
}

export async function createPurchase(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  const title = str(fd, "title");
  if (!title) return { error: "Dites ce qu'il faut acheter." };
  const r = readLines(fd);
  if ("error" in r) return { error: r.error };
  const supabase = await createClient();
  const event_id = str(fd, "event_id");
  const { data, error } = await supabase.from("purchase_requests").insert({
    title, details: str(fd, "details"), event_id, supplier_id: str(fd, "supplier_id"), needed_by: str(fd, "needed_by"),
    requested_by: s.employee.id, status: "demande",
  }).select("id").single();
  if (error) return fail(error);
  if (r.lines.length) {
    const { error: e2 } = await supabase.from("purchase_lines").insert(r.lines.map((l) => ({ ...l, request_id: data.id })));
    if (e2) return { error: `Demande créée, mais les lignes n'ont pas été enregistrées : ${e2.message}`, redirect: `/achats/${data.id}` };
  }
  // La Direction peut valider directement sa propre demande
  if (s.can("purchases.validate") && fd.get("auto_validate") === "on") await supabase.rpc("purchase_decide", { p_request: data.id, p_ok: true, p_note: null });
  refresh(data.id, event_id);
  return { redirect: `/achats/${data.id}` };
}

export async function decidePurchase(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  if (!id) return { error: "Demande introuvable." };
  const ok = str(fd, "decision") === "ok";
  const note = str(fd, "note");
  if (!ok && !note) return { error: "Écrivez en quelques mots pourquoi c'est refusé." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("purchase_decide", { p_request: id, p_ok: ok, p_note: note });
  if (error) return fail(error);
  refresh(id);
  return { ok: ok ? "Validé : l'acheteur est prévenu." : "Refusé : le demandeur est prévenu." };
}

export async function orderPurchase(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  if (!id) return { error: "Demande introuvable." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("purchase_order", { p_request: id, p_supplier: str(fd, "supplier_id") });
  if (error) return fail(error);
  const r = await saveAmount(supabase, id, fd);
  if (r) return r;
  refresh(id);
  return { ok: "Marqué comme commandé." };
}

export async function receivePurchase(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  if (!id) return { error: "Demande introuvable." };
  const supabase = await createClient();
  const up = await upload(supabase, `purchases/${id}`, fd.get("photo"));
  if (up.error) return { error: up.error };
  const { error } = await supabase.rpc("purchase_receive", { p_request: id, p_photo: up.path });
  if (error) return fail(error);
  revalidatePath("/stock");
  refresh(id);
  return { ok: "Reçu ! Le stock est mis à jour et le demandeur est prévenu." };
}

export async function cancelPurchase(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  if (!id) return { error: "Demande introuvable." };
  const supabase = await createClient();
  const { error } = await supabase.from("purchase_requests").update({ status: "annulee" }).eq("id", id);
  if (error) return fail(error);
  refresh(id);
  return { ok: "Demande annulée." };
}

/** Montant de l'achat (confidentiel : Direction et commerciale). */
async function saveAmount(supabase: SupabaseClient, id: string, fd: FormData): Promise<ActionResult | null> {
  const s = await requireSession();
  const raw = str(fd, "amount_mad");
  if (!s.can("finance.view") || raw === null) return null;
  const amt = Number(raw.replace(/\s/g, "").replace(",", "."));
  const paid = Number((str(fd, "paid_mad") ?? "0").replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(amt) || amt < 0 || !Number.isFinite(paid) || paid < 0) return { error: "Montant invalide." };
  const { data: p } = await supabase.from("purchase_requests").select("title, event_id, supplier_id").eq("id", id).single();
  const inv = await upload(supabase, `expenses/${id}`, fd.get("invoice"));
  if (inv.error) return { error: inv.error };
  const { error } = await supabase.from("expenses").upsert({
    purchase_id: id, event_id: p?.event_id ?? null, supplier_id: str(fd, "supplier_id") ?? p?.supplier_id ?? null,
    label: `Achat : ${p?.title ?? ""}`, amount_mad: amt, paid_mad: paid, payment_method: str(fd, "payment_method"),
    paid_at: paid >= amt && amt > 0 ? new Date().toISOString().slice(0, 10) : null,
    ...(inv.path ? { invoice_path: inv.path } : {}),
  }, { onConflict: "purchase_id" });
  if (error) return fail(error);
  if (p?.event_id) revalidatePath(`/evenements/${p.event_id}`);
  return null;
}

export async function savePurchaseAmount(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  if (!id) return { error: "Demande introuvable." };
  const supabase = await createClient();
  const r = await saveAmount(supabase, id, fd);
  if (r) return r;
  refresh(id);
  return { ok: "Montant enregistré." };
}
