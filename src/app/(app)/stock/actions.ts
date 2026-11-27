"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { fail, str, type ActionResult } from "@/lib/action";
import { uploadStockPhoto } from "@/lib/stock";

function int(fd: FormData, key: string) {
  const v = str(fd, key);
  if (!v) return 0;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
}

function themes(fd: FormData) {
  const picked = fd.getAll("themes").map(String);
  const extra = (str(fd, "themes_extra") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  return Array.from(new Set([...picked, ...extra].map((t) => t.charAt(0).toUpperCase() + t.slice(1))));
}

function itemPayload(fd: FormData) {
  return {
    name: str(fd, "name"),
    category_id: str(fd, "category_id"),
    themes: themes(fd),
    unit: str(fd, "unit") ?? "pièce",
    location: str(fd, "location"),
    code: str(fd, "code")?.toUpperCase() ?? null,
    name_ar: str(fd, "name_ar"),
    dimensions: str(fd, "dimensions"),
    color: str(fd, "color"),
    notes: str(fd, "notes"),
    min_qty: Math.max(0, int(fd, "min_qty") || 0),
  };
}

function refresh(itemId?: string, eventId?: string) {
  revalidatePath("/stock");
  if (itemId) revalidatePath(`/stock/${itemId}`);
  if (eventId) {
    revalidatePath(`/evenements/${eventId}`);
    revalidatePath(`/evenements/${eventId}/materiel`);
  }
}

export async function createItem(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  if (!s.can("stock.manage")) return { error: "Réservé au dépôt et à la direction." };
  const p = itemPayload(fd);
  if (!p.name) return { error: "Donnez un nom à l'article." };
  const qty = int(fd, "qty_good");
  if (Number.isNaN(qty) || qty < 0) return { error: "Quantité invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("stock_items").insert({ ...p, qty_good: 0, created_by: s.employee.id }).select("id").single();
  if (error) return fail(error);
  const up = await uploadStockPhoto(supabase, `items/${data.id}`, fd.get("photo"));
  if (up.error) return { error: `Article créé, mais ${up.error.toLowerCase()}`, redirect: `/stock/${data.id}` };
  if (up.path) await supabase.from("stock_items").update({ photo_path: up.path }).eq("id", data.id);
  // La quantité de départ passe par une entrée en stock : elle apparaît dans l'historique de l'article
  if (qty > 0) {
    const { error: e2 } = await supabase.rpc("stock_adjust", { p_item: data.id, p_delta: qty, p_note: "Inventaire de départ" });
    if (e2) return { error: `Article créé, mais la quantité n'a pas été enregistrée : ${e2.message}`, redirect: `/stock/${data.id}` };
  }
  refresh(data.id);
  return { redirect: `/stock/${data.id}` };
}

export async function updateItem(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  if (!s.can("stock.manage")) return { error: "Réservé au dépôt et à la direction." };
  const id = str(fd, "id");
  const p = itemPayload(fd);
  if (!id || !p.name) return { error: "Donnez un nom à l'article." };
  const supabase = await createClient();
  const up = await uploadStockPhoto(supabase, `items/${id}`, fd.get("photo"));
  if (up.error) return { error: up.error };
  const { error } = await supabase.from("stock_items").update({ ...p, ...(up.path ? { photo_path: up.path } : {}) }).eq("id", id);
  if (error) return fail(error);
  refresh(id);
  return { redirect: `/stock/${id}` };
}

export async function archiveItem(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  if (!s.can("stock.manage")) return { error: "Réservé au dépôt et à la direction." };
  const id = str(fd, "id");
  const supabase = await createClient();
  const { error } = await supabase.from("stock_items").update({ is_active: fd.get("active") === "1" }).eq("id", id!);
  if (error) return fail(error);
  refresh(id!);
  return { ok: fd.get("active") === "1" ? "Article remis dans l'inventaire." : "Article retiré de l'inventaire (historique conservé)." };
}

/** Entrée en stock (+) ou correction (−) */
export async function adjustStock(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  const n = int(fd, "qty");
  const sign = fd.get("sign") === "-" ? -1 : 1;
  if (!id || !n || Number.isNaN(n) || n <= 0) return { error: "Indiquez une quantité." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("stock_adjust", { p_item: id, p_delta: sign * n, p_note: str(fd, "note") ?? (sign > 0 ? "Entrée en stock" : "Correction d'inventaire") });
  if (error) return fail(error);
  refresh(id);
  return { ok: sign > 0 ? `${n} ajouté(s) au stock.` : `${n} retiré(s) du stock.` };
}

/** Signaler un article abîmé ou cassé au dépôt (hors événement) */
export async function flagItem(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  const n = int(fd, "qty");
  const to = str(fd, "to");
  if (!id || !n || Number.isNaN(n) || n <= 0) return { error: "Indiquez combien." };
  const supabase = await createClient();
  const up = await uploadStockPhoto(supabase, `items/${id}`, fd.get("photo"));
  if (up.error) return { error: up.error };
  const { error } = await supabase.rpc("stock_flag", { p_item: id, p_qty: n, p_to: to, p_note: str(fd, "note"), p_photo: up.path });
  if (error) return fail(error);
  refresh(id);
  return { ok: "C'est noté." };
}

export async function repairedItem(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  const n = int(fd, "qty");
  if (!id || !n || Number.isNaN(n) || n <= 0) return { error: "Indiquez combien sont réparés." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("stock_repaired", { p_item: id, p_qty: n, p_note: str(fd, "note") });
  if (error) return fail(error);
  refresh(id);
  return { ok: `${n} remis en bon état.` };
}

export async function discardItem(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  const n = int(fd, "qty");
  if (!id || !n || Number.isNaN(n) || n <= 0) return { error: "Indiquez combien sont jetés." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("stock_discard", { p_item: id, p_qty: n, p_from: str(fd, "from") ?? "broken", p_note: str(fd, "note") });
  if (error) return fail(error);
  refresh(id);
  return { ok: `${n} jeté(s).` };
}

// ---------------------------------------------------------------------
// Matériel d'un événement
// ---------------------------------------------------------------------
export async function reserveItem(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const eventId = str(fd, "event_id");
  const itemId = str(fd, "item_id");
  const n = int(fd, "qty");
  if (!eventId || !itemId) return { error: "Choisissez un article." };
  if (Number.isNaN(n) || n < 0) return { error: "Quantité invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("stock_reserve", { p_event: eventId, p_item: itemId, p_qty: n, p_note: str(fd, "note") });
  if (error) return fail(error);
  refresh(itemId, eventId);
  return { ok: n === 0 ? "Retiré de la liste." : "Réservé pour l'événement." };
}

export async function setLineStep(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const line = str(fd, "line_id");
  const eventId = str(fd, "event_id");
  const step = str(fd, "step");
  if (!line || !step) return { error: "Action invalide." };
  const supabase = await createClient();
  let photo: string | null = null;
  if (step === "charge") {
    const up = await uploadStockPhoto(supabase, `events/${eventId}`, fd.get("photo"));
    if (up.error) return { error: up.error };
    photo = up.path;
  }
  const { error } = await supabase.rpc("stock_set_step", { p_line: line, p_step: step, p_photo: photo });
  if (error) return fail(error);
  refresh(undefined, eventId ?? undefined);
  return { ok: step === "prepare" ? "Préparé." : step === "charge" ? "Chargé dans la voiture." : "Remis en réservé." };
}

export async function returnLine(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const line = str(fd, "line_id");
  const eventId = str(fd, "event_id");
  const vals = ["good", "repair", "broken", "missing"].map((k) => int(fd, k));
  if (!line || vals.some((v) => Number.isNaN(v) || v < 0)) return { error: "Quantités invalides." };
  const supabase = await createClient();
  const up = await uploadStockPhoto(supabase, `events/${eventId}`, fd.get("photo"));
  if (up.error) return { error: up.error };
  const { error } = await supabase.rpc("stock_return", {
    p_line: line, p_good: vals[0], p_repair: vals[1], p_broken: vals[2], p_missing: vals[3], p_note: str(fd, "note"), p_photo: up.path,
  });
  if (error) return fail(error);
  refresh(undefined, eventId ?? undefined);
  return { ok: vals[1] + vals[2] + vals[3] > 0 ? "Retour enregistré. Une tâche a été créée pour le dépôt." : "Retour enregistré : tout est en bon état." };
}

/** Prêt d'outillage (visseuse, perceuse…) à un employé */
export async function lendTool(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  const employee = str(fd, "employee_id");
  const qty = int(fd, "qty") || 1;
  if (!id || !employee) return { error: "Choisissez la personne." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("tool_lend", { p_item: id, p_employee: employee, p_qty: qty, p_due: str(fd, "due_back"), p_event: str(fd, "event_id"), p_note: str(fd, "note") });
  if (error) return fail(error);
  refresh(id);
  return { ok: "C'est noté : on sait qui l'a." };
}

export async function returnTool(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const loan = str(fd, "loan_id");
  const id = str(fd, "id");
  if (!loan) return { error: "Prêt introuvable." };
  const ok = str(fd, "state") !== "abime";
  const supabase = await createClient();
  const { error } = await supabase.rpc("tool_return", { p_loan: loan, p_ok: ok, p_note: str(fd, "note") });
  if (error) return fail(error);
  refresh(id ?? undefined);
  return { ok: ok ? "Rendu, merci !" : "Rendu : mis de côté pour réparation." };
}
