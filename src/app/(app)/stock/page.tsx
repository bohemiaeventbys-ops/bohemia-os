import Link from "next/link";
import { Hammer, PackageCheck, Plus, Search, ShoppingCart, Truck, Undo2, Warehouse } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { Badge, toneTile } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { NavIcon } from "@/components/layout/icon";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedUrls } from "@/lib/storage";
import { cn } from "@/lib/cn";
import { addDays, diffDays, formatDayShort, todayISO } from "@/lib/dates";
import { EVENT_TYPE } from "@/lib/labels";
import { STOCK_BUCKET, isLow, type EventItem, type StockCategory, type StockItem } from "@/lib/stock";
import type { EventRow } from "@/lib/types";
import { discardItem, repairedItem } from "./actions";
import { CompactStock } from "./compact";

export const metadata = { title: "Dépôt & Stock" };

type SP = { vue?: string; cat?: string; theme?: string; q?: string; du?: string; au?: string; etat?: string; page?: string };

export default async function StockPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const s = await requireSession();
  const supabase = await createClient();
  const vue = sp.vue === "sorties" || sp.vue === "reparer" || sp.vue === "racheter" || sp.vue === "compact" ? sp.vue : "inventaire";
  const canManage = s.can("stock.manage");
  const canMove = canManage || s.can("stock.move") || s.can("events.manage");

  const [{ data: catData }, { data: itemData }] = await Promise.all([
    supabase.from("stock_categories").select("*").order("sort_order"),
    supabase.from("stock_items").select("*").eq("is_active", true).order("name").limit(2000),
  ]);
  const cats = (catData ?? []) as StockCategory[];
  const catMap = new Map(cats.map((c) => [c.id, c]));
  const all = (itemData ?? []) as StockItem[];
  const repairCount = all.filter((i) => i.qty_repair > 0 || i.qty_broken > 0).length;
  const low = all.filter(isLow);

  const tabs = [
    { key: "inventaire", label: "Inventaire", href: "/stock", count: all.length },
    { key: "compact", label: "Liste compacte", href: "/stock?vue=compact" },
    { key: "sorties", label: "Sorties & retours", href: "/stock?vue=sorties" },
    { key: "reparer", label: "À réparer", href: "/stock?vue=reparer", count: repairCount },
    { key: "racheter", label: "Il en manque", href: "/stock?vue=racheter", count: low.length },
  ];

  return (
    <>
      <PageHeader title="Dépôt & Stock" subtitle="Tout le matériel, son état, et ce qui part sur chaque événement."
        actions={canManage && <ButtonLink href="/stock/nouveau" size="lg"><Plus className="h-5 w-5" /> Ajouter un article</ButtonLink>} />
      <Tabs active={vue} items={tabs} />
      {vue === "inventaire" && <Inventory sp={sp} all={all} cats={cats} catMap={catMap} />}
      {vue === "compact" && <CompactStock sp={sp} all={all} cats={cats} canManage={canManage} />}
      {vue === "sorties" && <Outgoing canMove={canMove} />}
      {vue === "racheter" && <LowList items={low} catMap={catMap} />}
      {vue === "reparer" && <Repairs items={all.filter((i) => i.qty_repair > 0 || i.qty_broken > 0)} catMap={catMap} canMove={canMove} canManage={canManage} />}
    </>
  );
}

async function Inventory({ sp, all, cats, catMap }: { sp: SP; all: StockItem[]; cats: StockCategory[]; catMap: Map<string, StockCategory> }) {
  const supabase = await createClient();
  const q = (sp.q ?? "").trim().toLowerCase();
  const items = all.filter((i) => (!sp.cat || i.category_id === sp.cat) && (!sp.theme || i.themes.includes(sp.theme))
    && (!q || i.name.toLowerCase().includes(q) || (i.location ?? "").toLowerCase().includes(q) || i.themes.some((t) => t.toLowerCase().includes(q))));
  const themes = Array.from(new Set(all.flatMap((i) => i.themes))).sort((a, b) => a.localeCompare(b, "fr"));
  const urls = await signedUrls(supabase, STOCK_BUCKET, items.map((i) => i.photo_path));
  const link = (p: Partial<SP>) => {
    const u = new URLSearchParams(Object.entries({ cat: sp.cat, theme: sp.theme, q: sp.q, ...p }).filter(([, v]) => v) as [string, string][]);
    return `/stock${u.size ? `?${u}` : ""}`;
  };
  const countByCat = new Map<string, number>();
  for (const i of all) if (i.category_id) countByCat.set(i.category_id, (countByCat.get(i.category_id) ?? 0) + 1);

  return (
    <>
      <form className="relative mb-4 max-w-xl">
        {sp.cat && <input type="hidden" name="cat" value={sp.cat} />}
        {sp.theme && <input type="hidden" name="theme" value={sp.theme} />}
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-300" />
        <input name="q" defaultValue={sp.q} placeholder="Chercher : vase, arche, rallonge, doré…" className="field h-12 pl-12 text-base" />
      </form>

      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <Link href={link({ cat: undefined })} className={cn("flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium", !sp.cat ? "border-ink bg-ink text-ivory" : "border-line bg-white text-ink-600")}>Tout</Link>
        {cats.map((c) => (
          <Link key={c.id} href={link({ cat: sp.cat === c.id ? undefined : c.id })}
            className={cn("flex shrink-0 items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5 text-sm font-medium", sp.cat === c.id ? "border-ink bg-ink text-ivory" : "border-line bg-white text-ink-600")}>
            <span className={cn("tile h-7 w-7 rounded-full", toneTile[c.color])}><NavIcon name={c.icon} className="h-4 w-4" /></span>
            {c.name}<span className={cn("text-xs", sp.cat === c.id ? "text-ivory/70" : "text-ink-300")}>{countByCat.get(c.id) ?? 0}</span>
          </Link>
        ))}
      </div>
      {themes.length > 0 && (
        <div className="-mx-4 mb-6 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          <span className="shrink-0 py-1 pr-1 text-xs font-medium text-ink-400">Thèmes :</span>
          {themes.map((t) => (
            <Link key={t} href={link({ theme: sp.theme === t ? undefined : t })}
              className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold", sp.theme === t ? "bg-rose-500 text-white" : "bg-rose-50 text-rose-700 ring-1 ring-rose-200")}>{t}</Link>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <Card><Empty title={all.length === 0 ? "L'inventaire est vide." : "Aucun article trouvé."} icon={<Warehouse className="h-8 w-8" />}>
          {all.length === 0 ? "Commencez par « Ajouter un article » : une photo, un nom, une quantité." : "Essayez un autre mot ou retirez les filtres."}
        </Empty></Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
          {items.map((i) => {
            const c = i.category_id ? catMap.get(i.category_id) : undefined;
            const url = i.photo_path ? urls.get(i.photo_path) : undefined;
            return (
              <Link key={i.id} href={`/stock/${i.id}`} className="card group overflow-hidden transition hover:-translate-y-0.5 hover:shadow-pop">
                <div className={cn("relative aspect-[4/3] w-full", !url && toneTile[c?.color ?? "neutral"])}>
                  {url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                    : <span className="flex h-full w-full items-center justify-center"><NavIcon name={c?.icon ?? "box"} className="h-10 w-10 opacity-70" /></span>}
                  <span className={cn("absolute left-2 top-2 rounded-full px-2.5 py-1 text-sm font-bold tabular-nums shadow-card", isLow(i) ? "bg-clay-500 text-white" : "bg-white/90 text-ink")}>{i.qty_good} <span className="text-xs font-medium opacity-70">{i.unit}{i.qty_good > 1 && i.unit === "pièce" ? "s" : ""}</span></span>
                </div>
                <div className="space-y-1.5 p-3">
                  <p className="line-clamp-2 text-[15px] font-semibold leading-snug">{i.name}</p>
                  <p className="truncate text-xs text-ink-400">{c?.name ?? "Sans catégorie"}{i.location ? ` · ${i.location}` : ""}</p>
                  {(i.qty_repair > 0 || i.qty_broken > 0) && (
                    <div className="flex flex-wrap gap-1">
                      {i.qty_repair > 0 && <Badge tone="ochre">{i.qty_repair} à réparer</Badge>}
                      {i.qty_broken > 0 && <Badge tone="clay">{i.qty_broken} cassé{i.qty_broken > 1 ? "s" : ""}</Badge>}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

async function Outgoing({ canMove }: { canMove: boolean }) {
  const supabase = await createClient();
  const today = todayISO();
  const { data: evData } = await supabase.from("events").select("*").gte("event_date", addDays(today, -21)).lte("event_date", addDays(today, 21)).neq("status", "annule").order("event_date");
  const events = (evData ?? []) as EventRow[];
  const ids = events.map((e) => e.id);
  const { data: lineData } = ids.length ? await supabase.from("event_items").select("event_id, status, qty").in("event_id", ids) : { data: [] };
  const lines = (lineData ?? []) as Pick<EventItem, "event_id" | "status" | "qty">[];
  const by = new Map<string, Pick<EventItem, "event_id" | "status" | "qty">[]>();
  for (const l of lines) by.set(l.event_id, [...(by.get(l.event_id) ?? []), l]);

  const upcoming = events.filter((e) => e.event_date >= today);
  const toBringBack = events.filter((e) => e.event_date < today && (by.get(e.id) ?? []).some((l) => l.status === "charge"));

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader title="Prochaines sorties" icon={<Truck />} tone="teal" subtitle="Préparer et charger le matériel de chaque événement" />
        {upcoming.length === 0 ? <Empty title="Aucun événement à venir." /> : (
          <ul className="divide-y divide-line">{upcoming.map((e) => <EventLine key={e.id} e={e} lines={by.get(e.id) ?? []} today={today} canMove={canMove} />)}</ul>
        )}
      </Card>
      <Card>
        <CardHeader title="À faire revenir" icon={<Undo2 />} tone="plum" subtitle="Matériel encore dehors après l'événement" />
        {toBringBack.length === 0 ? <Empty title="Tout le matériel est rentré." /> : (
          <ul className="divide-y divide-line">{toBringBack.map((e) => <EventLine key={e.id} e={e} lines={by.get(e.id) ?? []} today={today} canMove={canMove} back />)}</ul>
        )}
      </Card>
    </div>
  );
}

function EventLine({ e, lines, today, canMove, back }: { e: EventRow; lines: Pick<EventItem, "status" | "qty">[]; today: string; canMove: boolean; back?: boolean }) {
  const d = diffDays(e.event_date, today);
  const total = lines.length;
  const done = lines.filter((l) => (back ? l.status === "retourne" : l.status === "charge" || l.status === "retourne")).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <li>
      <Link href={`/evenements/${e.id}/materiel`} className="flex items-center gap-4 px-5 py-4 hover:bg-sand-50">
        <div className={cn("w-14 shrink-0 rounded-xl py-1.5 text-center", back ? "bg-plum-50 text-plum-700" : d <= 2 ? "bg-clay-50 text-clay-700" : "bg-teal-50 text-teal-700")}>
          <p className="text-xs font-semibold">{formatDayShort(e.event_date)}</p>
          <p className="text-2xs font-medium">{back ? `il y a ${-d} j` : d === 0 ? "Aujourd'hui" : `J-${d}`}</p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{e.name}</p>
          <p className="truncate text-xs text-ink-400">{EVENT_TYPE[e.event_type]} · {total ? `${total} article(s)` : "Aucun matériel prévu"}</p>
          {total > 0 && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-sand-200"><div className={cn("h-full rounded-full", back ? "bg-plum-500" : "bg-teal-500")} style={{ width: `${pct}%` }} /></div>
              <span className="text-xs tabular-nums text-ink-400">{done}/{total} {back ? "revenus" : "chargés"}</span>
            </div>
          )}
        </div>
        {canMove && <span className={cn("hidden shrink-0 rounded-xl px-3 py-2 text-sm font-semibold sm:inline-flex sm:items-center sm:gap-1.5", back ? "bg-plum-100 text-plum-700" : "bg-teal-100 text-teal-700")}>
          {back ? <><Undo2 className="h-4 w-4" /> Retour</> : <><PackageCheck className="h-4 w-4" /> Préparer</>}
        </span>}
      </Link>
    </li>
  );
}

async function Repairs({ items, catMap, canMove, canManage }: { items: StockItem[]; catMap: Map<string, StockCategory>; canMove: boolean; canManage: boolean }) {
  const supabase = await createClient();
  const urls = await signedUrls(supabase, STOCK_BUCKET, items.map((i) => i.photo_path));
  if (items.length === 0) return <Card><Empty title="Rien à réparer." icon={<Hammer className="h-8 w-8" />}>Tout le matériel est en bon état.</Empty></Card>;
  return (
    <Card>
      <CardHeader title="Atelier réparation" icon={<Hammer />} tone="ochre" subtitle="Réparez, ou jetez ce qui ne servira plus. Chaque geste est enregistré." />
      <ul className="divide-y divide-line">
        {items.map((i) => {
          const url = i.photo_path ? urls.get(i.photo_path) : undefined;
          const c = i.category_id ? catMap.get(i.category_id) : undefined;
          return (
            <li key={i.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <Link href={`/stock/${i.id}`} className="flex items-center gap-3">
                {url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={url} alt="" className="h-14 w-14 rounded-xl object-cover" />
                  : <span className={cn("tile h-14 w-14", toneTile[c?.color ?? "neutral"])}><NavIcon name={c?.icon ?? "box"} className="h-6 w-6" /></span>}
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold">{i.name}</span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {i.qty_repair > 0 && <Badge tone="ochre">{i.qty_repair} à réparer</Badge>}
                    {i.qty_broken > 0 && <Badge tone="clay">{i.qty_broken} cassé{i.qty_broken > 1 ? "s" : ""}</Badge>}
                    <Badge tone="sage">{i.qty_good} en bon état</Badge>
                  </span>
                </span>
              </Link>
              <div className="flex flex-wrap gap-2">
                {canMove && i.qty_repair > 0 && (
                  <ActionForm action={repairedItem} className="flex gap-2">
                    <input type="hidden" name="id" value={i.id} />
                    <input name="qty" type="number" min={1} max={i.qty_repair} defaultValue={i.qty_repair} className="field h-11 w-20 text-center" aria-label="Combien" />
                    <SubmitButton variant="success"><Hammer className="h-4 w-4" /> Réparé</SubmitButton>
                  </ActionForm>
                )}
                {canManage && i.qty_broken > 0 && (
                  <ActionForm action={discardItem} className="flex gap-2">
                    <input type="hidden" name="id" value={i.id} /><input type="hidden" name="from" value="broken" />
                    <input name="qty" type="number" min={1} max={i.qty_broken} defaultValue={i.qty_broken} className="field h-11 w-20 text-center" aria-label="Combien" />
                    <SubmitButton variant="danger">Jeter</SubmitButton>
                  </ActionForm>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function LowList({ items, catMap }: { items: StockItem[]; catMap: Map<string, StockCategory> }) {
  if (!items.length) return <Card><Empty title="Rien ne manque." icon={<PackageCheck className="h-8 w-8" />}>Donnez un minimum aux articles (Modifier &gt; « Prévenir s&apos;il en reste moins de ») pour être prévenu.</Empty></Card>;
  return (
    <Card>
      <CardHeader icon={<ShoppingCart />} tone="clay" title="Il en manque" subtitle="Sous le minimum : le dépôt, les achats et la direction sont prévenus" />
      <ul className="divide-y divide-line">
        {items.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <Link href={`/stock/${i.id}`} className="min-w-0 flex-1">
              <span className="block font-semibold">{i.name}</span>
              <span className="block text-sm text-ink-500">{catMap.get(i.category_id ?? "")?.name ?? "Sans catégorie"} · reste <b className="text-clay-700">{i.qty_good}</b> / minimum {i.min_qty}</span>
            </Link>
            <ButtonLink href={`/achats/nouveau?article=${i.id}&qte=${i.min_qty - i.qty_good}`} size="sm">Demander un achat</ButtonLink>
          </li>
        ))}
      </ul>
    </Card>
  );
}
