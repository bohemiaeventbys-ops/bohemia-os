import { addDays, toLocalISODate } from "./dates";

/** Créneau d'occupation du matériel : du chargement (ou de la veille) au démontage (ou au lendemain). */
export function eventSlot(e: { event_date: string; load_at?: string | null; delivery_at?: string | null; teardown_at?: string | null }) {
  const starts = [e.load_at, e.delivery_at].filter(Boolean).map((d) => toLocalISODate(d!));
  return {
    from: starts.length ? starts.sort()[0] : addDays(e.event_date, -1),
    to: e.teardown_at ? toLocalISODate(e.teardown_at) : addDays(e.event_date, 1),
  };
}
