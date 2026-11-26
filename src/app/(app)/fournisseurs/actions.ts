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
