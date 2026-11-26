"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePerm, requireSession } from "@/lib/auth";
import { fail, str, type ActionResult } from "@/lib/action";

export async function saveTemplate(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requirePerm("settings.manage");
  const id = str(fd, "id");
  const title = str(fd, "title");
  const days = Number(str(fd, "days") ?? "0");
  const when = str(fd, "when") ?? "avant";
  if (!title) return { error: "Écrivez la tâche." };
  if (!Number.isInteger(days) || days < 0 || days > 120) return { error: "Nombre de jours invalide." };
  const row = {
    title,
    description: str(fd, "description"),
    department_id: str(fd, "department_id"),
    assignee_id: str(fd, "assignee_id"),
    event_types: fd.getAll("event_types").map(String),
    offset_days: when === "avant" ? -days : when === "apres" ? days : 0,
    due_time: str(fd, "due_time"),
    priority: str(fd, "priority") ?? "normale",
    requires_validation: fd.get("requires_validation") === "on",
    is_active: fd.get("is_active") !== "off",
  };
  const supabase = await createClient();
  const { error } = id ? await supabase.from("task_templates").update(row).eq("id", id) : await supabase.from("task_templates").insert(row);
  if (error) return fail(error);
  revalidatePath("/parametres/taches-auto");
  return { ok: "Enregistré. Les prochains événements utiliseront ce modèle." };
}

export async function deleteTemplate(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requirePerm("settings.manage");
  const supabase = await createClient();
  const { error } = await supabase.from("task_templates").delete().eq("id", str(fd, "id")!);
  if (error) return fail(error);
  revalidatePath("/parametres/taches-auto");
  return { ok: "Supprimé." };
}

export async function saveRecurring(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requirePerm("settings.manage");
  const id = str(fd, "id");
  const title = str(fd, "title");
  const weekday = Number(str(fd, "weekday"));
  if (!title) return { error: "Écrivez la tâche." };
  if (!(weekday >= 1 && weekday <= 7)) return { error: "Choisissez le jour." };
  const row = {
    title, weekday,
    description: str(fd, "description"),
    department_id: str(fd, "department_id"),
    assignee_id: str(fd, "assignee_id"),
    due_time: str(fd, "due_time"),
    priority: str(fd, "priority") ?? "normale",
    is_active: fd.get("is_active") !== "off",
  };
  const supabase = await createClient();
  const { error } = id ? await supabase.from("recurring_tasks").update(row).eq("id", id) : await supabase.from("recurring_tasks").insert(row);
  if (error) return fail(error);
  revalidatePath("/parametres/taches-auto");
  return { ok: "Enregistré. Elle sera créée chaque semaine." };
}

export async function deleteRecurring(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requirePerm("settings.manage");
  const supabase = await createClient();
  const { error } = await supabase.from("recurring_tasks").delete().eq("id", str(fd, "id")!);
  if (error) return fail(error);
  revalidatePath("/parametres/taches-auto");
  return { ok: "Supprimé." };
}

/** Bouton du planning : créer maintenant les tâches de la semaine affichée */
export async function generateWeek(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_week_tasks", { p_week_start: str(fd, "week") });
  if (error) return fail(error);
  revalidatePath("/taches/planning");
  return { ok: data ? `${data} tâche(s) de la semaine créée(s).` : "Les tâches de la semaine existent déjà." };
}

/** Bouton de l'événement : créer les tâches manquantes (après ajout d'un modèle, par exemple) */
export async function generateEventTasks(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireSession();
  const id = str(fd, "id");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_event_tasks", { p_event: id });
  if (error) return fail(error);
  revalidatePath(`/evenements/${id}`);
  return { ok: data ? `${data} tâche(s) créée(s) et envoyée(s) à chacun.` : "Toutes les tâches existent déjà." };
}
