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
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FileText, Hammer, Handshake, Lock, Palette, Sparkles, Warehouse } from "lucide-react";
import { generateEventTasks } from "../../parametres/taches-auto/actions";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { diffDays, formatDateTime, formatDayLong, todayISO } from "@/lib/dates";
import { formatMAD, fullName } from "@/lib/format";
import { DONE_STATUSES, EVENT_STATUS, EVENT_TYPE } from "@/lib/labels";
import { sortTasks } from "@/lib/tasks";
import type { Employee, EventFinance, EventRow, Task } from "@/lib/types";
import { TaskTable } from "../../taches/task-row";
import { addTeamMember, removeTeamMember, saveFinances } from "../actions";
import { ServicesCard } from "./services-card";
import { ClientDocsCard } from "./client-docs-card";
import { MaterialsCard } from "./materials-card";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireSession();
  const supabase = await createClient();
  const { data: e } = await supabase.from("events").select("*").eq("id", id).maybeSingle<EventRow>();
  if (!e) notFound();
  const [{ data: staff }, { data: team }, { data: taskData }, { data: matData }] = await Promise.all([
    supabase.from("employees").select("*").eq("status", "actif").order("first_name"),
    supabase.from("event_team").select("*").eq("event_id", id),
    supabase.from("tasks").select("*").eq("event_id", id),
    supabase.from("event_items").select("qty, status").eq("event_id", id),
  ]);
  const mat = (matData ?? []) as { qty: number; status: string }[];
  const matOut = mat.filter((m) => m.status === "charge" || m.status === "retourne").length;
  const people = new Map(((staff ?? []) as Employee[]).map((p) => [p.id, p]));
  const tasks = sortTasks((taskData ?? []) as Task[]);
  const done = tasks.filter((t) => DONE_STATUSES.includes(t.status)).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const canEdit = s.can("events.manage");
  const days = diffDays(e.event_date, todayISO());
  const showMoney = s.can("finance.view");
  const { data: fin } = showMoney ? await supabase.from("event_finances").select("*").eq("event_id", id).maybeSingle<EventFinance>() : { data: null };
  const teamIds = new Set((team ?? []).map((t) => t.employee_id));

  return (
    <>
      <PageHeader eyebrow={<Link href="/evenements" className="hover:underline">Événements</Link>} title={e.name}
        subtitle={<span className="flex flex-wrap items-center gap-2"><span>{formatDayLong(e.event_date)}</span> · {EVENT_TYPE[e.event_type]} <Badge tone={EVENT_STATUS[e.status].tone}>{EVENT_STATUS[e.status].label}</Badge>
          {days >= 0 && days <= 2 && <Badge tone="clay">{days === 0 ? "Aujourd'hui" : `J-${days}`}</Badge>}</span>}
        actions={<>
          {s.can("tasks.create") && <Link href={`/taches/nouvelle?evenement=${id}&date=${e.event_date}`} className={buttonClass("secondary", "sm")}><Plus className="h-3.5 w-3.5" /> Tâche</Link>}
          <Link href={`/evenements/${id}/fiche`} className={buttonClass("primary", "sm")}><FileText className="h-3.5 w-3.5" /> Fiche technique</Link>
          {canEdit && <Link href={`/evenements/${id}/modifier`} className={buttonClass("secondary", "sm")}>Modifier</Link>}
        </>} />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardBody className="grid gap-5 py-5 text-sm md:grid-cols-3">
              <Info label="Client">{e.client_name ?? "—"}{e.client_phone && <p className="text-ink-400">{e.client_phone}</p>}</Info>
              <Info label="Lieu">{e.address ?? "—"}</Info>
              <Info label="Responsable">{e.manager_id ? fullName(people.get(e.manager_id)) : "—"}</Info>
              <Info label="Nombre de personnes">{e.guests ? <b className="text-lg">{e.guests}</b> : "—"}</Info>
              <Info label="Livraison">{formatDateTime(e.delivery_at)}</Info>
              <Info label="Installation">{formatDateTime(e.setup_at)}</Info>
              <Info label="Début">{formatDateTime(e.start_at)}</Info>
              <Info label="Fin">{formatDateTime(e.end_at)}</Info>
              <Info label="Démontage">{formatDateTime(e.teardown_at)}</Info>
              {e.notes && <Info label="Notes" className="md:col-span-3"><p className="whitespace-pre-line">{e.notes}</p></Info>}
            </CardBody>
          </Card>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { href: `/evenements/${id}/conception`, icon: <Palette className="h-7 w-7" />, cls: "bg-rose-100 text-rose-700", label: "Design", hint: "Photo du design" },
              { href: `/evenements/${id}/materiel`, icon: <Warehouse className="h-7 w-7" />, cls: "bg-ochre-100 text-ochre-700", label: "Matériel du dépôt", hint: mat.length ? `${mat.length} article(s)` : "Réserver du stock" },
              { href: "#materiaux", icon: <Hammer className="h-7 w-7" />, cls: "bg-teal-100 text-teal-700", label: "Matériaux", hint: "Bois, plexi, vinyle…" },
              { href: "#prestataires", icon: <Handshake className="h-7 w-7" />, cls: "bg-plum-100 text-plum-700", label: "Prestataires", hint: "Crêpes, glace…" },
            ].map((x) => (
              <Link key={x.label} href={x.href} className="card flex flex-col items-center gap-2 px-3 py-4 text-center transition hover:-translate-y-0.5 hover:shadow-pop">
                <span className={`tile h-14 w-14 ${x.cls}`}>{x.icon}</span>
                <span className="text-[15px] font-bold leading-tight">{x.label}</span>
                <span className="text-xs text-ink-500">{x.hint}</span>
              </Link>
            ))}
          </div>
          <Link href={`/evenements/${id}/fiche`} className="flex items-center justify-center gap-2 rounded-2xl bg-ink px-4 py-4 text-[16px] font-bold text-ivory shadow-card hover:opacity-90">
            <FileText className="h-5 w-5" /> Voir la fiche (PDF) pour l&apos;équipe
          </Link>

          <Card>
            <CardHeader title="Tâches de l'événement" subtitle={`${done}/${tasks.length} terminées`}
              action={<div className="flex items-center gap-2"><div className="h-1.5 w-32 overflow-hidden rounded-full bg-sand-200"><div className="h-full bg-taupe-500" style={{ width: `${pct}%` }} /></div><span className="text-xs tabular-nums text-ink-400">{pct} %</span></div>} />
            {(canEdit || s.can("tasks.create")) && (
              <ActionForm action={generateEventTasks} className="border-b border-line bg-rose-50/50 px-5 py-3">
                <input type="hidden" name="id" value={id} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-ink-500">Les tâches de chacun sont créées automatiquement à la saisie de l&apos;événement (Paramètres &gt; Tâches automatiques).</p>
                  <SubmitButton size="sm" variant="secondary"><Sparkles className="h-3.5 w-3.5" /> Créer les tâches manquantes</SubmitButton>
                </div>
              </ActionForm>
            )}
            {tasks.length === 0 ? <Empty title="Aucune tâche liée.">Créez les tâches de production, logistique, décoration… depuis le bouton « Tâche ».</Empty> :
              <TaskTable tasks={tasks} people={people} events={new Map()} showEvent={false} />}
          </Card>

          <Link href={`/evenements/${id}/materiel`} className="card flex items-center gap-4 px-5 py-4 transition hover:-translate-y-0.5 hover:shadow-pop">
            <span className="tile h-12 w-12 bg-ochre-100 text-ochre-700"><Warehouse className="h-6 w-6" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">Matériel de l&apos;événement</span>
              <span className="block text-sm text-ink-500">{mat.length ? `${mat.length} article(s) · ${mat.reduce((a, m) => a + m.qty, 0)} pièces · ${matOut} chargé(s)` : "Aucun matériel prévu : ajoutez panneaux, tables, vases, lumières…"}</span>
            </span>
            <span className={buttonClass("secondary", "sm")}>Ouvrir</span>
          </Link>

          <MaterialsCard eventId={id} canEdit={canEdit || s.can("stock.move") || s.can("stock.manage")} />

          <div id="prestataires" className="scroll-mt-24"><ServicesCard eventId={id} eventDate={e.event_date} s={s} event={e} /></div>
        </div>

        <div className="space-y-6">
          <ClientDocsCard eventId={id} clientId={e.client_id ?? null} s={s} />
          {showMoney && (
            <Card className="border-ochre-200">
              <CardHeader title={<span className="flex items-center gap-2"><Lock className="h-4 w-4 text-ochre-700" /> Montants confidentiels</span>}
                subtitle="Visible uniquement par la direction et la commerciale" />
              <CardBody className="space-y-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <Money label="Budget" v={fin?.budget_mad} />
                  <Money label="Devis" v={fin?.quote_mad} />
                  <Money label="Payé" v={fin?.paid_mad} />
                </div>
                <ActionForm action={saveFinances} className="space-y-3">
                  <input type="hidden" name="id" value={id} />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Budget (DH)"><Input name="budget_mad" inputMode="decimal" defaultValue={fin?.budget_mad ?? ""} /></Field>
                    <Field label="Devis (DH)"><Input name="quote_mad" inputMode="decimal" defaultValue={fin?.quote_mad ?? ""} /></Field>
                    <Field label="Déjà payé (DH)"><Input name="paid_mad" inputMode="decimal" defaultValue={fin?.paid_mad ?? ""} /></Field>
                    <Field label="Paiement"><Select name="payment_status" defaultValue={fin?.payment_status ?? "non_paye"}>
                      <option value="non_paye">Non payé</option><option value="acompte">Acompte</option><option value="paye">Payé</option>
                    </Select></Field>
                  </div>
                  <Field label="Notes"><Textarea name="finance_notes" rows={2} defaultValue={fin?.notes ?? ""} /></Field>
                  <SubmitButton size="sm">Enregistrer les montants</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          )}

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

function Money({ label, v }: { label: string; v: number | null | undefined }) {
  return (
    <div className="rounded-xl bg-ochre-50 px-2 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ochre-700">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{formatMAD(v ?? null)}</p>
    </div>
  );
}
