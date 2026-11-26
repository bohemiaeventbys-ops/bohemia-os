import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/components/print-button";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateTime, formatDayLong, hhmm, toLocalTime } from "@/lib/dates";
import { fullName } from "@/lib/format";
import { EVENT_STATUS, EVENT_TYPE, TASK_STATUS } from "@/lib/labels";
import { LINE_STATUS, type EventItem, type StockCategory, type StockItem } from "@/lib/stock";
import type { Department, Employee, EventRow, Task } from "@/lib/types";
import { SERVICE_STATUS, type EventService, type Supplier } from "@/lib/suppliers";

export const metadata = { title: "Fiche technique" };

const STEPS: Record<string, string> = {
  commercial: "Commercial & client", conception: "Conception & validation", achats: "Achats", production: "Production (impression, vinyle, découpe, peinture)",
  fleurs: "Fleurs", logistique: "Logistique (dépôt, chargement, livraison, retour)", autre: "Autres tâches",
};

/** Fiche technique générée automatiquement à partir de l'événement, de l'équipe, du matériel et des tâches. Sans aucun montant. */
export default async function FicheTechnique({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireSession();
  const supabase = await createClient();
  const { data: e } = await supabase.from("events").select("*").eq("id", id).maybeSingle<EventRow>();
  if (!e) notFound();
  const [{ data: staff }, { data: deps }, { data: team }, { data: lineData }, { data: taskData }, { data: tplData }, { data: catData }, { data: svcData }] = await Promise.all([
    supabase.from("employees").select("*"),
    supabase.from("departments").select("*"),
    supabase.from("event_team").select("*").eq("event_id", id),
    supabase.from("event_items").select("*").eq("event_id", id),
    supabase.from("tasks").select("*").eq("event_id", id).order("due_date"),
    supabase.from("task_templates").select("id, step"),
    supabase.from("stock_categories").select("*").order("sort_order"),
    supabase.from("event_services").select("*").eq("event_id", id).neq("status", "annule").order("service_date"),
  ]);
  const services = (svcData ?? []) as EventService[];
  const { data: supData } = services.length ? await supabase.from("suppliers").select("*").in("id", services.map((v) => v.supplier_id)) : { data: [] };
  const sup = new Map(((supData ?? []) as Supplier[]).map((x) => [x.id, x]));
  const people = new Map(((staff ?? []) as Employee[]).map((p) => [p.id, p]));
  const depMap = new Map(((deps ?? []) as Department[]).map((d) => [d.id, d]));
  const lines = (lineData ?? []) as EventItem[];
  const { data: itemData } = lines.length ? await supabase.from("stock_items").select("*").in("id", lines.map((l) => l.item_id)) : { data: [] };
  const items = new Map(((itemData ?? []) as StockItem[]).map((i) => [i.id, i]));
  const cats = (catData ?? []) as StockCategory[];
  const tasks = (taskData ?? []) as (Task & { template_id?: string | null })[];
  const stepOf = new Map((tplData ?? []).map((t) => [t.id as string, t.step as string]));
  const byStep = new Map<string, typeof tasks>();
  for (const t of tasks) {
    const k = (t.template_id && stepOf.get(t.template_id)) || "autre";
    byStep.set(k, [...(byStep.get(k) ?? []), t]);
  }

  const moments: [string, string | null][] = [["Livraison", e.delivery_at], ["Installation", e.setup_at], ["Début", e.start_at], ["Fin", e.end_at], ["Démontage", e.teardown_at]];

  return (
    <div className="mx-auto max-w-4xl print:max-w-none">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/evenements/${id}`} className="link text-sm">← Retour à l&apos;événement</Link>
        <PrintButton />
      </div>

      <article className="card space-y-8 p-6 sm:p-10 print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-rose-600">Fiche technique</p>
            <h1 className="mt-1 font-display text-4xl font-semibold">{e.name}</h1>
            <p className="mt-1 text-ink-500">{formatDayLong(e.event_date)} · {EVENT_TYPE[e.event_type]}</p>
          </div>
          <div className="text-right">
            <p className="font-display text-2xl font-semibold tracking-[0.14em]">BOHEMIA</p>
            <Badge tone={EVENT_STATUS[e.status].tone}>{EVENT_STATUS[e.status].label}</Badge>
            <p className="mt-1 text-xs text-ink-400">Générée le {formatDateTime(new Date().toISOString())}</p>
          </div>
        </header>

        <section className="grid gap-6 sm:grid-cols-2">
          <Block title="Client">
            <p className="font-semibold">{e.client_name ?? "—"}</p>
            {e.client_phone && <p>{e.client_phone}</p>}
          </Block>
          <Block title="Lieu">
            <p>{e.address ?? "À préciser"}</p>
            <p className="text-ink-500">Responsable : {e.manager_id ? fullName(people.get(e.manager_id)) : "—"}</p>
          </Block>
        </section>

        <section>
          <H>Horaires</H>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {moments.map(([l, v]) => (
              <div key={l} className="rounded-xl bg-sand-50 px-3 py-2.5 print:border print:border-line">
                <p className="text-xs text-ink-400">{l}</p>
                <p className="font-semibold">{v ? `${formatDate(v)} ${toLocalTime(v)}` : "—"}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <H>Équipe</H>
          {(team ?? []).length === 0 ? <p className="text-sm text-ink-400">Personne n&apos;est encore assigné.</p> : (
            <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
              {(team ?? []).map((m) => <li key={m.employee_id}>• <span className="font-medium">{fullName(people.get(m.employee_id))}</span>{m.role_label ? ` · ${m.role_label}` : ""}</li>)}
            </ul>
          )}
        </section>

        <section>
          <H>Matériel ({lines.length} article{lines.length > 1 ? "s" : ""}, {lines.reduce((a, l) => a + l.qty, 0)} pièces)</H>
          {lines.length === 0 ? <p className="text-sm text-ink-400">Aucun matériel réservé pour l&apos;instant (Dépôt & Stock).</p> : (
            <div className="space-y-4">
              {[...cats.map((c) => ({ id: c.id, name: c.name })), { id: null as string | null, name: "Autres" }].map((c) => {
                const list = lines.filter((l) => (items.get(l.item_id)?.category_id ?? null) === c.id);
                if (!list.length) return null;
                return (
                  <div key={c.name}>
                    <p className="mb-1 text-sm font-semibold text-ink-600">{c.name}</p>
                    <table className="w-full text-sm">
                      <tbody>
                        {list.map((l) => {
                          const i = items.get(l.item_id);
                          return (
                            <tr key={l.id} className="border-b border-line/70">
                              <td className="w-8 py-1.5"><span className="inline-block h-4 w-4 rounded border border-ink-300" /></td>
                              <td className="py-1.5 font-medium">{i?.name}</td>
                              <td className="py-1.5 text-right font-bold tabular-nums">× {l.qty}</td>
                              <td className="hidden py-1.5 pl-4 text-ink-400 sm:table-cell print:table-cell">{i?.location ?? ""}</td>
                              <td className="py-1.5 pl-3 text-right"><span className="text-xs text-ink-500">{LINE_STATUS[l.status].label}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {services.length > 0 && (
          <section>
            <H>Prestataires</H>
            <table className="w-full text-sm">
              <tbody>
                {services.map((v) => {
                  const x = sup.get(v.supplier_id);
                  return (
                    <tr key={v.id} className="border-b border-line/70">
                      <td className="py-1.5 font-medium">{x?.name}</td>
                      <td className="py-1.5 pl-3">{v.description}</td>
                      <td className="whitespace-nowrap py-1.5 pl-3 tabular-nums">{formatDate(v.service_date ?? e.event_date)}{v.service_time ? ` ${hhmm(v.service_time)}` : ""}</td>
                      <td className="whitespace-nowrap py-1.5 pl-3 tabular-nums text-ink-500">{x?.phone ?? ""}</td>
                      <td className="py-1.5 pl-3 text-right text-xs text-ink-500">{SERVICE_STATUS[v.status].label}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        <section>
          <H>Qui fait quoi</H>
          {tasks.length === 0 ? <p className="text-sm text-ink-400">Aucune tâche.</p> : (
            <div className="space-y-4">
              {Object.keys(STEPS).filter((k) => byStep.has(k)).map((k) => (
                <div key={k}>
                  <p className="mb-1 text-sm font-semibold text-ink-600">{STEPS[k]}</p>
                  <table className="w-full text-sm">
                    <tbody>
                      {byStep.get(k)!.map((t) => (
                        <tr key={t.id} className="border-b border-line/70 align-top">
                          <td className="w-8 py-1.5"><span className={`inline-block h-4 w-4 rounded border ${["valide", "termine"].includes(t.status) ? "border-sage-600 bg-sage-500" : "border-ink-300"}`} /></td>
                          <td className="py-1.5">{t.title}</td>
                          <td className="py-1.5 pl-3 text-ink-600">{t.assignee_id ? fullName(people.get(t.assignee_id)) : t.department_id ? depMap.get(t.department_id)?.name : "—"}</td>
                          <td className="whitespace-nowrap py-1.5 pl-3 text-right tabular-nums">{formatDate(t.due_date)}{t.due_time ? ` ${hhmm(t.due_time)}` : ""}</td>
                          <td className="hidden py-1.5 pl-3 text-right text-xs text-ink-500 sm:table-cell print:table-cell">{TASK_STATUS[t.status].label}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </section>

        {e.notes && (
          <section>
            <H>Notes</H>
            <p className="whitespace-pre-line text-sm">{e.notes}</p>
          </section>
        )}
      </article>
    </div>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 border-l-4 border-rose-400 pl-3 text-base font-bold uppercase tracking-wide text-ink">{children}</h2>;
}
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><H>{title}</H><div className="space-y-0.5 text-sm">{children}</div></div>;
}
