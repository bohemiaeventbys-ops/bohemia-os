"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, CloudOff, Loader2, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { t, type Key, type Lang } from "@/lib/i18n";
import { markField, markLoaded, sendFieldDoc, type FieldResult } from "./actions";

/* ------------------------------------------------------------------ */
/* File d'attente sur le téléphone (IndexedDB) : rien n'est perdu si le réseau coupe */
/* ------------------------------------------------------------------ */
type Entry = { uid: string; eventId: string; kind: string; note?: string | null; itemId?: string | null; qty?: number | null; blob?: Blob | null; at: number };
const DB = "bohemia-terrain", STORE = "queue", CHANGED = "field-queue-changed";

function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "uid" });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  return new Promise<T>((res, rej) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { res(req.result as T); db.close(); };
    tx.onerror = () => { rej(tx.error); db.close(); };
  });
}
const qPut = (e: Entry) => idb<unknown>("readwrite", (s) => s.put(e)).catch(() => null);
const qDel = (uid: string) => idb<unknown>("readwrite", (s) => s.delete(uid)).catch(() => null);
const qAll = () => idb<Entry[]>("readonly", (s) => s.getAll()).catch(() => [] as Entry[]);
const changed = () => window.dispatchEvent(new Event(CHANGED));
const newUid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16)));

async function push(e: Entry): Promise<FieldResult> {
  const fd = new FormData();
  fd.set("uid", e.uid); fd.set("event_id", e.eventId); fd.set("kind", e.kind);
  if (e.note) fd.set("note", e.note);
  if (e.itemId) fd.set("item_id", e.itemId);
  if (e.qty) fd.set("qty", String(e.qty));
  if (e.blob) fd.set("file", new File([e.blob], `${e.uid}.jpg`, { type: e.blob.type || "image/jpeg" }));
  try {
    return await sendFieldDoc(fd);
  } catch {
    return { ok: false, error: "server" };
  }
}

/** Enregistre d'abord sur le téléphone, puis envoie. « ok » seulement quand le serveur a tout reçu. */
async function sendOrQueue(e: Entry): Promise<"ok" | "queued" | "denied"> {
  await qPut(e);
  changed();
  const r = navigator.onLine ? await push(e) : ({ ok: false, error: "server" } as FieldResult);
  if (r.ok || r.error === "invalid" || r.error === "denied") { await qDel(e.uid); changed(); }
  if (r.ok) return "ok";
  return r.error === "denied" ? "denied" : "queued";
}

let flushing = false;
async function flush(): Promise<number> {
  if (flushing || !navigator.onLine) return (await qAll()).length;
  flushing = true;
  try {
    for (const e of await qAll()) {
      const r = await push(e);
      if (r.ok || r.error === "invalid" || r.error === "denied") await qDel(e.uid);
    }
  } finally {
    flushing = false;
    changed();
  }
  return (await qAll()).length;
}

/** Bandeau « N photo(s) en attente d'envoi » qui réessaie tout seul dès que le réseau revient. */
export function FieldQueue({ lang }: { lang: Lang }) {
  const [n, setN] = useState(0);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const refresh = useCallback(async () => setN((await qAll()).length), []);
  const retry = useCallback(async () => {
    setBusy(true);
    const before = (await qAll()).length;
    const left = await flush();
    setN(left);
    setBusy(false);
    if (left < before) router.refresh();
  }, [router]);
  useEffect(() => {
    refresh();
    retry();
    const on = () => retry();
    window.addEventListener("online", on);
    window.addEventListener(CHANGED, refresh);
    const timer = setInterval(() => { if (navigator.onLine) retry(); }, 30000);
    return () => { window.removeEventListener("online", on); window.removeEventListener(CHANGED, refresh); clearInterval(timer); };
  }, [refresh, retry]);
  if (!n) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-ochre-100 px-4 py-3 text-ochre-700 ring-1 ring-ochre-200" role="status">
      <CloudOff className="h-6 w-6 shrink-0" />
      <p className="min-w-0 flex-1 text-[15px] font-semibold"><span dir="ltr">{n}</span> {t(lang, "p.pendingN")}</p>
      <button type="button" onClick={retry} disabled={busy} className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-bold ring-1 ring-ochre-200">
        <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} /> {t(lang, "p.retry")}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Gros bouton qui ouvre : photo (facultative ou obligatoire) + commentaire + quantité */
/* ------------------------------------------------------------------ */
export function FieldReport({ lang, eventId, kind, label, icon, tone = "ink", photo = "required", note = false, askQty = false, itemId, success, className }: {
  lang: Lang; eventId: string; kind: Entry["kind"]; label: string; icon?: React.ReactNode; tone?: "ink" | "teal" | "clay" | "ochre" | "rose" | "plum";
  photo?: "required" | "optional" | "none"; note?: boolean; askQty?: boolean; itemId?: string; success: Key; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [qty, setQty] = useState(1);
  const [state, setState] = useState<"idle" | "preparing" | "sending" | "ok" | "queued" | "denied" | "needPhoto">("idle");
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const tr = (k: Key) => t(lang, k);

  function reset() {
    setBlob(null); setText(""); setQty(1);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (input.current) input.current.value = "";
  }
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!open) setOpen(true);
    setState("preparing");
    const small = await shrink(f).catch(() => f);
    setBlob(small);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(small));
    setState("idle");
  }
  async function send() {
    if (photo === "required" && !blob) { setState("needPhoto"); return; }
    setState("sending");
    const r = await sendOrQueue({ uid: newUid(), eventId, kind, note: text.trim() || null, itemId: itemId ?? null, qty: askQty ? qty : null, blob, at: Date.now() });
    setState(r);
    if (r !== "denied") { reset(); setOpen(false); }
    if (r === "ok") router.refresh();
  }

  const tones = { ink: "bg-ink text-ivory", teal: "bg-teal-600 text-white", clay: "bg-clay-600 text-white", ochre: "bg-ochre-500 text-white", rose: "bg-rose-600 text-white", plum: "bg-plum-600 text-white" };
  const big = cn("flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl px-4 py-3 text-[17px] font-bold shadow-card transition active:scale-[0.98]", tones[tone]);
  // Photo obligatoire : le gros bouton ouvre directement l'appareil photo
  const direct = photo === "required" && !note && !askQty;

  return (
    <div className={cn("space-y-2", className)}>
      {!open && (direct ? (
        <label className={cn(big, "cursor-pointer")}>
          {icon ?? <Camera className="h-6 w-6" />} {label}
          <input ref={input} type="file" accept="image/*" capture="environment" onChange={onFile} className="sr-only" />
        </label>
      ) : (
        <button type="button" onClick={() => { setOpen(true); setState("idle"); }} className={big}>{icon ?? <Camera className="h-6 w-6" />} {label}</button>
      ))}

      {open && (
        <div className="space-y-3 rounded-2xl bg-white p-4 ring-2 ring-line">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[16px] font-bold">{label}</p>
            <button type="button" onClick={() => { reset(); setOpen(false); setState("idle"); }} className="rounded-xl p-2 text-ink-400 hover:bg-sand-100" aria-label={tr("c.close")}><X className="h-5 w-5" /></button>
          </div>
          {askQty && (
            <div>
              <p className="mb-1 text-sm font-semibold text-ink-500">{tr("t.howMany")}</p>
              <div className="flex items-center gap-2" dir="ltr">
                <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="h-14 w-14 rounded-2xl bg-sand-100 text-2xl font-bold">−</button>
                <input type="number" inputMode="numeric" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} className="field h-14 w-24 text-center text-2xl font-bold" />
                <button type="button" onClick={() => setQty((q) => q + 1)} className="h-14 w-14 rounded-2xl bg-sand-100 text-2xl font-bold">+</button>
              </div>
            </div>
          )}
          {photo !== "none" && (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {preview && <img src={preview} alt="" className="h-24 w-24 rounded-xl object-cover ring-1 ring-line" />}
              <label className="inline-flex h-14 flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong bg-sand-50 px-4 text-[15px] font-bold text-ink-600">
                <Camera className="h-6 w-6 text-teal-600" /> {state === "preparing" ? tr("p.preparing") : preview ? tr("p.retake") : tr("p.take")}
                <input ref={input} type="file" accept="image/*" capture="environment" onChange={onFile} className="sr-only" />
              </label>
            </div>
          )}
          {note && <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={tr("p.note")} className="field min-h-20 text-[16px]" />}
          {state === "needPhoto" && <p className="rounded-lg bg-clay-100 px-3 py-2 text-sm font-semibold text-clay-700">{tr("p.photoRequired")}</p>}
          {state === "denied" && <p className="rounded-lg bg-clay-100 px-3 py-2 text-sm font-semibold text-clay-700">{tr("p.denied")}</p>}
          <button type="button" onClick={send} disabled={state === "sending" || state === "preparing"} className={cn(big, "disabled:opacity-60")}>
            {state === "sending" ? <><Loader2 className="h-6 w-6 animate-spin" /> {tr("p.sending")}</> : tr("p.send")}
          </button>
        </div>
      )}

      {!open && state === "ok" && <Flash tone="ok">{tr(success)}</Flash>}
      {!open && state === "queued" && <Flash tone="wait">{tr("p.pending")}</Flash>}
      {!open && state === "denied" && <Flash tone="err">{tr("p.denied")}</Flash>}
    </div>
  );
}

function Flash({ tone, children }: { tone: "ok" | "wait" | "err"; children: React.ReactNode }) {
  const c = tone === "ok" ? "bg-sage-100 text-sage-700" : tone === "wait" ? "bg-ochre-100 text-ochre-700" : "bg-clay-100 text-clay-700";
  const I = tone === "ok" ? CheckCircle2 : tone === "wait" ? CloudOff : X;
  return <p className={cn("flex items-center gap-2 rounded-xl px-3 py-2.5 text-[15px] font-bold", c)} role="status"><I className="h-5 w-5 shrink-0" /> {children}</p>;
}

/* ------------------------------------------------------------------ */
/* Boutons d'état : livraison confirmée, facture remise, chargé */
/* ------------------------------------------------------------------ */
export function MarkButton({ lang, eventId, what, done, labelOn, labelOff, kind = "button" }: {
  lang: Lang; eventId: string; what: "livre" | "facture"; done: boolean; labelOn: Key; labelOff: Key; kind?: "button" | "check";
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<Key | null>(null);
  const [on, setOn] = useState(done);
  useEffect(() => setOn(done), [done]);
  const router = useRouter();
  const toggle = (v: boolean) => start(async () => {
    setErr(null);
    const r = await markField(eventId, what, v).catch(() => ({ ok: false, error: "server" }) as FieldResult);
    if (r.ok) { setOn(v); router.refresh(); } else setErr(r.error === "denied" ? "p.denied" : "p.error");
  });
  if (kind === "check") return (
    <div>
      <button type="button" onClick={() => toggle(!on)} disabled={pending} aria-pressed={on}
        className={cn("flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 py-3 text-start text-[16px] font-bold ring-2 transition",
          on ? "bg-sage-100 text-sage-700 ring-sage-300" : "bg-white text-ink-600 ring-line")}>
        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg border-2", on ? "border-sage-600 bg-sage-600 text-white" : "border-line-strong bg-white")}>
          {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : on ? "✓" : ""}
        </span>
        {t(lang, on ? labelOn : labelOff)}
      </button>
      {err && <p className="mt-1 text-sm font-semibold text-clay-700">{t(lang, err)}</p>}
    </div>
  );
  return (
    <div className="space-y-1">
      {on ? (
        <div className="flex items-center gap-2">
          <p className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-sage-100 px-4 text-[17px] font-bold text-sage-700"><CheckCircle2 className="h-6 w-6" /> {t(lang, labelOn)}</p>
          <button type="button" onClick={() => toggle(false)} disabled={pending} className="h-14 rounded-2xl bg-white px-4 text-sm font-semibold text-ink-500 ring-1 ring-line">{t(lang, "t.undo")}</button>
        </div>
      ) : (
        <button type="button" onClick={() => toggle(true)} disabled={pending} className="flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-sage-600 px-4 text-[17px] font-bold text-white shadow-card active:scale-[0.98] disabled:opacity-60">
          {pending ? <Loader2 className="h-6 w-6 animate-spin" /> : <CheckCircle2 className="h-6 w-6" />} {t(lang, labelOff)}
        </button>
      )}
      {err && <p className="text-sm font-semibold text-clay-700">{t(lang, err)}</p>}
    </div>
  );
}

export function LoadButton({ lang, lineId, loaded }: { lang: Lang; lineId: string; loaded: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState(false);
  const router = useRouter();
  if (loaded) return <p className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-teal-100 px-4 text-[16px] font-bold text-teal-700"><CheckCircle2 className="h-6 w-6" /> {t(lang, "t.loaded")}</p>;
  return (
    <div>
      <button type="button" disabled={pending} onClick={() => start(async () => {
        const r = await markLoaded(lineId).catch(() => ({ ok: false }) as FieldResult);
        setErr(!r.ok);
        if (r.ok) router.refresh();
      })} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-teal-600 px-4 text-[16px] font-bold text-white shadow-card active:scale-[0.98] disabled:opacity-60">
        {pending ? <Loader2 className="h-6 w-6 animate-spin" /> : <CheckCircle2 className="h-6 w-6" />} {t(lang, "t.markLoaded")}
      </button>
      {err && <p className="mt-1 text-sm font-semibold text-clay-700">{t(lang, "p.error")}</p>}
    </div>
  );
}

async function shrink(file: File, max = 1600, quality = 0.8): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), "image/jpeg", quality));
}
