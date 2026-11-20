import Link from "next/link";
import { Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { diffDays, formatDayShort, todayISO, toLocalTime } from "@/lib/dates";
import { formatMAD, fullName } from "@/lib/format";
import { DONE_STATUSES, EVENT_STATUS, EVENT_TYPE } from "@/lib/labels";
import type { EventRow } from "@/lib/types";

export const metadata = { title: "Événements" };

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ vue?: string; type?: string }> }) {
  const sp = await searchParams;
  const s = await requireSession();
  const supabase = await createClient();
  const today = todayISO();
  const vue = sp.vue === "passes" ? "passes" : "avenir";
  let q = supabase.from("events").select("*").limit(300);
  q = vue === "avenir" ? q.gte("event_date", today).order("event_date") : q.lt("event_date", today).order("event_date", { ascending: false });
  if (sp.type) q = q.eq("event_type", sp.type);
  const [{ data }, { data: staff }] = await Promise.all([q, supabase.from("employees").select("id, first_name, last_name")]);
  const events = (data ?? []) as EventRow[];
  const ids = events.map((e) => e.id);
  const { data: taskRows } = ids.length ? await supabase.from("tasks").select("event_id, status").in("event_id", ids) : { data: [] };
  const progress = new Map<string, { done: number; total: number }>();
  for (const t of taskRows ?? []) {
    const p = progress.get(t.event_id) ?? { done: 0, total: 0 };
    p.total++;
    if (DONE_STATUSES.includes(t.status)) p.done++;
    progress.set(t.event_id, p);
  }
  const people = new Map((staff ?? []).map((p) => [p.id, p]));
  const typeLink = (t?: string) => `/evenements?vue=${vue}${t ? `&type=${t}` : ""}`;

  return (
    <>
      <PageHeader eyebrow="Production événementielle" title="Événements" subtitle="Socle Phase 2 · fiches techniques, checklist et sous-sections arrivent en Phase 3."
        actions={s.can("events.manage") && <ButtonLink href="/evenements/nouveau"><Plus className="h-4 w-4" /> Nouvel événement</ButtonLink>} />
      <Tabs active={vue} items={[{ key: "avenir", label: "À venir", href: `/evenements?vue=avenir${sp.type ? `&type=${sp.type}` : ""}` }, { key: "passes", label: "Passés", href: `/evenements?vue=passes${sp.type ? `&type=${sp.type}` : ""}` }]} />
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <Link href={typeLink()} className={`rounded-full border px-3 py-1 ${!sp.type ? "border-ink bg-ink text-ivory" : "border-line bg-white text-ink-500"}`}>Tous types</Link>
        {Object.entries(EVENT_TYPE).map(([k, v]) => (
          <Link key={k} href={typeLink(k)} className={`rounded-full border px-3 py-1 ${sp.type === k ? "border-ink bg-ink text-ivory" : "border-line bg-white text-ink-500"}`}>{v}</Link>
        ))}
      </div>
      <Card>
        {events.length === 0 ? <Empty title="Aucun événement." /> : (
          <table className="table-base">
            <thead><tr><th>Date</th><th>Événement</th><th>Type</th><th>Lieu</th><th>Responsable</th><th>Budget</th><th>Tâches</th><th>Statut</th></tr></thead>
            <tbody>
              {events.map((e) => {
                const p = progress.get(e.id);
                const days = diffDays(e.event_date, today);
                return (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap"><p className="font-medium ">{formatDayShort(e.event_date)}</p><p className="text-xs text-ink-400">{vue === "avenir" ? (days === 0 ? "Aujourd'hui" : days === 1 ? "Demain" : `Dans ${days} j`) : ""}{e.start_at ? ` · ${toLocalTime(e.start_at)}` : ""}</p></td>
                    <td><Link href={`/evenements/${e.id}`} className="font-medium hover:underline">{e.name}</Link><p className="text-xs text-ink-400">{e.client_name ?? ""}</p></td>
                    <td className="text-ink-500">{EVENT_TYPE[e.event_type]}</td>
                    <td className="max-w-[200px] truncate text-ink-500">{e.address ?? "—"}</td>
                    <td>{e.manager_id ? fullName(people.get(e.manager_id)) : "—"}</td>
                    <td className="tabular-nums">{formatMAD(e.budget_mad)}</td>
                    <td>{p ? <Progress done={p.done} total={p.total} /> : <span className="text-xs text-ink-300">Aucune</span>}</td>
                    <td><Badge tone={EVENT_STATUS[e.status].tone}>{EVENT_STATUS[e.status].label}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  const pct = Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-sand-200"><div className="h-full rounded-full bg-taupe-500" style={{ width: `${pct}%` }} /></div>
      <span className="text-xs tabular-nums text-ink-400">{done}/{total}</span>
    </div>
  );
}
