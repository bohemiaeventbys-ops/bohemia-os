import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { buttonClass } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/dates";
import { fullName } from "@/lib/format";

const TABLES: Record<string, string> = {
  tasks: "Tâches", employees: "Employés", events: "Événements", departments: "Départements", attendance_corrections: "Corrections de pointage",
  employee_permissions: "Permissions individuelles", role_permissions: "Permissions par rôle", work_schedules: "Horaires", kiosk_devices: "Postes de pointage",
  department_managers: "Responsables", employee_pins: "Codes PIN", leave_requests: "Congés", company_settings: "Paramètres", "auth.users": "Comptes de connexion",
};
const ACTIONS: Record<string, string> = { INSERT: "Création", UPDATE: "Modification", DELETE: "Suppression" };

function describe(row: { table_name: string; action: string; summary: string | null; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null }) {
  if (row.summary) return row.summary;
  const d = row.new_data ?? row.old_data ?? {};
  const label = (d.title ?? d.name ?? (d.first_name ? `${d.first_name} ${d.last_name ?? ""}` : null) ?? d.reason ?? "") as string;
  if (row.action === "UPDATE" && row.old_data && row.new_data) {
    const changed = Object.keys(row.new_data).filter((k) => !["updated_at"].includes(k) && JSON.stringify(row.new_data![k]) !== JSON.stringify(row.old_data![k]));
    return `${label} — ${changed.join(", ")}`;
  }
  return label;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ table?: string; page?: string }> }) {
  const sp = await searchParams;
  await requirePerm("audit.view");
  const supabase = await createClient();
  const page = Math.max(0, Number(sp.page ?? 0));
  let q = supabase.from("audit_log").select("*").order("occurred_at", { ascending: false }).range(page * 100, page * 100 + 99);
  if (sp.table) q = q.eq("table_name", sp.table);
  const [{ data }, { data: staff }] = await Promise.all([q, supabase.from("employees").select("id, first_name, last_name")]);
  const people = new Map((staff ?? []).map((p) => [p.id, p]));
  return (
    <>
      <form className="mb-4 flex items-center gap-2">
        <Select name="table" defaultValue={sp.table ?? ""} className="h-9 w-64 py-1"><option value="">Tous les modules</option>{Object.entries(TABLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <button className={buttonClass("secondary", "sm")}>Filtrer</button>
      </form>
      <Card>
        {!data?.length ? <Empty title="Aucune action enregistrée." /> : (
          <table className="table-base">
            <thead><tr><th>Date</th><th>Auteur</th><th>Module</th><th>Action</th><th>Détail</th></tr></thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-ink-500">{formatDateTime(r.occurred_at)}</td>
                  <td>{r.actor_employee_id ? fullName(people.get(r.actor_employee_id)) : <span className="text-ink-300">Système / kiosque</span>}</td>
                  <td>{TABLES[r.table_name] ?? r.table_name}</td>
                  <td>{ACTIONS[r.action] ?? r.action}</td>
                  <td className="max-w-lg truncate text-ink-500" title={describe(r)}>{describe(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <div className="mt-4 flex gap-2">
        {page > 0 && <Link href={`?${new URLSearchParams({ ...(sp.table ? { table: sp.table } : {}), page: String(page - 1) })}`} className={buttonClass("secondary", "sm")}>← Plus récent</Link>}
        {data?.length === 100 && <Link href={`?${new URLSearchParams({ ...(sp.table ? { table: sp.table } : {}), page: String(page + 1) })}`} className={buttonClass("secondary", "sm")}>Plus ancien →</Link>}
      </div>
    </>
  );
}
