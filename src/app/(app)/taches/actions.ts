"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { fail, str, type ActionResult } from "@/lib/action";
import type { TaskStatus } from "@/lib/types";

function taskPayload(fd: FormData) {
  return {
    title: str(fd, "title"),
    description: str(fd, "description"),
    instructions: str(fd, "instructions"),
    expected_result: str(fd, "expected_result"),
    assignee_id: str(fd, "assignee_id"),
    department_id: str(fd, "department_id"),
    event_id: str(fd, "event_id"),
    priority: (str(fd, "priority") ?? "normale") as "basse" | "normale" | "haute" | "urgente",
    planned_date: str(fd, "planned_date"),
    planned_time: str(fd, "planned_time"),
    due_date: str(fd, "due_date"),
    due_time: str(fd, "due_time"),
    requires_validation: fd.get("requires_validation") === "on",
  };
}

async function uploadFiles(taskId: string, employeeId: string, files: FormDataEntryValue[]) {
  const supabase = await createClient();
  for (const f of files) {
    if (!(f instanceof File) || f.size === 0) continue;
    if (f.size > 50 * 1024 * 1024) return `Fichier trop lourd : ${f.name} (50 Mo max).`;
    const safe = f.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${taskId}/${Date.now()}-${safe}`;
    const { error } = await supabase.storage.from("task-files").upload(path, f, { contentType: f.type || "application/octet-stream" });
    if (error) return `Envoi impossible (${f.name}) : ${error.message}`;
    const { error: e2 } = await supabase.from("task_attachments").insert({
      task_id: taskId, storage_path: path, file_name: f.name, mime_type: f.type, size_bytes: f.size, uploaded_by: employeeId,
    });
    if (e2) return e2.message;
  }
  return null;
}

export async function createTask(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  if (!s.can("tasks.create")) return { error: "Vous n'avez pas la permission de créer des tâches." };
  const p = taskPayload(fd);
  if (!p.title) return { error: "Le titre est obligatoire." };
  const supabase = await createClient();
  if (!p.department_id && p.assignee_id) {
    const { data } = await supabase.from("employees").select("department_id").eq("id", p.assignee_id).single();
    p.department_id = data?.department_id ?? null;
  }
  if (!p.planned_date && p.due_date) p.planned_date = p.due_date;
  const { data, error } = await supabase.from("tasks").insert({ ...p, created_by: s.employee.id }).select("id").single();
  if (error) return fail(error);
  const collaborators = fd.getAll("collaborators").map(String).filter((c) => c && c !== p.assignee_id);
  if (collaborators.length) await supabase.from("task_collaborators").insert(collaborators.map((employee_id) => ({ task_id: data.id, employee_id })));
  const err = await uploadFiles(data.id, s.employee.id, fd.getAll("files"));
  revalidatePath("/taches");
  if (err) return { error: `Tâche créée, mais : ${err}`, redirect: `/taches/${data.id}` };
  return fd.get("another") === "1" ? { ok: "Tâche créée. Vous pouvez en saisir une autre." } : { redirect: `/taches/${data.id}` };
}

export async function updateTask(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  if (!id) return { error: "Tâche introuvable." };
  const p = taskPayload(fd);
  if (!p.title) return { error: "Le titre est obligatoire." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("tasks").update(p).eq("id", id).select("id");
  if (error) return fail(error);
  if (!data?.length) return { error: "Modification non autorisée." };
  const collaborators = fd.getAll("collaborators").map(String).filter((c) => c && c !== p.assignee_id);
  await supabase.from("task_collaborators").delete().eq("task_id", id).not("employee_id", "in", `(${collaborators.join(",") || "00000000-0000-0000-0000-000000000000"})`);
  if (collaborators.length) await supabase.from("task_collaborators").upsert(collaborators.map((employee_id) => ({ task_id: id, employee_id })), { ignoreDuplicates: true });
  revalidatePath(`/taches/${id}`);
  return { redirect: `/taches/${id}` };
}

export async function changeStatus(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  const status = str(fd, "status") as TaskStatus | null;
  if (!id || !status) return { error: "Action invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("task_set_status", { p_task: id, p_status: status, p_note: str(fd, "note") });
  if (error) return fail(error);
  revalidatePath(`/taches/${id}`);
  revalidatePath("/ma-journee");
  return { ok: "Statut mis à jour." };
}

export async function addComment(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  const id = str(fd, "id");
  const body = str(fd, "body");
  if (!id) return { error: "Tâche introuvable." };
  const supabase = await createClient();
  if (body) {
    const { error } = await supabase.from("task_comments").insert({ task_id: id, author_id: s.employee.id, body });
    if (error) return fail(error);
  }
  const err = await uploadFiles(id, s.employee.id, fd.getAll("files"));
  if (err) return { error: err };
  if (!body && !fd.getAll("files").some((f) => f instanceof File && f.size > 0)) return { error: "Écrivez un commentaire ou joignez un fichier." };
  revalidatePath(`/taches/${id}`);
  return { ok: "Ajouté." };
}

export async function deleteAttachment(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "attachment_id");
  const taskId = str(fd, "id");
  const supabase = await createClient();
  const { data, error } = await supabase.from("task_attachments").delete().eq("id", id!).select("storage_path");
  if (error) return fail(error);
  if (data?.[0]) await supabase.storage.from("task-files").remove([data[0].storage_path]);
  revalidatePath(`/taches/${taskId}`);
  return { ok: "Fichier supprimé." };
}

export async function duplicateTask(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  const shift = Number(str(fd, "shift") ?? "0") || 0;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("duplicate_task", { p_task: id, p_shift_days: shift });
  if (error) return fail(error);
  return { redirect: `/taches/${data}` };
}

export async function deleteTask(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  if (fd.get("confirm") !== "on") return { error: "Cochez la case de confirmation." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("tasks").delete().eq("id", id!).select("id");
  if (error) return fail(error);
  if (!data?.length) return { error: "Suppression non autorisée." };
  revalidatePath("/taches");
  return { redirect: "/taches" };
}

export async function duplicateWeek(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const from = str(fd, "week_start");
  const to = str(fd, "target_start");
  if (!from || !to) return { error: "Semaines requises." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("duplicate_week", { p_week_start: from, p_target_start: to, p_department: str(fd, "department_id"), p_employee: str(fd, "employee_id") });
  if (error) return fail(error);
  revalidatePath("/taches/planning");
  return { ok: `${data} tâche(s) dupliquée(s) sur la semaine cible.` };
}
