"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const FIELD_BUCKET = "field-docs";
const KINDS = ["bl", "facture", "photo_installation", "probleme", "manque", "abime"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FieldResult = { ok: true } | { ok: false; error: "denied" | "invalid" | "server" };

/**
 * Enregistre un document terrain (BL, photo, problème, manque, article abîmé).
 * Le téléphone envoie un identifiant unique (uid) : renvoyer la même chose après une coupure ne crée pas de doublon.
 * Ne répond « ok » qu'une fois la photo et la ligne bien enregistrées sur le serveur.
 */
export async function sendFieldDoc(fd: FormData): Promise<FieldResult> {
  const eventId = String(fd.get("event_id") ?? "");
  const kind = String(fd.get("kind") ?? "");
  const uid = String(fd.get("uid") ?? "");
  const itemId = String(fd.get("item_id") ?? "") || null;
  const qtyRaw = Number(fd.get("qty") ?? 0);
  const note = String(fd.get("note") ?? "").trim().slice(0, 2000) || null;
  const file = fd.get("file");
  if (!UUID.test(eventId) || !UUID.test(uid) || (itemId && !UUID.test(itemId)) || !(KINDS as readonly string[]).includes(kind)) return { ok: false, error: "invalid" };
  const qty = Number.isInteger(qtyRaw) && qtyRaw > 0 ? Math.min(qtyRaw, 100000) : null;

  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("can_field", { p_event: eventId });
  if (!allowed) return { ok: false, error: "denied" };

  let path: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/") || file.size > 15 * 1024 * 1024) return { ok: false, error: "invalid" };
    path = `events/${eventId}/${uid}.jpg`;
    const { error } = await supabase.storage.from(FIELD_BUCKET).upload(path, file, { contentType: file.type });
    // déjà reçue lors d'un envoi précédent coupé : on garde la même
    if (error && !/exist|duplicate/i.test(error.message)) return { ok: false, error: "server" };
  }

  const { error } = await supabase.from("field_docs").insert({ event_id: eventId, kind, file_path: path, note, item_id: itemId, qty, client_uid: uid });
  if (error && error.code !== "23505") return { ok: false, error: error.message.includes("row-level") ? "denied" : "server" };
  revalidatePath("/terrain");
  return { ok: true };
}

/** Livraison confirmée / facture remise (ou annulation) */
export async function markField(eventId: string, what: "livre" | "facture", value: boolean): Promise<FieldResult> {
  if (!UUID.test(eventId) || !["livre", "facture"].includes(what)) return { ok: false, error: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("field_mark", { p_event: eventId, p_what: what, p_value: value });
  if (error) return { ok: false, error: error.message.includes("Permission") ? "denied" : "server" };
  revalidatePath("/terrain");
  return { ok: true };
}

/** Dépôt : article chargé dans le camion */
export async function markLoaded(lineId: string): Promise<FieldResult> {
  if (!UUID.test(lineId)) return { ok: false, error: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("stock_set_step", { p_line: lineId, p_step: "charge" });
  if (error) return { ok: false, error: error.message.includes("Permission") ? "denied" : "server" };
  revalidatePath("/terrain");
  return { ok: true };
}
