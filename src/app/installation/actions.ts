"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fail, str, type ActionResult } from "@/lib/action";

export async function installAdmin(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = createAdminClient();
  const { count } = await admin.from("employees").select("id", { count: "exact", head: true }).eq("role", "admin").not("user_id", "is", null);
  if ((count ?? 0) > 0) return { error: "L'installation a déjà été effectuée." };

  const first = str(fd, "first_name");
  const last = str(fd, "last_name") ?? "";
  const email = str(fd, "email");
  const password = str(fd, "password");
  if (!first || !email || !password) return { error: "Tous les champs sont requis." };
  if (password.length < 8) return { error: "Le mot de passe doit contenir au moins 8 caractères." };

  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) return fail(error ?? "Création du compte impossible.");
  const { error: e2 } = await admin.from("employees").insert({
    user_id: data.user.id, first_name: first, last_name: last, email, role: "admin", job_title: "Direction",
  });
  if (e2) {
    await admin.auth.admin.deleteUser(data.user.id);
    return fail(e2);
  }
  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email, password });
  return { redirect: "/" };
}
