"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { fail, str, type ActionResult } from "@/lib/action";
import { isValidISODate } from "@/lib/dates";
import { LEAVE_TYPE } from "@/lib/labels";

function refresh() {
  for (const p of ["/conges", "/calendrier", "/pointage", "/", "/ma-journee"]) revalidatePath(p);
}

/** Demande de congé / absence. Un employé ne peut créer que pour lui-même, en attente (imposé par RLS). */
export async function requestLeave(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  const type = str(fd, "leave_type");
  const start = str(fd, "start_date");
  const end = str(fd, "end_date") ?? start;
  if (!type || !(type in LEAVE_TYPE)) return { error: "Choisissez le type de demande." };
  if (!start || !end || !isValidISODate(start) || !isValidISODate(end)) return { error: "Indiquez la date." };
  if (end < start) return { error: "La date de fin est avant la date de début." };

  const canManage = s.can("leaves.manage");
  const forWho = canManage ? str(fd, "employee_id") ?? s.employee.id : s.employee.id;
  const direct = canManage && fd.get("direct") === "on";
  const supabase = await createClient();
  const { error } = await supabase.from("leave_requests").insert({
    employee_id: forWho, leave_type: type, start_date: start, end_date: end, comment: str(fd, "comment"),
    status: direct ? "validee" : "en_attente",
    ...(direct ? { reviewed_by: s.employee.id, reviewed_at: new Date().toISOString() } : {}),
  });
  if (error) return fail(error);
  refresh();
  return { ok: direct ? "Enregistré et validé." : "Demande envoyée. Vous serez prévenu(e) dès qu'elle est validée." };
}

export async function cancelLeave(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  const id = str(fd, "id");
  if (!id) return { error: "Demande introuvable." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("leave_requests").update({ status: "annulee" })
    .eq("id", id).eq("employee_id", s.employee.id).eq("status", "en_attente").select("id");
  if (error) return fail(error);
  if (!data?.length) return { error: "Cette demande ne peut plus être annulée." };
  refresh();
  return { ok: "Demande annulée." };
}

/** Validation ou refus (motif obligatoire pour un refus). Contrôle des droits côté base (review_leave). */
export async function reviewLeave(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  const decision = str(fd, "decision");
  const comment = str(fd, "review_comment");
  if (!id || (decision !== "validee" && decision !== "refusee")) return { error: "Choix invalide." };
  if (decision === "refusee" && !comment) return { error: "Écrivez le motif du refus dans le commentaire." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_leave", { p_leave: id, p_status: decision, p_comment: comment });
  if (error) return fail(error);
  refresh();
  return { ok: decision === "validee" ? "Demande validée. L'employé est prévenu." : "Demande refusée. L'employé est prévenu." };
}
