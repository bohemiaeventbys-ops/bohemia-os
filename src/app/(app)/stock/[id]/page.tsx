import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CalendarDays, Hammer, History, Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, toneTile } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Input } from "@/components/ui/field";
import { PhotoInput } from "@/components/ui/photo-input";
import { NavIcon } from "@/components/layout/icon";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedUrls } from "@/lib/storage";
import { cn } from "@/lib/cn";
import { formatDateTime, formatDayShort, todayISO, addDays } from "@/lib/dates";
import { fullName } from "@/lib/format";
import { LINE_STATUS, MOVE_KIND, STOCK_BUCKET, totalQty, type EventItem, type StockCategory, type StockItem, type StockMovement } from "@/lib/stock";
import type { EventRow } from "@/lib/types";
import { adjustStock, archiveItem, discardItem, flagItem, repairedItem } from "../actions";
import { LoansCard } from "./loans-card";
import { isLow } from "@/lib/stock";

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireSession();
  const supabase = await createClient();
  const { data: item } = await supabase.from("stock_items").select("*").eq("id", id).maybeSingle<StockItem>();
  if (!item) notFound();
  const today = todayISO();
  const [{ data: cat }, { data: lineData }, { data: moveData }, { data: staff }] = await Promise.all([
    item.category_id ? supabase.from("stock_categories").select("*").eq("id", item.category_id).maybeSingle<StockCategory>() : Promise.resolve({ data: null }),
    supabase.from("event_items").select("*").eq("item_id", id).neq("status", "retourne"),
    supabase.from("stock_movements").select("*").eq("item_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("employees").select("id, first_name, last_name"),
  ]);
  const lines = (lineData ?? []) as EventItem[];
  const moves = (moveData ?? []) as StockMovement[];
  const evIds = Array.from(new Set([...lines.map((l) => l.event_id), ...moves.map((m) => m.event_id).filter((x): x is string => !!x)]));
  const { data: evData } = evIds.length ? await supabase.from("events").select("*").in("id", evIds) : { data: [] };
  const events = new Map(((evData ?? []) as EventRow[]).map((e) => [e.id, e]));
  const people = new Map((staff ?? []).map((p) => [p.id, p]));
  const urls = await signedUrls(supabase, STOCK_BUCKET, [item.photo_path, ...moves.map((m) => m.photo_path)]);
  const photo = item.photo_path ? urls.get(item.photo_path) : undefined;
  const canManage = s.can("stock.manage");
  const canMove = canManage || s.can("stock.move") || s.can("events.manage");
  const upcoming = lines.filter((l) => (events.get(l.event_id)?.event_date ?? "") >= addDays(today, -7))
    .sort((a, b) => (events.get(a.event_id)?.event_date ?? "").localeCompare(events.get(b.event_id)?.event_date ?? ""));

  return (
    <>
      <PageHeader eyebrow={<Link href="/stock" className="hover:underline">Dépôt & Stock</Link>} title={item.name}
        subtitle={<span className="flex flex-wrap items-center gap-2">
          {cat && <span className="inline-flex items-center gap-1.5"><span className={cn("tile h-6 w-6 rounded-md", toneTile[cat.color])}><NavIcon name={cat.icon} className="h-3.5 w-3.5" /></span>{cat.name}</span>}
          {item.themes.map((t) => <span key={t} className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">{t}</span>)}
          {!item.is_active && <Badge tone="neutral">Retiré de l&apos;inventaire</Badge>}
        </span>}
        actions={canManage && <Link href={`/stock/${id}/modifier`} className={buttonClass("secondary")}><Pencil className="h-4 w-4" /> Modifier</Link>} />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-2">
          <Card className="overflow-hidden">
            <div className={cn("aspect-[4/3] w-full", !photo && toneTile[cat?.color ?? "neutral"])}>
              {photo
                // eslint-disable-next-line @next/next/no-img-element
                ? <a href={photo} target="_blank" rel="noreferrer"><img src={photo} alt={item.name} className="h-full w-full object-cover" /></a>
                : <span className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm"><NavIcon name={cat?.icon ?? "box"} className="h-14 w-14 opacity-60" />Pas encore de photo</span>}
            </div>
            <div className="grid grid-cols-3 divide-x divide-line border-t border-line text-center">
              <Count label="Bon état" n={item.qty_good} tone="text-sage-700" />
              <Count label="À réparer" n={item.qty_repair} tone="text-ochre-700" />
              <Count label="Cassés" n={item.qty_broken} tone="text-clay-700" />
            </div>
            <CardBody className="space-y-1.5 border-t border-line text-sm text-ink-600">
              <p><span className="text-ink-400">Total :</span> {totalQty(item)} {item.unit}{totalQty(item) > 1 && item.unit === "pièce" ? "s" : ""}</p>
              {item.location && <p><span className="text-ink-400">Rangé :</span> {item.location}</p>}
              {item.dimensions && <p><span className="text-ink-400">Dimensions :</span> {item.dimensions}</p>}
              {item.color && <p><span className="text-ink-400">Couleur / matière :</span> {item.color}</p>}
              {item.notes && <p className="whitespace-pre-line pt-1">{item.notes}</p>}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-3">
          {isLow(item) && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-clay-200 bg-clay-50 px-5 py-4">
              <AlertTriangle className="h-6 w-6 shrink-0 text-clay-600" />
              <p className="min-w-0 flex-1 text-sm"><b>Il en manque.</b> Il en reste {item.qty_good} en bon état, le minimum est {item.min_qty}.</p>
              <Link href={`/achats/nouveau?article=${item.id}&qte=${item.min_qty - item.qty_good}`} className={buttonClass("primary")}>Demander un achat</Link>
            </div>
          )}
          {(cat?.name.startsWith("Outillage") || item.themes.includes("Outillage")) && <LoansCard item={item} canMove={canMove} />}
          {canMove && (
            <Card>
              <CardHeader title="Que voulez-vous faire ?" icon={<Hammer />} tone="ochre" />
              <div className="divide-y divide-line">
                {canManage && (
                  <Action icon={<Plus />} tone="sage" title="Ajouter au stock" hint="Achat, fabrication, article retrouvé">
                    <ActionForm action={adjustStock} resetOnSuccess className="flex flex-wrap gap-2">
                      <input type="hidden" name="id" value={id} /><input type="hidden" name="sign" value="+" />
                      <Input name="qty" type="number" min={1} defaultValue={1} className="h-11 w-24 text-center text-base" aria-label="Combien" />
                      <Input name="note" placeholder="D'où ça vient ? (facultatif)" className="h-11 min-w-0 flex-1" />
                      <SubmitButton variant="success"><Plus className="h-4 w-4" /> Ajouter</SubmitButton>
                    </ActionForm>
                  </Action>
                )}
                {item.qty_good > 0 && (
                  <Action icon={<AlertTriangle />} tone="clay" title="Signaler un dégât" hint="Abîmé (à réparer) ou cassé, avec une photo">
                    <ActionForm action={flagItem} resetOnSuccess className="space-y-3">
                      <input type="hidden" name="id" value={id} />
                      <div className="flex flex-wrap gap-2">
                        <Input name="qty" type="number" min={1} max={item.qty_good} defaultValue={1} className="h-11 w-24 text-center text-base" aria-label="Combien" />
                        <label className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border-2 border-line px-3 text-sm font-semibold has-[:checked]:border-ochre-500 has-[:checked]:bg-ochre-50"><input type="radio" name="to" value="repair" defaultChecked className="sr-only" />À réparer</label>
                        <label className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border-2 border-line px-3 text-sm font-semibold has-[:checked]:border-clay-500 has-[:checked]:bg-clay-50"><input type="radio" name="to" value="broken" className="sr-only" />Cassé</label>
                      </div>
                      <Input name="note" placeholder="Qu'est-ce qui ne va pas ?" />
                      <div className="flex flex-wrap items-center justify-between gap-3"><PhotoInput label="Photo du dégât" /><SubmitButton variant="danger">Signaler</SubmitButton></div>
                    </ActionForm>
                  </Action>
                )}
                {item.qty_repair > 0 && (
                  <Action icon={<Hammer />} tone="ochre" title="Réparation terminée" hint={`${item.qty_repair} en attente de réparation`}>
                    <ActionForm action={repairedItem} className="flex flex-wrap gap-2">
                      <input type="hidden" name="id" value={id} />
                      <Input name="qty" type="number" min={1} max={item.qty_repair} defaultValue={item.qty_repair} className="h-11 w-24 text-center text-base" aria-label="Combien" />
                      <SubmitButton variant="success"><Hammer className="h-4 w-4" /> Réparé, remis en stock</SubmitButton>
                    </ActionForm>
                  </Action>
                )}
                {canManage && (item.qty_broken > 0 || item.qty_repair > 0) && (
                  <Action icon={<Trash2 />} tone="neutral" title="Jeter" hint="Ce qu'on n'utilisera plus">
                    <ActionForm action={discardItem} className="flex flex-wrap gap-2">
                      <input type="hidden" name="id" value={id} />
                      <input type="hidden" name="from" value={item.qty_broken > 0 ? "broken" : "repair"} />
                      <Input name="qty" type="number" min={1} max={item.qty_broken || item.qty_repair} defaultValue={item.qty_broken || item.qty_repair} className="h-11 w-24 text-center text-base" aria-label="Combien" />
                      <SubmitButton variant="danger"><Trash2 className="h-4 w-4" /> Jeter {item.qty_broken > 0 ? "les cassés" : "les irréparables"}</SubmitButton>
                    </ActionForm>
                  </Action>
                )}
                {canManage && item.qty_good > 0 && (
                  <Action icon={<Minus />} tone="neutral" title="Corriger l'inventaire" hint="On en a compté moins que prévu">
                    <ActionForm action={adjustStock} resetOnSuccess className="flex flex-wrap gap-2">
                      <input type="hidden" name="id" value={id} /><input type="hidden" name="sign" value="-" />
                      <Input name="qty" type="number" min={1} max={item.qty_good} defaultValue={1} className="h-11 w-24 text-center text-base" aria-label="Combien en moins" />
                      <Input name="note" required placeholder="Pourquoi ? (obligatoire)" className="h-11 min-w-0 flex-1" />
                      <SubmitButton variant="secondary">Retirer</SubmitButton>
                    </ActionForm>
                  </Action>
                )}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Réservé pour" icon={<CalendarDays />} tone="rose" subtitle="Événements à venir qui utilisent cet article" />
            {upcoming.length === 0 ? <Empty title="Aucune réservation." /> : (
              <ul className="divide-y divide-line">
                {upcoming.map((l) => {
                  const e = events.get(l.event_id);
                  return (
                    <li key={l.id}>
                      <Link href={`/evenements/${l.event_id}/materiel`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-sand-50">
                        <span className="min-w-0"><span className="block truncate font-semibold">{e?.name}</span><span className="text-xs text-ink-400">{e ? formatDayShort(e.event_date) : ""}</span></span>
                        <span className="flex shrink-0 items-center gap-2"><span className="text-sm font-bold tabular-nums">× {l.qty}</span><Badge tone={LINE_STATUS[l.status].tone}>{LINE_STATUS[l.status].label}</Badge></span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Historique" icon={<History />} tone="mist" subtitle="Chaque entrée, sortie, retour, réparation" />
            {moves.length === 0 ? <Empty title="Aucun mouvement." /> : (
              <ul className="divide-y divide-line">
                {moves.map((m) => {
                  const ph = m.photo_path ? urls.get(m.photo_path) : undefined;
                  return (
                    <li key={m.id} className="flex items-start gap-3 px-5 py-3 text-sm">
                      <Badge tone={m.kind === "retour" ? "sage" : m.kind === "sortie" ? "teal" : m.kind === "rebut" ? "clay" : m.kind === "reparation" ? "ochre" : "neutral"}>{MOVE_KIND[m.kind]} · {m.qty}</Badge>
                      <div className="min-w-0 flex-1">
                        <p className="text-ink-600">{m.detail}{m.event_id && events.get(m.event_id) ? <> · <Link href={`/evenements/${m.event_id}`} className="link">{events.get(m.event_id)?.name}</Link></> : null}</p>
                        <p className="text-xs text-ink-400">{formatDateTime(m.created_at)}{m.by_employee ? ` · ${fullName(people.get(m.by_employee))}` : ""}</p>
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {ph && <a href={ph} target="_blank" rel="noreferrer"><img src={ph} alt="" className="h-12 w-12 rounded-lg object-cover" /></a>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {canManage && (
            <ActionForm action={archiveItem}>
              <input type="hidden" name="id" value={id} /><input type="hidden" name="active" value={item.is_active ? "0" : "1"} />
              <SubmitButton variant="ghost" size="sm">{item.is_active ? "Retirer cet article de l'inventaire" : "Remettre dans l'inventaire"}</SubmitButton>
            </ActionForm>
          )}
        </div>
      </div>
    </>
  );
}

function Count({ label, n, tone }: { label: string; n: number; tone: string }) {
  return (
    <div className="px-2 py-4">
      <p className={cn("font-display text-4xl font-semibold leading-none", tone)}>{n}</p>
      <p className="mt-1 text-xs font-medium text-ink-500">{label}</p>
    </div>
  );
}

function Action({ icon, tone, title, hint, children }: { icon: React.ReactNode; tone: "sage" | "clay" | "ochre" | "neutral"; title: string; hint: string; children: React.ReactNode }) {
  return (
    <details className="group px-5 py-4">
      <summary className="flex cursor-pointer list-none items-center gap-3">
        <span className={cn("tile h-10 w-10 [&_svg]:h-5 [&_svg]:w-5", toneTile[tone])}>{icon}</span>
        <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold">{title}</span><span className="block text-xs text-ink-400">{hint}</span></span>
        <span className="text-xl text-ink-300 transition group-open:rotate-45">+</span>
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}
