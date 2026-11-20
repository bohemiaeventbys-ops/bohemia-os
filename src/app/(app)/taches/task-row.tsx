import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { formatDate, hhmm } from "@/lib/dates";
import { fullName } from "@/lib/format";
import { PRIORITY, TASK_STATUS } from "@/lib/labels";
import { isOverdue } from "@/lib/tasks";
import type { Task } from "@/lib/types";

type P = { id: string; first_name: string; last_name: string };

export function TaskTable({ tasks, people, events, showAssignee = true }: { tasks: Task[]; people: Map<string, P>; events: Map<string, string>; showAssignee?: boolean }) {
  return (
    <table className="table-base">
      <thead><tr><th>Tâche</th>{showAssignee && <th>Responsable</th>}<th>Événement</th><th>Priorité</th><th>Statut</th><th>Deadline</th></tr></thead>
      <tbody>
        {tasks.map((t) => {
          const late = isOverdue(t);
          const a = t.assignee_id ? people.get(t.assignee_id) : undefined;
          return (
            <tr key={t.id}>
              <td className="max-w-md"><Link href={`/taches/${t.id}`} className="font-medium hover:underline">{t.title}</Link>
                {t.status === "bloque" && t.blocked_reason && <p className="mt-0.5 truncate text-xs text-clay-700">{t.blocked_reason}</p>}</td>
              {showAssignee && <td>{a ? <span className="flex items-center gap-2"><Avatar person={a} size={24} />{fullName(a)}</span> : <span className="text-ink-300">Non assignée</span>}</td>}
              <td className="text-ink-500">{t.event_id ? events.get(t.event_id) ?? "—" : "—"}</td>
              <td><Badge tone={PRIORITY[t.priority].tone} dot={false}>{PRIORITY[t.priority].label}</Badge></td>
              <td><Badge tone={TASK_STATUS[t.status].tone}>{TASK_STATUS[t.status].label}</Badge></td>
              <td className={`whitespace-nowrap tabular-nums ${late ? "font-medium text-clay-700" : "text-ink-500"}`}>
                {t.due_date ? `${formatDate(t.due_date)}${t.due_time ? ` ${hhmm(t.due_time)}` : ""}` : "—"}{late && " · en retard"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
