// Toutes les dates « métier » sont exprimées dans le fuseau Africa/Casablanca,
// quel que soit le fuseau du serveur ou du poste.
export const TZ = "Africa/Casablanca";
export const LOCALE = "fr-FR";

function parts(d: Date) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)!.value;
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour") === "24" ? "00" : get("hour"), min: get("minute"), s: get("second") };
}

/** Date du jour à Casablanca, format AAAA-MM-JJ */
export function todayISO(now = new Date()): string {
  const p = parts(now);
  return `${p.y}-${p.m}-${p.d}`;
}

/** Date AAAA-MM-JJ d'un instant, vue depuis Casablanca */
export function toLocalISODate(d: Date | string): string {
  const p = parts(typeof d === "string" ? new Date(d) : d);
  return `${p.y}-${p.m}-${p.d}`;
}

/** Heure HH:MM d'un instant, vue depuis Casablanca */
export function toLocalTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const p = parts(typeof d === "string" ? new Date(d) : d);
  return `${p.h}:${p.min}`;
}

/** Décalage (en minutes) de Casablanca par rapport à UTC à un instant donné */
function offsetMinutes(at: Date): number {
  const p = parts(at);
  const asUTC = Date.UTC(+p.y, +p.m - 1, +p.d, +p.h, +p.min, +p.s);
  return Math.round((asUTC - at.getTime()) / 60000);
}

/** Convertit une date + heure locales de Casablanca en instant ISO (UTC) */
export function localToISO(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const off = offsetMinutes(guess);
  return new Date(guess.getTime() - off * 60000).toISOString();
}

// --- Arithmétique sur dates calendaires (AAAA-MM-JJ), sans fuseau ---
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
/** 1 = lundi … 7 = dimanche */
export function isoWeekday(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}
export function startOfWeek(iso: string): string {
  return addDays(iso, 1 - isoWeekday(iso));
}
export function startOfMonth(iso: string): string {
  return iso.slice(0, 8) + "01";
}
export function endOfMonth(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
export function addMonths(iso: string, n: number): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
}
export function diffDays(a: string, b: string): number {
  const ta = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const tb = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((ta - tb) / 86400000);
}
export function isValidISODate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(opts: Intl.DateTimeFormatOptions) {
  const k = JSON.stringify(opts);
  if (!fmtCache.has(k)) fmtCache.set(k, new Intl.DateTimeFormat(LOCALE, { timeZone: "UTC", ...opts }));
  return fmtCache.get(k)!;
}
function isoToUTCDate(iso: string) {
  return new Date(iso + "T12:00:00Z");
}
/** « vendredi 20 novembre » */
export function formatDayLong(iso: string): string {
  return cap(fmt({ weekday: "long", day: "numeric", month: "long" }).format(isoToUTCDate(iso)));
}
/** « ven. 20 nov. » */
export function formatDayShort(iso: string): string {
  return cap(fmt({ weekday: "short", day: "numeric", month: "short" }).format(isoToUTCDate(iso)));
}
/** « 20/11/2026 » */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return fmt({ day: "2-digit", month: "2-digit", year: "numeric" }).format(isoToUTCDate(iso.slice(0, 10)));
}
/** « novembre 2026 » */
export function formatMonth(iso: string): string {
  return cap(fmt({ month: "long", year: "numeric" }).format(isoToUTCDate(iso)));
}
export function formatDateTime(ts: string | null | undefined): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(ts));
}
export function formatMinutes(min: number | null | undefined): string {
  if (!min) return "0 h 00";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h} h ${String(m).padStart(2, "0")}`;
}
export function hhmm(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : "";
}
export function relativeTime(ts: string): string {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  if (diff < 7 * 86400) return `il y a ${Math.floor(diff / 86400)} j`;
  return formatDateTime(ts);
}
/** Minutes écoulées « maintenant » à Casablanca depuis minuit */
export function nowLocalMinutes(now = new Date()): number {
  const p = parts(now);
  return +p.h * 60 + +p.min;
}
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
