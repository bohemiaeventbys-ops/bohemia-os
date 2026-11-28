import { Hammer, Plus, Trash2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Input } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { addMaterial, deleteMaterial } from "../actions";

export type EventMaterial = { id: string; label: string; qty: number | null; unit: string | null; note: string | null };
const SUGGEST = ["Bois", "Plexi", "Forex", "Vinyle", "Tissu", "Peinture", "Fleurs", "Ballons", "Moquette"];

/** Matériaux à acheter ou fabriquer pour cet événement (bois, plexi, vinyle, tissu…). Sans prix. */
export async function MaterialsCard({ eventId, canEdit }: { eventId: string; canEdit: boolean }) {
  const supabase = await createClient();
  const { data } = await supabase.from("event_materials").select("*").eq("event_id", eventId).order("created_at");
  const list = (data ?? []) as EventMaterial[];
  return (
    <Card>
      <div id="materiaux" className="scroll-mt-24" />
      <CardHeader icon={<Hammer />} tone="teal" title="Matériaux à fabriquer / acheter" subtitle={list.length ? `${list.length} ligne(s)` : "Bois, plexi, vinyle, tissu…"} />
      {list.length > 0 && (
        <ul className="divide-y divide-line">
          {list.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-5 py-3">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{m.label}</span>
                {m.note && <span className="block text-sm text-ink-500">{m.note}</span>}
              </span>
              {m.qty != null && <span className="shrink-0 rounded-xl bg-sand-100 px-3 py-1 text-lg font-bold tabular-nums">{Number(m.qty)} {m.unit ?? ""}</span>}
              {canEdit && (
                <ActionForm action={deleteMaterial}>
                  <input type="hidden" name="id" value={m.id} /><input type="hidden" name="event_id" value={eventId} />
                  <button className="rounded-lg p-2 text-ink-300 hover:bg-clay-100 hover:text-clay-700" aria-label="Retirer"><Trash2 className="h-4 w-4" /></button>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <ActionForm action={addMaterial} resetOnSuccess className="space-y-2 border-t border-line bg-sand-50/60 px-5 py-4">
          <input type="hidden" name="event_id" value={eventId} />
          <div className="grid gap-2 sm:grid-cols-[1fr_90px_110px]">
            <Input name="label" required list="mat-suggest" placeholder="Matériau, ex. Plexi blanc 3 mm" className="h-12" />
            <Input name="qty" inputMode="decimal" placeholder="Qté" className="h-12 text-center" />
            <Input name="unit" placeholder="m², plaques…" className="h-12" />
          </div>
          <Input name="note" placeholder="Pour quoi ? ex. lettres du panneau de bienvenue" className="h-12" />
          <datalist id="mat-suggest">{SUGGEST.map((x) => <option key={x} value={x} />)}</datalist>
          <SubmitButton><Plus className="h-4 w-4" /> Ajouter</SubmitButton>
        </ActionForm>
      )}
    </Card>
  );
}
