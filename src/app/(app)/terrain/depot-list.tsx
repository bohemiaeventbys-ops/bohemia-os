"use client";

import { useMemo, useState } from "react";
import { PackageX, Search, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { t, type Lang } from "@/lib/i18n";
import { FieldReport, LoadButton } from "./field-send";

export type DepotLine = { id: string; itemId: string; qty: number; status: string; finish: string | null; name: string; nameAr: string | null; code: string | null; place: string | null; photo: string | null };
export type DepotGroup = { id: string; name: string; day: string; load: string | null; lines: DepotLine[] };

const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const STATUS: Record<string, { key: "t.reserved" | "t.prepared" | "t.loaded" | "t.returned"; cls: string }> = {
  reserve: { key: "t.reserved", cls: "bg-mist-100 text-mist-700" },
  prepare: { key: "t.prepared", cls: "bg-ochre-100 text-ochre-700" },
  charge: { key: "t.loaded", cls: "bg-teal-100 text-teal-700" },
  retourne: { key: "t.returned", cls: "bg-sage-100 text-sage-700" },
};

/** Liste du dépôt : recherche par nom, nom arabe ou code ; gros boutons par article. */
export function DepotList({ lang, groups, canMove }: { lang: Lang; groups: DepotGroup[]; canMove: boolean }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const n = norm(q.trim());
    if (!n) return groups;
    return groups.map((g) => ({ ...g, lines: g.lines.filter((l) => [l.name, l.nameAr ?? "", l.code ?? "", l.place ?? ""].some((x) => norm(x).includes(n))) }));
  }, [q, groups]);
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-300" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t(lang, "t.searchItem")} className="field h-14 ps-12 text-[17px]" inputMode="search" />
      </div>
      {shown.map((g) => {
        const loaded = g.lines.filter((l) => l.status === "charge" || l.status === "retourne").length;
        return (
          <section key={g.id} className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-line">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-rose-600">{g.day}</p>
                <h2 className="text-xl font-semibold leading-tight" dir="auto">{g.name}</h2>
              </div>
              <div className="shrink-0 text-end">
                {g.load && <p className="rounded-full bg-mist-100 px-3 py-1 text-sm font-bold text-mist-700"><span>{t(lang, "t.load")}</span> <span dir="ltr">{g.load}</span></p>}
                {g.lines.length > 0 && <p className={cn("mt-1 text-sm font-bold", loaded === g.lines.length ? "text-sage-700" : "text-ink-500")}>
                  {loaded === g.lines.length ? `✓ ${t(lang, "t.allLoaded")}` : <><span dir="ltr">{loaded}</span> {t(lang, "t.of")} <span dir="ltr">{g.lines.length}</span> {t(lang, "t.loaded")}</>}
                </p>}
              </div>
            </div>
            {g.lines.length === 0 && <p className="py-4 text-center text-ink-400">{t(lang, "t.noItems")}</p>}
            <ul className="space-y-3">
              {g.lines.map((l) => {
                const st = STATUS[l.status] ?? STATUS.reserve;
                const label = lang === "ar" && l.nameAr ? l.nameAr : l.name;
                return (
                  <li key={l.id} className={cn("rounded-2xl p-3 ring-1", l.status === "charge" ? "bg-teal-50/50 ring-teal-200" : "bg-sand-50 ring-line")}>
                    <div className="flex gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {l.photo ? <img src={l.photo} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover ring-1 ring-line" />
                        : <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-white text-ink-300 ring-1 ring-line"><PackageX className="h-8 w-8" /></span>}
                      <div className="min-w-0 flex-1">
                        <p className="text-[17px] font-bold leading-tight" dir="auto">{label}</p>
                        {lang === "ar" && l.nameAr && <p className="text-sm text-ink-500" dir="auto">{l.name}</p>}
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[15px]">
                          <span><span className="text-ink-500">{t(lang, "t.qty")} : </span><b className="text-xl" dir="ltr">{l.qty}</b></span>
                          {l.code && <span><span className="text-ink-500">{t(lang, "t.code")} : </span><b dir="ltr" className="font-mono">{l.code}</b></span>}
                          {l.place && <span><span className="text-ink-500">{t(lang, "t.place")} : </span><b dir="auto">{l.place}</b></span>}
                        </div>
                        {l.finish && <p className="mt-1 rounded-lg bg-plum-100 px-2 py-1 text-sm text-plum-700"><b>{t(lang, "t.finish")} : </b><span dir="auto">{l.finish}</span></p>}
                        <span className={cn("mt-2 inline-block rounded-full px-3 py-0.5 text-sm font-bold", st.cls)}>{t(lang, st.key)}</span>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      {canMove && l.status !== "retourne" && <LoadButton lang={lang} lineId={l.id} loaded={l.status === "charge"} />}
                      <FieldReport lang={lang} eventId={g.id} itemId={l.itemId} kind="manque" label={t(lang, "t.reportMissing")} icon={<PackageX className="h-6 w-6" />} tone="ochre" photo="none" askQty success="t.missingSaved" />
                      <FieldReport lang={lang} eventId={g.id} itemId={l.itemId} kind="abime" label={t(lang, "t.reportDamaged")} icon={<TriangleAlert className="h-6 w-6" />} tone="clay" photo="optional" note success="t.damagedSaved" />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
