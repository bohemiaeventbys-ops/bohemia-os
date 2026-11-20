import type { Task } from "./types";
import { DONE_STATUSES, PRIORITY } from "./labels";
import { nowLocalMinutes, timeToMinutes, todayISO } from "./dates";

export function isDone(t: Pick<Task, "status">) {
  return DONE_STATUSES.includes(t.status);
}

/** Échéance dépassée (heure de Casablanca) et tâche non clôturée / non soumise */
export function isOverdue(t: Pick<Task, "status" | "due_date" | "due_time">, now = new Date()) {
  if (!t.due_date || isDone(t) || t.status === "a_verifier") return false;
  const today = todayISO(now);
  if (t.due_date < today) return true;
  if (t.due_date > today) return false;
  return timeToMinutes(t.due_time ?? "23:59") < nowLocalMinutes(now);
}

export function sortTasks<T extends Pick<Task, "priority" | "due_date" | "due_time" | "planned_time">>(list: T[]) {
  return [...list].sort((a, b) =>
    (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") ||
    PRIORITY[a.priority].rank - PRIORITY[b.priority].rank ||
    (a.due_time ?? a.planned_time ?? "99").localeCompare(b.due_time ?? b.planned_time ?? "99"));
}
