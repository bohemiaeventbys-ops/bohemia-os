"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { fail, str, type ActionResult } from "@/lib/action";

export async function saveClient(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  if (!(s.can("clients.manage") || s.can("events.manage"))) return { error: "Permission refusée." };
  const name = str(fd, "name");
  if (!name) return { error: "Donnez le nom du client." };
  const payload = {
    kind: str(fd, "kind") === "entreprise" ? "entreprise" : "particulier",
    name, contact_name: str(fd, "contact_name"), phone: str(fd, "phone"), whatsapp: str(fd, "whatsapp"), email: str(fd, "email"),
    address: str(fd, "address"), city: str(fd, "city"), ice: str(fd, "ice"), source: str(fd, "source"), notes: str(fd, "notes"),
  };
  const supabase = await createClient();
  const id = str(fd, "id");
  const back = str(fd, "back");
  if (id) {
    const { error } = await supabase.from("clients").update(payload).eq("id", id);
    if (error) return fail(error);
    revalidatePath(`/clients/${id}`);
    return { redirect: `/clients/${id}` };
  }
  const { data, error } = await supabase.from("clients").insert(payload).select("id").single();
  if (error) return fail(error);
  revalidatePath("/clients");
  return { redirect: back ? `${back}${back.includes("?") ? "&" : "?"}client=${data.id}` : `/clients/${data.id}` };
}
