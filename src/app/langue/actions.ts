"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isLang } from "@/lib/i18n";

/** Change la langue : mémorisée sur ce téléphone et sur la fiche de la personne connectée. */
export async function setLang(lang: string) {
  if (!isLang(lang)) return;
  (await cookies()).set("lang", lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) await supabase.rpc("set_my_lang", { p_lang: lang });
  revalidatePath("/", "layout");
}
