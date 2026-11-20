import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** URLs signées (1 h) pour des fichiers privés du stockage */
export async function signedUrls(supabase: SupabaseClient, bucket: string, paths: (string | null | undefined)[]) {
  const list = Array.from(new Set(paths.filter((p): p is string => !!p)));
  const out = new Map<string, string>();
  if (!list.length) return out;
  const { data } = await supabase.storage.from(bucket).createSignedUrls(list, 3600);
  for (const d of data ?? []) if (d.signedUrl && d.path) out.set(d.path, d.signedUrl);
  return out;
}
