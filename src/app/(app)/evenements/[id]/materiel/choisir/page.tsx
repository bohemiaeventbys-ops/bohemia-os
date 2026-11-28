import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedUrls } from "@/lib/storage";
import { addDays, formatDate } from "@/lib/dates";
import { eventSlot } from "@/lib/slot";
import { STOCK_BUCKET, type StockCategory, type StockItem } from "@/lib/stock";
import type { EventRow } from "@/lib/types";
import { StockBasket, type BasketItem } from "./stock-basket";

export const metadata = { title: "Choisir le matériel" };

/** Catalogue du stock ouvert pour un événement : ses dates sont gardées, la disponibilité est calculée sur son créneau. */
export default async function ChooseStock({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireSession();
  if (!(s.can("stock.manage") || s.can("stock.move") || s.can("events.manage"))) redirect(`/evenements/${id}`);
  const supabase = await createClient();
  const { data: e } = await supabase.from("events").select("*").eq("id", id).maybeSingle<EventRow>();
  if (!e) notFound();
  const slot = eventSlot(e);

  const [{ data: itemData }, { data: catData }, { data: near }, { data: mine }] = await Promise.all([
    supabase.from("stock_items").select("*").eq("is_active", true).order("name").limit(3000),
    supabase.from("stock_categories").select("*").order("sort_order"),
    supabase.from("events").select("id, name, event_date, load_at, delivery_at, teardown_at, status").neq("id", id).neq("status", "annule")
      .gte("event_date", addDays(e.event_date, -20)).lte("event_date", addDays(e.event_date, 20)),
    supabase.from("event_items").select("item_id, qty").eq("event_id", id),
  ]);
  const items = (itemData ?? []) as StockItem[];
  const cats = (catData ?? []) as (StockCategory & { parent_id?: string | null })[];
  const catMap = new Map(cats.map((c) => [c.id, c]));
  const overlapping = ((near ?? []) as EventRow[]).filter((o) => { const x = eventSlot(o); return x.from <= slot.to && x.to >= slot.from; });
  const { data: other } = overlapping.length
    ? await supabase.from("event_items").select("item_id, qty, event_id").in("event_id", overlapping.map((o) => o.id)).neq("status", "retourne")
    : { data: [] };
  const evName = new Map(overlapping.map((o) => [o.id, `${o.name} (${formatDate(o.event_date)})`]));
  const taken = new Map<string, { qty: number; who: string[] }>();
  for (const l of other ?? []) {
    const t = taken.get(l.item_id) ?? { qty: 0, who: [] };
    t.qty += l.qty;
    t.who.push(`${l.qty} × ${evName.get(l.event_id) ?? "autre événement"}`);
    taken.set(l.item_id, t);
  }
  const already = new Map((mine ?? []).map((m) => [m.item_id as string, m.qty as number]));
  const urls = await signedUrls(supabase, STOCK_BUCKET, items.map((i) => i.photo_path));
  const catName = (cid: string | null) => {
    const c = cid ? catMap.get(cid) : undefined;
    if (!c) return null;
    const p = c.parent_id ? catMap.get(c.parent_id) : undefined;
    return p ? `${p.name} › ${c.name}` : c.name;
  };
  const list: BasketItem[] = items.map((i) => ({
    id: i.id, name: i.name, code: i.code ?? null, cat: catName(i.category_id), catRoot: i.category_id ? (catMap.get(i.category_id)?.parent_id ?? i.category_id) : null,
    photo: i.photo_path ? urls.get(i.photo_path) ?? null : null, dims: i.dimensions, place: i.location, color: i.color,
    good: i.qty_good, repair: i.qty_repair, broken: i.qty_broken,
    avail: Math.max(0, i.qty_good - (taken.get(i.id)?.qty ?? 0)), others: taken.get(i.id)?.who ?? [], mine: already.get(i.id) ?? 0,
  }));
  const roots = cats.filter((c) => !c.parent_id).map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="mx-auto max-w-5xl">
      <Link href={`/evenements/${id}`} className="link text-sm">← {e.name}</Link>
      <h1 className="mt-1 font-display text-3xl font-semibold">Choisir le matériel</h1>
      <p className="mt-1 text-[15px] text-ink-500">
        Disponibilité calculée du <b className="text-ink">{formatDate(slot.from)}</b> (sortie) au <b className="text-ink">{formatDate(slot.to)}</b> (retour).
      </p>
      <StockBasket eventId={id} items={list} cats={roots} />
    </div>
  );
}
