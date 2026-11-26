import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Lock, PackageCheck, ShoppingBag, X } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { PhotoInput } from "@/components/ui/photo-input";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedUrls } from "@/lib/storage";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatMAD, fullName } from "@/lib/format";
import { PURCHASE_BUCKET, PURCHASE_STATUS, type Expense, type Purchase, type PurchaseLine, type Supplier } from "@/lib/suppliers";
import type { StockItem } from "@/lib/stock";
import type { Employee, EventRow } from "@/lib/types";
import { ContactButtons } from "../../fournisseurs/contact-buttons";
import { cancelPurchase, decidePurchase, orderPurchase, receivePurchase, savePurchaseAmount } from "../actions";

export const metadata = { title: "Achat" };

const STEPS: Purchase["status"][] = ["demande", "validee", "commandee", "recue"];

export default async function PurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireSession();
  const supabase = await createClient();
  const { data: p } = await supabase.from("purchase_requests").select("*").eq("id", id).maybeSingle<Purchase>();
  if (!p) notFound();
  const fin = s.can("finance.view");
  const [{ data: ln }, { data: emp }, { data: su }, { data: ev }, { data: ex }] = await Promise.all([
    supabase.from("purchase_lines").select("*").eq("request_id", id).order("sort_order"),
    supabase.from("employees").select("*"),
    supabase.from("suppliers").select("*").eq("is_active", true).order("name"),
    p.event_id ? supabase.from("events").select("id, name, event_date").eq("id", p.event_id).maybeSingle() : Promise.resolve({ data: null }),
    fin ? supabase.from("expenses").select("*").eq("purchase_id", id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const lines = (ln ?? []) as PurchaseLine[];
  const people = new Map(((emp ?? []) as Employee[]).map((e) => [e.id, e]));
  const suppliers = (su ?? []) as Supplier[];
  const supplier = suppliers.find((x) => x.id === p.supplier_id);
  const event = ev as Pick<EventRow, "id" | "name" | "event_date"> | null;
  const expense = ex as Expense | null;
  const itemIds = lines.map((l) => l.stock_item_id).filter(Boolean) as string[];
  const { data: it } = itemIds.length ? await supabase.from("stock_items").select("id, name").in("id", itemIds) : { data: [] };
  const items = new Map(((it ?? []) as Pick<StockItem, "id" | "name">[]).map((i) => [i.id, i.name]));
  const urls = await signedUrls(supabase, PURCHASE_BUCKET, [p.received_photo_path]);

  const mine = p.requested_by === s.employee.id;
  const canValidate = s.can("purchases.validate") && p.status === "demande";
  const canOrder = s.can("purchases.manage") && p.status === "validee";
  const canReceive = (s.can("purchases.manage") || s.can("stock.manage")) && (p.status === "validee" || p.status === "commandee");
  const canCancel = ((mine && p.status === "demande") || s.can("purchases.manage")) && (p.status === "demande" || p.status === "validee");
  const stepIdx = STEPS.indexOf(p.status);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow={<Link href="/achats" className="hover:underline">Achats</Link>} title={p.title}
        subtitle={<span className="flex flex-wrap items-center gap-2"><Badge tone={PURCHASE_STATUS[p.status].tone}>{PURCHASE_STATUS[p.status].label}</Badge>
          Demandé par {fullName(people.get(p.requested_by ?? ""))} le {formatDate(p.created_at.slice(0, 10))}</span>} />

      {stepIdx >= 0 && (
        <ol className="mb-6 grid grid-cols-4 gap-1.5 text-center text-xs font-semibold">
          {["Demandé", "Validé", "Commandé", "Reçu"].map((l, i) => (
            <li key={l} className={`rounded-lg py-2 ${i <= stepIdx ? "bg-teal-500 text-white" : "bg-sand-100 text-ink-400"}`}>{l}</li>
          ))}
        </ol>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {canValidate && (
            <Card className="border-ochre-200">
              <CardHeader title="Votre décision" subtitle="Le demandeur et l'acheteur sont prévenus" tone="ochre" icon={<Check />} />
              <CardBody>
                <ActionForm action={decidePurchase} className="space-y-3">
                  <input type="hidden" name="id" value={p.id} />
                  <Textarea name="note" rows={2} placeholder="Un mot (obligatoire si vous refusez)" />
                  <div className="grid grid-cols-2 gap-2">
                    <SubmitButton name="decision" value="ok" variant="success" size="lg"><Check className="h-5 w-5" /> Valider</SubmitButton>
                    <SubmitButton name="decision" value="non" variant="danger" size="lg"><X className="h-5 w-5" /> Refuser</SubmitButton>
                  </div>
                </ActionForm>
              </CardBody>
            </Card>
          )}

          {canOrder && (
            <Card className="border-mist-200">
              <CardHeader title="Commander" subtitle="Quand c'est commandé ou payé, appuyez ici" tone="mist" icon={<ShoppingBag />} />
              <CardBody>
                <ActionForm action={orderPurchase} className="space-y-3">
                  <input type="hidden" name="id" value={p.id} />
                  <Field label="Chez qui">
                    <Select name="supplier_id" defaultValue={p.supplier_id ?? ""}><option value="">—</option>{suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
                  </Field>
                  {fin && <AmountFields e={expense} />}
                  <SubmitButton size="lg" className="w-full">C&apos;est commandé</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          )}

          {canReceive && (
            <Card className="border-sage-200">
              <CardHeader title="Réception" subtitle="Prenez une photo de ce qui est arrivé" tone="sage" icon={<PackageCheck />} />
              <CardBody>
                <ActionForm action={receivePurchase} className="space-y-3">
                  <input type="hidden" name="id" value={p.id} />
                  <PhotoInput name="photo" label="Photo de la livraison" />
                  <SubmitButton size="lg" variant="success" className="w-full">C&apos;est arrivé au dépôt</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Détail" subtitle={lines.length ? `${lines.length} ligne(s)` : undefined} />
            {lines.length > 0 && (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-line">
                  {lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-5 py-2.5 font-medium">{l.label}{l.stock_item_id && <span className="block text-xs font-normal text-teal-700">→ entre au stock : {items.get(l.stock_item_id)}</span>}</td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-right font-bold tabular-nums">{Number(l.qty)} {l.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <CardBody className="space-y-2 text-sm">
              {p.details && <p className="whitespace-pre-line">{p.details}</p>}
              {p.needed_by && <p><span className="text-ink-400">Pour le :</span> <b>{formatDate(p.needed_by)}</b></p>}
              {event && <p><span className="text-ink-400">Événement :</span> <Link className="link" href={`/evenements/${event.id}`}>{event.name}</Link> ({formatDate(event.event_date)})</p>}
              {!lines.length && !p.details && <p className="text-ink-400">Pas de détail.</p>}
            </CardBody>
          </Card>

          {p.received_photo_path && urls.get(p.received_photo_path) && (
            <Card>
              <CardHeader title="Photo de réception" subtitle={formatDateTime(p.received_at)} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urls.get(p.received_photo_path)!} alt="Réception" className="w-full rounded-b-2xl object-cover" />
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {supplier && (
            <Card>
              <CardHeader title={supplier.name} subtitle="Fournisseur" />
              <CardBody><ContactButtons s={supplier} /></CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Suivi" />
            <CardBody className="space-y-2 text-sm">
              <p>Demandé · {formatDateTime(p.created_at)}</p>
              {p.decided_at && <p>{p.status === "refusee" ? "Refusé" : "Validé"} par {fullName(people.get(p.decided_by ?? ""))} · {formatDateTime(p.decided_at)}</p>}
              {p.decision_note && <p className="rounded-lg bg-sand-50 p-2 italic">« {p.decision_note} »</p>}
              {p.ordered_at && <p>Commandé par {fullName(people.get(p.ordered_by ?? ""))} · {formatDateTime(p.ordered_at)}</p>}
              {p.received_at && <p>Reçu par {fullName(people.get(p.received_by ?? ""))} · {formatDateTime(p.received_at)}</p>}
            </CardBody>
          </Card>
          {fin && (
            <Card className="border-ochre-200">
              <CardHeader icon={<Lock />} tone="ochre" title="Montant (confidentiel)" subtitle={expense ? `${formatMAD(expense.amount_mad)} · payé ${formatMAD(expense.paid_mad)}` : "Pas encore saisi"} />
              <CardBody>
                <ActionForm action={savePurchaseAmount} className="space-y-3">
                  <input type="hidden" name="id" value={p.id} />
                  <AmountFields e={expense} />
                  <SubmitButton size="sm">Enregistrer</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          )}
          {canCancel && (
            <ActionForm action={cancelPurchase}>
              <input type="hidden" name="id" value={p.id} />
              <SubmitButton variant="ghost" size="sm">Annuler la demande</SubmitButton>
            </ActionForm>
          )}
        </div>
      </div>
    </div>
  );
}

function AmountFields({ e }: { e: Expense | null }) {
  return (
    <div className="grid grid-cols-2 gap-3 rounded-xl bg-ochre-50 p-3">
      <Field label="Prix total (DH)"><Input name="amount_mad" inputMode="decimal" defaultValue={e?.amount_mad ?? ""} /></Field>
      <Field label="Payé (DH)"><Input name="paid_mad" inputMode="decimal" defaultValue={e?.paid_mad ?? ""} /></Field>
      <Field label="Payé par" className="col-span-2">
        <Select name="payment_method" defaultValue={e?.payment_method ?? ""}><option value="">—</option><option>Espèces</option><option>Virement</option><option>Chèque</option></Select>
      </Field>
      <Field label="Facture (photo ou PDF)" className="col-span-2"><input type="file" name="invoice" accept="image/*,application/pdf" className="block w-full text-sm" /></Field>
    </div>
  );
}
