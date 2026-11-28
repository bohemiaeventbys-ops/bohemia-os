"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Maximize2, Paperclip, Star, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { rid, shrinkImage } from "@/lib/client/files";
import { cn } from "@/lib/cn";
import { clientOk, graphicOk, removeInspiration, setCover } from "./design-actions";

/** Les deux validations d'une version du design. */
export function DesignValidations({ eventId, proofId, graphic, client, canEdit }: {
  eventId: string; proofId: string; canEdit: boolean;
  graphic: { at: string; by: string | null } | null;
  client: { at: string | null; proofUrl: string | null } | null;
}) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { setErr(null); const r = await fn(); if (r.ok) router.refresh(); else setErr(r.error ?? "Erreur"); });
  const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Africa/Casablanca" }) : "");

  async function approveWith(f: File | null) {
    setErr(null);
    let path: string | null = null;
    try {
      if (f) {
        setBusy("Envoi de la preuve…");
        const pdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
        const body = pdf ? f : await shrinkImage(f, 1800, 0.85);
        path = `${eventId}/accords/${rid()}.${pdf ? "pdf" : "jpg"}`;
        const { error } = await createClient().storage.from("design-proofs").upload(path, body, { contentType: pdf ? "application/pdf" : "image/jpeg" });
        if (error) throw new Error("Envoi impossible : vérifiez le réseau.");
      }
      setBusy(null);
      run(() => clientOk(eventId, proofId, path));
    } catch (e) { setBusy(null); setErr(e instanceof Error ? e.message : "Erreur"); }
    finally { if (file.current) file.current.value = ""; }
  }

  const row = "flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 text-sm";
  return (
    <div className={cn("grid gap-2 sm:grid-cols-2", (pending || busy) && "opacity-60")}>
      {graphic ? (
        <div className={cn(row, "bg-sage-100 text-sage-800")}>
          <Check className="h-5 w-5 shrink-0" />
          <p className="flex-1"><b>Validé par l&apos;infographiste</b><br />{graphic.by ?? "—"} · {day(graphic.at)}</p>
          {canEdit && <button type="button" onClick={() => run(() => graphicOk(eventId, proofId, false))} className="text-xs underline">Annuler</button>}
        </div>
      ) : canEdit ? (
        <button type="button" disabled={pending} onClick={() => run(() => graphicOk(eventId, proofId, true))} className={cn(row, "justify-center bg-olive-700 font-bold text-white")}>
          <Check className="h-5 w-5" /> Validé par l&apos;infographiste
        </button>
      ) : <p className={cn(row, "bg-sand-100 text-ink-500")}>⏳ Infographiste : pas encore validé</p>}

      {client ? (
        <div className={cn(row, "bg-sage-100 text-sage-800")}>
          <Check className="h-5 w-5 shrink-0" />
          <p className="flex-1"><b>Approuvé par la cliente</b><br />{day(client.at)}{client.proofUrl && <> · <a href={client.proofUrl} target="_blank" rel="noreferrer" className="underline">voir la preuve</a></>}</p>
          {canEdit && !client.proofUrl && (
            <label className="cursor-pointer text-xs underline">Joindre la preuve<input type="file" className="sr-only" accept="image/*,application/pdf" onChange={(e) => approveWith(e.target.files?.[0] ?? null)} /></label>
          )}
        </div>
      ) : canEdit ? (
        <div className="space-y-1">
          <button type="button" disabled={pending || !!busy} onClick={() => approveWith(null)} className={cn(row, "w-full justify-center bg-olive-700 font-bold text-white")}>
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />} {busy ?? "Approuvé par la cliente"}
          </button>
          <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl py-1.5 text-xs font-semibold text-olive-700 underline">
            <Paperclip className="h-3.5 w-3.5" /> Approuvé, avec la preuve (capture, photo, PDF)
            <input ref={file} type="file" className="sr-only" accept="image/*,application/pdf" onChange={(e) => approveWith(e.target.files?.[0] ?? null)} />
          </label>
        </div>
      ) : <p className={cn(row, "bg-sand-100 text-ink-500")}>⏳ Cliente : pas encore approuvé</p>}
      {err && <p className="text-sm font-semibold text-clay-700 sm:col-span-2">{err}</p>}
    </div>
  );
}

/** Image en grand, qui s'ouvre en plein écran au toucher */
export function Zoomable({ src, alt, href, className }: { src: string; alt: string; href?: string; className?: string }) {
  const [full, setFull] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setFull(true)} className={cn("group relative block w-full", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="max-h-[70vh] w-full bg-sand-50 object-contain" />
        <span className="absolute end-3 top-3 flex items-center gap-1 rounded-full bg-ink/70 px-3 py-1.5 text-xs font-semibold text-ivory"><Maximize2 className="h-3.5 w-3.5" /> Plein écran</span>
      </button>
      {full && (
        <div className="fixed inset-0 z-50 flex flex-col bg-ink/95" onClick={() => setFull(false)}>
          <div className="flex items-center justify-between gap-2 p-3 text-ivory">
            {href ? <a href={href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="rounded-xl bg-paper/10 px-4 py-2 text-sm font-semibold">Ouvrir le fichier d&apos;origine</a> : <span />}
            <button type="button" className="rounded-xl bg-paper/10 p-3" aria-label="Fermer"><X className="h-6 w-6" /></button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="min-h-0 flex-1 object-contain" />
        </div>
      )}
    </>
  );
}

export function Inspirations({ eventId, list, canEdit }: { eventId: string; list: { id: string; url: string | null; is_cover: boolean }[]; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [zoom, setZoom] = useState<string | null>(null);
  const router = useRouter();
  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); router.refresh(); });
  return (
    <>
      <div className={cn("grid grid-cols-3 gap-2 sm:grid-cols-4", pending && "opacity-60")}>
        {list.map((p) => (
          <div key={p.id} className={cn("relative overflow-hidden rounded-xl ring-1", p.is_cover ? "ring-4 ring-ochre-400" : "ring-line")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {p.url && <img src={p.url} alt="" onClick={() => setZoom(p.url)} className="aspect-square w-full cursor-zoom-in object-cover" />}
            {p.is_cover && <span className="absolute start-1 top-1 rounded-full bg-ochre-400 px-2 py-0.5 text-[10px] font-bold text-white">Couverture</span>}
            {canEdit && (
              <div className="absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-ink/60 p-1">
                {!p.is_cover ? <button type="button" onClick={() => run(() => setCover(eventId, p.id))} className="rounded-lg bg-paper/90 p-1.5" aria-label="Choisir comme couverture"><Star className="h-4 w-4 text-ochre-600" /></button> : <span />}
                <button type="button" onClick={() => run(() => removeInspiration(eventId, p.id))} className="rounded-lg bg-paper/90 p-1.5" aria-label="Retirer"><Trash2 className="h-4 w-4 text-clay-700" /></button>
              </div>
            )}
          </div>
        ))}
      </div>
      {zoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/95 p-3" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="" className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </>
  );
}
