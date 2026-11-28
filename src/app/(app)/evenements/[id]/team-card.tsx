import Link from "next/link";
import { AlertTriangle, Crown, UserPlus, Users, X } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Avatar } from "@/components/ui/avatar";
import { Input, Select } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDate, toLocalISODate, toLocalTime } from "@/lib/dates";
import { fullName } from "@/lib/format";
import { MISSIONS, ROLES, type Assignment, type RoleKey } from "@/lib/team";
import type { Employee } from "@/lib/types";
import { addAssignment, removeAssignment } from "../actions";

/** Équipe affectée : qui, quel rôle, quelle mission, à quelle heure. Signale si quelqu'un est déjà pris ailleurs. */
export async function TeamCard({ eventId, eventDate, canEdit, people }: { eventId: string; eventDate: string; canEdit: boolean; people: Employee[] }) {
  const supabase = await createClient();
  const { data } = await supabase.from("event_assignments").select("*").eq("event_id", eventId).order("start_at", { nullsFirst: false });
  const list = (data ?? []) as Assignment[];
  const map = new Map(people.map((p) => [p.id, p]));

  // Conflits : la même personne sur un autre événement au même moment
  const emp = Array.from(new Set(list.filter((a) => a.employee_id && a.start_at).map((a) => a.employee_id!)));
  const { data: other } = emp.length
    ? await supabase.from("event_assignments").select("employee_id, start_at, end_at, event_id, events(name)").in("employee_id", emp).neq("event_id", eventId)
        .gte("start_at", addDays(eventDate, -3)).lte("start_at", addDays(eventDate, 4))
    : { data: [] };
  const conflict = (a: Assignment) => {
    if (!a.employee_id || !a.start_at) return null;
    const s = new Date(a.start_at).getTime(), e = a.end_at ? new Date(a.end_at).getTime() : s + 3600000;
    const o = ((other ?? []) as unknown as { employee_id: string; start_at: string; end_at: string | null; events: { name: string } | null }[])
      .find((x) => x.employee_id === a.employee_id && new Date(x.start_at).getTime() < e && (x.end_at ? new Date(x.end_at).getTime() : new Date(x.start_at).getTime() + 3600000) > s);
    return o?.events?.name ?? null;
  };

  return (
    <Card>
      <CardHeader icon={<Users />} tone="plum" title="Équipe" subtitle={list.length ? `${new Set(list.map((a) => a.employee_id ?? a.external_name)).size} personne(s) · ${list.length} mission(s)` : "Personne pour l'instant"} />
      {list.length > 0 && (
        <ul className="divide-y divide-line">
          {list.map((a) => {
            const p = a.employee_id ? map.get(a.employee_id) : undefined;
            const c = conflict(a);
            const r = ROLES[a.role as RoleKey];
            return (
              <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                {p ? <Avatar person={p} size={36} /> : <span className="grid h-9 w-9 place-items-center rounded-full bg-sand-100 text-xs font-bold text-ink-500">EXT</span>}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-tight">
                    {p ? fullName(p) : `${a.external_name} (renfort)`}
                    {a.is_lead && <Crown className="ms-1 inline h-4 w-4 text-ochre-500" aria-label="Responsable principal" />}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-2 text-sm text-ink-500">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r?.tone ?? ""}`}>{r?.fr ?? a.role}</span>
                    {a.mission && <span>{a.mission}</span>}
                    {a.start_at && <span className="font-semibold tabular-nums text-ink">{toLocalISODate(a.start_at) !== eventDate ? `${formatDate(a.start_at)} ` : ""}{toLocalTime(a.start_at)}{a.end_at ? ` → ${toLocalTime(a.end_at)}` : ""}</span>}
                    {!p && a.external_phone && <span className="tabular-nums">{a.external_phone}</span>}
                  </p>
                  {c && <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-clay-700"><AlertTriangle className="h-3.5 w-3.5" /> Déjà prise au même moment : {c}</p>}
                </div>
                {canEdit && (
                  <ActionForm action={removeAssignment}>
                    <input type="hidden" name="id" value={a.id} /><input type="hidden" name="event_id" value={eventId} />
                    <button className="rounded-lg p-2 text-ink-300 hover:bg-clay-100 hover:text-clay-700" aria-label="Retirer"><X className="h-4 w-4" /></button>
                  </ActionForm>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canEdit && (
        <details className="border-t border-line" open={list.length === 0}>
          <summary className="flex cursor-pointer list-none items-center justify-center gap-2 px-5 py-4 text-[15px] font-bold text-plum-700"><UserPlus className="h-5 w-5" /> Ajouter une personne</summary>
          <ActionForm action={addAssignment} resetOnSuccess className="space-y-3 border-t border-line bg-sand-50/60 px-5 py-4">
            <input type="hidden" name="event_id" value={eventId} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-ink-500">Qui
                <Select name="employee_id" required defaultValue="" className="mt-1 h-12">
                  <option value="" disabled>Choisir…</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{fullName(p)}{p.job_title ? ` · ${p.job_title}` : ""}</option>)}
                  <option value="externe">+ Renfort externe</option>
                </Select>
              </label>
              <label className="block text-xs font-semibold text-ink-500">Rôle
                <Select name="role" required defaultValue="installateur" className="mt-1 h-12">
                  {Object.entries(ROLES).map(([k, r]) => <option key={k} value={k}>{r.fr}</option>)}
                </Select>
              </label>
              <label className="block text-xs font-semibold text-ink-500">Mission
                <Input name="mission" list="missions" placeholder="Chargement, livraison, montage…" className="mt-1 h-12" />
                <datalist id="missions">{MISSIONS.map((m) => <option key={m} value={m} />)}</datalist>
              </label>
              <label className="block text-xs font-semibold text-ink-500">Jour
                <Input name="day" type="date" defaultValue={eventDate} className="mt-1 h-12" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-semibold text-ink-500">Début<Input name="start" type="time" className="mt-1 h-12" /></label>
                <label className="block text-xs font-semibold text-ink-500">Fin<Input name="end" type="time" className="mt-1 h-12" /></label>
              </div>
              <label className="flex items-center gap-2 self-end pb-3 text-sm font-semibold"><input type="checkbox" name="is_lead" className="h-5 w-5" /> Responsable principal</label>
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer text-ink-500">Renfort externe : nom et téléphone</summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Input name="external_name" placeholder="Nom du renfort" className="h-11" />
                <Input name="external_phone" type="tel" placeholder="Téléphone" className="h-11" />
              </div>
            </details>
            <SubmitButton size="lg" className="w-full sm:w-auto"><UserPlus className="h-5 w-5" /> Ajouter à l&apos;équipe</SubmitButton>
            <p className="text-xs text-ink-400">Une même personne peut avoir plusieurs missions (ex. chargement le matin, démontage le soir). <Link href="/semaine" className="link">Voir « Cette semaine »</Link></p>
          </ActionForm>
        </details>
      )}
    </Card>
  );
}
