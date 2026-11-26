import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDate, todayISO } from "@/lib/dates";
import { PURCHASE_UNITS, type Supplier } from "@/lib/suppliers";
import type { StockCategory, StockItem } from "@/lib/stock";
import type { EventRow } from "@/lib/types";
import { createPurchase } from "../actions";

export const metadata = { title: "Demander un achat" };

type SP = { titre?: string; article?: string; evenement?: string; qte?: string };

export default async function NewPurchase({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const s = await requireSession();
  const supabase = await createClient();
  const today = todayISO();
  const [{ data: ev }, { data: it }, { data: ca }, { data: su }] = await Promise.all([
    supabase.from("events").select("id, name, event_date").gte("event_date", addDays(today, -2)).not("status", "in", "(annule,cloture)").order("event_date").limit(60),
    supabase.from("stock_items").select("id, name, category_id, unit").eq("is_active", true).order("name"),
    supabase.from("stock_categories").select("*").order("sort_order"),
    supabase.from("suppliers").select("id, name, kind").eq("is_active", true).eq("kind", "fournisseur").order("name"),
  ]);
  const events = (ev ?? []) as Pick<EventRow, "id" | "name" | "event_date">[];
  const items = (it ?? []) as Pick<StockItem, "id" | "name" | "category_id" | "unit">[];
  const cats = (ca ?? []) as StockCategory[];
  const pre = sp.article ? items.find((i) => i.id === sp.article) : undefined;
  const rows = 5;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow={<Link href="/achats" className="hover:underline">Achats</Link>} title="Demander un achat"
        subtitle="La Direction reçoit la demande tout de suite sur son téléphone." />
      <Card>
        <CardBody className="py-6">
          <ActionForm action={createPurchase} className="space-y-5">
            <Field label="Qu'est-ce qu'il faut ?"><Input name="title" required defaultValue={sp.titre ?? (pre ? `Racheter : ${pre.name}` : "")} placeholder="Ex. Vinyle doré pour l'arche, mousse florale…" className="h-12 text-base" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Pour quel événement ? (facultatif)">
                <Select name="event_id" defaultValue={sp.evenement ?? ""}>
                  <option value="">Pas d&apos;événement (atelier, dépôt…)</option>
                  {events.map((e) => <option key={e.id} value={e.id}>{formatDate(e.event_date)} · {e.name}</option>)}
                </Select>
              </Field>
              <Field label="Il le faut pour le"><Input name="needed_by" type="date" min={today} defaultValue={addDays(today, 3)} /></Field>
            </div>

            <fieldset>
              <legend className="label">Détail (une ligne par article)</legend>
              <div className="space-y-2">
                {Array.from({ length: rows }, (_, i) => (
                  <div key={i} className="grid grid-cols-[1fr_5rem_6.5rem] gap-2 sm:grid-cols-[1fr_5rem_6.5rem_12rem]">
                    <Input name="line_label" placeholder={i === 0 ? "Ex. Plaque Forex 3 mm" : ""} defaultValue={i === 0 && pre ? pre.name : ""} />
                    <Input name="line_qty" inputMode="decimal" placeholder="Qté" defaultValue={i === 0 && pre ? sp.qte ?? "1" : ""} className="text-center" />
                    <Select name="line_unit" defaultValue={i === 0 && pre ? pre.unit : "pièce"}>{PURCHASE_UNITS.map((u) => <option key={u}>{u}</option>)}</Select>
                    <Select name="line_item" defaultValue={i === 0 && pre ? pre.id : ""} className="col-span-3 sm:col-span-1" aria-label="Entre dans le stock">
                      <option value="">Ne va pas au stock</option>
                      {cats.map((c) => {
                        const list = items.filter((x) => x.category_id === c.id);
                        return list.length ? <optgroup key={c.id} label={c.name}>{list.map((x) => <option key={x.id} value={x.id}>→ {x.name}</option>)}</optgroup> : null;
                      })}
                    </Select>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-ink-400">Si vous choisissez un article du stock, la quantité y sera ajoutée automatiquement à la réception.</p>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Fournisseur conseillé (facultatif)">
                <Select name="supplier_id" defaultValue=""><option value="">—</option>{((su ?? []) as Supplier[]).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
              </Field>
            </div>
            <Field label="Précisions (couleur, taille, lien, photo envoyée sur WhatsApp…)"><Textarea name="details" rows={3} /></Field>
            {s.can("purchases.validate") && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="auto_validate" defaultChecked className="h-5 w-5 accent-ink" /> Je valide directement (envoyer à l&apos;acheteur)</label>}
            <SubmitButton size="lg" className="w-full sm:w-auto">Envoyer la demande</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
    </div>
  );
}
