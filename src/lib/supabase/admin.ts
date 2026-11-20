import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Client « service » : contourne la RLS. À n'utiliser que côté serveur,
 * pour les opérations encadrées (kiosque, création de comptes, installation).
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY manquante dans l'environnement serveur.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
