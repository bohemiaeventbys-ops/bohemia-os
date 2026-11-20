import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CalendarClock, FileText, Paperclip, Sparkles, Target, User } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Empty } from "@/components/ui/empty";
import { buttonClass } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Input, Textarea } from "@/components/ui/field";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedUrls } from "@/lib/storage";
import { formatDate, formatDateTime, hhmm, relativeTime } from "@/lib/dates";
import { fullName } from "@/lib/format";
import { EVENT_TYPE, PRIORITY, TASK_STATUS } from "@/lib/labels";
import { isDone, isOverdue } from "@/lib/tasks";
import type { Task, TaskStatus } from "@/lib/types";
import { addComment, changeStatus, deleteAttachment, deleteTask, duplicateTask } from "../actions";

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireSession();
  const supabase = await createClient();
  const { data: t } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle<Task>();
  if (!t) notFound();
  const [{ data: staff }, { data: event }, { data: dept }, { data: collab }, { data: comments }, { data: files }, { data: history }] = await Promise.all([
    supabase.from("employees").select("id, first_name, last_name, photo_path"),
    t.event_id ? supabase.from("events").select("id, name, event_date, event_type, address").eq("id", t.event_id).maybeSingle() : Promise.resolve({ data: null }),
    t.department_id ? supabase.from("departments").select("name").eq("id", t.department_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("task_collaborators").select("employee_id").eq("task_id", id),
    supabase.from("task_comments").select("*").eq("task_id", id).order("created_at"),
    supabase.from("task_attachments").select("*").eq("task_id", id).order("created_at"),
    supabase.from("task_history").select("*").eq("task_id", id).order("created_at", { ascending: false }),
  ]);
  const people = new Map((staff ?? []).map((p) => [p.id, p]));
  const fileUrls = await signedUrls(supabase, "task-files", (files ?? []).map((f) => f.storage_path));
  const me = s.employee.id;
  const canManage = s.can("tasks.manage") || t.created_by === me || (!!t.department_id && s.managedDepartmentIds.includes(t.department_id));
  const canValidate = canManage || s.can("tasks.validate");
  const collabIds = (collab ?? []).map((c) => c.employee_id as string);
  const worker = t.assignee_id === me || collabIds.includes(me);
  const overdue = isOverdue(t);
  const assignee = t.assignee_id ? people.get(t.assignee_id) : null;

  const workerActions: { status: TaskStatus; label: string; note?: string; primary?: boolean }[] = [];
  if (worker && !isDone(t)) {
    if (["a_faire", "en_attente", "a_corriger", "bloque"].includes(t.status)) workerActions.push({ status: "en_cours", label: t.status === "a_faire" ? "Démarrer" : "Reprendre", primary: true });
    if (t.status === "en_cours") {
      workerActions.push({ status: "en_attente", label: "Mettre en pause" });
      workerActions.push(t.requires_validation ? { status: "a_verifier", label: "Soumettre à validation", primary: true } : { status: "termine", label: "Terminer", primary: true });
    }
    if (t.status !== "bloque" && t.status !== "a_verifier") workerActions.push({ status: "bloque", label: "Signaler un blocage", note: "Qu'est-ce qui bloque ?" });
  }
  const managerActions: { status: TaskStatus; label: string; note?: string; primary?: boolean }[] = [];
  if (canValidate) {
    if (t.status === "a_verifier") {
      managerActions.push({ status: "valide", label: "Valider", primary: true });
      managerActions.push({ status: "a_corriger", label: "Demander une correction", note: "Que faut-il corriger ?" });
    }
    if (!isDone(t) && t.status !== "a_verifier") managerActions.push({ status: "termine", label: "Clôturer comme terminée" });
    if (isDone(t)) managerActions.push({ status: "a_faire", label: "Réouvrir" });
  }

  const histLabel = (h: { action: string; details: Record<string, string> | null }) => {
    const d = h.details ?? {};
    switch (h.action) {
      case "creation": return "a créé la tâche";
      case "statut": return `a changé le statut : ${TASK_STATUS[d.de as TaskStatus]?.label ?? d.de} → ${TASK_STATUS[d.vers as TaskStatus]?.label ?? d.vers}`;
      case "reassignation": return `a réassigné la tâche à ${fullName(people.get(d.vers))}`;
      case "deadline": return `a modifié la deadline : ${d.de || "aucune"} → ${d.vers || "aucune"}`;
      default: return "a modifié la tâche";
    }
  };

  return (
    <>
      <PageHeader eyebrow={<Link href="/taches" className="hover:underline">Tâches</Link>} title={t.title}
        subtitle={<span className="flex flex-wrap items-center gap-2">
          <Badge tone={TASK_STATUS[t.status].tone}>{TASK_STATUS[t.status].label}</Badge>
          <Badge tone={PRIORITY[t.priority].tone} dot={false}>Priorité {PRIORITY[t.priority].label.toLowerCase()}</Badge>
          {overdue && <Badge tone="clay">En retard</Badge>}
          {dept?.name && <span className="text-ink-400">{dept.name}</span>}
        </span>}
        actions={canManage && <>
          <Link href={`/taches/${id}/modifier`} className={buttonClass("secondary", "sm")}>Modifier</Link>
          <ActionForm action={duplicateTask} className="inline">
            <input type="hidden" name="id" value={id} /><input type="hidden" name="shift" value="0" />
            <SubmitButton size="sm" variant="secondary">Dupliquer</SubmitButton>
          </ActionForm>
          <ActionForm action={duplicateTask} className="inline">
            <input type="hidden" name="id" value={id} /><input type="hidden" name="shift" value="7" />
            <SubmitButton size="sm" variant="secondary">Dupliquer à +7 jours</SubmitButton>
          </ActionForm>
        </>} />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {t.status === "bloque" && t.blocked_reason && (
            <div className="flex gap-3 rounded-xl border border-clay-500/20 bg-clay-100 px-4 py-3 text-sm text-clay-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> <span><strong>Blocage signalé :</strong> {t.blocked_reason}</span>
            </div>
          )}

          <Card>
            <CardBody className="grid gap-5 py-5 md:grid-cols-2">
              <Block icon={<FileText className="h-4 w-4" />} label="Ce que je dois faire">{t.description || <span className="text-ink-300">—</span>}</Block>
              <Block icon={<Target className="h-4 w-4" />} label="Résultat attendu">{t.expected_result || <span className="text-ink-300">—</span>}</Block>
              <Block icon={<Sparkles className="h-4 w-4" />} label="Pour quel événement">
                {event ? <Link href={`/evenements/${event.id}`} className="link">{event.name} · {EVENT_TYPE[event.event_type as keyof typeof EVENT_TYPE]} · {formatDate(event.event_date)}</Link> : <span className="text-ink-300">Aucun</span>}
              </Block>
              <Block icon={<CalendarClock className="h-4 w-4" />} label="Quand">
                <p>Réalisation : {t.planned_date ? `${formatDate(t.planned_date)}${t.planned_time ? ` à ${hhmm(t.planned_time)}` : ""}` : "—"}</p>
                <p className={overdue ? "font-medium text-clay-700" : ""}>Deadline : {t.due_date ? `${formatDate(t.due_date)}${t.due_time ? ` à ${hhmm(t.due_time)}` : ""}` : "—"}</p>
              </Block>
              {t.instructions && <Block icon={<FileText className="h-4 w-4" />} label="Instructions" className="md:col-span-2"><p className="whitespace-pre-line">{t.instructions}</p></Block>}
            </CardBody>
          </Card>

          {(workerActions.length > 0 || managerActions.length > 0) && (
            <Card>
              <CardHeader title={worker ? "Mon avancement" : "Actions"} subtitle={t.requires_validation ? "Cette tâche doit être validée par la direction." : undefined} />
              <CardBody className="flex flex-wrap items-start gap-3">
                {[...workerActions, ...managerActions].map((a) => a.note ? (
                  <details key={a.status} className="w-full rounded-xl border border-line bg-sand-50 px-4 py-3 md:w-auto">
                    <summary className="cursor-pointer text-sm font-medium">{a.label}</summary>
                    <ActionForm action={changeStatus} className="mt-3 space-y-2 md:w-96">
                      <input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={a.status} />
                      <Textarea name="note" placeholder={a.note} required />
                      <SubmitButton size="sm" variant={a.status === "bloque" ? "danger" : "primary"}>{a.label}</SubmitButton>
                    </ActionForm>
                  </details>
                ) : (
                  <ActionForm key={a.status} action={changeStatus}>
                    <input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={a.status} />
                    <SubmitButton variant={a.primary ? "primary" : "secondary"}>{a.label}</SubmitButton>
                  </ActionForm>
                ))}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Commentaires" subtitle={`${comments?.length ?? 0} message(s)`} />
            {comments && comments.length > 0 && (
              <ul className="divide-y divide-line">
                {comments.map((c) => {
                  const a = people.get(c.author_id);
                  return (
                    <li key={c.id} className="flex gap-3 px-5 py-3.5">
                      {a && <Avatar person={a} size={28} />}
                      <div className="min-w-0">
                        <p className="text-xs text-ink-400"><span className="font-medium text-ink">{fullName(a)}</span> · {relativeTime(c.created_at)}</p>
                        <p className="mt-1 whitespace-pre-line text-sm">{c.body}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <CardBody className="border-t border-line">
              <ActionForm action={addComment} resetOnSuccess className="space-y-2">
                <input type="hidden" name="id" value={id} />
                <Textarea name="body" placeholder="Écrire un commentaire, poser une question…" rows={2} />
                <div className="flex items-center justify-between gap-3">
                  <Input type="file" name="files" multiple className="max-w-xs border-0 bg-transparent px-0 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-sand-100 file:px-3 file:py-1 file:text-xs" />
                  <SubmitButton size="sm">Envoyer</SubmitButton>
                </div>
              </ActionForm>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Personnes" icon={<User className="h-4 w-4" />} />
            <CardBody className="space-y-3 text-sm">
              <Person label="Responsable" p={assignee} />
              {collabIds.length > 0 && (
                <div>
                  <p className="label">Collaborateurs</p>
                  <div className="space-y-2">{collabIds.map((cid) => <Person key={cid} p={people.get(cid)} />)}</div>
                </div>
              )}
              <Person label="Créée par" p={t.created_by ? people.get(t.created_by) : null} sub={formatDateTime(t.created_at)} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Fichiers" icon={<Paperclip className="h-4 w-4" />} subtitle={`${files?.length ?? 0} fichier(s)`} />
            {!files?.length ? <Empty title="Aucun fichier joint." /> : (
              <ul className="divide-y divide-line">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
                    <a href={fileUrls.get(f.storage_path)} target="_blank" rel="noreferrer" className="min-w-0 truncate link">{f.file_name}</a>
                    {(canManage || f.uploaded_by === me) && (
                      <ActionForm action={deleteAttachment}>
                        <input type="hidden" name="id" value={id} /><input type="hidden" name="attachment_id" value={f.id} />
                        <button className="text-xs text-ink-300 hover:text-clay-700">Retirer</button>
                      </ActionForm>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Historique" />
            <ul className="space-y-3 px-5 py-4 text-xs">
              {(history ?? []).map((h) => (
                <li key={h.id} className="border-l-2 border-line pl-3">
                  <p><span className="font-medium text-ink">{fullName(h.actor_id ? people.get(h.actor_id) : null)}</span> <span className="text-ink-500">{histLabel(h)}</span></p>
                  <p className="text-ink-300">{formatDateTime(h.created_at)}</p>
                </li>
              ))}
            </ul>
          </Card>

          {canManage && (
            <details className="rounded-xl border border-line px-4 py-3 text-sm">
              <summary className="cursor-pointer text-ink-400">Supprimer la tâche</summary>
              <ActionForm action={deleteTask} className="mt-3 space-y-2">
                <input type="hidden" name="id" value={id} />
                <label className="flex items-center gap-2 text-xs text-ink-500"><input type="checkbox" name="confirm" className="accent-clay-500" /> Je confirme la suppression définitive</label>
                <SubmitButton size="sm" variant="danger">Supprimer</SubmitButton>
              </ActionForm>
            </details>
          )}
        </div>
      </div>
    </>
  );
}

function Block({ icon, label, children, className }: { icon: React.ReactNode; label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="label flex items-center gap-1.5"><span className="text-taupe-400">{icon}</span>{label}</p>
      <div className="text-sm leading-relaxed text-ink">{children}</div>
    </div>
  );
}

function Person({ label, p, sub }: { label?: string; p: { first_name: string; last_name: string } | null | undefined; sub?: string }) {
  return (
    <div>
      {label && <p className="label">{label}</p>}
      {p ? <div className="flex items-center gap-2.5"><Avatar person={p} size={26} /><div><p>{fullName(p)}</p>{sub && <p className="text-xs text-ink-400">{sub}</p>}</div></div> : <p className="text-ink-300">—</p>}
    </div>
  );
}
