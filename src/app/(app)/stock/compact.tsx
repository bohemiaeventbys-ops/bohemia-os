import Link from "next/link";
import { FolderPlus } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Input, Select } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { signedUrls } from "@/lib/storage";
import { addDays, formatDate, isValidISODate, todayISO } from "@/lib/dates";
import { eventSlot } from "@/lib/slot";
import { cn } from "@/lib/cn";
import { STOCK_BUCKET, type StockCategory, type StockItem } from "@/lib/stock";
import type { EventRow } from "@/lib/types";
import { createCategory } from "./actions";

type SP = { vue?: string; cat?: string; q?: string; du?: string; au?: string; etat?: string; page?: string };
const PER = 100;
const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Vue compacte : beaucoup d'articles par page, miniatures, total / réservé / disponible sur une période. */
export async function CompactStock({ sp, all, cats, canManage }: { sp: SP; all: StockItem[]; cats: (StockCategory & { parent_id?: string | null })[]; canManage: boolean }) {
  const du = isValidISODate(sp.du) ? sp.du : todayISO();
  const au = isValidISODate(sp.au) && sp.au >= du ? sp.au : addDays(du, 7);
  const etat = ["dispo", "reserve", "indispo"].includes(sp.etat ?? "") ? sp.etat! : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const supabase = await createClient();

  const { data: evs } = await supabase.from("events").select("id, name, event_date, load_at, delivery_at, teardown_at").neq("status", "annule")
    .gte("event_date", addDays(du, -20)).lte("event_date", addDays(au, 20));
  const inPeriod = ((evs ?? []) as EventRow[]).filter((e) => { const x = eventSlot(e); return x.from <= au && x.to >= du; });
  const { data: lines } = inPeriod.length
    ? await supabase.from("event_items").select("item_id, qty").in("event_id", inPeriod.map((e) => e.id)).neq("status", "retourne")
    : { data: [] };
  const reserved = new Map<string, number>();
  for (const l of lines ?? []) reserved.set(l.item_id, (reserved.get(l.item_id) ?? 0) + l.qty);

  const catMap = new Map(cats.map((c) => [c.id, c]));
  const inCat = (i: StockItem) => !sp.cat || i.category_id === sp.cat || catMap.get(i.category_id ?? "")?.parent_id === sp.cat;
  const nq = norm(sp.q ?? "");
  const rows = all.filter(inCat).filter((i) => !nq || [i.name, i.code ?? "", i.location ?? ""].some((x) => norm(x).includes(nq))).map((i) => {
    const r = reserved.get(i.id) ?? 0;
    return { i, total: i.qty_good + i.qty_repair + i.qty_broken, r, avail: Math.max(0, i.qty_good - r) };
  }).filter((x) => !etat || (etat === "dispo" ? x.avail > 0 : etat === "reserve" ? x.r > 0 : x.avail === 0));
  const pages = Math.max(1, Math.ceil(rows.length / PER));
  const shown = rows.slice((page - 1) * PER, page * PER);
  const urls = await signedUrls(supabase, STOCK_BUCKET, shown.map((x) => x.i.photo_path));
  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams({ vue: "compact", du, au, ...(sp.cat ? { cat: sp.cat } : {}), ...(sp.q ? { q: sp.q } : {}), ...(etat ? { etat } : {}), ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v != null)) as Record<string, string> });
    if (patch.etat === "") p.delete("etat");
    return `/stock?${p.toString()}`;
  };
  const label = (c: StockCategory & { parent_id?: string | null }) => (c.parent_id ? `${catMap.get(c.parent_id)?.name ?? ""} › ${c.name}` : c.name);

  return (
    <div className="space-y-3">
      <form className="grid gap-2 rounded-2xl bg-white p-3 ring-1 ring-line sm:grid-cols-[1fr_auto_auto_1fr_auto]" action="/stock">
        <input type="hidden" name="vue" value="compact" />
        <Input name="q" defaultValue={sp.q ?? ""} placeholder="Nom, code, emplacement…" className="h-11" />
        <label className="text-xs text-ink-500">Du<Input type="date" name="du" defaultValue={du} className="h-11" /></label>
        <label className="text-xs text-ink-500">Au<Input type="date" name="au" defaultValue={au} className="h-11" /></label>
        <Select name="cat" defaultValue={sp.cat ?? ""} className="h-11 self-end">
          <option value="">Toutes les catégories</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}
        </Select>
        <SubmitButton variant="secondary" className="self-end">Afficher</SubmitButton>
      </form>
      <div className="flex flex-wrap gap-2">
        {[["", "Tout"], ["dispo", "Disponible"], ["reserve", "Réservé"], ["indispo", "Indisponible"]].map(([k, l]) => (
          <Link key={k} href={qs({ etat: k, page: "1" })} className={cn("h-10 rounded-full px-4 text-sm font-semibold leading-10 ring-1", etat === k ? "bg-ink text-ivory ring-ink" : "bg-white ring-line")}>{l}</Link>
        ))}
        <span className="ms-auto self-center text-sm text-ink-500">{rows.length} article(s) · période du {formatDate(du)} au {formatDate(au)}</span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-sand-50 text-start text-[11px] uppercase tracking-wider text-ink-500">
            <tr><th className="px-2 py-2" /><th className="px-2 py-2 text-start">Article</th><th className="px-2 py-2 text-start">Catégorie</th><th className="px-2 py-2 text-start">Emplacement</th><th className="px-2 py-2 text-end">Total</th><th className="px-2 py-2 text-end">Réservé</th><th className="px-2 py-2 text-end">Disponible</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map(({ i, total, r, avail }) => {
              const u = i.photo_path ? urls.get(i.photo_path) : null;
              const c = i.category_id ? catMap.get(i.category_id) : undefined;
              return (
                <tr key={i.id} className="hover:bg-sand-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <td className="w-12 px-2 py-1">{u ? <img src={u} alt="" loading="lazy" className="h-9 w-9 rounded-md object-cover" /> : <span className="block h-9 w-9 rounded-md bg-sand-100" />}</td>
                  <td className="px-2 py-1"><Link href={`/stock/${i.id}`} className="font-semibold hover:underline">{i.name}</Link>{i.code && <span className="ms-2 font-mono text-xs text-ink-400">{i.code}</span>}</td>
                  <td className="px-2 py-1 text-ink-500">{c ? label(c) : "—"}</td>
                  <td className="px-2 py-1 text-ink-500">{i.location ?? "—"}</td>
                  <td className="px-2 py-1 text-end tabular-nums">{total}</td>
                  <td className="px-2 py-1 text-end tabular-nums">{r || "—"}</td>
                  <td className="px-2 py-1 text-end"><span className={cn("inline-block min-w-10 rounded-full px-2 py-0.5 text-center text-xs font-bold tabular-nums", avail > 0 ? "bg-sage-100 text-sage-700" : "bg-clay-100 text-clay-700")}>{avail > 0 ? avail : "Indispo"}</span></td>
                </tr>
              );
            })}
            {shown.length === 0 && <tr><td colSpan={7} className="px-3 py-10 text-center text-ink-400">Aucun article.</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && <Link href={qs({ page: String(page - 1) })} className="rounded-xl bg-white px-4 py-2 font-semibold ring-1 ring-line">← Précédent</Link>}
          <span className="text-sm text-ink-500">Page {page} / {pages}</span>
          {page < pages && <Link href={qs({ page: String(page + 1) })} className="rounded-xl bg-white px-4 py-2 font-semibold ring-1 ring-line">Suivant →</Link>}
        </div>
      )}

      {canManage && (
        <details className="card">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 font-semibold"><FolderPlus className="h-5 w-5 text-ochre-600" /> Nouvelle catégorie ou sous-catégorie</summary>
          <ActionForm action={createCategory} resetOnSuccess className="grid gap-2 border-t border-line px-5 py-4 sm:grid-cols-[1fr_1fr_auto]">
            <Input name="name" required placeholder="Ex. Poufs, Estrades, Moquette…" className="h-11" />
            <Select name="parent_id" defaultValue="" className="h-11">
              <option value="">Catégorie principale</option>
              {cats.filter((c) => !c.parent_id).map((c) => <option key={c.id} value={c.id}>Sous-catégorie de : {c.name}</option>)}
            </Select>
            <SubmitButton>Créer</SubmitButton>
          </ActionForm>
        </details>
      )}
    </div>
  );
}
