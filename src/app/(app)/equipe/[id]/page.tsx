import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Empty } from "@/components/ui/empty";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input, Select } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/button";
import { requireSession, isManagerish } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadDepartments, loadSchedules } from "@/lib/queries";
import { signedUrls } from "@/lib/storage";
import { endOfMonth, formatDate, formatDateTime, formatMinutes, formatMonth, startOfMonth, todayISO } from "@/lib/dates";
import { fullName } from "@/lib/format";
import { OPEN_STATUSES, PRIORITY, ROLE, TASK_STATUS } from "@/lib/labels";
import type { AttendanceDay, Employee, Task } from "@/lib/types";
import { EmployeeFields } from "../employee-form";
import { createAccount, resetPassword, revokeAccount, saveAccess, setPin, updateEmployee, uploadPhoto } from "../actions";

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireSession();
  if (!(s.can("employees.view") || s.can("employees.manage") || isManagerish(s) || id === s.employee.id)) redirect("/ma-journee");
  const supabase = await createClient();
  const { data: e } = await supabase.from("employees").select("*").eq("id", id).maybeSingle<Employee>();
  if (!e) notFound();
  const today = todayISO();
  const [departments, schedules, { data: perms }, { data: rolePerms }, { data: overrides }, { data: tasks }, { data: days }, { data: audit }, { data: managed }] = await Promise.all([
    loadDepartments(supabase), loadSchedules(supabase),
    supabase.from("permissions").select("*").order("sort_order"),
    supabase.from("role_permissions").select("*"),
    supabase.from("employee_permissions").select("*").eq("employee_id", id),
    supabase.from("tasks").select("*").eq("assignee_id", id).in("status", [...OPEN_STATUSES, "a_verifier"]).order("due_date", { ascending: true, nullsFirst: false }).limit(15),
    supabase.from("attendance_days").select("*").eq("employee_id", id).gte("work_date", startOfMonth(today)).lte("work_date", endOfMonth(today)),
    supabase.from("audit_log").select("*").eq("table_name", "employees").eq("record_id", id).order("occurred_at", { ascending: false }).limit(10),
    supabase.from("department_managers").select("department_id").eq("employee_id", id),
  ]);
  const urls = await signedUrls(supabase, "avatars", [e.photo_path]);
  const canEdit = s.can("employees.manage");
  const dept = departments.find((d) => d.id === e.department_id);
  const monthDays = (days ?? []) as AttendanceDay[];
  const worked = monthDays.reduce((a, d) => a + d.worked_minutes, 0);
  const lates = monthDays.filter((d) => d.late_minutes > 0).length;
  const ov = new Map((overrides ?? []).map((o) => [o.permission, o.granted]));
  const roleDefaults = new Set((rolePerms ?? []).filter((r) => r.role === e.role).map((r) => r.permission));
  const managedNames = departments.filter((d) => (managed ?? []).some((m) => m.department_id === d.id)).map((d) => d.name);

  return (
    <>
      <PageHeader eyebrow={<Link href="/equipe" className="hover:underline">Équipe</Link>}
        title={<span className="flex items-center gap-4"><Avatar person={e} url={e.photo_path ? urls.get(e.photo_path) : null} size={56} />{fullName(e)}</span>}
        subtitle={[e.job_title, dept?.name, managedNames.length ? `Responsable : ${managedNames.join(", ")}` : null].filter(Boolean).join(" · ")}
        actions={<>
          <Link href={`/pointage/${e.id}`} className={buttonClass("secondary", "sm")}>Pointage</Link>
          <Link href={`/taches?responsable=${e.id}`} className={buttonClass("secondary", "sm")}>Tâches</Link>
        </>} />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Fiche employé" subtitle={`Créée le ${formatDate(e.created_at.slice(0, 10))}`} action={<Badge tone={e.status === "actif" ? "sage" : "neutral"}>{e.status}</Badge>} />
            <CardBody className="py-5">
              {canEdit ? (
                <ActionForm action={updateEmployee}>
                  <input type="hidden" name="id" value={e.id} />
                  <EmployeeFields e={e} departments={departments} schedules={schedules} />
                  <div className="mt-5 flex justify-end"><SubmitButton>Enregistrer</SubmitButton></div>
                </ActionForm>
              ) : (
                <dl className="grid gap-4 text-sm md:grid-cols-2">
                  {[["Fonction", e.job_title], ["Département", dept?.name], ["Téléphone", e.phone], ["Email", e.email], ["Date d'entrée", formatDate(e.hire_date)],
                    ["Horaires", schedules.find((x) => x.id === e.schedule_id)?.name ?? "Par défaut"]].map(([k, v]) => (
                    <div key={k}><dt className="label">{k}</dt><dd>{v || "—"}</dd></div>
                  ))}
                </dl>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Tâches en cours" subtitle={`${tasks?.length ?? 0} tâche(s) ouverte(s)`} action={<Link href={`/taches?responsable=${e.id}`} className="link text-xs">Toutes ses tâches</Link>} />
            {!tasks?.length ? <Empty title="Aucune tâche ouverte." /> : (
              <ul className="divide-y divide-line">
                {(tasks as Task[]).map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-4 px-5 py-3">
                    <Link href={`/taches/${t.id}`} className="min-w-0 truncate text-sm font-medium hover:underline">{t.title}</Link>
                    <div className="flex shrink-0 items-center gap-2">
                      {t.priority !== "normale" && <Badge tone={PRIORITY[t.priority].tone} dot={false}>{PRIORITY[t.priority].label}</Badge>}
                      <Badge tone={TASK_STATUS[t.status].tone}>{TASK_STATUS[t.status].label}</Badge>
                      <span className="w-20 text-right text-xs text-ink-400">{formatDate(t.due_date)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Historique de la fiche" subtitle="Modifications enregistrées automatiquement" />
            {!audit?.length ? <Empty title="Aucune modification." /> : (
              <ul className="divide-y divide-line text-sm">
                {audit.map((a) => {
                  const changed = a.action === "UPDATE" && a.old_data && a.new_data
                    ? Object.keys(a.new_data).filter((k) => k !== "updated_at" && JSON.stringify(a.new_data[k]) !== JSON.stringify(a.old_data[k])) : [];
                  return (
                    <li key={a.id} className="px-5 py-2.5">
                      <span className="text-ink-400">{formatDateTime(a.occurred_at)}</span> · {a.action === "INSERT" ? "Création" : a.action === "UPDATE" ? `Modification : ${changed.join(", ") || "—"}` : a.action}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title={`Présence — ${formatMonth(today)}`} />
            <CardBody className="grid grid-cols-3 gap-3 text-center">
              <div><p className="font-display text-3xl">{monthDays.filter((d) => d.first_in).length}</p><p className="text-xs text-ink-400">jours présents</p></div>
              <div><p className={`font-display text-3xl ${lates ? "text-clay-700" : ""}`}>{lates}</p><p className="text-xs text-ink-400">retards</p></div>
              <div><p className="font-display text-3xl">{Math.round(worked / 60)}</p><p className="text-xs text-ink-400">heures ({formatMinutes(worked)})</p></div>
            </CardBody>
          </Card>

          {canEdit && (
            <>
              <Card>
                <CardHeader title="Photo" />
                <CardBody>
                  <ActionForm action={uploadPhoto} className="space-y-3">
                    <input type="hidden" name="id" value={e.id} />
                    <Input type="file" name="photo" accept="image/*" required className="file:mr-3 file:rounded-md file:border-0 file:bg-sand-100 file:px-3 file:py-1 file:text-xs" />
                    <SubmitButton size="sm" variant="secondary">Mettre à jour la photo</SubmitButton>
                  </ActionForm>
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Code PIN de pointage" subtitle="Utilisé uniquement sur le kiosque. Jamais affiché." />
                <CardBody>
                  <ActionForm action={setPin} className="space-y-3" resetOnSuccess>
                    <input type="hidden" name="id" value={e.id} />
                    <div className="grid grid-cols-2 gap-3">
                      <Input name="pin" type="password" inputMode="numeric" pattern="[0-9]{4,6}" placeholder="Nouveau PIN" autoComplete="new-password" required />
                      <Input name="pin_confirm" type="password" inputMode="numeric" pattern="[0-9]{4,6}" placeholder="Confirmer" autoComplete="new-password" required />
                    </div>
                    <SubmitButton size="sm" variant="secondary">Définir le PIN</SubmitButton>
                  </ActionForm>
                </CardBody>
              </Card>
            </>
          )}

          {s.isAdmin && (
            <Card>
              <CardHeader title="Accès à la plateforme" subtitle={e.user_id ? "Compte de connexion actif" : "Aucun compte : l'employé peut seulement pointer."} />
              <CardBody className="space-y-4">
                {!e.user_id ? (
                  <ActionForm action={createAccount} className="space-y-3">
                    <input type="hidden" name="id" value={e.id} />
                    <Field label="Email de connexion"><Input name="email" type="email" defaultValue={e.email ?? ""} required /></Field>
                    <Field label="Mot de passe provisoire"><Input name="password" type="text" minLength={8} required autoComplete="off" /></Field>
                    <SubmitButton size="sm">Créer l&apos;accès</SubmitButton>
                  </ActionForm>
                ) : (
                  <>
                    <p className="text-sm text-ink-500">Connexion : <strong>{e.email}</strong></p>
                    <ActionForm action={resetPassword} className="flex gap-2" resetOnSuccess>
                      <input type="hidden" name="id" value={e.id} />
                      <Input name="password" type="text" minLength={8} placeholder="Nouveau mot de passe" required autoComplete="off" />
                      <SubmitButton size="sm" variant="secondary">Réinitialiser</SubmitButton>
                    </ActionForm>
                    {e.id !== s.employee.id && (
                      <ActionForm action={revokeAccount}>
                        <input type="hidden" name="id" value={e.id} />
                        <SubmitButton size="sm" variant="danger">Supprimer l&apos;accès</SubmitButton>
                      </ActionForm>
                    )}
                  </>
                )}
              </CardBody>
            </Card>
          )}

          {s.isAdmin && (
            <Card>
              <CardHeader title="Rôle et permissions" subtitle="Les permissions par défaut viennent du rôle ; vous pouvez les ajuster pour cette personne." />
              <CardBody>
                <ActionForm action={saveAccess} className="space-y-4">
                  <input type="hidden" name="id" value={e.id} />
                  <Field label="Niveau d'accès">
                    <Select name="role" defaultValue={e.role}>{Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                  </Field>
                  {e.role === "admin" ? <p className="text-xs text-ink-400">Un administrateur dispose de toutes les permissions.</p> : (
                    <div className="space-y-2">
                      {(perms ?? []).map((p) => {
                        const o = ov.get(p.key);
                        return (
                          <div key={p.key} className="flex items-center justify-between gap-3 text-sm">
                            <span className="min-w-0"><span className="text-ink">{p.label}</span><span className="block text-2xs text-ink-300">{p.module} · défaut : {roleDefaults.has(p.key) ? "oui" : "non"}</span></span>
                            <select name={`perm:${p.key}`} defaultValue={o === true ? "grant" : o === false ? "revoke" : "default"} className="field h-8 w-28 shrink-0 py-0 text-xs">
                              <option value="default">Défaut</option><option value="grant">Accordée</option><option value="revoke">Retirée</option>
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <SubmitButton size="sm">Enregistrer les accès</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
