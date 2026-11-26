import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseServiceKey, supabaseUrl } from "./env";

/**
 * Client « service » : contourne la RLS. À n'utiliser que côté serveur,
 * pour les opérations encadrées (kiosque, création de comptes, installation).
 */
export function createAdminClient() {
  const key = supabaseServiceKey();
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY manquante dans l'environnement serveur.");
  return createClient(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
