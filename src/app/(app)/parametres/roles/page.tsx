import { Card, CardHeader } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { requirePerm } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { saveRolePermissions } from "../actions";

export default async function RolesSettings() {
  const s = await requirePerm("settings.manage");
  if (!s.isAdmin) redirect("/parametres");
  const supabase = await createClient();
  const [{ data: perms }, { data: rp }] = await Promise.all([supabase.from("permissions").select("*").order("sort_order"), supabase.from("role_permissions").select("*")]);
  const has = (role: string, key: string) => (rp ?? []).some((r) => r.role === role && r.permission === key);
  return (
    <Card className="max-w-4xl">
      <CardHeader title="Permissions par rôle" subtitle="Valeurs par défaut. Chaque fiche employé permet ensuite d'accorder ou retirer une permission individuellement." />
      <ActionForm action={saveRolePermissions}>
        <table className="table-base">
          <thead><tr><th>Permission</th><th className="text-center">Direction</th><th className="text-center">Responsable</th><th className="text-center">Employé</th></tr></thead>
          <tbody>
            {(perms ?? []).map((p) => (
              <tr key={p.key}>
                <td><p>{p.label}</p><p className="text-2xs text-ink-300">{p.module}</p></td>
                <td className="text-center"><input type="checkbox" checked disabled className="h-4 w-4 accent-ink" /></td>
                <td className="text-center"><input type="checkbox" name={`manager:${p.key}`} defaultChecked={has("manager", p.key)} className="h-4 w-4 accent-ink" /></td>
                <td className="text-center"><input type="checkbox" name={`employee:${p.key}`} defaultChecked={has("employee", p.key)} className="h-4 w-4 accent-ink" /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-line px-5 py-4">
          <p className="text-xs text-ink-400">Un responsable ne voit que les tâches et présences de ses propres départements, sauf permission « toutes ».</p>
          <SubmitButton>Enregistrer</SubmitButton>
        </div>
      </ActionForm>
    </Card>
  );
}
