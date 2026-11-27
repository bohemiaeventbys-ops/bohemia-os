import Link from "next/link";
import { AlertTriangle, Camera, Clock, FileText, MapPin, Navigation, PackageX, Phone, Search, Truck, Warehouse, Wrench } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedUrls } from "@/lib/storage";
import { addDays, todayISO, toLocalISODate, toLocalTime } from "@/lib/dates";
import { getLang } from "@/lib/lang";
import { t, type Key, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { PROOF_BUCKET } from "@/lib/clients";
import { STOCK_BUCKET } from "@/lib/stock";
import { FieldQueue, FieldReport, MarkButton } from "./field-send";
import { DepotList, type DepotGroup } from "./depot-list";

export const metadata = { title: "Terrain" };
export const dynamic = "force-dynamic";

type Ev = {
  id: string; name: string; event_date: string; status: string; address: string | null; client_name: string | null; client_phone: string | null;
  load_at: string | null; delivery_at: string | null; setup_at: string | null; start_at: string | null; teardown_at: string | null;
  access_notes: string | null; site_contact_name: string | null; site_contact_phone: string | null;
  delivered_at: string | null; invoice_handed_at: string | null;
};
type View = "chauffeur" | "depot" | "installation";
const VIEWS: View[] = ["chauffeur", "depot", "installation"];
const ACTIVE = "(annule,prospect,devis_envoye,cloture)";

function dayLabel(lang: Lang, iso: string) {
  const today = todayISO();
  if (iso === today) return t(lang, "t.today");
  if (iso === addDays(today, 1)) return t(lang, "t.tomorrow");
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(iso + "T12:00:00Z"));
}
const sortKey = (e: Ev) => e.load_at ?? e.delivery_at ?? e.setup_at ?? e.start_at ?? `${e.event_date}T23:59`;
const mapsUrl = (a: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a)}`;
const tel = (p: string) => `tel:${p.replace(/[^\d+]/g, "")}`;

export default async function TerrainPage({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const sp = await searchParams;
  const s = await requireSession();
  const lang = await getLang();
  const tr = (k: Key) => t(lang, k);
  const supabase = await createClient();

  const seesAll = s.can("stock.move") || s.can("stock.manage") || s.can("events.manage");
  const canMove = seesAll;
  const { data: dept } = s.employee.department_id
    ? await supabase.from("departments").select("code").eq("id", s.employee.department_id).maybeSingle<{ code: string }>()
    : { data: null };
  const fallback: View = dept?.code === "TRA" ? "chauffeur" : dept?.code === "DEP" ? "depot" : "installation";
  const view: View = VIEWS.includes(sp.vue as View) ? (sp.vue as View) : fallback;

  const today = todayISO();
  const until = view === "depot" ? addDays(today, 1) : addDays(today, 14);
  let q = supabase.from("events").select("*").gte("event_date", addDays(today, view === "depot" ? 0 : -1)).lte("event_date", until).not("status", "in", ACTIVE);
  if (!seesAll) {
    const { data: mine } = await supabase.from("event_team").select("event_id").eq("employee_id", s.employee.id);
    const ids = (mine ?? []).map((m) => m.event_id as string);
    q = q.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  }
  const { data } = await q;
  // On garde ce qui n'est pas encore terminé : une mission d'hier encore en cours reste visible
  const events = ((data ?? []) as Ev[])
    .filter((e) => e.event_date >= today || (view === "chauffeur" && !e.delivered_at))
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  const tabs: { v: View; icon: React.ReactNode; tone: string }[] = [
    { v: "chauffeur", icon: <Truck className="h-6 w-6" />, tone: "bg-mist-600" },
    { v: "depot", icon: <Warehouse className="h-6 w-6" />, tone: "bg-ochre-500" },
    { v: "installation", icon: <Wrench className="h-6 w-6" />, tone: "bg-rose-600" },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="font-display text-3xl font-semibold">{tr("t.title")}</h1>
        <p className="mt-1 text-[15px] text-ink-500">{tr("t.subtitle")}</p>
      </div>
      <nav className="grid grid-cols-3 gap-2">
        {tabs.map((x) => (
          <Link key={x.v} href={`/terrain?vue=${x.v}`} aria-current={view === x.v ? "page" : undefined}
            className={cn("flex flex-col items-center gap-1 rounded-2xl px-2 py-3 text-[15px] font-bold transition",
              view === x.v ? `${x.tone} text-white shadow-card` : "bg-white text-ink-500 ring-1 ring-line")}>
            {x.icon} {tr(`t.tab.${x.v}` as Key)}
          </Link>
        ))}
      </nav>
      <FieldQueue lang={lang} />

      {view === "chauffeur" && <Chauffeur lang={lang} events={events} />}
      {view === "depot" && <Depot lang={lang} events={events} canMove={canMove} />}
      {view === "installation" && <Installation lang={lang} events={events} />}
    </div>
  );
}

function None({ lang }: { lang: Lang }) {
  return <p className="rounded-2xl bg-white px-5 py-10 text-center text-[17px] font-semibold text-ink-400 ring-1 ring-line">{t(lang, "t.none")}</p>;
}

function Times({ lang, e, keys }: { lang: Lang; e: Ev; keys: ("load_at" | "delivery_at" | "setup_at" | "start_at" | "teardown_at")[] }) {
  const L: Record<string, Key> = { load_at: "t.load", delivery_at: "t.delivery", setup_at: "t.setup", start_at: "t.start", teardown_at: "t.teardown" };
  const shown = keys.filter((k) => e[k]);
  if (!shown.length) return null;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {shown.map((k) => {
        const d = toLocalISODate(e[k]!);
        return (
          <div key={k} className="rounded-xl bg-sand-50 px-3 py-2 ring-1 ring-line">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-500"><Clock className="h-3.5 w-3.5" /> {t(lang, L[k])}</p>
            <p className="text-2xl font-bold tabular-nums" dir="ltr">{toLocalTime(e[k])}</p>
            {d !== e.event_date && <p className="text-xs text-ink-500">{dayLabel(lang, d)}</p>}
          </div>
        );
      })}
    </div>
  );
}

function Head({ lang, e, big }: { lang: Lang; e: Ev; big?: boolean }) {
  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-wide text-rose-600">{dayLabel(lang, e.event_date)}</p>
      <h2 className={cn("font-semibold leading-tight", big ? "text-2xl" : "text-lg")} dir="auto">{e.name}</h2>
    </div>
  );
}

function Place({ lang, e }: { lang: Lang; e: Ev }) {
  const contact = e.site_contact_name ?? e.client_name;
  const phone = e.site_contact_phone ?? e.client_phone;
  return (
    <div className="space-y-2 text-[15px]">
      <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" /> <span dir="auto">{e.address ?? <span className="text-ink-400">{t(lang, "t.noAddress")}</span>}</span></p>
      {(contact || phone) && <p className="flex items-start gap-2"><Phone className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" /> <span><span className="text-ink-500">{t(lang, "t.contact")} : </span><span dir="auto">{contact}</span> {phone && <span dir="ltr" className="font-semibold">{phone}</span>}</span></p>}
      {e.access_notes && <p className="rounded-xl bg-ochre-100 px-3 py-2 text-ochre-700"><span className="font-bold">{t(lang, "t.access")} : </span><span dir="auto">{e.access_notes}</span></p>}
    </div>
  );
}

function BigLinks({ lang, e }: { lang: Lang; e: Ev }) {
  const phone = e.site_contact_phone ?? e.client_phone;
  const btn = "flex min-h-14 items-center justify-center gap-2 rounded-2xl px-3 text-[17px] font-bold shadow-card active:scale-[0.98]";
  return (
    <div className="grid grid-cols-2 gap-2">
      {e.address ? <a href={mapsUrl(e.address)} target="_blank" rel="noreferrer" className={cn(btn, "bg-mist-600 text-white")}><Navigation className="h-6 w-6" /> {t(lang, "t.route")}</a>
        : <span className={cn(btn, "bg-sand-100 text-ink-300 shadow-none")}><Navigation className="h-6 w-6" /> {t(lang, "t.route")}</span>}
      {phone ? <a href={tel(phone)} className={cn(btn, "bg-teal-600 text-white")}><Phone className="h-6 w-6" /> {t(lang, "t.call")}</a>
        : <span className={cn(btn, "bg-sand-100 text-ink-300 shadow-none")}><Phone className="h-6 w-6" /> {t(lang, "t.call")}</span>}
    </div>
  );
}

/* ----------------------------- Chauffeur ----------------------------- */
async function Chauffeur({ lang, events }: { lang: Lang; events: Ev[] }) {
  if (!events.length) return <None lang={lang} />;
  const supabase = await createClient();
  const { data: bls } = await supabase.from("field_docs").select("event_id").eq("kind", "bl").in("event_id", events.map((e) => e.id));
  const blCount = new Map<string, number>();
  for (const b of bls ?? []) blCount.set(b.event_id as string, (blCount.get(b.event_id as string) ?? 0) + 1);
  const [next, ...later] = events;
  return (
    <div className="space-y-4">
      <p className="text-sm font-bold uppercase tracking-wider text-ink-400">{t(lang, "t.next")}</p>
      <ChauffeurCard lang={lang} e={next} bl={blCount.get(next.id) ?? 0} open />
      {later.length > 0 && <p className="pt-2 text-sm font-bold uppercase tracking-wider text-ink-400">{t(lang, "t.later")}</p>}
      {later.map((e) => <ChauffeurCard key={e.id} lang={lang} e={e} bl={blCount.get(e.id) ?? 0} />)}
    </div>
  );
}

function Card({ open, summary, children }: { open?: boolean; summary: React.ReactNode; children: React.ReactNode }) {
  return (
    <details open={open} className="group rounded-3xl bg-white p-4 shadow-card ring-1 ring-line sm:p-5">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">{summary}</summary>
      <div className="mt-4 space-y-4">{children}</div>
    </details>
  );
}

function ChauffeurCard({ lang, e, bl, open }: { lang: Lang; e: Ev; bl: number; open?: boolean }) {
  return (
    <Card open={open} summary={
      <div className="flex items-start justify-between gap-3">
        <Head lang={lang} e={e} big={open} />
        {e.delivered_at ? <span className="shrink-0 rounded-full bg-sage-100 px-3 py-1 text-sm font-bold text-sage-700">✓ {t(lang, "t.delivered")}</span>
          : e.load_at ? <span className="shrink-0 rounded-full bg-mist-100 px-3 py-1 text-sm font-bold text-mist-700" dir="ltr">{toLocalTime(e.load_at)}</span> : null}
      </div>
    }>
      <Times lang={lang} e={e} keys={["load_at", "delivery_at", "setup_at"]} />
      <Place lang={lang} e={e} />
      <BigLinks lang={lang} e={e} />
      <MarkButton lang={lang} eventId={e.id} what="livre" done={!!e.delivered_at} labelOn="t.delivered" labelOff="t.deliver" />
      <FieldReport lang={lang} eventId={e.id} kind="bl" label={t(lang, "t.scanBL")} icon={<FileText className="h-6 w-6" />} tone="plum" success="t.blSaved" />
      {bl > 0 && <p className="text-sm font-semibold text-sage-700">✓ <span dir="ltr">{bl}</span> {t(lang, "t.blCount")}</p>}
      <MarkButton lang={lang} eventId={e.id} what="facture" kind="check" done={!!e.invoice_handed_at} labelOn="t.invoiceHanded" labelOff="t.invoiceNotHanded" />
    </Card>
  );
}

/* ------------------------------- Dépôt ------------------------------- */
async function Depot({ lang, events, canMove }: { lang: Lang; events: Ev[]; canMove: boolean }) {
  if (!events.length) return <None lang={lang} />;
  const supabase = await createClient();
  const { data: lines } = await supabase.from("event_items")
    .select("id, event_id, item_id, qty, note, finish, status, stock_items(name, name_ar, code, location, photo_path)")
    .in("event_id", events.map((e) => e.id));
  type L = { id: string; event_id: string; item_id: string; qty: number; note: string | null; finish: string | null; status: string;
    stock_items: { name: string; name_ar: string | null; code: string | null; location: string | null; photo_path: string | null } | null };
  const all = (lines ?? []) as unknown as L[];
  const urls = await signedUrls(supabase, STOCK_BUCKET, all.map((l) => l.stock_items?.photo_path));
  const groups: DepotGroup[] = events.map((e) => ({
    id: e.id, name: e.name, day: dayLabel(lang, e.event_date), load: e.load_at ? toLocalTime(e.load_at) : null,
    lines: all.filter((l) => l.event_id === e.id).map((l) => ({
      id: l.id, itemId: l.item_id, qty: l.qty, status: l.status, finish: l.finish ?? l.note,
      name: l.stock_items?.name ?? "—", nameAr: l.stock_items?.name_ar ?? null, code: l.stock_items?.code ?? null, place: l.stock_items?.location ?? null,
      photo: l.stock_items?.photo_path ? urls.get(l.stock_items.photo_path) ?? null : null,
    })).sort((a, b) => Number(a.status === "charge") - Number(b.status === "charge") || (a.place ?? "").localeCompare(b.place ?? "")),
  }));
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-ink-400"><Search className="h-4 w-4" /> {t(lang, "t.toPrepare")}</p>
      <DepotList lang={lang} groups={groups} canMove={canMove} />
    </div>
  );
}

/* ---------------------------- Installation ---------------------------- */
async function Installation({ lang, events }: { lang: Lang; events: Ev[] }) {
  if (!events.length) return <None lang={lang} />;
  const supabase = await createClient();
  const ids = events.map((e) => e.id);
  const [{ data: proofs }, { data: photos }] = await Promise.all([
    supabase.from("design_proofs").select("id, event_id, title, file_path, version, created_at").eq("status", "valide").in("event_id", ids).order("created_at", { ascending: false }),
    supabase.from("field_docs").select("id, event_id, file_path, kind, note, created_at").in("kind", ["photo_installation", "probleme"]).in("event_id", ids).order("created_at", { ascending: false }),
  ]);
  const proofUrls = await signedUrls(supabase, PROOF_BUCKET, (proofs ?? []).map((p) => p.file_path as string));
  const photoUrls = await signedUrls(supabase, "field-docs", (photos ?? []).map((p) => p.file_path as string | null));
  const [next, ...later] = events;
  const card = (e: Ev, open: boolean) => {
    const vis = (proofs ?? []).filter((p) => p.event_id === e.id);
    const ph = (photos ?? []).filter((p) => p.event_id === e.id);
    return (
      <Card key={e.id} open={open} summary={<Head lang={lang} e={e} big={open} />}>
        <Times lang={lang} e={e} keys={["setup_at", "start_at", "teardown_at"]} />
        <Place lang={lang} e={e} />
        <BigLinks lang={lang} e={e} />
        <div>
          <p className="mb-2 text-sm font-bold uppercase tracking-wider text-ink-400">{t(lang, "t.visual")}</p>
          {vis.length === 0 ? <p className="rounded-xl bg-sand-50 px-3 py-4 text-center text-ink-400 ring-1 ring-line">{t(lang, "t.noVisual")}</p> : (
            <div className="space-y-3">
              {vis.map((p) => {
                const u = proofUrls.get(p.file_path as string);
                const isPdf = /\.pdf$/i.test(p.file_path as string);
                return (
                  <a key={p.id} href={u} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl ring-1 ring-line">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {u && !isPdf ? <img src={u} alt={p.title as string} className="w-full bg-sand-50 object-contain" /> : <span className="flex h-24 items-center justify-center gap-2 bg-sand-50 font-bold"><FileText className="h-6 w-6" /> PDF</span>}
                    <span className="block bg-sage-100 px-3 py-2 text-sm font-bold text-sage-700" dir="auto">✓ {p.title as string}</span>
                  </a>
                );
              })}
            </div>
          )}
        </div>
        <FieldReport lang={lang} eventId={e.id} kind="photo_installation" label={t(lang, "t.addPhoto")} icon={<Camera className="h-6 w-6" />} tone="teal" success="t.photoSaved" />
        <FieldReport lang={lang} eventId={e.id} kind="probleme" label={t(lang, "t.reportProblem")} icon={<AlertTriangle className="h-6 w-6" />} tone="clay" photo="optional" note success="t.problemSaved" />
        {ph.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-bold uppercase tracking-wider text-ink-400">{t(lang, "t.photos")}</p>
            <div className="grid grid-cols-3 gap-2">
              {ph.map((p) => {
                const u = p.file_path ? photoUrls.get(p.file_path as string) : null;
                return (
                  <a key={p.id} href={u ?? undefined} target="_blank" rel="noreferrer" className={cn("relative block aspect-square overflow-hidden rounded-xl ring-1", p.kind === "probleme" ? "ring-2 ring-clay-500" : "ring-line")}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {u ? <img src={u} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center bg-clay-100 p-2 text-center text-xs font-semibold text-clay-700" dir="auto">{(p.note as string) ?? ""}</span>}
                    {p.kind === "probleme" && <span className="absolute inset-x-0 bottom-0 bg-clay-600 px-1 py-0.5 text-center text-[11px] font-bold text-white"><PackageX className="me-1 inline h-3 w-3" />{t(lang, "t.reportProblem")}</span>}
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    );
  };
  return (
    <div className="space-y-4">
      <p className="text-sm font-bold uppercase tracking-wider text-ink-400">{t(lang, "t.next")}</p>
      {card(next, true)}
      {later.length > 0 && <p className="pt-2 text-sm font-bold uppercase tracking-wider text-ink-400">{t(lang, "t.later")}</p>}
      {later.map((e) => card(e, false))}
    </div>
  );
}
