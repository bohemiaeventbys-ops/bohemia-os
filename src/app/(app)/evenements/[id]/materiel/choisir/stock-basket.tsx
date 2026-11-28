"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Loader2, Minus, PackagePlus, Plus, Search, ShoppingBasket, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { rid, shrinkImage } from "@/lib/client/files";
import { cn } from "@/lib/cn";
import { reserveMany } from "../../../../stock/actions";

export type BasketItem = {
  id: string; name: string; code: string | null; cat: string | null; catRoot: string | null; photo: string | null; dims: string | null; place: string | null; color: string | null; shape: string | null; material: string | null; panel: boolean;
  good: number; repair: number; broken: number; avail: number; others: string[]; mine: number;
};
export type Line = { qty: number; finish: string; color: string; vinyl: string; zone: string; short: boolean; photo: Blob | null; preview: string | null };
const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Envoie les photos de référence puis réserve tout le panier pour l'événement. */
export async function reserveBasket(eventId: string, basket: Record<string, Line>, setBusy: (s: string | null) => void = () => {}, forceShort = false) {
  const supabase = createClient();
  const lines = [];
  for (const [id, l] of Object.entries(basket)) {
    let ref: string | null = null;
    if (l.photo) {
      setBusy("Envoi des photos de référence…");
      ref = `events/${eventId}/ref-${rid()}.jpg`;
      const { error } = await supabase.storage.from("stock-photos").upload(ref, l.photo, { contentType: "image/jpeg" });
      if (error) ref = null;
    }
    lines.push({ item_id: id, qty: l.qty, finish: l.finish, color: l.color, vinyl: l.vinyl, zone: l.zone, short: forceShort || l.short, ref_photo_path: ref });
  }
  setBusy("Réservation…");
  return reserveMany(eventId, lines);
}

/** Plusieurs articles en une fois : on touche les photos, on règle les quantités et les consignes, puis « Réserver ». */
export function StockBasket({ eventId, items, cats, initialCat, onBasket }: {
  eventId: string | null; items: BasketItem[]; cats: { id: string; name: string }[]; initialCat?: string | null;
  /** Mode « Nouvel événement » : pas encore d'événement, le panier est remonté et réservé à l'enregistrement. */
  onBasket?: (b: Record<string, Line>) => void;
}) {
  const deferred = !eventId;
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(initialCat ?? null);
  const [basket, setBasket] = useState<Record<string, Line>>({});
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const shown = useMemo(() => {
    const n = norm(q.trim());
    return items.filter((i) => (!cat || i.catRoot === cat) && (!n || [i.name, i.code ?? "", i.cat ?? "", i.color ?? "", i.material ?? "", i.shape ?? ""].some((x) => norm(x).includes(n)))).slice(0, 120);
  }, [q, cat, items]);
  const count = Object.keys(basket).length;
  useEffect(() => { onBasket?.(basket); }, [basket, onBasket]);

  const set = (id: string, patch: Partial<Line>) => setBasket((b) => ({ ...b, [id]: { ...b[id], ...patch } }));
  const toggle = (i: BasketItem) => setBasket((b) => {
    if (b[i.id]) { const { [i.id]: _, ...rest } = b; void _; return rest; }
    return { ...b, [i.id]: { qty: Math.max(1, i.mine || 1), finish: "", color: "", vinyl: "", zone: "", short: false, photo: null, preview: null } };
  });

  async function confirm() {
    setErr(null);
    const ids = Object.keys(basket);
    const over = ids.find((id) => basket[id].qty > (byId.get(id)?.avail ?? 0) && !basket[id].short);
    if (over) { setOpen(true); setErr(`Pas assez de « ${byId.get(over)?.name} » : ${byId.get(over)?.avail} disponible(s). Choisissez un autre modèle ou cochez « noter le manque ».`); return; }
    try {
      if (!eventId) return;
      const r = await reserveBasket(eventId, basket, setBusy);
      if (!r.ok) { setErr(r.error); return; }
      router.push(`/evenements/${eventId}?reserve=${r.n}#materiel`);
      router.refresh();
    } catch {
      setErr("Réservation impossible : vérifiez le réseau et réessayez.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={deferred ? "" : "pb-32"} onKeyDown={deferred ? (e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault(); } : undefined}>
      <div className={deferred ? "space-y-2" : "sticky top-16 z-10 -mx-4 space-y-2 bg-ivory/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8"}>
        <div className="relative">
          <Search className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-300" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher : salon, table basse, panneau, CH-12…" className="field h-14 ps-12 text-[17px]" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Chip on={!cat} onClick={() => setCat(null)}>Tout</Chip>
          {cats.map((c) => <Chip key={c.id} on={cat === c.id} onClick={() => setCat(c.id)}>{c.name}</Chip>)}
        </div>
      </div>

      <div className={cn("mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4", deferred && "max-h-[30rem] overflow-y-auto rounded-2xl p-1")}>
        {shown.map((i) => {
          const on = !!basket[i.id];
          return (
            <button key={i.id} type="button" onClick={() => toggle(i)}
              className={cn("relative overflow-hidden rounded-2xl bg-paper text-start ring-1 transition", i.avail === 0 && !on && "opacity-60", on ? "ring-4 ring-olive-600" : "ring-line hover:ring-ink-300")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {i.photo ? <img src={i.photo} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" /> : <span className="flex aspect-[4/3] w-full items-center justify-center bg-sand-100 text-ink-300"><PackagePlus className="h-8 w-8" /></span>}
              <span className="block space-y-0.5 px-2.5 py-2">
                <span className="block text-sm font-semibold leading-tight">{i.name}</span>
                {i.code && <span className="block font-mono text-xs font-bold text-ink-600">{i.code}</span>}
                <span className="block text-xs text-ink-500">{[i.shape, i.dims, i.material, i.place].filter(Boolean).join(" · ")}</span>
                <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-bold", i.avail > 0 ? "bg-sage-100 text-sage-700" : "bg-clay-100 text-clay-700")}>
                  {i.avail > 0 ? `${i.avail} ${deferred ? "en stock" : "disponible(s)"}` : deferred ? "Aucun en bon état" : "Indisponible"}
                </span>
                {(i.repair > 0 || i.broken > 0) && <span className="block text-[11px] text-ochre-700">{i.repair ? `${i.repair} à réparer ` : ""}{i.broken ? `${i.broken} cassé(s)` : ""}</span>}
                {i.others.length > 0 && <span className="block text-[11px] text-ink-400" title={i.others.join("\n")}>Réservé ailleurs : {i.others[0]}{i.others.length > 1 ? ` +${i.others.length - 1}` : ""}</span>}
                {i.mine > 0 && <span className="block text-[11px] font-semibold text-olive-700">Déjà sur cet événement : {i.mine}</span>}
              </span>
              {on && <span className="absolute end-2 top-2 rounded-full bg-olive-600 p-1 text-white"><Check className="h-4 w-4" /></span>}
            </button>
          );
        })}
        {shown.length === 0 && <p className="col-span-full py-10 text-center text-ink-400">Rien trouvé.</p>}
      </div>

      {/* Panier */}
      {count > 0 && (
        <div className={deferred ? "mt-4" : "fixed inset-x-0 bottom-0 z-40 lg:start-64"}>
          {deferred && <p className="mb-2 flex items-center gap-2 font-bold"><ShoppingBasket className="h-5 w-5 text-olive-700" /> {count} article(s) choisi(s) : quantités et consignes</p>}
          {(open || deferred) && (
            <div className={deferred ? "space-y-3" : "max-h-[65vh] overflow-y-auto border-t border-line bg-paper px-4 pb-3 pt-4 shadow-pop sm:px-8"}>
              <div className="mx-auto max-w-5xl space-y-3">
                {Object.entries(basket).map(([id, l]) => {
                  const i = byId.get(id)!;
                  const gap = l.qty - i.avail;
                  return (
                    <div key={id} className="rounded-2xl bg-sand-50 p-3 ring-1 ring-line">
                      <div className="flex flex-wrap items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {i.photo ? <img src={i.photo} alt="" className="h-12 w-12 rounded-lg object-cover" /> : <span className="h-12 w-12 rounded-lg bg-sand-100" />}
                        <p className="min-w-0 flex-1 font-semibold leading-tight">{i.name}<span className="block text-xs font-normal text-ink-500">{[i.code, i.dims, i.material].filter(Boolean).join(" · ")}{i.code || i.dims || i.material ? " · " : ""}{i.avail} {deferred ? "en stock" : "disponible(s)"}</span></p>
                        <div className="order-last flex w-full items-center justify-end gap-1 sm:order-none sm:w-auto">
                          <span className="me-auto text-sm font-semibold text-ink-500 sm:hidden">Quantité</span>
                          <button type="button" onClick={() => set(id, { qty: Math.max(1, l.qty - 1) })} className="grid h-11 w-11 place-items-center rounded-xl bg-paper ring-1 ring-line"><Minus className="h-4 w-4" /></button>
                          <input type="number" min={1} value={l.qty} onChange={(e) => set(id, { qty: Math.max(1, Number(e.target.value) || 1) })} className="field h-11 w-16 text-center text-lg font-bold" />
                          <button type="button" onClick={() => set(id, { qty: l.qty + 1 })} className="grid h-11 w-11 place-items-center rounded-xl bg-paper ring-1 ring-line"><Plus className="h-4 w-4" /></button>
                        </div>
                        <button type="button" onClick={() => toggle(i)} className="rounded-lg p-2 text-ink-300 hover:text-clay-700" aria-label="Retirer"><X className="h-5 w-5" /></button>
                      </div>
                      {gap > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-clay-50 px-3 py-2 text-sm ring-1 ring-clay-200">
                          <b className="text-clay-700">Écart : il manque {gap}</b>
                          <span className="text-ink-500">({i.avail} {deferred ? "en stock" : "libre(s) sur ce créneau"})</span>
                          <button type="button" onClick={() => { setCat(i.catRoot); setQ(""); setOpen(false); if (!deferred) window.scrollTo({ top: 0, behavior: "smooth" }); }} className="rounded-lg bg-paper px-3 py-1.5 font-semibold ring-1 ring-line">Choisir un autre modèle</button>
                          {deferred ? <span className="font-semibold text-ink-600">Sinon, le manque sera noté sur la fiche.</span> : <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={l.short} onChange={(e) => set(id, { short: e.target.checked })} className="h-5 w-5" /> Réserver {i.avail} et noter le manque</label>}
                        </div>
                      )}
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <input value={l.color} onChange={(e) => set(id, { color: e.target.value })} placeholder="Couleur demandée (ex. blanc, rose poudré)" className="field h-11" />
                        <input value={l.finish} onChange={(e) => set(id, { finish: e.target.value })} placeholder="Finition (ex. doré, mat, velours)" className="field h-11" />
                        {i.panel && <input value={l.vinyl} onChange={(e) => set(id, { vinyl: e.target.value })} placeholder="Vinyle à poser (ex. prénom en doré)" className="field h-11 sm:col-span-2" />}
                        <input value={l.zone} onChange={(e) => set(id, { zone: e.target.value })} placeholder="Zone de pose (ex. entrée, coin photo)" className="field h-11" />
                        <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-paper px-3 text-sm font-semibold ring-1 ring-line">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {l.preview ? <img src={l.preview} alt="" className="h-8 w-8 rounded object-cover" /> : <Camera className="h-4 w-4 text-teal-600" />} Photo de référence
                          <input type="file" accept="image/*" className="sr-only" onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            const b = await shrinkImage(f, 1400, 0.8).catch(() => f);
                            set(id, { photo: b, preview: URL.createObjectURL(b) });
                          }} />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {!deferred && <div className="border-t border-line bg-paper/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur sm:px-8">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
              <button type="button" onClick={() => setOpen((v) => !v)} className="flex h-14 items-center gap-2 rounded-2xl bg-sand-100 px-4 font-bold">
                <ShoppingBasket className="h-5 w-5" /> {count} article(s) · {open ? "Masquer" : "Quantités et consignes"}
              </button>
              <button type="button" onClick={confirm} disabled={!!busy} className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-olive-700 px-4 text-[17px] font-bold text-white shadow-card disabled:opacity-60">
                {busy ? <><Loader2 className="h-5 w-5 animate-spin" /> {busy}</> : <><Check className="h-5 w-5" /> Réserver pour l&apos;événement</>}
              </button>
            </div>
            {err && <p className="mx-auto mt-2 max-w-5xl rounded-lg bg-clay-100 px-3 py-2 text-sm font-semibold text-clay-700">{err}</p>}
          </div>}
        </div>
      )}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={cn("h-10 shrink-0 rounded-full px-4 text-sm font-semibold ring-1", on ? "bg-ink text-ivory ring-ink" : "bg-paper text-ink-600 ring-line")}>{children}</button>;
}
