"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp, getKioskToken, isMobileRequest } from "@/lib/kiosk";
import type { PunchKind } from "@/lib/types";

export interface PunchResult {
  ok: boolean;
  error?: string;
  employee?: string;
  kind?: PunchKind;
  at?: string;
  status?: string;
  late_minutes?: number;
  worked_minutes?: number;
  overtime_minutes?: number;
}

const KINDS: PunchKind[] = ["arrivee", "sortie", "retour", "depart"];

export async function kioskPunch(employeeId: string, pin: string, kind: PunchKind): Promise<PunchResult> {
  if (await isMobileRequest()) return { ok: false, error: "Le pointage est interdit depuis un téléphone." };
  const token = await getKioskToken();
  if (!token) return { ok: false, error: "Ce poste n'est pas enregistré comme kiosque." };
  if (!KINDS.includes(kind) || !/^[0-9]{4,6}$/.test(pin)) return { ok: false, error: "Saisie invalide." };
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("kiosk_punch", {
    p_token: token, p_employee: employeeId, p_pin: pin, p_kind: kind, p_ip: await clientIp(),
  });
  if (error) return { ok: false, error: "Erreur d'enregistrement. Réessayez." };
  return data as PunchResult;
}

export async function kioskRefresh() {
  const token = await getKioskToken();
  if (!token) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("kiosk_employees", { p_token: token });
  if (error) return null;
  return data as { id: string; last_kind: PunchKind | null }[];
}
