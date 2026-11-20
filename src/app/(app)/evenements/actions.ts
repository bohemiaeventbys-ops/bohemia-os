"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { fail, str, type ActionResult } from "@/lib/action";
import { localToISO } from "@/lib/dates";

function ts(fd: FormData, date: string, key: string) {
  const t = str(fd, key);
  if (!t) return null;
  const d = str(fd, `${key}_date`) ?? date;
  return localToISO(d, t);
}

function payload(fd: FormData) {
  const date = str(fd, "event_date");
  if (!date) return null;
  const budget = str(fd, "budget_mad");
  return {
    name: str(fd, "name"),
    event_type: str(fd, "event_type") ?? "autre",
    status: str(fd, "status") ?? "confirme",
    client_name: str(fd, "client_name"),
    client_phone: str(fd, "client_phone"),
    event_date: date,
    address: str(fd, "address"),
    delivery_at: ts(fd, date, "delivery"),
    setup_at: ts(fd, date, "setup"),
    start_at: ts(fd, date, "start"),
    end_at: ts(fd, date, "end"),
    teardown_at: ts(fd, date, "teardown"),
    manager_id: str(fd, "manager_id"),
    budget_mad: budget ? Number(budget.replace(/\s/g, "").replace(",", ".")) : null,
    notes: str(fd, "notes"),
  };
}

export async function createEvent(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  const p = payload(fd);
  if (!p?.name) return { error: "Nom et date de l'événement obligatoires." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("events").insert({ ...p, created_by: s.employee.id }).select("id").single();
  if (error) return fail(error);
  revalidatePath("/evenements");
  return { redirect: `/evenements/${data.id}` };
}

export async function updateEvent(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  const p = payload(fd);
  if (!id || !p?.name) return { error: "Nom et date obligatoires." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("events").update(p).eq("id", id).select("id");
  if (error) return fail(error);
  if (!data?.length) return { error: "Modification non autorisée." };
  revalidatePath(`/evenements/${id}`);
  return { redirect: `/evenements/${id}` };
}

export async function addTeamMember(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  const emp = str(fd, "employee_id");
  if (!id || !emp) return { error: "Choisissez un employé." };
  const supabase = await createClient();
  const { error } = await supabase.from("event_team").insert({ event_id: id, employee_id: emp, role_label: str(fd, "role_label") });
  if (error) return fail(error);
  revalidatePath(`/evenements/${id}`);
  return { ok: "Ajouté à l'équipe (notifié)." };
}

export async function removeTeamMember(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  const emp = str(fd, "employee_id");
  const supabase = await createClient();
  const { error } = await supabase.from("event_team").delete().eq("event_id", id!).eq("employee_id", emp!);
  if (error) return fail(error);
  revalidatePath(`/evenements/${id}`);
  return { ok: "Retiré." };
}
