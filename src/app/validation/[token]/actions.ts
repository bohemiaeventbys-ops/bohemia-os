"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { str, type ActionResult } from "@/lib/action";

/** Réponse de la cliente, sans compte : le lien secret fait office d'autorisation. */
export async function clientDecide(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const token = str(fd, "token");
  const ok = str(fd, "decision") === "ok";
  const comment = str(fd, "comment");
  if (!token || !/^[a-f0-9]{36}$/.test(token)) return { error: "Lien invalide." };
  if (!ok && !comment) return { error: "Dites-nous en quelques mots ce que vous souhaitez changer." };
  if (comment && comment.length > 2000) return { error: "Message trop long." };
  const admin = createAdminClient();
  const { error } = await admin.rpc("proof_client_decide", { p_token: token, p_ok: ok, p_comment: comment });
  if (error) return { error: error.message.includes("déjà") ? "Vous avez déjà répondu pour cette maquette. Merci !" : "Une erreur est survenue, réessayez dans un instant." };
  revalidatePath(`/validation/${token}`);
  return { ok: ok ? "Merci ! Votre validation est bien reçue, nous lançons la fabrication." : "Merci ! Nous corrigeons la maquette et revenons vers vous très vite." };
}
