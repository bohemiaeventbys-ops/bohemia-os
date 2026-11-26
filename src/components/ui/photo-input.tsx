"use client";

import { useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Gros bouton « Prendre une photo » : ouvre l'appareil photo sur téléphone.
 * La photo est réduite (1600 px, JPEG) avant l'envoi pour aller vite même en 4G.
 */
export function PhotoInput({ name = "photo", label = "Prendre une photo", required, className, preview }: {
  name?: string; label?: string; required?: boolean; className?: string; preview?: string | null;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(preview ?? null);
  const [busy, setBusy] = useState(false);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const small = await shrink(file);
      const dt = new DataTransfer();
      dt.items.add(small);
      if (ref.current) ref.current.files = dt.files;
      setUrl(URL.createObjectURL(small));
    } catch {
      setUrl(URL.createObjectURL(file));
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    if (ref.current) ref.current.value = "";
    setUrl(null);
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {url ? (
        <span className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="h-20 w-20 rounded-xl object-cover ring-1 ring-line" />
          <button type="button" onClick={clear} className="absolute -right-2 -top-2 rounded-full bg-ink p-1 text-ivory" aria-label="Retirer la photo"><X className="h-3.5 w-3.5" /></button>
        </span>
      ) : null}
      <label className="inline-flex h-12 cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-line-strong bg-white px-4 text-sm font-semibold text-ink-600 transition hover:border-taupe-400 hover:bg-sand-50">
        <Camera className="h-5 w-5 text-teal-600" />
        {busy ? "Préparation…" : url ? "Changer la photo" : label}
        <input ref={ref} type="file" name={name} accept="image/*" capture="environment" required={required && !url} onChange={onChange} className="sr-only" />
      </label>
    </div>
  );
}

async function shrink(file: File, max = 1600, quality = 0.82): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), "image/jpeg", quality));
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}
