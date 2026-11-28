"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fail, str, type ActionResult } from "@/lib/action";
import { isValidISODate } from "@/lib/dates";

const KINDS = ["rdv", "appel", "note", "rappel"];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Ajouter à l'agenda partagé (tout le monde peut). */
export async function addAgenda(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireSession();
  const day = str(fd, "day");
  const title = str(fd, "title");
  const kind = str(fd, "kind") ?? "note";
  const start = str(fd, "start_time");
  const end = str(fd, "end_time");
  if (!isValidISODate(day)) return { error: "Choisissez le jour." };
  if (!title) return { error: "Écrivez ce qu'il y a (ex. Appeler Mme Alami)." };
  if (!KINDS.includes(kind)) return { error: "Type invalide." };
  if ((start && !TIME.test(start)) || (end && !TIME.test(end))) return { error: "Heure invalide." };
  if (start && end && end < start) return { error: "L'heure de fin est avant le début." };
  const supabase = await createClient();
  const { error } = await supabase.from("agenda_entries").insert({
    day, kind, title: title.slice(0, 200), start_time: start, end_time: end,
    details: str(fd, "details")?.slice(0, 2000) ?? null, phone: str(fd, "phone")?.slice(0, 40) ?? null,
  });
  if (error) return fail(error);
  revalidatePath("/calendrier");
  return { ok: "Ajouté à l'agenda." };
}

export async function deleteAgenda(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireSession();
  const id = str(fd, "id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return { error: "Invalide." };
  const supabase = await createClient();
  const { error, count } = await supabase.from("agenda_entries").delete({ count: "exact" }).eq("id", id);
  if (error) return fail(error);
  if (!count) return { error: "Seule la personne qui l'a écrit (ou la direction) peut le supprimer." };
  revalidatePath("/calendrier");
  return { ok: "Supprimé." };
}
