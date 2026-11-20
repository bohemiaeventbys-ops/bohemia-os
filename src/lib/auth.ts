import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Employee } from "./types";

export interface Session {
  userId: string;
  email: string | null;
  employee: Employee;
  isAdmin: boolean;
  perms: Set<string>;
  managedDepartmentIds: string[];
  can: (perm: string) => boolean;
}

/** Session courante (employé lié + permissions effectives). Mise en cache par requête. */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: employee } = await supabase.from("employees").select("*").eq("user_id", user.id).eq("status", "actif").maybeSingle<Employee>();
  if (!employee) return null;

  const [{ data: rolePerms }, { data: overrides }, { data: managed }] = await Promise.all([
    supabase.from("role_permissions").select("permission").eq("role", employee.role),
    supabase.from("employee_permissions").select("permission, granted").eq("employee_id", employee.id),
    supabase.from("department_managers").select("department_id").eq("employee_id", employee.id),
  ]);

  const perms = new Set<string>((rolePerms ?? []).map((r) => r.permission as string));
  for (const o of overrides ?? []) {
    if (o.granted) perms.add(o.permission as string);
    else perms.delete(o.permission as string);
  }
  const isAdmin = employee.role === "admin";
  return {
    userId: user.id,
    email: user.email ?? null,
    employee,
    isAdmin,
    perms,
    managedDepartmentIds: (managed ?? []).map((m) => m.department_id as string),
    can: (p: string) => isAdmin || perms.has(p),
  };
});

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/connexion?erreur=compte");
  return s;
}

/** Exige une permission ; sinon renvoie vers « Ma journée ». */
export async function requirePerm(perm: string | string[]): Promise<Session> {
  const s = await requireSession();
  const list = Array.isArray(perm) ? perm : [perm];
  if (!list.some((p) => s.can(p))) redirect("/ma-journee?acces=refuse");
  return s;
}

/** Responsable (d'au moins un département) ou direction */
export function isManagerish(s: Session) {
  return s.isAdmin || s.managedDepartmentIds.length > 0 || s.can("tasks.view_all");
}
