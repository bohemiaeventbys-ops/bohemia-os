import { PageHeader } from "@/components/ui/page-header";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadEmployees } from "@/lib/queries";
import { getLang } from "@/lib/lang";
import { signedUrls } from "@/lib/storage";
import { STOCK_BUCKET, type StockCategory, type StockItem } from "@/lib/stock";
import { EventFields } from "../event-form";
import type { BasketItem } from "../[id]/materiel/choisir/stock-basket";
import { NewEventForm } from "./new-event-form";

export const metadata = { title: "Nouvel événement" };

/** Tout sur la même page : la fiche, le design et le mobilier du dépôt. */
export default async function NewEvent({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const sp = await searchParams;
  await requirePerm("events.manage");
  const lang = await getLang();
  const supabase = await createClient();
  const [employees, { data: clients }, { data: itemData }, { data: catData }] = await Promise.all([
    loadEmployees(supabase),
    supabase.from("clients").select("id, name, phone").order("name"),
    supabase.from("stock_items").select("*").eq("is_active", true).order("name").limit(3000),
    supabase.from("stock_categories").select("*").order("sort_order"),
  ]);
  const items = (itemData ?? []) as StockItem[];
  const cats = (catData ?? []) as (StockCategory & { parent_id?: string | null })[];
  const catMap = new Map(cats.map((c) => [c.id, c]));
  const catName = (cid: string | null) => {
    const c = cid ? catMap.get(cid) : undefined;
    if (!c) return null;
    const p = c.parent_id ? catMap.get(c.parent_id) : undefined;
    return p ? `${p.name} › ${c.name}` : c.name;
  };
  const urls = await signedUrls(supabase, STOCK_BUCKET, items.map((i) => i.photo_path));
  const list: BasketItem[] = items.map((i) => ({
    id: i.id, name: i.name, code: i.code ?? null, cat: catName(i.category_id), catRoot: i.category_id ? (catMap.get(i.category_id)?.parent_id ?? i.category_id) : null,
    photo: i.photo_path ? urls.get(i.photo_path) ?? null : null, dims: i.dimensions, place: i.location, color: i.color,
    shape: i.shape ?? null, material: i.material ?? null, panel: !!(i.material || i.shape) || /panneau|forex|mdf|arche/i.test(`${catName(i.category_id) ?? ""} ${i.name}`),
    good: i.qty_good, repair: i.qty_repair, broken: i.qty_broken, avail: i.qty_good, others: [], mine: 0,
  }));
  const roots = cats.filter((c) => !c.parent_id).map((c) => ({ id: c.id, name: c.name }));
  const ar = lang === "ar";

  return (
    <>
      <PageHeader eyebrow={ar ? "الأحداث" : "Événements"} title={ar ? "حدث جديد" : "Nouvel événement"}
        subtitle={ar ? "املأ البطاقة، أضف التصميم والأثاث، ثم اضغط « إنشاء الحدث »." : "Remplissez la fiche, ajoutez le design et le mobilier du dépôt, puis « Créer l'événement »."} />
      <NewEventForm items={list} cats={roots} lang={lang}>
        <EventFields employees={employees} clients={clients ?? []} clientId={sp.client} lang={lang} />
      </NewEventForm>
    </>
  );
}
