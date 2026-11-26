"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth";
import { fail, str, type ActionResult } from "@/lib/action";

function employeePayload(fd: FormData) {
  return {
    first_name: str(fd, "first_name"),
    last_name: str(fd, "last_name") ?? "",
    job_title: str(fd, "job_title"),
    department_id: str(fd, "department_id"),
    phone: str(fd, "phone"),
    email: str(fd, "email"),
    hire_date: str(fd, "hire_date"),
    schedule_id: str(fd, "schedule_id"),
    status: (str(fd, "status") ?? "actif") as "actif" | "inactif" | "suspendu",
    notes: str(fd, "notes"),
  };
}

export async function createEmployee(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  if (!s.can("employees.manage")) return { error: "Permission refusée." };
  const payload = employeePayload(fd);
  if (!payload.first_name) return { error: "Le prénom est obligatoire." };
  const role = (str(fd, "role") ?? "employee") as "admin" | "manager" | "employee";
  const supabase = await createClient();
  const { data, error } = await supabase.from("employees").insert({ ...payload, role: s.isAdmin ? role : "employee" }).select("id").single();
  if (error) return fail(error);
  const pin = str(fd, "pin");
  if (pin) {
    const { error: e2 } = await supabase.rpc("set_employee_pin", { p_employee: data.id, p_pin: pin });
    if (e2) return { error: `Employé créé, mais PIN refusé : ${e2.message}`, redirect: `/equipe/${data.id}` };
  }
  revalidatePath("/equipe");
  return { redirect: `/equipe/${data.id}` };
}

export async function updateEmployee(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  if (!id) return { error: "Employé introuvable." };
  const payload = employeePayload(fd);
  if (!payload.first_name) return { error: "Le prénom est obligatoire." };
  const supabase = await createClient();
  const { error } = await supabase.from("employees").update(payload).eq("id", id);
  if (error) return fail(error);
  revalidatePath(`/equipe/${id}`);
  revalidatePath("/equipe");
  return { ok: "Fiche enregistrée." };
}

export async function setPin(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  const pin = str(fd, "pin");
  if (!id || !pin) return { error: "PIN requis." };
  if (pin !== str(fd, "pin_confirm")) return { error: "Les deux codes ne correspondent pas." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_employee_pin", { p_employee: id, p_pin: pin });
  if (error) return fail(error);
  revalidatePath(`/equipe/${id}`);
  return { ok: "Code PIN enregistré. Il n'est jamais affiché ni stocké en clair." };
}

export async function uploadPhoto(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  const file = fd.get("photo");
  if (!id || !(file instanceof File) || file.size === 0) return { error: "Choisissez une image." };
  if (!file.type.startsWith("image/")) return { error: "Le fichier doit être une image." };
  if (file.size > 5 * 1024 * 1024) return { error: "Image trop lourde (5 Mo maximum)." };
  const supabase = await createClient();
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${id}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type, upsert: false });
  if (error) return fail(error);
  const { error: e2 } = await supabase.from("employees").update({ photo_path: path }).eq("id", id);
  if (e2) return fail(e2);
  revalidatePath(`/equipe/${id}`);
  return { ok: "Photo mise à jour." };
}

async function auditAsAdmin(actorEmployeeId: string, actorUserId: string, recordId: string, action: string, summary: string) {
  const admin = createAdminClient();
  await admin.from("audit_log").insert({ actor_employee_id: actorEmployeeId, actor_user_id: actorUserId, table_name: "auth.users", record_id: recordId, action, summary });
}

export async function createAccount(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  if (!s.isAdmin) return { error: "Seule la direction peut créer des accès." };
  const id = str(fd, "id");
  const email = str(fd, "email");
  const password = str(fd, "password");
  if (!id || !email || !password) return { error: "Email et mot de passe provisoire requis." };
  if (password.length < 8) return { error: "Mot de passe : 8 caractères minimum." };
  const admin = createAdminClient();
  const { data: emp } = await admin.from("employees").select("user_id").eq("id", id).single();
  if (emp?.user_id) return { error: "Cet employé a déjà un accès." };
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) return fail(error?.message.includes("already") ? "Cet email est déjà utilisé." : error ?? "Création impossible.");
  const { error: e2 } = await admin.from("employees").update({ user_id: data.user.id, email }).eq("id", id);
  if (e2) {
    await admin.auth.admin.deleteUser(data.user.id);
    return fail(e2);
  }
  await auditAsAdmin(s.employee.id, s.userId, data.user.id, "ACCES_CREE", `Accès créé pour ${email}`);
  revalidatePath(`/equipe/${id}`);
  return { ok: `Accès créé. Transmettez à l'employé son email (${email}) et son mot de passe provisoire.` };
}

export async function resetPassword(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  if (!s.isAdmin) return { error: "Permission refusée." };
  const id = str(fd, "id");
  const password = str(fd, "password");
  if (!id || !password || password.length < 8) return { error: "Mot de passe : 8 caractères minimum." };
  const admin = createAdminClient();
  const { data: emp } = await admin.from("employees").select("user_id").eq("id", id).single();
  if (!emp?.user_id) return { error: "Aucun accès lié." };
  const { error } = await admin.auth.admin.updateUserById(emp.user_id, { password });
  if (error) return fail(error);
  await auditAsAdmin(s.employee.id, s.userId, emp.user_id, "MOT_DE_PASSE", "Mot de passe réinitialisé");
  return { ok: "Mot de passe réinitialisé." };
}

export async function revokeAccount(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  if (!s.isAdmin) return { error: "Permission refusée." };
  const id = str(fd, "id");
  if (!id) return { error: "Employé introuvable." };
  if (id === s.employee.id) return { error: "Vous ne pouvez pas retirer votre propre accès." };
  const admin = createAdminClient();
  const { data: emp } = await admin.from("employees").select("user_id").eq("id", id).single();
  if (!emp?.user_id) return { error: "Aucun accès lié." };
  await admin.from("employees").update({ user_id: null }).eq("id", id);
  await admin.auth.admin.deleteUser(emp.user_id);
  await auditAsAdmin(s.employee.id, s.userId, emp.user_id, "ACCES_RETIRE", "Accès de connexion supprimé");
  revalidatePath(`/equipe/${id}`);
  return { ok: "Accès supprimé. La fiche et l'historique sont conservés." };
}

export async function saveAccess(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  if (!s.isAdmin) return { error: "Seule la direction peut modifier les rôles et permissions." };
  const id = str(fd, "id");
  const role = str(fd, "role") as "admin" | "manager" | "employee" | null;
  if (!id || !role) return { error: "Données incomplètes." };
  if (id === s.employee.id && role !== "admin") return { error: "Vous ne pouvez pas retirer votre propre rôle d'administrateur." };
  const supabase = await createClient();
  const { error } = await supabase.from("employees").update({ role }).eq("id", id);
  if (error) return fail(error);
  const { data: perms } = await supabase.from("permissions").select("key");
  for (const p of perms ?? []) {
    const v = fd.get(`perm:${p.key}`);
    if (v === "grant" || v === "revoke") {
      const { error: e } = await supabase.from("employee_permissions").upsert({ employee_id: id, permission: p.key, granted: v === "grant" });
      if (e) return fail(e);
    } else {
      await supabase.from("employee_permissions").delete().eq("employee_id", id).eq("permission", p.key);
    }
  }
  revalidatePath(`/equipe/${id}`);
  return { ok: "Rôle et permissions enregistrés." };
}

/** Données personnelles (CIN, CNSS…) : Direction uniquement, table séparée protégée. */
export async function savePrivate(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  if (!s.isAdmin) return { error: "Réservé à la direction." };
  const id = str(fd, "id");
  if (!id) return { error: "Employé introuvable." };
  const cin = str(fd, "cin")?.toUpperCase().replace(/\s+/g, "") ?? null;
  if (cin && !/^[A-Z]{1,2}\d{3,7}$/.test(cin)) return { error: "CIN invalide (ex. BE123456)." };
  const supabase = await createClient();
  const { error } = await supabase.from("employee_private").upsert({
    employee_id: id, cin,
    birth_date: str(fd, "birth_date"), address: str(fd, "address"),
    emergency_name: str(fd, "emergency_name"), emergency_phone: str(fd, "emergency_phone"),
    contract_type: str(fd, "contract_type"), contract_end: str(fd, "contract_end"),
    cnss_number: str(fd, "cnss_number"), bank_rib: str(fd, "bank_rib"),
  });
  if (error) return fail(error);
  revalidatePath(`/equipe/${id}`);
  return { ok: "Données personnelles enregistrées." };
}
