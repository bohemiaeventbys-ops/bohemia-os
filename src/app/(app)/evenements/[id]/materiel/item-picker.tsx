"use client";

import { useMemo, useState } from "react";
import { Check, PackagePlus, Search } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { cn } from "@/lib/cn";
import { reserveItem } from "../../../stock/actions";

export type PickItem = { id: string; name: string; code: string | null; cat: string | null; photo: string | null; avail: number; place: string | null };
const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** « + Ajouter du stock » : on cherche par nom ou code, on touche la photo, on met la quantité et la finition. */
export function ItemPicker({ eventId, items }: { eventId: string; items: PickItem[] }) {
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<PickItem | null>(null);
  const shown = useMemo(() => {
    const n = norm(q.trim());
    const list = n ? items.filter((i) => [i.name, i.code ?? "", i.cat ?? ""].some((x) => norm(x).includes(n))) : items;
    return list.slice(0, 60);
  }, [q, items]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-300" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher : chaise, arche, CH-12…" className="field h-14 ps-12 text-[17px]" />
      </div>
      <div className="grid max-h-[420px] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((i) => (
          <button key={i.id} type="button" disabled={i.avail === 0} onClick={() => setPick(i)}
            className={cn("relative overflow-hidden rounded-2xl bg-white text-start ring-1 transition disabled:opacity-40",
              pick?.id === i.id ? "ring-4 ring-rose-500" : "ring-line hover:ring-ink-300")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {i.photo ? <img src={i.photo} alt="" className="aspect-[4/3] w-full object-cover" /> : <span className="flex aspect-[4/3] w-full items-center justify-center bg-sand-100 text-ink-300"><PackagePlus className="h-8 w-8" /></span>}
            <span className="block px-2.5 py-2">
              <span className="block text-sm font-semibold leading-tight">{i.name}</span>
              <span className="block text-xs text-ink-500">{i.code ? <b className="font-mono">{i.code}</b> : null}{i.code ? " · " : ""}{i.avail} dispo</span>
            </span>
            {pick?.id === i.id && <span className="absolute end-2 top-2 rounded-full bg-rose-500 p-1 text-white"><Check className="h-4 w-4" /></span>}
          </button>
        ))}
        {shown.length === 0 && <p className="col-span-full py-6 text-center text-ink-400">Rien trouvé.</p>}
      </div>
      {pick && (
        <ActionForm action={reserveItem} resetOnSuccess onSuccess={() => { setPick(null); setQ(""); }} className="space-y-3 rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-200">
          <input type="hidden" name="event_id" value={eventId} />
          <input type="hidden" name="item_id" value={pick.id} />
          <p className="text-[16px] font-bold">{pick.name} <span className="font-normal text-ink-500">· {pick.avail} dispo</span></p>
          <div className="grid gap-3 sm:grid-cols-[120px_1fr_auto]">
            <label className="block text-xs font-semibold text-ink-500">Quantité
              <input name="qty" type="number" min={1} max={pick.avail} defaultValue={1} required className="field mt-1 h-12 text-center text-lg font-bold" />
            </label>
            <label className="block text-xs font-semibold text-ink-500">Finition / couleur (facultatif)
              <input name="finish" placeholder="Ex. doré, blanc mat, bois naturel" className="field mt-1 h-12" />
            </label>
            <div className="self-end"><SubmitButton size="lg" className="w-full"><PackagePlus className="h-5 w-5" /> Réserver</SubmitButton></div>
          </div>
        </ActionForm>
      )}
    </div>
  );
}
