"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { ArrowLeft, Delete, LogIn, LogOut, PauseCircle, PlayCircle, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatMinutes, TZ } from "@/lib/dates";
import type { PunchKind } from "@/lib/types";
import { kioskPunch, kioskRefresh, type PunchResult } from "./actions";

export interface KioskEmployee {
  id: string;
  first_name: string;
  last_name: string;
  department: string | null;
  last_kind: PunchKind | null;
  has_pin: boolean;
  photo_url: string | null;
}

const STATUS_TEXT: Record<string, string> = {
  a_l_heure: "À l'heure",
  en_retard: "En retard",
  sortie_autorisee: "Sortie autorisée",
  journee_terminee: "Journée terminée",
};
const ACTIONS: { kind: PunchKind; label: string; icon: typeof LogIn; allowed: (last: PunchKind | null) => boolean; primary?: boolean }[] = [
  { kind: "arrivee", label: "ARRIVÉE", icon: LogIn, allowed: (l) => l === null, primary: true },
  { kind: "sortie", label: "SORTIE AUTORISÉE", icon: PauseCircle, allowed: (l) => l === "arrivee" || l === "retour" },
  { kind: "retour", label: "RETOUR", icon: PlayCircle, allowed: (l) => l === "sortie", primary: true },
  { kind: "depart", label: "DÉPART", icon: LogOut, allowed: (l) => l === "arrivee" || l === "retour", primary: true },
];

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function KioskApp({ initialEmployees }: { initialEmployees: KioskEmployee[] }) {
  const now = useClock();
  const [employees, setEmployees] = useState(initialEmployees);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<KioskEmployee | null>(null);
  const [pin, setPin] = useState("");
  const [result, setResult] = useState<PunchResult | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = useCallback(() => {
    setSelected(null);
    setPin("");
    setResult(null);
    setQuery("");
  }, []);

  // retour automatique à l'accueil (inactivité / après pointage)
  useEffect(() => {
    if (!selected && !result) return;
    const delay = result?.ok ? 6000 : 30000;
    const t = setTimeout(reset, delay);
    return () => clearTimeout(t);
  }, [selected, result, pin, reset]);

  // rafraîchit l'état des pointages toutes les minutes
  useEffect(() => {
    const t = setInterval(async () => {
      const fresh = await kioskRefresh();
      if (fresh) setEmployees((prev) => prev.map((e) => ({ ...e, last_kind: fresh.find((f) => f.id === e.id)?.last_kind ?? null })));
    }, 60000);
    return () => clearInterval(t);
  }, []);

  // saisie clavier du PIN
  useEffect(() => {
    if (!selected || result) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) setPin((p) => (p.length < 6 ? p + e.key : p));
      else if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
      else if (e.key === "Escape") reset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, result, reset]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? employees.filter((e) => `${e.first_name} ${e.last_name}`.toLowerCase().includes(q)) : employees;
  }, [employees, query]);

  function punch(kind: PunchKind) {
    if (!selected) return;
    startTransition(async () => {
      const r = await kioskPunch(selected.id, pin, kind);
      setResult(r);
      if (r.ok) {
        setEmployees((prev) => prev.map((e) => (e.id === selected.id ? { ...e, last_kind: kind } : e)));
      } else {
        setPin("");
      }
    });
  }

  const time = now ? new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(now) : "";
  const dateRaw = now ? new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now) : "";
  const date = dateRaw.charAt(0).toUpperCase() + dateRaw.slice(1);

  return (
    <div className="flex min-h-screen select-none flex-col bg-ivory">
      <header className="flex items-center justify-between border-b border-line px-12 py-6">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-3xl font-semibold tracking-[0.16em]">BOHEMIA</span>
          <span className="text-xs font-semibold uppercase tracking-[0.3em] text-taupe-500">Pointage</span>
        </div>
        <div className="text-right">
          <p className="font-display text-5xl tabular-nums leading-none text-ink">{time}</p>
          <p className="mt-1 text-sm text-ink-400">{date}</p>
        </div>
      </header>

      {/* Écran 3 : résultat */}
      {result && selected ? (
        <div className="flex flex-1 items-center justify-center p-12">
          <div className={cn("w-full max-w-xl rounded-3xl border p-12 text-center", result.ok ? "border-sage-500/30 bg-white" : "border-clay-500/30 bg-white")}>
            {result.ok ? (
              <>
                <p className="text-sm uppercase tracking-[0.2em] text-taupe-500">{ACTIONS.find((a) => a.kind === result.kind)?.label} enregistrée</p>
                <p className="mt-4 font-display text-5xl text-ink">{result.employee}</p>
                <p className="mt-6 font-display text-7xl tabular-nums text-ink">
                  {result.at ? new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(result.at)) : ""}
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3 text-sm">
                  {result.status && (
                    <span className={cn("rounded-full px-4 py-1.5", result.status === "en_retard" ? "bg-clay-100 text-clay-700" : "bg-sage-100 text-sage-700")}>
                      {STATUS_TEXT[result.status] ?? result.status}
                      {result.status === "en_retard" && result.late_minutes ? ` · ${result.late_minutes} min` : ""}
                    </span>
                  )}
                  {result.kind === "depart" && (
                    <span className="rounded-full bg-sand-100 px-4 py-1.5 text-ink-500">
                      Travaillé : {formatMinutes(result.worked_minutes)}
                      {result.overtime_minutes ? ` · Heures sup. : ${formatMinutes(result.overtime_minutes)}` : ""}
                    </span>
                  )}
                </div>
                {result.kind === "arrivee" && <p className="mt-8 text-sm text-ink-400">Bonne journée.</p>}
                {result.kind === "depart" && <p className="mt-8 text-sm text-ink-400">Merci et bonne soirée.</p>}
              </>
            ) : (
              <>
                <p className="font-display text-4xl text-clay-700">Pointage refusé</p>
                <p className="mt-4 text-lg text-ink-500">{result.error}</p>
              </>
            )}
            <button onClick={result.ok ? reset : () => setResult(null)} className="mt-10 rounded-xl bg-ink px-8 py-4 text-ivory">
              {result.ok ? "Terminer" : "Réessayer"}
            </button>
          </div>
        </div>
      ) : selected ? (
        /* Écran 2 : PIN + action */
        <div className="flex flex-1 items-start justify-center gap-16 p-12">
          <div className="w-80">
            <button onClick={reset} className="mb-8 inline-flex items-center gap-2 text-sm text-ink-400 hover:text-ink">
              <ArrowLeft className="h-4 w-4" /> Changer de personne
            </button>
            <div className="flex items-center gap-4">
              <Face e={selected} size={72} />
              <div>
                <p className="font-display text-3xl leading-tight">{selected.first_name} {selected.last_name}</p>
                <p className="text-sm text-ink-400">{selected.department ?? ""}</p>
              </div>
            </div>
            <p className="mt-10 text-xs uppercase tracking-[0.2em] text-ink-400">Code PIN personnel</p>
            <div className="mt-3 flex gap-3">
              {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
                <span key={i} className={cn("h-4 w-4 rounded-full border", i < pin.length ? "border-ink bg-ink" : "border-line-strong")} />
              ))}
            </div>
            {!selected.has_pin && <p className="mt-4 text-sm text-clay-700">Aucun PIN défini : contactez la direction.</p>}
            <div className="mt-8 grid grid-cols-3 gap-3">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"].map((k) =>
                k === "" ? <span key="blank" /> : (
                  <button key={k}
                    onClick={() => (k === "del" ? setPin((p) => p.slice(0, -1)) : setPin((p) => (p.length < 6 ? p + k : p)))}
                    className="flex h-16 items-center justify-center rounded-2xl border border-line bg-white font-display text-3xl text-ink transition active:scale-95 active:bg-sand-100">
                    {k === "del" ? <Delete className="h-6 w-6 text-ink-400" strokeWidth={1.5} /> : k}
                  </button>
                ),
              )}
            </div>
          </div>
          <div className="w-96 pt-16">
            <p className="text-xs uppercase tracking-[0.2em] text-ink-400">Action</p>
            <div className="mt-4 space-y-3">
              {ACTIONS.map((a) => {
                const allowed = a.allowed(selected.last_kind);
                return (
                  <button key={a.kind} disabled={!allowed || pin.length < 4 || pending} onClick={() => punch(a.kind)}
                    className={cn("flex w-full items-center gap-4 rounded-2xl px-6 py-5 text-left text-lg font-medium tracking-wide transition disabled:cursor-not-allowed",
                      !allowed ? "hidden" : a.primary ? "bg-ink text-ivory hover:bg-ink-600 disabled:opacity-40" : "border border-line-strong bg-white text-ink hover:bg-sand-50 disabled:opacity-40")}>
                    <a.icon className="h-6 w-6" strokeWidth={1.5} />
                    {pending ? "Enregistrement…" : a.label}
                  </button>
                );
              })}
              {selected.last_kind === "depart" && <p className="rounded-2xl bg-sand-100 px-6 py-5 text-ink-500">Journée déjà terminée.</p>}
            </div>
            <p className="mt-6 text-xs text-ink-300">L&apos;heure enregistrée est celle du serveur, pas celle de cet ordinateur.</p>
          </div>
        </div>
      ) : (
        /* Écran 1 : choix de la personne */
        <div className="flex-1 px-12 py-10">
          <div className="mb-8 flex items-center justify-between gap-6">
            <p className="font-display text-3xl text-ink">Sélectionnez votre nom</p>
            <div className="relative w-80">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-300" strokeWidth={1.5} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher…" className="field h-12 pl-11 text-base" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            {filtered.map((e) => (
              <button key={e.id} onClick={() => { setSelected(e); setPin(""); }}
                className="flex flex-col items-center rounded-2xl border border-line bg-white px-4 py-6 text-center transition hover:border-taupe-300 hover:shadow-pop">
                <Face e={e} size={64} />
                <p className="mt-3 font-medium text-ink">{e.first_name} {e.last_name}</p>
                <p className="mt-0.5 line-clamp-1 text-xs text-ink-400">{e.department ?? "—"}</p>
                <span className={cn("mt-3 rounded-full px-2.5 py-0.5 text-xs",
                  e.last_kind === null ? "bg-sand-100 text-ink-400" : e.last_kind === "depart" ? "bg-ink text-ivory" : e.last_kind === "sortie" ? "bg-ochre-100 text-ochre-700" : "bg-sage-100 text-sage-700")}>
                  {e.last_kind === null ? "Non pointé" : e.last_kind === "depart" ? "Parti" : e.last_kind === "sortie" ? "Sorti" : "Présent"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Face({ e, size }: { e: KioskEmployee; size: number }) {
  if (e.photo_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={e.photo_url} alt="" width={size} height={size} className="rounded-full object-cover ring-1 ring-line" style={{ width: size, height: size }} />;
  }
  return (
    <span className="inline-flex items-center justify-center rounded-full bg-nude-100 font-display text-taupe-700 ring-1 ring-nude-200" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {(e.first_name[0] ?? "") + (e.last_name?.[0] ?? "")}
    </span>
  );
}
