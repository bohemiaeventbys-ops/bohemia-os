import { Check } from "lucide-react";
import { ActionForm, FormReset, SubmitButton } from "@/components/ui/action-form";
import { Field, Input, Textarea } from "@/components/ui/field";
import { PhotoInput } from "@/components/ui/photo-input";
import { toneTile } from "@/components/ui/badge";
import { NavIcon } from "@/components/layout/icon";
import { cn } from "@/lib/cn";
import { THEME_SUGGESTIONS, type StockCategory, type StockItem } from "@/lib/stock";
import type { ActionResult } from "@/lib/action";

export function ItemForm({ action, item, cats, knownThemes, photoUrl, defaultCat }: {
  action: (p: ActionResult, fd: FormData) => Promise<ActionResult>;
  item?: StockItem; cats: StockCategory[]; knownThemes: string[]; photoUrl?: string | null; defaultCat?: string;
}) {
  const themes = Array.from(new Set([...THEME_SUGGESTIONS, ...knownThemes, ...(item?.themes ?? [])])).sort((a, b) => a.localeCompare(b, "fr"));
  const catId = item?.category_id ?? defaultCat ?? cats[0]?.id;
  return (
    <ActionForm action={action} className="space-y-6">
      {item && <input type="hidden" name="id" value={item.id} />}
      <section className="space-y-2">
        <p className="label">1. La photo</p>
        <PhotoInput preview={photoUrl} label="Prendre la photo de l'article" />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Field label="2. Le nom" className="sm:col-span-2"><Input name="name" required defaultValue={item?.name} placeholder="Ex. Arche ronde dorée 2 m" className="h-12 text-base" /></Field>
        {!item && <Field label="3. Combien ?" hint="En bon état, aujourd'hui"><Input name="qty_good" type="number" min={0} inputMode="numeric" defaultValue={1} className="h-12 text-center text-lg font-semibold" /></Field>}
      </section>

      <fieldset>
        <legend className="label">{item ? "Catégorie" : "4. La catégorie"}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {cats.map((c) => (
            <label key={c.id} className="flex cursor-pointer items-center gap-2.5 rounded-xl border-2 border-line bg-paper p-2.5 transition hover:border-line-strong has-[:checked]:border-ink has-[:checked]:bg-sand-50">
              <input type="radio" name="category_id" value={c.id} defaultChecked={c.id === catId} className="sr-only" />
              <span className={cn("tile h-9 w-9", toneTile[c.color])}><NavIcon name={c.icon} className="h-[18px] w-[18px]" /></span>
              <span className="text-sm font-semibold leading-tight">{c.name}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="label">Thèmes (facultatif, plusieurs possibles)</legend>
        <div className="flex flex-wrap gap-2">
          {themes.map((t) => (
            <label key={t} className="cursor-pointer rounded-full bg-paper px-3.5 py-2 text-sm font-medium text-ink-600 ring-1 ring-line transition has-[:checked]:bg-rose-500 has-[:checked]:text-white has-[:checked]:ring-rose-500">
              <input type="checkbox" name="themes" value={t} defaultChecked={item?.themes.includes(t)} className="sr-only" />{t}
            </label>
          ))}
        </div>
        <Input name="themes_extra" placeholder="Autre thème ? Écrivez-le ici (séparez par des virgules)" className="mt-2" />
      </fieldset>

      <details className="rounded-xl bg-sand-50 p-4" open={!!item}>
        <summary className="cursor-pointer text-sm font-semibold text-ink-600">Plus de détails (code, emplacement, dimensions, matière…)</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Code article" hint="Court et unique, ex. CH-12, ARC-03"><Input name="code" defaultValue={item?.code ?? ""} className="font-mono uppercase" autoCapitalize="characters" /></Field>
          <Field label="Nom en arabe (facultatif)" hint="Pour l'équipe qui lit l'arabe"><Input name="name_ar" dir="rtl" lang="ar" defaultValue={item?.name_ar ?? ""} placeholder="مثال : كرسي ذهبي" /></Field>
          <Field label="Où est-il rangé ?"><Input name="location" defaultValue={item?.location ?? ""} placeholder="Ex. Dépôt, allée B, étagère 3" /></Field>
          <Field label="Prévenir s'il en reste moins de" hint="0 = pas d'alerte. Ex. 2 visseuses, 50 ballons"><Input name="min_qty" type="number" min={0} inputMode="numeric" defaultValue={item?.min_qty ?? 0} className="text-center" /></Field>
          <Field label="Unité"><Input name="unit" defaultValue={item?.unit ?? "pièce"} placeholder="pièce, mètre, lot…" /></Field>
          <Field label="Dimensions"><Input name="dimensions" defaultValue={item?.dimensions ?? ""} placeholder="Ex. 200 × 120 cm" /></Field>
          <Field label="Couleur"><Input name="color" defaultValue={item?.color ?? ""} placeholder="Ex. doré, bois naturel, blanc" /></Field>
          <Field label="Matière" hint="Panneaux : Forex, MDF…"><Input name="material" list="bo-materials" defaultValue={item?.material ?? ""} placeholder="Ex. MDF, Forex, bois, métal" /></Field>
          <Field label="Forme" hint="Panneaux : rond, arche, rectangle…"><Input name="shape" list="bo-shapes" defaultValue={item?.shape ?? ""} placeholder="Ex. arche" /></Field>
          <datalist id="bo-materials"><option value="MDF" /><option value="Forex" /><option value="Bois" /><option value="Métal" /><option value="Plexiglas" /><option value="Tissu" /></datalist>
          <datalist id="bo-shapes"><option value="Rond" /><option value="Arche" /><option value="Rectangle" /><option value="Carré" /><option value="Ovale" /><option value="Sur mesure" /></datalist>
          <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" rows={2} defaultValue={item?.notes ?? ""} /></Field>
        </div>
      </details>

      <div className="flex flex-wrap gap-2"><SubmitButton size="lg" className="w-full sm:w-auto"><Check className="h-5 w-5" /> {item ? "Enregistrer" : "Ajouter à l'inventaire"}</SubmitButton><FormReset mode={item ? "edit" : "new"} /></div>
    </ActionForm>
  );
}
