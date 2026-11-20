import Link from "next/link";
import { Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { requireSession, isManagerish } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadDepartments, loadEmployees, loadSchedules } from "@/lib/queries";
import { signedUrls } from "@/lib/storage";
import { fullName } from "@/lib/format";
import { ROLE } from "@/lib/labels";
import { cn } from "@/lib/cn";

export const metadata = { title: "Équipe" };

export default async function EquipePage({ searchParams }: { searchParams: Promise<{ departement?: string; statut?: string }> }) {
  const sp = await searchParams;
  const s = await requireSession();
  if (!(s.can("employees.view") || s.can("employees.manage") || isManagerish(s))) redirect("/ma-journee");
  const supabase = await createClient();
  const [employees, departments, schedules, { data: managers }] = await Promise.all([
    loadEmployees(supabase, { activeOnly: false }), loadDepartments(supabase), loadSchedules(supabase),
    supabase.from("department_managers").select("department_id, employee_id"),
  ]);
  const statut = sp.statut ?? "actif";
  const list = employees.filter((e) => (statut === "tous" || e.status === statut) && (!sp.departement || e.department_id === sp.departement));
  const urls = await signedUrls(supabase, "avatars", list.map((e) => e.photo_path));
  const dept = new Map(departments.map((d) => [d.id, d]));
  const sched = new Map(schedules.map((x) => [x.id, x.name]));
  const mgrSet = new Set((managers ?? []).map((m) => m.employee_id));

  return (
    <>
      <PageHeader eyebrow="Organisation" title="Équipe" subtitle={`${employees.filter((e) => e.status === "actif").length} employés actifs · ${departments.filter((d) => d.is_active).length} départements`}
        actions={s.can("employees.manage") && <ButtonLink href="/equipe/nouveau"><Plus className="h-4 w-4" /> Nouvel employé</ButtonLink>} />

      <div className="mb-6 flex flex-wrap gap-2">
        <Chip href={`/equipe?statut=${statut}`} active={!sp.departement}>Tous</Chip>
        {departments.filter((d) => d.is_active).map((d) => (
          <Chip key={d.id} href={`/equipe?departement=${d.id}&statut=${statut}`} active={sp.departement === d.id}>
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: d.color }} />{d.name}
          </Chip>
        ))}
        <span className="mx-2 border-l border-line" />
        {[["actif", "Actifs"], ["inactif", "Inactifs"], ["tous", "Tous statuts"]].map(([k, l]) => (
          <Chip key={k} href={`/equipe?statut=${k}${sp.departement ? `&departement=${sp.departement}` : ""}`} active={statut === k}>{l}</Chip>
        ))}
      </div>

      <Card>
        {list.length === 0 ? <Empty title="Aucun employé." /> : (
          <table className="table-base">
            <thead><tr><th>Employé</th><th>Fonction</th><th>Département</th><th>Horaires</th><th>Téléphone</th><th>Accès</th><th>Statut</th></tr></thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id}>
                  <td>
                    <Link href={`/equipe/${e.id}`} className="flex items-center gap-3">
                      <Avatar person={e} url={e.photo_path ? urls.get(e.photo_path) : null} size={34} />
                      <div>
                        <p className="font-medium hover:underline">{fullName(e)}</p>
                        {mgrSet.has(e.id) && <p className="text-xs text-taupe-500">Responsable</p>}
                      </div>
                    </Link>
                  </td>
                  <td className="text-ink-500">{e.job_title ?? "—"}</td>
                  <td>{e.department_id ? dept.get(e.department_id)?.name : "—"}</td>
                  <td className="text-ink-500">{e.schedule_id ? sched.get(e.schedule_id) : "Par défaut"}</td>
                  <td className="tabular-nums text-ink-500">{e.phone ?? "—"}</td>
                  <td>{e.user_id ? <span className="text-xs text-ink-500">{ROLE[e.role]}</span> : <span className="text-xs text-ink-300">Pas de compte</span>}</td>
                  <td><Badge tone={e.status === "actif" ? "sage" : e.status === "suspendu" ? "ochre" : "neutral"}>{e.status === "actif" ? "Actif" : e.status === "suspendu" ? "Suspendu" : "Inactif"}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn("inline-flex items-center rounded-full border px-3 py-1 text-xs transition",
      active ? "border-ink bg-ink text-ivory" : "border-line bg-white text-ink-500 hover:border-taupe-300")}>{children}</Link>
  );
}
