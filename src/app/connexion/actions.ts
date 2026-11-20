"use server";

import { createClient } from "@/lib/supabase/server";
import { fail, str, type ActionResult } from "@/lib/action";

export async function signIn(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const email = str(fd, "email");
  const password = str(fd, "password");
  const next = str(fd, "suite");
  if (!email || !password) return { error: "Email et mot de passe requis." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return fail(error.message === "Invalid login credentials" ? "Identifiants incorrects." : error.message);
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return { redirect: safeNext };
}
