"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { pdfFirstPage, rid, shrinkImage } from "@/lib/client/files";
import { cn } from "@/lib/cn";
import { registerDesign, registerInspirations } from "./design-actions";

const BUCKET = "design-proofs";

/**
 * « Ajouter le design » (image ou PDF) et « Ajouter des inspirations » (plusieurs photos).
 * Le fichier part directement du téléphone vers le stockage (pas de limite de taille du serveur),
 * puis la fiche est mise à jour.
 */
export function DesignUpload({ eventId, kind, className, label }: { eventId: string; kind: "design" | "inspiration"; className?: string; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    setErr(null);
    const supabase = createClient();
    try {
      if (kind === "design") {
        const f = list[0];
        const pdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
        if (!pdf && !f.type.startsWith("image/")) throw new Error("Image ou PDF uniquement.");
        if (f.size > 25 * 1024 * 1024) throw new Error("Fichier trop lourd (25 Mo max).");
        setBusy("Préparation…");
        const body = pdf ? f : await shrinkImage(f, 2600, 0.9);
        const path = `${eventId}/${rid()}.${pdf ? "pdf" : "jpg"}`;
        let previewPath: string | null = null;
        if (pdf) {
          const prev = await pdfFirstPage(f);
          if (prev) {
            previewPath = `${eventId}/${rid()}-apercu.jpg`;
            setBusy("Envoi de l'aperçu…");
            const { error } = await supabase.storage.from(BUCKET).upload(previewPath, prev, { contentType: "image/jpeg" });
            if (error) previewPath = null;
          }
        }
        setBusy("Envoi du design…");
        const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: pdf ? "application/pdf" : "image/jpeg" });
        if (error) throw new Error("Envoi impossible : vérifiez le réseau et réessayez.");
        const r = await registerDesign(eventId, path, previewPath, "Design");
        if (!r.ok) throw new Error(r.error);
      } else {
        const paths: string[] = [];
        const files = Array.from(list).filter((f) => f.type.startsWith("image/")).slice(0, 20);
        for (const [i, f] of files.entries()) {
          setBusy(`Photo ${i + 1} sur ${files.length}…`);
          const body = await shrinkImage(f, 1800, 0.82);
          const path = `${eventId}/inspirations/${rid()}.jpg`;
          const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: "image/jpeg" });
          if (error) throw new Error("Envoi impossible : vérifiez le réseau et réessayez.");
          paths.push(path);
        }
        if (paths.length) {
          const r = await registerInspirations(eventId, paths);
          if (!r.ok) throw new Error(r.error);
        }
      }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Envoi impossible.");
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className={className}>
      <label className={cn("flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[15px] font-bold shadow-card transition active:scale-[0.98]",
        kind === "design" ? "bg-rose-600 text-white" : "bg-white text-rose-700 ring-2 ring-rose-200", busy && "pointer-events-none opacity-70")}>
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : kind === "design" ? <Upload className="h-5 w-5" /> : <ImagePlus className="h-5 w-5" />}
        {busy ?? label ?? (kind === "design" ? "Ajouter le design" : "Ajouter des inspirations")}
        <input ref={input} type="file" className="sr-only" multiple={kind === "inspiration"}
          accept={kind === "design" ? "image/*,application/pdf,.pdf" : "image/*"} onChange={(e) => onFiles(e.target.files)} />
      </label>
      {err && <p className="mt-2 rounded-lg bg-clay-100 px-3 py-2 text-sm font-semibold text-clay-700">{err}</p>}
    </div>
  );
}
