import Link from "next/link";
import { Handshake, MessageCircle, Plus } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { Session } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, hhmm } from "@/lib/dates";
import { formatMAD } from "@/lib/format";
import { SERVICE_STATUS, SUPPLIER_KIND, waLink, type EventService, type Expense, type Supplier } from "@/lib/suppliers";
import { buttonClass } from "@/components/ui/button";
import { toLocalTime } from "@/lib/dates";
import type { EventRow } from "@/lib/types";
import { ContactButtons } from "../../fournisseurs/contact-buttons";
import { deleteService, saveService, setServiceStatus } from "../../fournisseurs/actions";

const NEXT: Partial<Record<EventService["status"], EventService["status"]>> = { a_reserver: "reserve", reserve: "confirme", confirme: "realise" };

/** Prestataires et sous-traitants d'un événement : moquette, animation, impression… */
export async function ServicesCard({ eventId, eventDate, s, event }: { eventId: string; eventDate: string; s: Session; event?: EventRow }) {
  const supabase = await createClient();
  const fin = s.can("finance.view");
  const canEdit = s.can("events.manage") || s.can("suppliers.manage");
  const [{ data: svc }, { data: sup }, { data: exp }] = await Promise.all([
    supabase.from("event_services").select("*").eq("event_id", eventId).order("service_date"),
    supabase.from("suppliers").select("*").eq("is_active", true).order("name"),
    fin ? supabase.from("expenses").select("*").eq("event_id", eventId) : Promise.resolve({ data: [] }),
  ]);
  const services = (svc ?? []) as EventService[];
  const suppliers = (sup ?? []) as Supplier[];
  const supMap = new Map(suppliers.map((x) => [x.id, x]));
  const expBySvc = new Map(((exp ?? []) as Expense[]).filter((e) => e.service_id).map((e) => [e.service_id!, e]));
  const missing = services.filter((v) => v.status === "a_reserver").length;

  return (
    <Card>
      <CardHeader icon={<Handshake />} tone="plum" title="Prestataires & sous-traitants"
        subtitle={services.length ? `${services.length} prestation(s)${missing ? ` · ${missing} à réserver` : ""}` : "Moquette, animation, impression…"} />
      {services.length === 0 ? <Empty title="Aucun prestataire pour cet événement." /> : (
        <ul className="divide-y divide-line">
          {services.map((v) => {
            const x = supMap.get(v.supplier_id);
            const e = expBySvc.get(v.id);
            const next = NEXT[v.status];
            return (
              <li key={v.id}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-5 py-3.5">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{x?.name ?? "Prestataire"} <span className="font-normal text-ink-400">· {v.description}</span></span>
                      <span className="block text-sm text-ink-500">{formatDate(v.service_date ?? eventDate)}{v.service_time ? ` à ${hhmm(v.service_time)}` : ""}
                        {fin && e && <> · <b className="text-ink">{formatMAD(e.amount_mad)}</b>{Number(e.paid_mad) < Number(e.amount_mad) ? ` (reste ${formatMAD(Number(e.amount_mad) - Number(e.paid_mad))})` : " payé"}</>}</span>
                    </span>
                    <Badge tone={SERVICE_STATUS[v.status].tone}>{SERVICE_STATUS[v.status].label}</Badge>
                  </summary>
                  <div className="space-y-4 border-t border-line bg-sand-50/60 px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {x && (() => {
                        const wa = waLink(x.whatsapp ?? x.phone);
                        return wa ? <a href={`${wa}?text=${encodeURIComponent(orderText(x, v, eventDate, event))}`} target="_blank" rel="noreferrer" className={buttonClass("success", "lg")}><MessageCircle className="h-5 w-5" /> Envoyer sa liste sur WhatsApp</a> : null;
                      })()}
                      {x && <ContactButtons s={x} />}
                      {canEdit && next && (
                        <ActionForm action={setServiceStatus}>
                          <input type="hidden" name="id" value={v.id} /><input type="hidden" name="status" value={next} />
                          <SubmitButton variant="primary">Passer à « {SERVICE_STATUS[next].label} »</SubmitButton>
                        </ActionForm>
                      )}
                      {x && <Link href={`/fournisseurs/${x.id}`} className="link text-sm">Sa fiche</Link>}
                    </div>
                    {v.notes && <p className="whitespace-pre-line text-sm text-ink-600">{v.notes}</p>}
                    {canEdit && <ServiceForm eventId={eventId} suppliers={suppliers} v={v} e={e} fin={fin} />}
                    {canEdit && (
                      <ActionForm action={deleteService}><input type="hidden" name="id" value={v.id} /><SubmitButton size="sm" variant="ghost">Supprimer cette prestation</SubmitButton></ActionForm>
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      {canEdit && (
        <details className="border-t border-line">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-semibold text-plum-700"><Plus className="h-4 w-4" /> Ajouter un prestataire</summary>
          <div className="border-t border-line bg-sand-50/60 px-5 py-4"><ServiceForm eventId={eventId} suppliers={suppliers} fin={fin} /></div>
        </details>
      )}
    </Card>
  );
}

function ServiceForm({ eventId, suppliers, v, e, fin }: { eventId: string; suppliers: Supplier[]; v?: EventService; e?: Expense; fin: boolean }) {
  const groups = Object.entries(SUPPLIER_KIND).map(([k, g]) => ({ label: g.plural, list: suppliers.filter((x) => x.kind === k) })).filter((g) => g.list.length);
  return (
    <ActionForm action={saveService} resetOnSuccess={!v} className="space-y-3">
      {v && <input type="hidden" name="id" value={v.id} />}
      <input type="hidden" name="event_id" value={eventId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Qui">
          <Select name="supplier_id" required defaultValue={v?.supplier_id ?? ""}>
            <option value="" disabled>Choisir…</option>
            {groups.map((g) => <optgroup key={g.label} label={g.label}>{g.list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>)}
          </Select>
        </Field>
        <Field label="Activité"><Input name="description" required defaultValue={v?.description} placeholder="Ex. Stand crêpes, glaces, shawarma, gâteau…" /></Field>
        <Field label="Jour (vide = jour de l'événement)"><Input name="service_date" type="date" defaultValue={v?.service_date ?? ""} /></Field>
        <Field label="Heure d'arrivée"><Input name="service_time" type="time" defaultValue={v?.service_time?.slice(0, 5) ?? ""} /></Field>
        <Field label="Où en est-on">
          <Select name="status" defaultValue={v?.status ?? "a_reserver"}>{Object.entries(SERVICE_STATUS).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}</Select>
        </Field>
      </div>
      {fin && (
        <div className="grid gap-3 rounded-xl bg-ochre-50 p-3 sm:grid-cols-3">
          <Field label="Prix (DH) · confidentiel"><Input name="amount_mad" inputMode="decimal" defaultValue={e?.amount_mad ?? ""} /></Field>
          <Field label="Déjà payé (DH)"><Input name="paid_mad" inputMode="decimal" defaultValue={e?.paid_mad ?? ""} /></Field>
          <Field label="Payé par">
            <Select name="payment_method" defaultValue={e?.payment_method ?? ""}><option value="">—</option><option>Espèces</option><option>Virement</option><option>Chèque</option></Select>
          </Field>
        </div>
      )}
      <Field label="Sa liste (quantités, parfums, détails…)" hint="Envoyée telle quelle sur WhatsApp, sans les prix"><Textarea name="notes" rows={4} defaultValue={v?.notes ?? ""} placeholder={"Ex. 150 crêpes\n2 animatrices de 16h à 20h\nNutella, miel, amlou"} /></Field>
      <SubmitButton>{v ? "Enregistrer" : "Ajouter"}</SubmitButton>
    </ActionForm>
  );
}

/** Message WhatsApp pour le prestataire : l'événement, l'heure, le lieu et sa liste. Jamais de prix. */
function orderText(x: Supplier, v: EventService, eventDate: string, e?: EventRow) {
  const day = formatDate(v.service_date ?? eventDate);
  const time = v.service_time ? hhmm(v.service_time) : e?.start_at ? toLocalTime(e.start_at) : null;
  return [
    `Bonjour ${x.contact_name ?? x.name},`,
    `Commande Bohemia Events${e ? ` pour « ${e.name} »` : ""} :`,
    `📅 ${day}${time ? ` à ${time}` : ""}`,
    e?.address ? `📍 ${e.address}` : null,
    e?.guests ? `👥 ${e.guests} personnes` : null,
    `🎪 ${v.description}`,
    v.notes ? `\n${v.notes}` : null,
    e?.site_contact_name || e?.site_contact_phone ? `\nContact sur place : ${[e?.site_contact_name, e?.site_contact_phone].filter(Boolean).join(" ")}` : null,
    `\nMerci de confirmer 🙏`,
  ].filter(Boolean).join("\n");
}
