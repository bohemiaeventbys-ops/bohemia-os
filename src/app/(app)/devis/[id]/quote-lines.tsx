"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { QUOTE_SECTIONS } from "@/lib/clients";

type Row = { key: number; section: string; label: string; details: string; qty: string; price: string };
const fmt = (n: number) => `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} DH`;
const n = (v: string) => { const x = Number(v.replace(/\s/g, "").replace(",", ".")); return Number.isFinite(x) ? x : 0; };

/** Lignes du devis : ajout et suppression instantanés, total recalculé pendant la saisie. */
export function QuoteLines({ initial, vat, discount, deposit, locked }: {
  initial: { section: string | null; label: string; details: string | null; qty: number; unit_price: number }[];
  vat: number; discount: number; deposit: number; locked: boolean;
}) {
  let k = 0;
  const [rows, setRows] = useState<Row[]>(() => {
    const base = initial.map((l) => ({ key: k++, section: l.section ?? "", label: l.label, details: l.details ?? "", qty: String(Number(l.qty)), price: String(Number(l.unit_price)) }));
    return base.length ? base : [{ key: k++, section: "Décoration", label: "", details: "", qty: "1", price: "" }];
  });
  const [v, setV] = useState({ vat: String(vat), discount: String(discount), deposit: String(deposit) });
  const set = (i: number, p: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const add = () => setRows((r) => [...r, { key: Date.now(), section: r.at(-1)?.section ?? "", label: "", details: "", qty: "1", price: "" }]);
  const sum = rows.reduce((a, r) => a + Math.round(n(r.qty) * n(r.price) * 100) / 100, 0);
  const ht = Math.max(sum - n(v.discount), 0);
  const tva = Math.round(ht * n(v.vat)) / 100;

  return (
    <div className="space-y-4">
      <datalist id="sections">{QUOTE_SECTIONS.map((s) => <option key={s} value={s} />)}</datalist>
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={r.key} className="rounded-xl border border-line bg-white p-3">
            <div className="grid gap-2 sm:grid-cols-[9rem_1fr]">
              <input name="line_section" list="sections" value={r.section} onChange={(e) => set(i, { section: e.target.value })} disabled={locked} placeholder="Rubrique" className="field h-10 text-sm" />
              <input name="line_label" value={r.label} onChange={(e) => set(i, { label: e.target.value })} disabled={locked} placeholder="Ex. Arche fleurie 2 m (roses blanches, eucalyptus)" className="field h-10 font-medium" />
            </div>
            <div className="mt-2 grid grid-cols-[1fr_4.5rem_7rem_auto] items-center gap-2">
              <input name="line_details" value={r.details} onChange={(e) => set(i, { details: e.target.value })} disabled={locked} placeholder="Précision (facultatif)" className="field h-10 text-sm" />
              <input name="line_qty" value={r.qty} onChange={(e) => set(i, { qty: e.target.value })} disabled={locked} inputMode="decimal" aria-label="Quantité" className="field h-10 text-center" />
              <input name="line_price" value={r.price} onChange={(e) => set(i, { price: e.target.value })} disabled={locked} inputMode="decimal" placeholder="Prix HT" aria-label="Prix unitaire HT" className="field h-10 text-right" />
              {!locked && <button type="button" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} className="rounded-lg p-2 text-ink-300 hover:bg-clay-50 hover:text-clay-700" aria-label="Supprimer la ligne"><Trash2 className="h-4 w-4" /></button>}
            </div>
            <p className="mt-1 text-right text-xs tabular-nums text-ink-400">{fmt(n(r.qty) * n(r.price))}</p>
          </div>
        ))}
      </div>
      {!locked && <button type="button" onClick={add} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line text-sm font-semibold text-ink-500 hover:border-rose-300 hover:text-rose-700"><Plus className="h-4 w-4" /> Ajouter une ligne</button>}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block"><span className="label">Remise (DH)</span><input name="discount_mad" value={v.discount} onChange={(e) => setV({ ...v, discount: e.target.value })} disabled={locked} inputMode="decimal" className="field" /></label>
        <div className="block"><span className="label">TVA</span>
          <input type="hidden" name="vat_rate" value={v.vat} />
          <button type="button" disabled={locked} onClick={() => setV({ ...v, vat: n(v.vat) > 0 ? "0" : "20" })}
            className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl border-2 text-sm font-semibold transition ${n(v.vat) > 0 ? "border-sage-500 bg-sage-50 text-sage-700" : "border-line bg-white text-ink-500"}`}>
            {n(v.vat) > 0 ? "✓ TVA 20 % ajoutée (TTC)" : "+ Ajouter la TVA 20 %"}
          </button>
        </div>
        <label className="block"><span className="label">Acompte (%)</span><input name="deposit_pct" value={v.deposit} onChange={(e) => setV({ ...v, deposit: e.target.value })} disabled={locked} inputMode="decimal" className="field" /></label>
      </div>
      <dl className="ml-auto max-w-xs space-y-1 rounded-xl bg-sand-50 p-4 text-sm tabular-nums">
        {n(v.discount) > 0 && <div className="flex justify-between"><dt className="text-ink-500">Sous-total</dt><dd>{fmt(sum)}</dd></div>}
        {n(v.discount) > 0 && <div className="flex justify-between"><dt className="text-ink-500">Remise</dt><dd>− {fmt(n(v.discount))}</dd></div>}
        <div className="flex justify-between"><dt className="text-ink-500">Total HT</dt><dd>{fmt(ht)}</dd></div>
        {n(v.vat) > 0 && <div className="flex justify-between"><dt className="text-ink-500">TVA {n(v.vat)} %</dt><dd>{fmt(tva)}</dd></div>}
        <div className="flex justify-between border-t border-line pt-1 text-base font-bold"><dt>{n(v.vat) > 0 ? "Total TTC" : "Total"}</dt><dd>{fmt(ht + tva)}</dd></div>
        <div className="flex justify-between text-ink-500"><dt>Acompte {n(v.deposit)} %</dt><dd>{fmt(Math.round((ht + tva) * n(v.deposit)) / 100)}</dd></div>
      </dl>
    </div>
  );
}
