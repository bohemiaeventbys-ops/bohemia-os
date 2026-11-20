import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadSchedules } from "@/lib/queries";
import { WEEKDAYS } from "@/lib/labels";
import type { WorkSchedule } from "@/lib/types";
import { deleteSchedule, saveSchedule } from "../actions";

export default async function SchedulesSettings() {
  await requirePerm("settings.manage");
  const supabase = await createClient();
  const schedules = await loadSchedules(supabase);
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-ink-500">L&apos;heure d&apos;arrivée est comparée à l&apos;horaire de l&apos;employé. Au-delà de la tolérance, le pointage est marqué « En retard ». Au départ, les heures au-delà de la durée prévue sont comptées en heures supplémentaires.</p>
      {schedules.map((s) => (
        <Card key={s.id}>
          <CardHeader title={<span className="flex items-center gap-2">{s.name}{s.is_default && <Badge tone="sage">Par défaut</Badge>}</span>} />
          <CardBody>
            <ScheduleForm s={s} />
            {!s.is_default && (
              <ActionForm action={deleteSchedule} className="mt-3"><input type="hidden" name="id" value={s.id} /><SubmitButton size="sm" variant="danger">Supprimer</SubmitButton></ActionForm>
            )}
          </CardBody>
        </Card>
      ))}
      <Card><CardHeader title="Nouvel horaire" /><CardBody><ScheduleForm /></CardBody></Card>
    </div>
  );
}

function ScheduleForm({ s }: { s?: WorkSchedule }) {
  return (
    <ActionForm action={saveSchedule} className="space-y-4">
      {s && <input type="hidden" name="id" value={s.id} />}
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Nom" className="md:col-span-2"><Input name="name" defaultValue={s?.name} required /></Field>
        <Field label="Tolérance de retard (minutes)"><Input type="number" name="grace_minutes" min={0} max={120} defaultValue={s?.grace_minutes ?? 10} /></Field>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {WEEKDAYS.map((w, i) => {
          const d = s?.days?.[String(i + 1)];
          return (
            <div key={w} className="rounded-xl border border-line bg-sand-50 p-2.5">
              <label className="mb-2 flex items-center gap-1.5 text-xs font-medium"><input type="checkbox" name={`on_${i + 1}`} defaultChecked={!!d || (!s && i < 5)} className="accent-ink" />{w}</label>
              <Input type="time" name={`start_${i + 1}`} defaultValue={d?.start ?? "09:00"} className="mb-1.5 h-8 px-2 py-0 text-xs" />
              <Input type="time" name={`end_${i + 1}`} defaultValue={d?.end ?? "18:00"} className="h-8 px-2 py-0 text-xs" />
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_default" defaultChecked={s?.is_default} className="h-4 w-4 accent-ink" /> Horaire par défaut</label>
        <SubmitButton size="sm">{s ? "Enregistrer" : "Créer l'horaire"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
