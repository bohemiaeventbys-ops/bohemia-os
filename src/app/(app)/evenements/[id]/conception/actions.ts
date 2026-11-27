"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { fail, str, type ActionResult } from "@/lib/action";
import { PROOF_BUCKET } from "@/lib/clients";

export async function uploadProof(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  if (!(s.can("design.manage") || s.can("events.manage"))) return { error: "Réservé au graphisme et à la direction." };
  const eventId = str(fd, "event_id");
  const title = str(fd, "title");
  const f = fd.get("file");
  if (!eventId || !title) return { error: "Donnez un nom à la maquette." };
  if (!(f instanceof File) || f.size === 0) return { error: "Choisissez le fichier de la maquette (image ou PDF)." };
  if (!f.type.startsWith("image/") && f.type !== "application/pdf") return { error: "Image (JPG, PNG) ou PDF uniquement." };
  if (f.size > 25 * 1024 * 1024) return { error: "Fichier trop lourd (25 Mo max)." };
  const supabase = await createClient();
  const ext = f.type === "application/pdf" ? "pdf" : f.type === "image/png" ? "png" : "jpg";
  const path = `${eventId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error: upErr } = await supabase.storage.from(PROOF_BUCKET).upload(path, f, { contentType: f.type });
  if (upErr) return { error: `Envoi impossible : ${upErr.message}` };
  // Nouvelle version d'une maquette existante : l'ancienne est remplacée
  const { data: prev } = await supabase.from("design_proofs").select("id, version, status").eq("event_id", eventId).ilike("title", title).order("version", { ascending: false });
  const version = (prev?.[0]?.version ?? 0) + 1;
  for (const p of prev ?? []) if (p.status === "a_valider" || p.status === "a_modifier") await supabase.from("design_proofs").update({ status: "annule" }).eq("id", p.id);
  const steps = fd.getAll("steps").map(String);
  const { error } = await supabase.from("design_proofs").insert({
    event_id: eventId, title, version, file_path: path, note: str(fd, "note"), production_steps: steps, production_due: str(fd, "production_due"),
  });
  if (error) return fail(error);
  revalidatePath(`/evenements/${eventId}/conception`);
  return { ok: "Maquette ajoutée : envoyez maintenant le lien à la cliente avec le bouton WhatsApp." };
}

export async function decideProof(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  const ok = str(fd, "decision") === "ok";
  const comment = str(fd, "comment");
  if (!id) return { error: "Maquette introuvable." };
  if (!ok && !comment) return { error: "Écrivez ce que la cliente veut changer." };
  const supabase = await createClient();
  const { data: p } = await supabase.from("design_proofs").select("event_id").eq("id", id).single();
  const { error } = await supabase.rpc("proof_decide", { p_proof: id, p_ok: ok, p_comment: comment });
  if (error) return fail(error);
  revalidatePath(`/evenements/${p?.event_id}/conception`);
  return { ok: ok ? "Validée : les tâches de production sont créées." : "Envoyée en correction au graphiste." };
}

export async function cancelProof(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  const supabase = await createClient();
  const { data, error } = await supabase.from("design_proofs").update({ status: "annule" }).eq("id", id!).select("event_id").single();
  if (error) return fail(error);
  revalidatePath(`/evenements/${data.event_id}/conception`);
  return { ok: "Maquette retirée." };
}
