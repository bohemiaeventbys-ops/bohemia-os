"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fail, str, type ActionResult } from "@/lib/action";
import { localToISO } from "@/lib/dates";

export async function correctPunch(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const action = str(fd, "action");
  const employee = str(fd, "employee_id");
  const date = str(fd, "work_date");
  const reason = str(fd, "reason");
  const punch = str(fd, "punch_id");
  const kind = str(fd, "kind");
  const time = str(fd, "time");
  if (!action || !employee || !date) return { error: "Données incomplètes." };
  if (!reason || reason.length < 3) return { error: "Le motif de correction est obligatoire." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("correct_punch", {
    p_action: action, p_employee: employee, p_date: date, p_reason: reason,
    p_punch: punch, p_kind: kind, p_time: time ? localToISO(date, time) : null,
  });
  if (error) return fail(error);
  revalidatePath(`/pointage/${employee}`);
  revalidatePath("/pointage");
  return { ok: "Correction enregistrée et tracée." };
}

export async function setDayStatus(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const employee = str(fd, "employee_id");
  const date = str(fd, "work_date");
  const status = str(fd, "status");
  const reason = str(fd, "reason");
  if (!employee || !date || !status) return { error: "Données incomplètes." };
  if (!reason || reason.length < 3) return { error: "Le motif est obligatoire." };
  const supabase = await createClient();
  const { error } = status === "auto"
    ? await supabase.rpc("clear_day_status", { p_employee: employee, p_date: date, p_reason: reason })
    : await supabase.rpc("set_day_status", { p_employee: employee, p_date: date, p_status: status, p_reason: reason });
  if (error) return fail(error);
  revalidatePath(`/pointage/${employee}`);
  revalidatePath("/pointage");
  return { ok: "Statut enregistré et tracé." };
}
