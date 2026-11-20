import { Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Select } from "@/components/ui/field";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadDepartments } from "@/lib/queries";
import { fullName } from "@/lib/format";
import { DONE_STATUSES, OPEN_STATUSES, TASK_STATUS, TASK_STATUS_ORDER } from "@/lib/labels";
import { isOverdue, sortTasks } from "@/lib/tasks";
import type { Task } from "@/lib/types";
import { TaskTable } from "./task-row";

export const metadata = { title: "Tâches" };

type SP = { vue?: string; statut?: string; responsable?: string; departement?: string; evenement?: string };

export default async function TasksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const s = await requireSession();
  const supabase = await createClient();
  const vue = sp.vue ?? "ouvertes";
  let q = supabase.from("tasks").select("*").limit(500);
  if (sp.responsable) q = q.eq("assignee_id", sp.responsable);
  if (sp.departement) q = q.eq("department_id", sp.departement);
  if (sp.evenement) q = q.eq("event_id", sp.evenement);
  if (sp.statut) q = q.eq("status", sp.statut);
  else if (vue === "terminees") q = q.in("status", DONE_STATUSES).order("completed_at", { ascending: false });
  else if (vue !== "toutes") q = q.not("status", "in", `(${DONE_STATUSES.join(",")})`);
  const [{ data }, { data: staff }, { data: events }, departments] = await Promise.all([
    q, supabase.from("employees").select("id, first_name, last_name").order("first_name"), supabase.from("events").select("id, name").order("event_date", { ascending: false }).limit(200), loadDepartments(supabase),
  ]);
  const all = (data ?? []) as Task[];
  const people = new Map((staff ?? []).map((p) => [p.id, p]));
  const evMap = new Map((events ?? []).map((e) => [e.id, e.name]));

  let list = all;
  if (vue === "retard") list = all.filter((t) => isOverdue(t));
  if (vue === "bloquees") list = all.filter((t) => t.status === "bloque");
  if (vue === "verifier") list = all.filter((t) => t.status === "a_verifier");
  if (vue === "miennes") list = all.filter((t) => t.assignee_id === s.employee.id);
  if (vue !== "terminees") list = sortTasks(list);

  const base = (v: string) => {
    const p = new URLSearchParams(Object.entries({ ...sp, vue: v }).filter(([, x]) => x) as [string, string][]);
    return `/taches?${p.toString()}`;
  };
  const open = all.filter((t) => OPEN_STATUSES.includes(t.status) || t.status === "a_verifier");

  return (
    <>
      <PageHeader eyebrow="Organisation du travail" title="Tâches" subtitle="Toutes les tâches visibles selon votre périmètre."
        actions={<>
          <ButtonLink href="/taches/planning" variant="secondary">Planning de la semaine</ButtonLink>
          {s.can("tasks.create") && <ButtonLink href="/taches/nouvelle"><Plus className="h-4 w-4" /> Nouvelle tâche</ButtonLink>}
        </>} />
      <Tabs active={vue} items={[
        { key: "ouvertes", label: "En cours", href: base("ouvertes"), count: vue === "ouvertes" ? list.length : undefined },
        { key: "miennes", label: "Mes tâches", href: base("miennes") },
        { key: "retard", label: "En retard", href: base("retard"), count: open.filter((t) => isOverdue(t)).length },
        { key: "bloquees", label: "Bloquées", href: base("bloquees"), count: open.filter((t) => t.status === "bloque").length },
        { key: "verifier", label: "À vérifier", href: base("verifier"), count: open.filter((t) => t.status === "a_verifier").length },
        { key: "terminees", label: "Terminées", href: base("terminees") },
        { key: "toutes", label: "Toutes", href: base("toutes") },
      ]} />
      <form className="mb-4 flex flex-wrap items-center gap-2">
        <input type="hidden" name="vue" value={vue} />
        <Select name="responsable" defaultValue={sp.responsable ?? ""} className="h-9 w-48 py-1"><option value="">Tous les responsables</option>{(staff ?? []).map((p) => <option key={p.id} value={p.id}>{fullName(p)}</option>)}</Select>
        <Select name="departement" defaultValue={sp.departement ?? ""} className="h-9 w-56 py-1"><option value="">Tous les départements</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
        <Select name="evenement" defaultValue={sp.evenement ?? ""} className="h-9 w-56 py-1"><option value="">Tous les événements</option>{(events ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select>
        <Select name="statut" defaultValue={sp.statut ?? ""} className="h-9 w-40 py-1"><option value="">Tous statuts</option>{TASK_STATUS_ORDER.map((k) => <option key={k} value={k}>{TASK_STATUS[k].label}</option>)}</Select>
        <button className={buttonClass("secondary", "sm")}>Filtrer</button>
      </form>
      <Card>{list.length === 0 ? <Empty title="Aucune tâche ici." /> : <TaskTable tasks={list} people={people} events={evMap} />}</Card>
    </>
  );
}
