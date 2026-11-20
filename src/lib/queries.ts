import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Session } from "./auth";
import type { Department, Employee, WorkSchedule } from "./types";

export async function loadDepartments(supabase: SupabaseClient) {
  const { data } = await supabase.from("departments").select("*").order("sort_order").order("name");
  return (data ?? []) as Department[];
}
export async function loadEmployees(supabase: SupabaseClient, opts: { activeOnly?: boolean } = {}) {
  let q = supabase.from("employees").select("*").order("first_name");
  if (opts.activeOnly !== false) q = q.eq("status", "actif");
  const { data } = await q;
  return (data ?? []) as Employee[];
}
export async function loadSchedules(supabase: SupabaseClient) {
  const { data } = await supabase.from("work_schedules").select("*").order("name");
  return (data ?? []) as WorkSchedule[];
}

/** Employés dont la session peut suivre la présence */
export function attendanceScope(s: Session, employees: Employee[]) {
  if (s.can("attendance.view_all")) return employees;
  if (s.managedDepartmentIds.length) return employees.filter((e) => e.department_id && s.managedDepartmentIds.includes(e.department_id) || e.id === s.employee.id);
  return employees.filter((e) => e.id === s.employee.id);
}
export function canFollowTeam(s: Session) {
  return s.can("attendance.view_all") || s.managedDepartmentIds.length > 0;
}
