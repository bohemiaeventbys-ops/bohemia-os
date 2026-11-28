"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download, Eye, Search, X } from "lucide-react";

export type Cell = string | number | null | undefined;
export type Column = {
  key: string;
  label: string;
  type?: "text" | "money" | "date" | "badge";
  /** "select" = liste déroulante des valeurs présentes ; "text" = champ de recherche ; false = pas de filtre */
  filter?: "select" | "text" | false;
  sum?: boolean;
  className?: string;
};
export type Row = {
  id: string;
  href?: string;
  /** lien de l'icône œil (voir le document) */
  view?: string | null;
  viewExternal?: boolean;
  cells: Record<string, Cell>;
  /** couleur du badge, par clé de colonne */
  tones?: Record<string, string>;
};

const TONES: Record<string, string> = {
  sage: "bg-sage-100 text-sage-700", clay: "bg-clay-100 text-clay-700", ochre: "bg-ochre-100 text-ochre-700",
  mist: "bg-mist-100 text-mist-700", rose: "bg-rose-100 text-rose-700", plum: "bg-plum-100 text-plum-700",
  teal: "bg-teal-100 text-teal-700", ink: "bg-ink text-ivory", neutral: "bg-sand-100 text-ink-500",
};
const money = (n: number) => `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} DH`;
const dateFr = (v: string) => (/^\d{4}-\d{2}-\d{2}/.test(v) ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : v);
const norm = (v: Cell) => (v == null ? "" : String(v)).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Tableau façon Excel : recherche, filtre par colonne, tri, totaux, export CSV, icône œil. */
export function DataTable({ columns, rows, empty = "Aucune ligne.", exportName }: { columns: Column[]; rows: Row[]; empty?: string; exportName?: string }) {
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const options = useMemo(() => {
    const o: Record<string, string[]> = {};
    for (const c of columns) if (c.filter === "select") {
      o[c.key] = Array.from(new Set(rows.flatMap((r) => String(r.cells[c.key] ?? "").split(" · ")).filter(Boolean))).sort((a, b) => a.localeCompare(b, "fr"));
    }
    return o;
  }, [columns, rows]);

  const shown = useMemo(() => {
    const nq = norm(q);
    let out = rows.filter((r) => {
      if (nq && !columns.some((c) => norm(r.cells[c.key]).includes(nq))) return false;
      for (const [k, v] of Object.entries(filters)) {
        if (!v) continue;
        const col = columns.find((c) => c.key === k);
        const cell = String(r.cells[k] ?? "");
        if (col?.filter === "select" ? !cell.split(" · ").includes(v) : !norm(cell).includes(norm(v))) return false;
      }
      return true;
    });
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      out = [...out].sort((a, b) => {
        const x = a.cells[sort.key], y = b.cells[sort.key];
        if (col?.type === "money") return (Number(x ?? 0) - Number(y ?? 0)) * sort.dir;
        return String(x ?? "").localeCompare(String(y ?? ""), "fr", { numeric: true }) * sort.dir;
      });
    }
    return out;
  }, [rows, columns, q, filters, sort]);

  const active = Object.values(filters).filter(Boolean).length;
  const fmt = (c: Column, v: Cell) => (v == null || v === "" ? "—" : c.type === "money" ? money(Number(v)) : c.type === "date" ? dateFr(String(v)) : String(v));

  function exportCsv() {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const lines = [columns.map((c) => esc(c.label)).join(";"),
      ...shown.map((r) => columns.map((c) => {
        const v = r.cells[c.key];
        return c.type === "money" ? String(Number(v ?? 0)).replace(".", ",") : esc(v == null ? "" : c.type === "date" ? dateFr(String(v)) : String(v));
      }).join(";"))];
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${exportName ?? "liste"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher dans le tableau…" className="field h-11 pl-9" />
        </div>
        <button type="button" onClick={() => setShowFilters((v) => !v)} className={`h-11 rounded-xl px-4 text-sm font-semibold ring-1 ${showFilters || active ? "bg-ink text-ivory ring-ink" : "bg-paper ring-line"}`}>
          Filtres{active ? ` (${active})` : ""}
        </button>
        {exportName && <button type="button" onClick={exportCsv} className="flex h-11 items-center gap-2 rounded-xl bg-paper px-4 text-sm font-semibold ring-1 ring-line hover:bg-sand-50"><Download className="h-4 w-4" /> Excel</button>}
      </div>
      {showFilters && (
        <div className="grid gap-2 border-b border-line bg-sand-50 p-3 sm:grid-cols-2 lg:grid-cols-4">
          {columns.filter((c) => c.filter).map((c) => (
            <label key={c.key} className="block text-xs text-ink-500">{c.label}
              {c.filter === "select" ? (
                <select value={filters[c.key] ?? ""} onChange={(e) => setFilters({ ...filters, [c.key]: e.target.value })} className="field mt-0.5 h-10 text-sm">
                  <option value="">Tous</option>{options[c.key]?.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input value={filters[c.key] ?? ""} onChange={(e) => setFilters({ ...filters, [c.key]: e.target.value })} className="field mt-0.5 h-10 text-sm" />
              )}
            </label>
          ))}
          {active > 0 && <button type="button" onClick={() => setFilters({})} className="flex items-center gap-1 self-end text-sm font-semibold text-clay-700"><X className="h-4 w-4" /> Effacer les filtres</button>}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-sand-50 text-left text-[11px] uppercase tracking-wider text-ink-500">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`whitespace-nowrap px-3 py-2.5 ${c.type === "money" ? "text-right" : ""} ${c.className ?? ""}`}>
                  <button type="button" className="inline-flex items-center gap-1 uppercase" onClick={() => setSort((s) => (s?.key === c.key ? (s.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 }))}>
                    {c.label}{sort?.key === c.key && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </button>
                </th>
              ))}
              <th className="w-12 px-3 py-2.5"><span className="sr-only">Voir</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.length === 0 && <tr><td colSpan={columns.length + 1} className="px-3 py-10 text-center text-ink-400">{empty}</td></tr>}
            {shown.map((r) => (
              <tr key={r.id} className="hover:bg-sand-50">
                {columns.map((c, i) => {
                  const v = r.cells[c.key];
                  const content = c.type === "badge" && v
                    ? <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[r.tones?.[c.key] ?? "neutral"] ?? TONES.neutral}`}>{String(v)}</span>
                    : fmt(c, v);
                  return (
                    <td key={c.key} className={`px-3 py-2.5 align-middle ${c.type === "money" ? "whitespace-nowrap text-right tabular-nums" : ""} ${i === 0 ? "font-semibold" : ""} ${c.className ?? ""}`}>
                      {r.href && i === 0 ? <Link href={r.href} className="hover:underline">{content}</Link> : content}
                    </td>
                  );
                })}
                <td className="px-3 py-1.5 text-right">
                  {r.view && (r.viewExternal
                    ? <a href={r.view} target="_blank" rel="noreferrer" className="inline-flex rounded-lg p-2 text-ink-400 hover:bg-paper hover:text-rose-700" aria-label="Voir le document"><Eye className="h-5 w-5" /></a>
                    : <Link href={r.view} className="inline-flex rounded-lg p-2 text-ink-400 hover:bg-paper hover:text-rose-700" aria-label="Voir"><Eye className="h-5 w-5" /></Link>)}
                </td>
              </tr>
            ))}
          </tbody>
          {columns.some((c) => c.sum) && shown.length > 0 && (
            <tfoot className="border-t-2 border-ink bg-sand-50 font-semibold">
              <tr>
                {columns.map((c, i) => (
                  <td key={c.key} className={`px-3 py-2.5 ${c.type === "money" ? "whitespace-nowrap text-right tabular-nums" : ""}`}>
                    {i === 0 ? `Total (${shown.length})` : c.sum ? money(shown.reduce((a, r) => a + Number(r.cells[c.key] ?? 0), 0)) : ""}
                  </td>
                ))}
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
