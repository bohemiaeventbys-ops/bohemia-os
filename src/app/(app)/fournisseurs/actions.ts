"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { fail, str, type ActionResult } from "@/lib/action";

function amount(fd: FormData, k: string): number | null | typeof NaN {
  const v = str(fd, k);
  if (v === null) return null;
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

function supplierPayload(fd: FormData) {
  const picked = fd.getAll("categories").map(String);
  const extra = (str(fd, "categories_extra") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const rating = Number(str(fd, "rating") ?? "");
  return {
    name: str(fd, "name"),
    kind: (str(fd, "kind") ?? "fournisseur") as "fournisseur" | "prestataire" | "sous_traitant",
    categories: Array.from(new Set([...picked, ...extra])),
    contact_name: str(fd, "contact_name"),
    phone: str(fd, "phone"),
    whatsapp: str(fd, "whatsapp"),
    email: str(fd, "email"),
    address: str(fd, "address"),
    notes: str(fd, "notes"),
    rating: rating >= 1 && rating <= 5 ? rating : null,
  };
}

export async function saveSupplier(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  if (!s.can("suppliers.manage")) return { error: "Réservé aux achats, à la commerciale et à la direction." };
  const p = supplierPayload(fd);
  if (!p.name) return { error: "Donnez un nom." };
  const id = str(fd, "id");
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("suppliers").update({ ...p, is_active: fd.get("archived") !== "on" }).eq("id", id);
    if (error) return fail(error);
    revalidatePath("/fournisseurs");
    revalidatePath(`/fournisseurs/${id}`);
    return { redirect: `/fournisseurs/${id}` };
  }
  const { data, error } = await supabase.from("suppliers").insert(p).select("id").single();
  if (error) return fail(error);
  revalidatePath("/fournisseurs");
  return { redirect: `/fournisseurs/${data.id}` };
}

/** Prestation d'un fournisseur sur un événement (moquette, animation, impression…). Le montant n'est écrit que par la Direction / commerciale. */
export async function saveService(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  if (!(s.can("events.manage") || s.can("suppliers.manage"))) return { error: "Permission refusée." };
  const id = str(fd, "id");
  const event_id = str(fd, "event_id");
  const supplier_id = str(fd, "supplier_id");
  const description = str(fd, "description");
  if (!event_id || !supplier_id || !description) return { error: "Choisissez le prestataire et décrivez la prestation." };
  const payload = {
    event_id, supplier_id, description,
    service_date: str(fd, "service_date"), service_time: str(fd, "service_time"),
    status: (str(fd, "status") ?? "a_reserver") as "a_reserver",
    notes: str(fd, "notes"),
  };
  const supabase = await createClient();
  let serviceId = id;
  if (id) {
    const { error } = await supabase.from("event_services").update(payload).eq("id", id);
    if (error) return fail(error);
  } else {
    const { data, error } = await supabase.from("event_services").insert(payload).select("id").single();
    if (error) return fail(error);
    serviceId = data.id;
  }
  if (s.can("finance.view")) {
    const amt = amount(fd, "amount_mad");
    const paid = amount(fd, "paid_mad");
    if (Number.isNaN(amt) || Number.isNaN(paid)) return { error: "Montant invalide." };
    if (amt !== null) {
      const { data: sup } = await supabase.from("suppliers").select("name").eq("id", supplier_id).single();
      const { error } = await supabase.from("expenses").upsert({
        service_id: serviceId, event_id, supplier_id, label: `${sup?.name ?? "Prestataire"} : ${description}`,
        amount_mad: amt, paid_mad: paid ?? 0, paid_at: paid && paid >= amt ? new Date().toISOString().slice(0, 10) : null,
        payment_method: str(fd, "payment_method"),
      }, { onConflict: "service_id" });
      if (error) return fail(error);
    }
  }
  revalidatePath(`/evenements/${event_id}`);
  revalidatePath(`/fournisseurs/${supplier_id}`);
  return { ok: id ? "Prestation mise à jour." : "Prestation ajoutée." };
}

export async function setServiceStatus(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  const status = str(fd, "status");
  if (!id || !status) return { error: "Données incomplètes." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("event_services").update({ status }).eq("id", id).select("event_id").single();
  if (error) return fail(error);
  revalidatePath(`/evenements/${data.event_id}`);
  return { ok: "Statut mis à jour." };
}

export async function deleteService(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  if (!id) return { error: "Prestation introuvable." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("event_services").delete().eq("id", id).select("event_id").single();
  if (error) return fail(error);
  revalidatePath(`/evenements/${data.event_id}`);
  return { ok: "Prestation supprimée." };
}

/** Banque du fournisseur (RIB, mode de paiement) : Direction et commerciale seulement. */
export async function saveSupplierBank(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  if (!s.can("finance.view")) return { error: "Réservé à la direction et à la commerciale." };
  const id = str(fd, "supplier_id");
  if (!id) return { error: "Fournisseur introuvable." };
  const rib = (str(fd, "rib") ?? "").replace(/\s/g, "");
  if (rib && !/^\d{24}$/.test(rib)) return { error: "Le RIB doit contenir 24 chiffres." };
  const supabase = await createClient();
  const { error } = await supabase.from("supplier_bank").upsert({
    supplier_id: id, bank_name: str(fd, "bank_name"), rib: rib || null,
    payment_mode: str(fd, "payment_mode") ?? "virement", invoices_ttc: fd.get("invoices_ttc") === "on",
  });
  if (error) return fail(error);
  revalidatePath(`/fournisseurs/${id}`);
  return { ok: "Coordonnées bancaires enregistrées." };
}

function dh(v: string | null) {
  if (v == null || v.trim() === "") return null;
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
}

/** Facture reçue d'un fournisseur (montant TTC), avec le fichier et, si déjà payée, le virement. */
export async function addSupplierInvoice(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  if (!s.can("finance.view")) return { error: "Réservé à la direction et à la commerciale." };
  const supplierId = str(fd, "supplier_id");
  const ttc = dh(str(fd, "amount_mad"));
  const paid = dh(str(fd, "paid_mad")) ?? 0;
  if (!supplierId) return { error: "Fournisseur introuvable." };
  if (ttc == null || Number.isNaN(ttc) || ttc <= 0) return { error: "Indiquez le montant TTC." };
  if (Number.isNaN(paid)) return { error: "Montant payé invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("expenses").insert({
    supplier_id: supplierId, event_id: str(fd, "event_id"),
    label: str(fd, "label") ?? "Facture fournisseur",
    invoice_number: str(fd, "invoice_number"), invoice_date: str(fd, "invoice_date"),
    vat_rate: fd.get("with_vat") ? 20 : 0,
    amount_mad: ttc, paid_mad: Math.min(paid, ttc),
    payment_method: str(fd, "payment_method"), paid_at: paid > 0 ? (str(fd, "paid_at") ?? new Date().toISOString().slice(0, 10)) : null,
  }).select("id").single();
  if (error) return fail(error);
  const f = fd.get("file");
  if (f instanceof File && f.size > 0) {
    if (!f.type.startsWith("image/") && f.type !== "application/pdf") return { error: "Facture enregistrée, mais le fichier doit être une photo ou un PDF." };
    const path = `expenses/${data.id}/${Date.now()}.${f.type === "application/pdf" ? "pdf" : "jpg"}`;
    const up = await supabase.storage.from("purchase-files").upload(path, f, { contentType: f.type });
    if (up.error) return { error: `Facture enregistrée, mais le fichier n'a pas pu être joint : ${up.error.message}` };
    await supabase.from("expenses").update({ invoice_path: path }).eq("id", data.id);
  }
  const pf = fd.get("proof");
  if (pf instanceof File && pf.size > 0 && (pf.type.startsWith("image/") || pf.type === "application/pdf")) {
    const path = `expenses/${data.id}/paiement-${Date.now()}.${pf.type === "application/pdf" ? "pdf" : "jpg"}`;
    const up = await supabase.storage.from("purchase-files").upload(path, pf, { contentType: pf.type });
    if (!up.error) await supabase.from("expenses").update({ proof_path: path }).eq("id", data.id);
  }
  revalidatePath(`/fournisseurs/${supplierId}`);
  return { ok: "Facture enregistrée." };
}

/** Enregistre un paiement (virement, espèces…) sur une facture fournisseur. */
export async function paySupplierInvoice(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  if (!s.can("finance.view")) return { error: "Réservé à la direction et à la commerciale." };
  const id = str(fd, "id");
  const amount = dh(str(fd, "amount"));
  if (!id || amount == null || Number.isNaN(amount) || amount <= 0) return { error: "Montant invalide." };
  const supabase = await createClient();
  const { data: e } = await supabase.from("expenses").select("amount_mad, paid_mad, supplier_id").eq("id", id).single();
  if (!e) return { error: "Facture introuvable." };
  const paid = Math.min(Number(e.paid_mad) + amount, Number(e.amount_mad));
  let proof: string | null = null;
  const f = fd.get("proof");
  if (f instanceof File && f.size > 0) {
    if (!f.type.startsWith("image/") && f.type !== "application/pdf") return { error: "Justificatif : photo ou PDF uniquement." };
    proof = `expenses/${id}/paiement-${Date.now()}.${f.type === "application/pdf" ? "pdf" : "jpg"}`;
    const up = await supabase.storage.from("purchase-files").upload(proof, f, { contentType: f.type });
    if (up.error) return { error: `Le justificatif n'a pas pu être joint : ${up.error.message}` };
  }
  const { error } = await supabase.from("expenses").update({
    paid_mad: paid, payment_method: str(fd, "payment_method") ?? "virement", paid_at: str(fd, "paid_at") ?? new Date().toISOString().slice(0, 10),
    ...(proof ? { proof_path: proof } : {}),
  }).eq("id", id);
  if (error) return fail(error);
  if (e.supplier_id) revalidatePath(`/fournisseurs/${e.supplier_id}`);
  return { ok: "Paiement enregistré." };
}
