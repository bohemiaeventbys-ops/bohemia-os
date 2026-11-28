"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, ImagePlus, Loader2, PackagePlus, Palette, Upload, X } from "lucide-react";
import { FormReset } from "@/components/ui/action-form";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { Lang } from "@/lib/i18n";
import { createEventWithId } from "../actions";
import { uploadDesignFile, uploadInspirationFiles } from "../[id]/design-upload";
import { reserveBasket, StockBasket, type BasketItem, type Line } from "../[id]/materiel/choisir/stock-basket";

const FORM_ID = "nouvel-evenement";

/**
 * « Nouvel événement » sur une seule page : la fiche, le design (et les inspirations), puis le mobilier du dépôt.
 * À l'enregistrement : l'événement est créé, le design est envoyé, le stock est réservé (un manque éventuel est noté sur la fiche).
 */
export function NewEventForm({ children, items, cats, lang }: { children: React.ReactNode; items: BasketItem[]; cats: { id: string; name: string }[]; lang: Lang }) {
  const L = (fr: string, ar: string) => (lang === "ar" ? ar : fr);
  const router = useRouter();
  const [design, setDesign] = useState<File | null>(null);
  const [inspi, setInspi] = useState<File[]>([]);
  const [basket, setBasket] = useState<Record<string, Line>>({});
  const [resetKey, setResetKey] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<{ msg: string; id?: string } | null>(null);
  const onBasket = useCallback((b: Record<string, Line>) => setBasket(b), []);
  const nItems = Object.keys(basket).length;

  async function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (busy) return;
    setErr(null);
    setBusy(L("Création de l'événement…", "إنشاء الحدث…"));
    let id: string | undefined;
    const problems: string[] = [];
    try {
      const r = await createEventWithId(new FormData(ev.currentTarget));
      if ("error" in r) { setErr({ msg: r.error }); return; }
      id = r.id;
      if (design) {
        try { await uploadDesignFile(id, design, setBusy); } catch (e) { problems.push(`Design : ${e instanceof Error ? e.message : "envoi impossible"}`); }
      }
      if (inspi.length) {
        try { await uploadInspirationFiles(id, inspi, setBusy); } catch (e) { problems.push(`Inspirations : ${e instanceof Error ? e.message : "envoi impossible"}`); }
      }
      if (nItems) {
        try {
          const rr = await reserveBasket(id, basket, setBusy, true);
          if (!rr.ok) problems.push(`Stock : ${rr.error}`);
        } catch { problems.push("Stock : réservation impossible"); }
      }
      if (problems.length) { setErr({ msg: `L'événement est créé, mais : ${problems.join(" · ")}. Vous pouvez réessayer depuis sa fiche.`, id }); return; }
      router.push(`/evenements/${id}${nItems ? `?reserve=${nItems}` : ""}`);
      router.refresh();
    } catch {
      setErr({ msg: id ? "L'événement est créé, mais la suite n'a pas pu être envoyée. Réessayez depuis sa fiche." : "Création impossible : vérifiez le réseau et réessayez.", id });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex flex-wrap gap-2">
        <a href="#design" className="inline-flex h-11 items-center gap-2 rounded-full bg-paper px-4 font-bold ring-1 ring-line-strong"><Palette className="h-4 w-4 text-olive-700" /> {L("Design", "التصميم")}</a>
        <a href="#materiel" className="inline-flex h-11 items-center gap-2 rounded-full bg-paper px-4 font-bold ring-1 ring-line-strong"><PackagePlus className="h-4 w-4 text-olive-700" /> {L("Mobilier du dépôt", "أثاث المستودع")}</a>
      </div>
      <form id={FORM_ID} onSubmit={onSubmit} className="rounded-2xl bg-paper p-4 shadow-card ring-1 ring-line sm:p-6">
        {children}
      </form>

      {/* Design */}
      <section id="design" className="scroll-mt-24 rounded-2xl bg-paper p-4 shadow-card ring-1 ring-line sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold"><Palette className="h-5 w-5 text-olive-700" /> {L("Design de l'événement", "تصميم الحدث")}</h2>
        <p className="mt-1 text-sm text-ink-500">{L("Image ou PDF. Vous pourrez le valider (infographiste, puis cliente) sur la fiche.", "صورة أو PDF. يمكن المصادقة عليه لاحقاً في البطاقة.")}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl bg-sand-50 px-4 py-3 font-bold ring-1 ring-line-strong hover:bg-sand-100">
            {design ? <FileText className="h-6 w-6 shrink-0 text-olive-700" /> : <Upload className="h-6 w-6 shrink-0" />}
            <span className="min-w-0 flex-1 truncate">{design ? design.name : L("Ajouter le design", "إضافة التصميم")}</span>
            {design && <Check className="h-5 w-5 shrink-0 text-sage-700" />}
            <input type="file" className="sr-only" accept="image/*,application/pdf,.pdf" onChange={(e) => setDesign(e.target.files?.[0] ?? null)} />
          </label>
          <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl bg-sand-50 px-4 py-3 font-bold ring-1 ring-line-strong hover:bg-sand-100">
            <ImagePlus className="h-6 w-6 shrink-0" />
            <span className="min-w-0 flex-1">{inspi.length ? `${inspi.length} ${L("photo(s) d'inspiration", "صور للإلهام")}` : L("Photos d'inspiration", "صور للإلهام")}</span>
            <input type="file" multiple className="sr-only" accept="image/*" onChange={(e) => setInspi(Array.from(e.target.files ?? []))} />
          </label>
        </div>
        {(design || inspi.length > 0) && (
          <button type="button" onClick={() => { setDesign(null); setInspi([]); }} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-ink-500 hover:text-clay-700">
            <X className="h-4 w-4" /> {L("Retirer les fichiers", "إزالة الملفات")}
          </button>
        )}
      </section>

      {/* Stock */}
      <section id="materiel" className="scroll-mt-24 rounded-2xl bg-paper p-4 shadow-card ring-1 ring-line sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold"><PackagePlus className="h-5 w-5 text-olive-700" /> {L("Mobilier et matériel du dépôt", "الأثاث والمعدات من المستودع")}</h2>
        <p className="mb-3 mt-1 text-sm text-ink-500">{L("Touchez les photos pour choisir. La réservation se fait sur les dates de l'événement ; s'il en manque, le manque est noté sur la fiche.", "اضغط على الصور للاختيار. يتم الحجز حسب تاريخ الحدث.")}</p>
        {items.length ? <StockBasket key={resetKey} eventId={null} items={items} cats={cats} onBasket={onBasket} />
          : <p className="rounded-xl bg-sand-50 px-4 py-3 text-ink-500">{L("Le stock est vide : ajoutez d'abord des articles dans « Stock ».", "المخزون فارغ.")}</p>}
      </section>

      <div className="sticky bottom-20 z-10 rounded-2xl bg-paper/95 p-3 shadow-pop ring-1 ring-line backdrop-blur lg:bottom-4">
        {err && (
          <p className="mb-2 rounded-lg bg-clay-100 px-3 py-2 text-sm font-semibold text-clay-700">
            {err.msg} {err.id && <a href={`/evenements/${err.id}`} className="underline">{L("Ouvrir l'événement", "فتح الحدث")}</a>}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="me-auto text-sm text-ink-500">{[design && L("design", "تصميم"), nItems > 0 && `${nItems} ${L("article(s)", "قطعة")}`].filter(Boolean).join(" · ")}</span>
          <FormReset mode="new" form={FORM_ID} label={L("Refaire à zéro", "البدء من جديد")} onReset={() => { setDesign(null); setInspi([]); setBasket({}); setResetKey((k) => k + 1); }} />
          <button type="submit" form={FORM_ID} disabled={!!busy} className={cn(buttonClass("primary", "lg"), "min-w-48")}>
            {busy ? <><Loader2 className="h-5 w-5 animate-spin" /> {busy}</> : <><Check className="h-5 w-5" /> {L("Créer l'événement", "إنشاء الحدث")}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
