"use server";

import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { fail, str, type ActionResult } from "@/lib/action";
import { KIOSK_COOKIE, isMobileRequest } from "@/lib/kiosk";

export async function saveDepartment(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  const name = str(fd, "name");
  if (!name) return { error: "Le nom est obligatoire." };
  const payload = {
    name, code: str(fd, "code"), description: str(fd, "description"),
    scope: (str(fd, "scope") ?? "").split(",").map((x) => x.trim()).filter(Boolean),
    color: str(fd, "color") ?? "#A39382", sort_order: Number(str(fd, "sort_order") ?? 100),
    is_active: fd.getAll("is_active").includes("on"),
  };
  const supabase = await createClient();
  const res = id ? await supabase.from("departments").update(payload).eq("id", id).select("id").single() : await supabase.from("departments").insert(payload).select("id").single();
  if (res.error) return fail(res.error);
  const deptId = res.data.id;
  const managers = fd.getAll("managers").map(String).filter(Boolean);
  await supabase.from("department_managers").delete().eq("department_id", deptId);
  if (managers.length) {
    const { error } = await supabase.from("department_managers").insert(managers.map((employee_id) => ({ department_id: deptId, employee_id })));
    if (error) return fail(error);
  }
  revalidatePath("/parametres/departements");
  return id ? { ok: "Département enregistré." } : { ok: "Département créé.", redirect: "/parametres/departements" };
}

export async function deleteDepartment(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  const supabase = await createClient();
  const { count } = await supabase.from("employees").select("id", { count: "exact", head: true }).eq("department_id", id!);
  if (count) return { error: `${count} employé(s) rattaché(s) : réaffectez-les ou désactivez plutôt le département.` };
  const { error } = await supabase.from("departments").delete().eq("id", id!);
  if (error) return fail(error);
  revalidatePath("/parametres/departements");
  return { ok: "Département supprimé." };
}

export async function saveSchedule(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  const name = str(fd, "name");
  if (!name) return { error: "Le nom est obligatoire." };
  const days: Record<string, { start: string; end: string }> = {};
  for (let d = 1; d <= 7; d++) {
    if (fd.get(`on_${d}`) === "on") {
      const start = str(fd, `start_${d}`);
      const end = str(fd, `end_${d}`);
      if (!start || !end || end <= start) return { error: "Vérifiez les heures : la fin doit être après le début." };
      days[String(d)] = { start, end };
    }
  }
  const payload = { name, days, grace_minutes: Number(str(fd, "grace_minutes") ?? 10), is_default: fd.get("is_default") === "on" };
  const supabase = await createClient();
  if (payload.is_default) await supabase.from("work_schedules").update({ is_default: false }).neq("id", id ?? "00000000-0000-0000-0000-000000000000");
  const { error } = id ? await supabase.from("work_schedules").update(payload).eq("id", id) : await supabase.from("work_schedules").insert(payload);
  if (error) return fail(error);
  revalidatePath("/parametres/horaires");
  return { ok: "Horaire enregistré." };
}

export async function deleteSchedule(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("work_schedules").delete().eq("id", str(fd, "id")!);
  if (error) return fail(error);
  revalidatePath("/parametres/horaires");
  return { ok: "Horaire supprimé. Les employés concernés passent sur l'horaire par défaut." };
}

/** Enregistre le navigateur actuel comme kiosque de pointage (cookie sécurisé, non lisible en JavaScript). */
export async function registerKiosk(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  if (!s.can("settings.manage")) return { error: "Permission refusée." };
  if (await isMobileRequest()) return { error: "Un kiosque doit être un ordinateur, pas un téléphone." };
  const name = str(fd, "name") ?? "Kiosque";
  const token = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(token).digest("hex");
  const supabase = await createClient();
  const { error } = await supabase.from("kiosk_devices").insert({ name, token_hash: hash, allowed_ip: str(fd, "allowed_ip"), created_by: s.employee.id });
  if (error) return fail(error);
  const c = await cookies();
  c.set(KIOSK_COOKIE, token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 400 });
  revalidatePath("/parametres/kiosques");
  return { ok: "Cet ordinateur est maintenant un kiosque. Ouvrez /kiosque (vous pouvez vous déconnecter)." };
}

export async function toggleKiosk(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("kiosk_devices").update({ is_active: fd.get("active") === "1", allowed_ip: str(fd, "allowed_ip") }).eq("id", str(fd, "id")!);
  if (error) return fail(error);
  revalidatePath("/parametres/kiosques");
  return { ok: "Poste mis à jour." };
}

export async function saveRolePermissions(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  if (!s.isAdmin) return { error: "Réservé à la direction." };
  const supabase = await createClient();
  const { data: perms } = await supabase.from("permissions").select("key");
  const rows: { role: "manager" | "employee"; permission: string }[] = [];
  for (const role of ["manager", "employee"] as const) for (const p of perms ?? []) if (fd.get(`${role}:${p.key}`) === "on") rows.push({ role, permission: p.key });
  const { error } = await supabase.from("role_permissions").delete().in("role", ["manager", "employee"]);
  if (error) return fail(error);
  if (rows.length) {
    const { error: e2 } = await supabase.from("role_permissions").insert(rows);
    if (e2) return fail(e2);
  }
  revalidatePath("/parametres/roles");
  return { ok: "Permissions par rôle enregistrées." };
}

export async function saveCompany(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const n = (k: string, d: number) => { const v = Number((str(fd, k) ?? "").replace(",", ".")); return Number.isFinite(v) && str(fd, k) ? v : d; };
  const { error } = await supabase.from("company_settings").update({
    company_name: str(fd, "company_name") ?? "Bohemia Events", overdue_notify_management: fd.get("overdue_notify_management") === "on", updated_at: new Date().toISOString(),
    legal_name: str(fd, "legal_name") ?? str(fd, "company_name") ?? "Bohemia Events", address: str(fd, "address"), phone: str(fd, "phone"), email: str(fd, "email"),
    ice: str(fd, "ice"), rc: str(fd, "rc"), if_number: str(fd, "if_number"), patente: str(fd, "patente"), bank_name: str(fd, "bank_name"), rib: str(fd, "rib"), website: str(fd, "website"), signatory: str(fd, "signatory"),
    vat_rate: n("vat_rate", 20), deposit_pct: n("deposit_pct", 50), quote_validity_days: Math.round(n("quote_validity_days", 15)),
    ...(str(fd, "quote_terms") ? { quote_terms: str(fd, "quote_terms") } : {}), ...(str(fd, "contract_terms") ? { contract_terms: str(fd, "contract_terms") } : {}),
  }).eq("id", true);
  if (error) return fail(error);
  revalidatePath("/parametres");
  return { ok: "Paramètres enregistrés." };
}
