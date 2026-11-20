import type { AttendanceDay, Employee, WorkSchedule } from "./types";
import { isoWeekday, nowLocalMinutes, timeToMinutes } from "./dates";
import type { Tone } from "./labels";
import { DAY_STATUS } from "./labels";

export type LiveKey = "present" | "late" | "out" | "done" | "not_yet" | "missing" | "absent" | "leave" | "off";

export const LIVE: Record<LiveKey, { label: string; tone: Tone }> = {
  present: { label: "Présent", tone: "sage" },
  late: { label: "Présent · en retard", tone: "clay" },
  out: { label: "Sortie autorisée", tone: "ochre" },
  done: { label: "Journée terminée", tone: "ink" },
  not_yet: { label: "Pas encore arrivé", tone: "neutral" },
  missing: { label: "Non arrivé · en retard", tone: "clay" },
  absent: { label: "Absent", tone: "clay" },
  leave: { label: "Congé", tone: "mist" },
  off: { label: "Repos", tone: "sand" },
};

export function scheduleFor(e: Pick<Employee, "schedule_id">, schedules: WorkSchedule[], dateISO: string) {
  const s = schedules.find((x) => x.id === e.schedule_id) ?? schedules.find((x) => x.is_default);
  if (!s) return null;
  const d = s.days?.[String(isoWeekday(dateISO))];
  if (!d?.start) return null;
  return { start: d.start, end: d.end, grace: s.grace_minutes, name: s.name };
}

/** Statut en temps réel d'un employé aujourd'hui */
export function liveStatus(day: AttendanceDay | undefined, onLeave: string | null, sched: ReturnType<typeof scheduleFor>, now = new Date()): { key: LiveKey; label: string; tone: Tone } {
  if (day) {
    if (day.manual_status && !["a_l_heure", "en_retard", "journee_terminee", "sortie_autorisee"].includes(day.status)) {
      const d = DAY_STATUS[day.status];
      return { key: day.status === "absent" ? "absent" : "leave", label: d.label, tone: d.tone };
    }
    if (day.status === "journee_terminee") return { key: "done", ...LIVE.done };
    if (day.status === "sortie_autorisee") return { key: "out", ...LIVE.out };
    if (day.status === "en_retard") return { key: "late", label: `Présent · ${day.late_minutes} min de retard`, tone: "clay" };
    return { key: "present", ...LIVE.present };
  }
  if (onLeave) return { key: "leave", label: onLeave, tone: "mist" };
  if (!sched) return { key: "off", ...LIVE.off };
  const n = nowLocalMinutes(now);
  if (n <= timeToMinutes(sched.start) + sched.grace) return { key: "not_yet", ...LIVE.not_yet };
  if (n < timeToMinutes(sched.end)) return { key: "missing", ...LIVE.missing };
  return { key: "absent", ...LIVE.absent };
}
