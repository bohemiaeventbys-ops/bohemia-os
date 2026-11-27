import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Mail, MapPin, Pencil, Phone, ShoppingCart, Star, User } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
import { formatMAD } from "@/lib/format";
import { PURCHASE_STATUS, SERVICE_STATUS, SUPPLIER_KIND, type EventService, type Expense, type Purchase, type Supplier } from "@/lib/suppliers";
import type { EventRow } from "@/lib/types";
import { ContactButtons } from "../contact-buttons";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input, Select } from "@/components/ui/field";
import { saveSupplierBank } from "../actions";

export const metadata = { title: "Fournisseur" };

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireSession();
  const supabase = await createClient();
  const { data: x } = await supabase.from("suppliers").select("*").eq("id", id).maybeSingle<Supplier>();
  if (!x) notFound();
  const fin = s.can("finance.view");
  const [{ data: svc }, { data: pur }, { data: exp }] = await Promise.all([
    supabase.from("event_services").select("*").eq("supplier_id", id).order("service_date", { ascending: false }).limit(50),
    supabase.from("purchase_requests").select("*").eq("supplier_id", id).order("created_at", { ascending: false }).limit(50),
    fin ? supabase.from("expenses").select("*").eq("supplier_id", id) : Promise.resolve({ data: [] }),
  ]);
  const { data: bank } = fin
    ? await supabase.from("supplier_bank").select("*").eq("supplier_id", id).maybeSingle<{ bank_name: string | null; rib: string | null; payment_mode: string; invoices_ttc: boolean }>()
    : { data: null };
  const services = (svc ?? []) as EventService[];
  const purchases = (pur ?? []) as Purchase[];
  const expenses = (exp ?? []) as Expense[];
  const evIds = Array.from(new Set(services.map((v) => v.event_id)));
  const { data: evData } = evIds.length ? await supabase.from("events").select("id, name, event_date").in("id", evIds) : { data: [] };
  const events = new Map(((evData ?? []) as Pick<EventRow, "id" | "name" | "event_date">[]).map((e) => [e.id, e]));
  const expBySvc = new Map(expenses.filter((e) => e.service_id).map((e) => [e.service_id!, e]));
  const total = expenses.reduce((a, e) => a + Number(e.amount_mad), 0);
  const unpaid = expenses.reduce((a, e) => a + Math.max(0, Number(e.amount_mad) - Number(e.paid_mad)), 0);

  return (
    <>
      <PageHeader eyebrow={<Link href="/fournisseurs" className="hover:underline">Fournisseurs & prestataires</Link>}
        title={x.name}
        subtitle={<span className="flex flex-wrap items-center gap-2"><Badge tone={SUPPLIER_KIND[x.kind].tone}>{SUPPLIER_KIND[x.kind].label}</Badge>{!x.is_active && <Badge>Archivé</Badge>}{x.categories.join(" · ")}</span>}
        actions={<>
          <ContactButtons s={x} size="lg" />
          {s.can("suppliers.manage") && <ButtonLink href={`/fournisseurs/${id}/modifier`} variant="secondary" size="lg"><Pencil className="h-4 w-4" /> Modifier</ButtonLink>}
        </>} />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader icon={<CalendarDays />} tone="rose" title="Sur nos événements" subtitle={`${services.length} prestation(s)`} />
            {services.length === 0 ? <Empty title="Pas encore de prestation.">Ajoutez-la depuis la page de l&apos;événement.</Empty> : (
              <ul className="divide-y divide-line">
                {services.map((v) => {
                  const ev = events.get(v.event_id);
                  const e = expBySvc.get(v.id);
                  return (
                    <li key={v.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <Link href={`/evenements/${v.event_id}`} className="font-semibold hover:underline">{ev?.name ?? "Événement"}</Link>
                        <p className="text-sm text-ink-500">{v.description} · {formatDate(v.service_date ?? ev?.event_date)}</p>
                      </div>
                      {fin && e && <span className="text-sm font-semibold tabular-nums">{formatMAD(e.amount_mad)}</span>}
                      <Badge tone={SERVICE_STATUS[v.status].tone}>{SERVICE_STATUS[v.status].label}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader icon={<ShoppingCart />} tone="teal" title="Achats chez lui" subtitle={`${purchases.length} commande(s)`} />
            {purchases.length === 0 ? <Empty title="Aucun achat." /> : (
              <ul className="divide-y divide-line">
                {purchases.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                    <Link href={`/achats/${p.id}`} className="min-w-0 flex-1 font-medium hover:underline">{p.title}</Link>
                    <span className="text-sm text-ink-400">{formatDate(p.created_at.slice(0, 10))}</span>
                    <Badge tone={PURCHASE_STATUS[p.status].tone}>{PURCHASE_STATUS[p.status].label}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Coordonnées" />
            <CardBody className="space-y-3 text-sm">
              {x.contact_name && <p className="flex gap-2"><User className="h-4 w-4 text-ink-300" />{x.contact_name}</p>}
              {x.phone && <p className="flex gap-2 tabular-nums"><Phone className="h-4 w-4 text-ink-300" />{x.phone}</p>}
              {x.email && <p className="flex gap-2"><Mail className="h-4 w-4 text-ink-300" /><a className="link" href={`mailto:${x.email}`}>{x.email}</a></p>}
              {x.address && <p className="flex gap-2"><MapPin className="h-4 w-4 text-ink-300" />{x.address}</p>}
              {x.rating && <p className="flex items-center gap-1 text-ochre-600">{Array.from({ length: x.rating }, (_, i) => <Star key={i} className="h-4 w-4 fill-current" />)}</p>}
              {x.notes && <p className="whitespace-pre-line rounded-xl bg-sand-50 p-3 text-ink-600">{x.notes}</p>}
            </CardBody>
          </Card>
          {fin && (
            <Card>
              <CardHeader title="Montants (confidentiel)" subtitle="Direction et commerciale" />
              <CardBody className="grid grid-cols-2 gap-3 text-center">
                <div className="rounded-xl bg-sand-50 p-3"><p className="text-xs text-ink-400">Total</p><p className="font-display text-2xl font-semibold">{formatMAD(total)}</p></div>
                <div className={`rounded-xl p-3 ${unpaid > 0 ? "bg-clay-50" : "bg-sage-50"}`}><p className="text-xs text-ink-400">Reste à payer</p><p className="font-display text-2xl font-semibold">{formatMAD(unpaid)}</p></div>
              </CardBody>
            </Card>
          )}
          {fin && (
            <Card>
              <CardHeader title="Banque et paiement" subtitle="Confidentiel : direction et commerciale" />
              <CardBody>
                <ActionForm action={saveSupplierBank} className="space-y-3">
                  <input type="hidden" name="supplier_id" value={id} />
                  <Field label="Banque"><Input name="bank_name" defaultValue={bank?.bank_name ?? ""} placeholder="Ex. Attijariwafa Bank" /></Field>
                  <Field label="RIB (24 chiffres)"><Input name="rib" defaultValue={bank?.rib ?? ""} inputMode="numeric" /></Field>
                  <Field label="Paiement habituel">
                    <Select name="payment_mode" defaultValue={bank?.payment_mode ?? "virement"}>
                      <option value="virement">Virement</option><option value="especes">Espèces</option><option value="cheque">Chèque</option><option value="mixte">Virement ou espèces</option>
                    </Select>
                  </Field>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="invoices_ttc" defaultChecked={bank?.invoices_ttc ?? true} className="h-5 w-5" /> Nous remet une facture TTC</label>
                  <SubmitButton variant="secondary">Enregistrer</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
