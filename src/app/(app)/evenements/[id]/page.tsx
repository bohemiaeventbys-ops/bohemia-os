import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Empty } from "@/components/ui/empty";
import { buttonClass } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Input, Select } from "@/components/ui/field";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { diffDays, formatDateTime, formatDayLong, todayISO } from "@/lib/dates";
import { formatMAD, fullName } from "@/lib/format";
import { DONE_STATUSES, EVENT_STATUS, EVENT_TYPE } from "@/lib/labels";
import { sortTasks } from "@/lib/tasks";
import type { Employee, EventRow, Task } from "@/lib/types";
import { TaskTable } from "../../taches/task-row";
import { addTeamMember, removeTeamMember } from "../actions";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireSession();
  const supabase = await createClient();
  const { data: e } = await supabase.from("events").select("*").eq("id", id).maybeSingle<EventRow>();
  if (!e) notFound();
  const [{ data: staff }, { data: team }, { data: taskData }] = await Promise.all([
    supabase.from("employees").select("*").eq("status", "actif").order("first_name"),
    supabase.from("event_team").select("*").eq("event_id", id),
    supabase.from("tasks").select("*").eq("event_id", id),
  ]);
  const people = new Map(((staff ?? []) as Employee[]).map((p) => [p.id, p]));
  const tasks = sortTasks((taskData ?? []) as Task[]);
  const done = tasks.filter((t) => DONE_STATUSES.includes(t.status)).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const canEdit = s.can("events.manage");
  const days = diffDays(e.event_date, todayISO());
  const teamIds = new Set((team ?? []).map((t) => t.employee_id));

  return (
    <>
      <PageHeader eyebrow={<Link href="/evenements" className="hover:underline">Événements</Link>} title={e.name}
        subtitle={<span className="flex flex-wrap items-center gap-2"><span className="capitalize">{formatDayLong(e.event_date)}</span> · {EVENT_TYPE[e.event_type]} <Badge tone={EVENT_STATUS[e.status].tone}>{EVENT_STATUS[e.status].label}</Badge>
          {days >= 0 && days <= 2 && <Badge tone="clay">{days === 0 ? "Aujourd'hui" : `J-${days}`}</Badge>}</span>}
        actions={<>
          {s.can("tasks.create") && <Link href={`/taches/nouvelle?evenement=${id}&date=${e.event_date}`} className={buttonClass("secondary", "sm")}><Plus className="h-3.5 w-3.5" /> Tâche</Link>}
          {canEdit && <Link href={`/evenements/${id}/modifier`} className={buttonClass("secondary", "sm")}>Modifier</Link>}
        </>} />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardBody className="grid gap-5 py-5 text-sm md:grid-cols-3">
              <Info label="Client">{e.client_name ?? "—"}{e.client_phone && <p className="text-ink-400">{e.client_phone}</p>}</Info>
              <Info label="Lieu">{e.address ?? "—"}</Info>
              <Info label="Budget">{formatMAD(e.budget_mad)}</Info>
              <Info label="Responsable">{e.manager_id ? fullName(people.get(e.manager_id)) : "—"}</Info>
              <Info label="Livraison">{formatDateTime(e.delivery_at)}</Info>
              <Info label="Installation">{formatDateTime(e.setup_at)}</Info>
              <Info label="Début">{formatDateTime(e.start_at)}</Info>
              <Info label="Fin">{formatDateTime(e.end_at)}</Info>
              <Info label="Démontage">{formatDateTime(e.teardown_at)}</Info>
              {e.notes && <Info label="Notes" className="md:col-span-3"><p className="whitespace-pre-line">{e.notes}</p></Info>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Tâches de l'événement" subtitle={`${done}/${tasks.length} terminées`}
              action={<div className="flex items-center gap-2"><div className="h-1.5 w-32 overflow-hidden rounded-full bg-sand-200"><div className="h-full bg-taupe-500" style={{ width: `${pct}%` }} /></div><span className="text-xs tabular-nums text-ink-400">{pct} %</span></div>} />
            {tasks.length === 0 ? <Empty title="Aucune tâche liée.">Créez les tâches de production, logistique, décoration… depuis le bouton « Tâche ».</Empty> :
              <TaskTable tasks={tasks} people={people} events={new Map()} />}
          </Card>

          <Card>
            <CardHeader title="Fiche technique, décoration, production, logistique, achats, checklist" subtitle="Phase 3" />
            <CardBody className="text-sm text-ink-500">
              Ces sous-sections seront ajoutées à cette fiche en Phase 3, sur la même base : les informations saisies ici une seule fois
              alimenteront la production, le dépôt, le transport et les achats.
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Équipe" subtitle={`${team?.length ?? 0} personne(s)`} />
            {(team ?? []).length === 0 ? <Empty title="Aucune personne assignée." /> : (
              <ul className="divide-y divide-line">
                {(team ?? []).map((m) => {
                  const p = people.get(m.employee_id);
                  return (
                    <li key={m.employee_id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                      <span className="flex items-center gap-2.5">{p && <Avatar person={p} size={26} />}<span>{fullName(p)}{m.role_label && <span className="block text-xs text-ink-400">{m.role_label}</span>}</span></span>
                      {canEdit && (
                        <ActionForm action={removeTeamMember}>
                          <input type="hidden" name="id" value={id} /><input type="hidden" name="employee_id" value={m.employee_id} />
                          <button className="text-xs text-ink-300 hover:text-clay-700">Retirer</button>
                        </ActionForm>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {canEdit && (
              <CardBody className="border-t border-line">
                <ActionForm action={addTeamMember} className="space-y-2" resetOnSuccess>
                  <input type="hidden" name="id" value={id} />
                  <Select name="employee_id" required defaultValue="">
                    <option value="" disabled>Ajouter une personne…</option>
                    {Array.from(people.values()).filter((p) => !teamIds.has(p.id)).map((p) => <option key={p.id} value={p.id}>{fullName(p)}</option>)}
                  </Select>
                  <Input name="role_label" placeholder="Rôle (ex. installation, chauffeur…)" />
                  <SubmitButton size="sm" variant="secondary">Ajouter</SubmitButton>
                </ActionForm>
              </CardBody>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function Info({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={className}><p className="label">{label}</p><div>{children}</div></div>;
}
