"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";

type R = { ok: true } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;
const okPath = (eventId: string, p: unknown) => typeof p === "string" && p.startsWith(`${eventId}/`) && !p.includes("..") && p.length < 300;

function done(eventId: string) {
  revalidatePath(`/evenements/${eventId}`);
  revalidatePath(`/evenements/${eventId}/fiche`);
  revalidatePath(`/evenements/${eventId}/conception`);
}
async function allowed() {
  const s = await requireSession();
  return s.can("design.manage") || s.can("events.manage");
}

/** Le fichier est déjà envoyé dans le stockage depuis le navigateur : on enregistre le design. */
export async function registerDesign(eventId: string, path: string, previewPath: string | null, title: string): Promise<R> {
  if (!UUID.test(eventId) || !okPath(eventId, path) || (previewPath && !okPath(eventId, previewPath))) return { ok: false, error: "Fichier invalide." };
  if (!(await allowed())) return { ok: false, error: "Réservé au graphisme et à la direction." };
  const supabase = await createClient();
  const t = title.trim().slice(0, 120) || "Design";
  const { data: prev } = await supabase.from("design_proofs").select("id, version, status").eq("event_id", eventId).ilike("title", t).order("version", { ascending: false });
  // Les versions non validées sont remplacées ; une version validée reste la référence jusqu'à la validation de la nouvelle
  for (const p of prev ?? []) if (p.status === "a_valider" || p.status === "a_modifier") await supabase.from("design_proofs").update({ status: "annule" }).eq("id", p.id);
  const { error } = await supabase.from("design_proofs").insert({ event_id: eventId, title: t, version: (prev?.[0]?.version ?? 0) + 1, file_path: path, preview_path: previewPath });
  if (error) return { ok: false, error: error.message };
  done(eventId);
  return { ok: true };
}

/** « Validé par l'infographiste » (nom et date enregistrés par la base). */
export async function graphicOk(eventId: string, proofId: string, ok = true): Promise<R> {
  if (!UUID.test(eventId) || !UUID.test(proofId)) return { ok: false, error: "Invalide." };
  if (!(await allowed())) return { ok: false, error: "Réservé au graphisme et à la direction." };
  const supabase = await createClient();
  const { data: p } = await supabase.from("design_proofs").select("id").eq("id", proofId).eq("event_id", eventId).maybeSingle();
  if (!p) return { ok: false, error: "Design introuvable." };
  const { error } = await supabase.rpc("proof_graphic_ok", { p_proof: proofId, p_ok: ok });
  if (error) return { ok: false, error: error.message };
  done(eventId);
  return { ok: true };
}

/** « Approuvé par la cliente » : date + preuve d'accord facultative (capture WhatsApp, photo, PDF). Les anciennes versions sont gardées. */
export async function clientOk(eventId: string, proofId: string, proofPath: string | null): Promise<R> {
  if (!UUID.test(eventId) || !UUID.test(proofId) || (proofPath && !okPath(eventId, proofPath))) return { ok: false, error: "Invalide." };
  if (!(await allowed())) return { ok: false, error: "Réservé au graphisme et à la direction." };
  const supabase = await createClient();
  const { data: p } = await supabase.from("design_proofs").select("status").eq("id", proofId).eq("event_id", eventId).maybeSingle();
  if (!p) return { ok: false, error: "Design introuvable." };
  if (p.status === "a_modifier") return { ok: false, error: "Ce design est à modifier : ajoutez une nouvelle version." };
  if (p.status !== "valide") {
    const { error } = await supabase.rpc("proof_decide", { p_proof: proofId, p_ok: true, p_comment: null });
    if (error) return { ok: false, error: error.message };
  }
  if (proofPath) {
    const { error } = await supabase.from("design_proofs").update({ client_proof_path: proofPath }).eq("id", proofId);
    if (error) return { ok: false, error: error.message };
  }
  done(eventId);
  return { ok: true };
}

export async function registerInspirations(eventId: string, paths: string[]): Promise<R> {
  if (!UUID.test(eventId) || !paths.length || paths.length > 30 || !paths.every((p) => okPath(eventId, p))) return { ok: false, error: "Fichiers invalides." };
  if (!(await allowed())) return { ok: false, error: "Réservé au graphisme et à la direction." };
  const supabase = await createClient();
  const { count } = await supabase.from("event_inspirations").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("is_cover", true);
  const { error } = await supabase.from("event_inspirations").insert(paths.map((p, i) => ({ event_id: eventId, file_path: p, is_cover: !count && i === 0 })));
  if (error) return { ok: false, error: error.message };
  done(eventId);
  return { ok: true };
}

export async function setCover(eventId: string, id: string): Promise<R> {
  if (!UUID.test(eventId) || !UUID.test(id) || !(await allowed())) return { ok: false, error: "Invalide." };
  const supabase = await createClient();
  await supabase.from("event_inspirations").update({ is_cover: false }).eq("event_id", eventId).neq("id", id);
  const { error } = await supabase.from("event_inspirations").update({ is_cover: true }).eq("id", id).eq("event_id", eventId);
  if (error) return { ok: false, error: error.message };
  done(eventId);
  return { ok: true };
}

export async function removeInspiration(eventId: string, id: string): Promise<R> {
  if (!UUID.test(eventId) || !UUID.test(id) || !(await allowed())) return { ok: false, error: "Invalide." };
  const supabase = await createClient();
  const { error } = await supabase.from("event_inspirations").delete().eq("id", id).eq("event_id", eventId);
  if (error) return { ok: false, error: error.message };
  done(eventId);
  return { ok: true };
}
