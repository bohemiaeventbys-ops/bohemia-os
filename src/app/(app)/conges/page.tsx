import Link from "next/link";
import { Check, Clock, DoorOpen, History, Inbox, Plane, RotateCcw, Stethoscope, UserX, X } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { Badge, toneTile } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Empty } from "@/components/ui/empty";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/cn";
import { addDays, diffDays, formatDate, formatDayShort, relativeTime, todayISO } from "@/lib/dates";
import { fullName } from "@/lib/format";
import { LEAVE_HINT, LEAVE_STATUS, LEAVE_TONE, LEAVE_TYPE } from "@/lib/labels";
import type { Employee, LeaveRequest } from "@/lib/types";
import { cancelLeave, requestLeave, reviewLeave } from "./actions";

export const metadata = { title: "Congés & absences" };

const ICONS: Record<string, React.ReactNode> = {
  conge: <Plane />, absence: <UserX />, maladie: <Stethoscope />, retard: <Clock />, sortie_autorisee: <DoorOpen />, recuperation: <RotateCcw />,
};

type SP = { vue?: string; employe?: string; type?: string; statut?: string; nouveau?: string };

function period(l: LeaveRequest) {
  const n = diffDays(l.end_date, l.start_date) + 1;
  return l.start_date === l.end_date ? `Le ${formatDayShort(l.start_date)}` : `Du ${formatDayShort(l.start_date)} au ${formatDayShort(l.end_date)} · ${n} jours`;
}

export default async function CongesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const s = await requireSession();
  const supabase = await createClient();
  const canManage = s.can("leaves.manage");
  const followsTeam = canManage || s.managedDepartmentIds.length > 0;
  const vue = followsTeam && (sp.vue === "validation" || sp.vue === "historique") ? sp.vue : "miennes";

  const [{ data: mineData }, { data: pendingData }, { data: staff }] = await Promise.all([
    supabase.from("leave_requests").select("*").eq("employee_id", s.employee.id).order("start_date", { ascending: false }).limit(100),
    followsTeam
      ? // RLS limite déjà aux personnes que l'on suit (direction : tout le monde ; responsable : son département)
        supabase.from("leave_requests").select("*").eq("status", "en_attente").neq("employee_id", s.employee.id).order("start_date")
      : Promise.resolve({ data: [] }),
    supabase.from("employees").select("*").eq("status", "actif").order("first_name"),
  ]);
  const mine = (mineData ?? []) as LeaveRequest[];
  const pending = (pendingData ?? []) as LeaveRequest[];
  const people = new Map(((staff ?? []) as Employee[]).map((p) => [p.id, p]));

  let history: LeaveRequest[] = [];
  if (vue === "historique") {
    let q = supabase.from("leave_requests").select("*").order("start_date", { ascending: false }).limit(300);
    if (sp.employe) q = q.eq("employee_id", sp.employe);
    if (sp.type && sp.type in LEAVE_TYPE) q = q.eq("leave_type", sp.type);
    if (sp.statut && sp.statut in LEAVE_STATUS) q = q.eq("status", sp.statut);
    history = ((await q).data ?? []) as LeaveRequest[];
  }

  const today = todayISO();
  const tabs = [
    { key: "miennes", label: "Mes demandes", href: "/conges" },
    ...(followsTeam ? [
      { key: "validation", label: "À valider", href: "/conges?vue=validation", count: pending.length },
      { key: "historique", label: "Historique de l'équipe", href: "/conges?vue=historique" },
    ] : []),
  ];

  return (
    <>
      <PageHeader title={followsTeam ? "Congés & absences" : "Mes congés"}
        subtitle="Demandez un congé en trois gestes. La direction valide ou refuse, et vous êtes prévenu(e) tout de suite." />
      {tabs.length > 1 && <Tabs active={vue} items={tabs} />}

      {vue === "miennes" && (
        <div className="grid gap-6 xl:grid-cols-5">
          <Card className="xl:col-span-3">
            <CardHeader title="Nouvelle demande" icon={<Plane />} tone="clay" subtitle="1. Choisissez le type · 2. Les dates · 3. Envoyez" />
            <CardBody>
              <ActionForm action={requestLeave} resetOnSuccess className="space-y-5">
                <fieldset>
                  <legend className="label">Type de demande</legend>
                  <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
                    {Object.entries(LEAVE_TYPE).map(([k, label], i) => (
                      <label key={k} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border-2 border-line bg-paper p-3 transition hover:border-line-strong",
                        "has-[:checked]:border-ink has-[:checked]:bg-sand-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-nude-200")}>
                        <input type="radio" name="leave_type" value={k} defaultChecked={i === 0} className="sr-only" />
                        <span className={cn("tile h-10 w-10 [&_svg]:h-5 [&_svg]:w-5", toneTile[LEAVE_TONE[k]])}>{ICONS[k]}</span>
                        <span className="min-w-0"><span className="block text-sm font-semibold leading-tight">{label}</span><span className="block text-[11px] leading-tight text-ink-400">{LEAVE_HINT[k]}</span></span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Du (ou le)"><Input type="date" name="start_date" required min={canManage ? undefined : addDays(today, -30)} defaultValue={today} /></Field>
                  <Field label="Au" hint="Laissez vide pour un seul jour"><Input type="date" name="end_date" /></Field>
                </div>
                <Field label="Un mot pour la direction (facultatif)"><Textarea name="comment" rows={2} placeholder="Ex. mariage de ma sœur, rendez-vous médical…" /></Field>
                {canManage && (
                  <div className="grid gap-4 rounded-xl bg-sand-50 p-4 sm:grid-cols-2">
                    <Field label="Pour qui ?">
                      <Select name="employee_id" defaultValue={s.employee.id}>
                        {Array.from(people.values()).map((p) => <option key={p.id} value={p.id}>{fullName(p)}</option>)}
                      </Select>
                    </Field>
                    <label className="flex items-center gap-2.5 self-end pb-3 text-sm text-ink-600">
                      <input type="checkbox" name="direct" className="h-5 w-5 rounded accent-ink" /> Valider directement
                    </label>
                  </div>
                )}
                <SubmitButton size="lg" className="w-full sm:w-auto"><Check className="h-5 w-5" /> Envoyer la demande</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader title="Mes demandes" icon={<History />} tone="mist" subtitle={`${mine.length} demande(s)`} />
            {mine.length === 0 ? <Empty title="Aucune demande pour l'instant." /> : (
              <ul className="divide-y divide-line">
                {mine.map((l) => (
                  <li key={l.id} className="flex items-start gap-3 px-5 py-3.5">
                    <span className={cn("tile h-10 w-10 [&_svg]:h-5 [&_svg]:w-5", toneTile[LEAVE_TONE[l.leave_type]])}>{ICONS[l.leave_type]}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-semibold">{LEAVE_TYPE[l.leave_type]}</span>
                        <Badge tone={LEAVE_STATUS[l.status].tone}>{LEAVE_STATUS[l.status].label}</Badge>
                      </div>
                      <p className="text-[13px] text-ink-500">{period(l)}</p>
                      {l.comment && <p className="mt-0.5 text-xs text-ink-400">« {l.comment} »</p>}
                      {l.review_comment && <p className={cn("mt-1.5 rounded-lg px-2.5 py-1.5 text-xs", l.status === "refusee" ? "bg-clay-50 text-clay-700" : "bg-sage-50 text-sage-700")}>Réponse : {l.review_comment}</p>}
                    </div>
                    {l.status === "en_attente" && (
                      <ActionForm action={cancelLeave}>
                        <input type="hidden" name="id" value={l.id} />
                        <SubmitButton size="sm" variant="ghost">Annuler</SubmitButton>
                      </ActionForm>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {vue === "validation" && (
        <Card>
          <CardHeader title="Demandes à valider" icon={<Inbox />} tone="ochre" subtitle={canManage ? "Validez, ou refusez en écrivant le motif" : "La validation est faite par la direction. Vous voyez les demandes de votre équipe."} />
          {pending.length === 0 ? <Empty title="Aucune demande en attente.">Tout est à jour.</Empty> : (
            <ul className="divide-y divide-line">
              {pending.map((l) => {
                const p = people.get(l.employee_id);
                return (
                  <li key={l.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_minmax(320px,420px)] lg:items-center">
                    <div className="flex items-start gap-3">
                      {p && <Avatar person={p} size={40} />}
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold">{fullName(p)}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-ink-500">
                          <Badge tone={LEAVE_TONE[l.leave_type]}>{LEAVE_TYPE[l.leave_type]}</Badge> {period(l)}
                        </p>
                        {l.comment && <p className="mt-1 text-sm text-ink-500">« {l.comment} »</p>}
                        {l.created_at && <p className="mt-1 text-xs text-ink-300">Demandé {relativeTime(l.created_at)}</p>}
                      </div>
                    </div>
                    {canManage && (
                      <ActionForm action={reviewLeave} className="space-y-2">
                        <input type="hidden" name="id" value={l.id} />
                        <Input name="review_comment" placeholder="Commentaire (obligatoire pour refuser)" />
                        <div className="flex gap-2">
                          <SubmitButton name="decision" value="validee" variant="success" className="flex-1"><Check className="h-4 w-4" /> Valider</SubmitButton>
                          <SubmitButton name="decision" value="refusee" variant="danger" className="flex-1" formNoValidate><X className="h-4 w-4" /> Refuser</SubmitButton>
                        </div>
                      </ActionForm>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {vue === "historique" && (
        <>
          <form className="mb-4 flex flex-wrap items-end gap-3">
            <input type="hidden" name="vue" value="historique" />
            <Field label="Employé"><Select name="employe" defaultValue={sp.employe ?? ""}><option value="">Tout le monde</option>{Array.from(people.values()).map((p) => <option key={p.id} value={p.id}>{fullName(p)}</option>)}</Select></Field>
            <Field label="Type"><Select name="type" defaultValue={sp.type ?? ""}><option value="">Tous</option>{Object.entries(LEAVE_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Statut"><Select name="statut" defaultValue={sp.statut ?? ""}><option value="">Tous</option>{Object.entries(LEAVE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
            <button className="h-11 rounded-xl bg-ink px-5 text-sm font-semibold text-ivory">Filtrer</button>
            {(sp.employe || sp.type || sp.statut) && <Link href="/conges?vue=historique" className="link pb-3 text-sm">Effacer</Link>}
          </form>
          <Card>
            {history.length === 0 ? <Empty title="Aucune demande." /> : (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead><tr><th>Employé</th><th>Type</th><th>Période</th><th>Statut</th><th>Commentaires</th><th>Traité par</th></tr></thead>
                  <tbody>
                    {history.map((l) => {
                      const p = people.get(l.employee_id);
                      return (
                        <tr key={l.id}>
                          <td><span className="flex items-center gap-2.5">{p && <Avatar person={p} size={28} />}<span className="font-medium">{fullName(p)}</span></span></td>
                          <td><Badge tone={LEAVE_TONE[l.leave_type]}>{LEAVE_TYPE[l.leave_type]}</Badge></td>
                          <td className="whitespace-nowrap text-ink-600">{formatDate(l.start_date)}{l.end_date !== l.start_date ? ` → ${formatDate(l.end_date)}` : ""}</td>
                          <td><Badge tone={LEAVE_STATUS[l.status].tone}>{LEAVE_STATUS[l.status].label}</Badge></td>
                          <td className="max-w-[280px] text-xs text-ink-500">{l.comment}{l.review_comment && <span className="block text-ink-400">Réponse : {l.review_comment}</span>}</td>
                          <td className="text-xs text-ink-500">{l.reviewed_by ? fullName(people.get(l.reviewed_by)) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
