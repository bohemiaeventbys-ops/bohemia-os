"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Maximize2, Star, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { approveDesign, removeInspiration, setCover } from "./design-actions";

export function ApproveDesign({ eventId, proofId }: { eventId: string; proofId: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div>
      <button type="button" disabled={pending} onClick={() => start(async () => { const r = await approveDesign(eventId, proofId); if (r.ok) router.refresh(); else setErr(r.error); })}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sage-600 px-4 font-bold text-white disabled:opacity-60">
        {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />} Valider ce design pour l&apos;installation
      </button>
      {err && <p className="mt-1 text-sm text-clay-700">{err}</p>}
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
            {href ? <a href={href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold">Ouvrir le fichier d&apos;origine</a> : <span />}
            <button type="button" className="rounded-xl bg-white/10 p-3" aria-label="Fermer"><X className="h-6 w-6" /></button>
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
                {!p.is_cover ? <button type="button" onClick={() => run(() => setCover(eventId, p.id))} className="rounded-lg bg-white/90 p-1.5" aria-label="Choisir comme couverture"><Star className="h-4 w-4 text-ochre-600" /></button> : <span />}
                <button type="button" onClick={() => run(() => removeInspiration(eventId, p.id))} className="rounded-lg bg-white/90 p-1.5" aria-label="Retirer"><Trash2 className="h-4 w-4 text-clay-700" /></button>
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
