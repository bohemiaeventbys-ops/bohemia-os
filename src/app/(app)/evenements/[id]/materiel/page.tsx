import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, PackageCheck, PackagePlus, Truck, Undo2 } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, toneTile } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Input } from "@/components/ui/field";
import { PhotoInput } from "@/components/ui/photo-input";
import { NavIcon } from "@/components/layout/icon";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedUrls } from "@/lib/storage";
import { cn } from "@/lib/cn";
import { addDays, diffDays, formatDateTime, formatDayLong, toLocalISODate, todayISO } from "@/lib/dates";
import { fullName } from "@/lib/format";
import { LINE_STATUS, STOCK_BUCKET, type EventItem, type StockCategory, type StockItem } from "@/lib/stock";
import type { EventRow } from "@/lib/types";
import { reserveItem, returnLine, saveLineDetails, setLineStep } from "../../../stock/actions";

export const metadata = { title: "Matériel de l'événement" };

function span(e: EventRow) {
  return {
    from: e.delivery_at ? toLocalISODate(e.delivery_at) : addDays(e.event_date, -1),
    to: e.teardown_at ? toLocalISODate(e.teardown_at) : addDays(e.event_date, 1),
  };
}

export default async function EventMaterial({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireSession();
  const supabase = await createClient();
  const { data: e } = await supabase.from("events").select("*").eq("id", id).maybeSingle<EventRow>();
  if (!e) notFound();
  const canMove = s.can("stock.manage") || s.can("stock.move") || s.can("events.manage");

  const [{ data: lineData }, { data: itemData }, { data: catData }, { data: staff }] = await Promise.all([
    supabase.from("event_items").select("*").eq("event_id", id).order("created_at"),
    supabase.from("stock_items").select("*").eq("is_active", true).order("name").limit(2000),
    supabase.from("stock_categories").select("*").order("sort_order"),
    supabase.from("employees").select("id, first_name, last_name"),
  ]);
  const lines = (lineData ?? []) as EventItem[];
  const items = (itemData ?? []) as StockItem[];
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const cats = (catData ?? []) as StockCategory[];
  const catMap = new Map(cats.map((c) => [c.id, c]));
  const people = new Map((staff ?? []).map((p) => [p.id, p]));


  const urls = await signedUrls(supabase, STOCK_BUCKET, [...lines.map((l) => itemMap.get(l.item_id)?.photo_path), ...lines.flatMap((l) => [l.loaded_photo_path, l.return_photo_path])]);

  const days = diffDays(e.event_date, todayISO());
  const count = (st: EventItem["status"]) => lines.filter((l) => l.status === st).length;

  const groups: { key: EventItem["status"]; title: string; hint: string; icon: React.ReactNode; tone: "mist" | "ochre" | "teal" | "sage" }[] = [
    { key: "reserve", title: "À préparer", hint: "Sortez-le du dépôt et posez-le au quai", icon: <PackageCheck />, tone: "mist" },
    { key: "prepare", title: "À charger", hint: "Prenez une photo dans la voiture", icon: <Truck />, tone: "ochre" },
    { key: "charge", title: "Dehors : à faire revenir", hint: "Au retour, comptez ce qui revient et dans quel état", icon: <Undo2 />, tone: "teal" },
    { key: "retourne", title: "Revenu au dépôt", hint: "", icon: <Check />, tone: "sage" },
  ];

  return (
    <>
      <PageHeader eyebrow={<Link href={`/evenements/${id}`} className="hover:underline">{e.name}</Link>} title="Matériel"
        subtitle={<span>{formatDayLong(e.event_date)}{days >= 0 ? ` · ${days === 0 ? "aujourd'hui" : `J-${days}`}` : ""}{e.address ? ` · ${e.address}` : ""}</span>} />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {groups.map((g) => (
          <div key={g.key} className="card flex items-center gap-3 px-4 py-3">
            <span className={cn("tile h-10 w-10 [&_svg]:h-5 [&_svg]:w-5", toneTile[g.tone])}>{g.icon}</span>
            <span><span className="block font-display text-3xl font-semibold leading-none">{count(g.key)}</span><span className="text-xs text-ink-500">{g.title}</span></span>
          </div>
        ))}
      </div>

      {canMove && (
        <Card className="mb-6">
          <CardHeader title="+ Ajouter du stock" icon={<PackagePlus />} tone="rose" subtitle="Le disponible tient compte des autres événements aux mêmes dates" />
          <CardBody>
            <Link href={`/evenements/${id}/materiel/choisir`} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-ochre-500 px-4 text-[16px] font-bold text-white shadow-card"><PackagePlus className="h-5 w-5" /> Choisir le matériel (plusieurs articles d&apos;un coup)</Link>
          </CardBody>
        </Card>
      )}

      {lines.length === 0 ? <Card><Empty title="Aucun matériel prévu pour cet événement." icon={<PackageCheck className="h-8 w-8" />}>Ajoutez les panneaux, tables, vases, lumières… depuis la liste ci-dessus.</Empty></Card> : (
        <div className="space-y-6">
          {groups.map((g) => {
            const list = lines.filter((l) => l.status === g.key);
            if (!list.length) return null;
            return (
              <Card key={g.key}>
                <CardHeader title={g.title} icon={g.icon} tone={g.tone} subtitle={`${list.length} article(s)${g.hint ? ` · ${g.hint}` : ""}`} />
                <ul className="divide-y divide-line">
                  {list.map((l) => {
                    const i = itemMap.get(l.item_id);
                    const c = i?.category_id ? catMap.get(i.category_id) : undefined;
                    const ph = i?.photo_path ? urls.get(i.photo_path) : undefined;
                    const loadPh = l.loaded_photo_path ? urls.get(l.loaded_photo_path) : undefined;
                    const retPh = l.return_photo_path ? urls.get(l.return_photo_path) : undefined;
                    return (
                      <li key={l.id} className="space-y-3 px-5 py-4">
                        <div className="flex items-center gap-3">
                          <Link href={`/stock/${l.item_id}`} className="shrink-0">
                            {ph
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={ph} alt="" className="h-16 w-16 rounded-xl object-cover" />
                              : <span className={cn("tile h-16 w-16", toneTile[c?.color ?? "neutral"])}><NavIcon name={c?.icon ?? "box"} className="h-7 w-7" /></span>}
                          </Link>
                          <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-semibold leading-snug">{i?.name ?? "Article"}</p>
                            <p className="text-xs text-ink-400">{i?.location ? `Rangé : ${i.location}` : c?.name}</p>
                            {(l.qty_short ?? 0) > 0 && <p className="mt-0.5 inline-block rounded-lg bg-clay-100 px-2 py-0.5 text-xs font-bold text-clay-700">Manquant : {l.qty_short}</p>}
                            {l.color && <p className="text-xs text-ink-600">Couleur : {l.color}</p>}
                            {l.finish && <p className="mt-0.5 inline-block rounded-lg bg-plum-100 px-2 py-0.5 text-xs font-semibold text-plum-700">Finition : {l.finish}</p>}
                            {l.vinyl && <p className="text-xs text-ink-600">Vinyle : {l.vinyl}</p>}
                            {l.zone && <p className="text-xs text-ink-500">Zone de pose : {l.zone}</p>}
                            {l.note && <p className="text-xs text-ink-500">« {l.note} »</p>}
                          </div>
                          <span className="shrink-0 rounded-xl bg-sand-100 px-3 py-1.5 font-display text-2xl font-semibold tabular-nums">× {l.qty}</span>
                        </div>

                        {canMove && l.status === "reserve" && (
                          <div className="flex flex-wrap gap-2">
                            <ActionForm action={setLineStep} className="flex-1">
                              <input type="hidden" name="line_id" value={l.id} /><input type="hidden" name="event_id" value={id} /><input type="hidden" name="step" value="prepare" />
                              <SubmitButton className="w-full"><PackageCheck className="h-5 w-5" /> C&apos;est préparé</SubmitButton>
                            </ActionForm>
                            <ActionForm action={reserveItem}>
                              <input type="hidden" name="event_id" value={id} /><input type="hidden" name="item_id" value={l.item_id} />
                              <div className="flex gap-2">
                                <Input name="qty" type="number" min={0} defaultValue={l.qty} className="h-11 w-20 text-center" aria-label="Changer la quantité (0 pour retirer)" />
                                <Input name="finish" defaultValue={l.finish ?? ""} placeholder="Finition" className="h-11 w-36" aria-label="Finition / couleur" />
                                <SubmitButton variant="secondary">Changer</SubmitButton>
                              </div>
                            </ActionForm>
                          </div>
                        )}

                        {canMove && l.status !== "retourne" && (
                          <details className="text-sm">
                            <summary className="cursor-pointer text-ink-500">Consignes : couleur, finition, vinyle, zone, photo</summary>
                            <ActionForm action={saveLineDetails} className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                              <input type="hidden" name="line_id" value={l.id} /><input type="hidden" name="event_id" value={id} />
                              <Input name="color" defaultValue={l.color ?? ""} placeholder="Couleur demandée" />
                              <Input name="finish" defaultValue={l.finish ?? ""} placeholder="Finition" />
                              <Input name="vinyl" defaultValue={l.vinyl ?? ""} placeholder="Vinyle à poser" />
                              <Input name="zone" defaultValue={l.zone ?? ""} placeholder="Zone de pose" />
                              <PhotoInput name="ref_photo" label="Photo de référence" />
                              <SubmitButton variant="secondary">Enregistrer</SubmitButton>
                            </ActionForm>
                          </details>
                        )}

                        {canMove && l.status === "prepare" && (
                          <ActionForm action={setLineStep} className="space-y-2">
                            <input type="hidden" name="line_id" value={l.id} /><input type="hidden" name="event_id" value={id} /><input type="hidden" name="step" value="charge" />
                            <div className="flex flex-wrap items-center gap-2">
                              <PhotoInput label="Photo dans la voiture" required />
                              <SubmitButton variant="warning" className="flex-1"><Truck className="h-5 w-5" /> Chargé dans la voiture</SubmitButton>
                            </div>
                          </ActionForm>
                        )}

                        {l.status === "charge" && (
                          <>
                            <p className="flex items-center gap-2 text-xs text-ink-400">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              {loadPh && <a href={loadPh} target="_blank" rel="noreferrer"><img src={loadPh} alt="" className="h-10 w-10 rounded-lg object-cover" /></a>}
                              Chargé {formatDateTime(l.loaded_at)}{l.loaded_by ? ` par ${fullName(people.get(l.loaded_by))}` : ""}
                            </p>
                            {canMove && (
                              <ActionForm action={returnLine} className="space-y-3 rounded-xl bg-sand-50 p-3">
                                <input type="hidden" name="line_id" value={l.id} /><input type="hidden" name="event_id" value={id} />
                                <p className="text-sm font-semibold">Au retour, combien sont… (total {l.qty})</p>
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                  <Qty name="good" label="En bon état" def={l.qty} cls="border-sage-200 bg-sage-50 text-sage-700" />
                                  <Qty name="repair" label="À réparer" def={0} cls="border-ochre-200 bg-ochre-50 text-ochre-700" />
                                  <Qty name="broken" label="Cassés" def={0} cls="border-clay-200 bg-clay-50 text-clay-700" />
                                  <Qty name="missing" label="Manquants" def={0} cls="border-rose-200 bg-rose-50 text-rose-700" />
                                </div>
                                <Input name="note" placeholder="En cas de dégât : qu'est-ce qui s'est passé ?" />
                                <div className="flex flex-wrap items-center gap-2">
                                  <PhotoInput label="Photo au retour" />
                                  <SubmitButton variant="success" className="flex-1"><Undo2 className="h-5 w-5" /> Enregistrer le retour</SubmitButton>
                                </div>
                              </ActionForm>
                            )}
                          </>
                        )}

                        {l.status === "retourne" && (
                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            <Badge tone={LINE_STATUS.retourne.tone}>Revenu {formatDateTime(l.returned_at)}</Badge>
                            {!!l.qty_returned_repair && <Badge tone="ochre">{l.qty_returned_repair} à réparer</Badge>}
                            {!!l.qty_returned_broken && <Badge tone="clay">{l.qty_returned_broken} cassé(s)</Badge>}
                            {!!l.qty_missing && <Badge tone="rose">{l.qty_missing} manquant(s)</Badge>}
                            {l.return_note && <span className="text-ink-500">« {l.return_note} »</span>}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {retPh && <a href={retPh} target="_blank" rel="noreferrer"><img src={retPh} alt="" className="h-10 w-10 rounded-lg object-cover" /></a>}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function Qty({ name, label, def, cls }: { name: string; label: string; def: number; cls: string }) {
  return (
    <label className={cn("flex flex-col items-center gap-1 rounded-xl border-2 p-2", cls)}>
      <span className="text-xs font-semibold">{label}</span>
      <input name={name} type="number" min={0} defaultValue={def} inputMode="numeric" className="h-11 w-full rounded-lg border border-line bg-paper text-center text-lg font-bold text-ink" />
    </label>
  );
}
