import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedUrls } from "@/lib/storage";
import { formatDateTime, formatDayLong } from "@/lib/dates";
import { fullName } from "@/lib/format";
import { PROOF_BUCKET, money2, type Client, type Company, type DesignProof, type Quote, type QuoteLine } from "@/lib/clients";
import { SERVICE_STATUS, type EventService, type Supplier } from "@/lib/suppliers";
import type { Employee, EventRow } from "@/lib/types";
import { DocFooter, DocShell } from "../../../devis/doc";

export const metadata = { title: "Récap client" };

/** Récapitulatif à envoyer au client : ce qui est prévu, quand, avec les maquettes validées. Aucun coût interne. */
export default async function RecapPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ montants?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const s = await requirePerm(["events.manage", "finance.view", "clients.manage"]);
  const supabase = await createClient();
  const { data: e } = await supabase.from("events").select("*").eq("id", id).maybeSingle<EventRow>();
  if (!e) notFound();
  const fin = s.can("finance.view");
  const showMoney = fin && sp.montants !== "non";
  const [{ data: company }, { data: client }, { data: pr }, { data: sv }, { data: mgr }, { data: qs }] = await Promise.all([
    supabase.from("company_settings").select("*").single<Company>(),
    e.client_id ? supabase.from("clients").select("*").eq("id", e.client_id).maybeSingle<Client>() : Promise.resolve({ data: null }),
    supabase.from("design_proofs").select("*").eq("event_id", id).eq("status", "valide").order("title"),
    supabase.from("event_services").select("*").eq("event_id", id).neq("status", "annule").order("service_date"),
    e.manager_id ? supabase.from("employees").select("*").eq("id", e.manager_id).maybeSingle<Employee>() : Promise.resolve({ data: null }),
    fin ? supabase.from("quotes").select("*").eq("event_id", id).eq("status", "accepte").order("decided_at", { ascending: false }).limit(1) : Promise.resolve({ data: [] }),
  ]);
  const proofs = (pr ?? []) as DesignProof[];
  const services = (sv ?? []) as EventService[];
  const quote = ((qs ?? []) as Quote[])[0];
  const [{ data: sup }, { data: ql }, { data: fi }] = await Promise.all([
    services.length ? supabase.from("suppliers").select("id, name").in("id", services.map((x) => x.supplier_id)) : Promise.resolve({ data: [] }),
    quote ? supabase.from("quote_lines").select("*").eq("quote_id", quote.id).order("sort_order") : Promise.resolve({ data: [] }),
    showMoney ? supabase.from("event_finances").select("paid_mad").eq("event_id", id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const supName = new Map(((sup ?? []) as Pick<Supplier, "id" | "name">[]).map((x) => [x.id, x.name]));
  const lines = (ql ?? []) as QuoteLine[];
  const urls = await signedUrls(supabase, PROOF_BUCKET, proofs.map((p) => p.file_path));
  const paid = Number((fi as { paid_mad: number } | null)?.paid_mad ?? 0);
  const sections = Array.from(new Set(lines.map((l) => l.section ?? "Prestations")));

  return (
    <div>
      <div className="mx-auto mb-4 flex max-w-4xl flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/evenements/${id}`} className="link text-sm">← Retour à l&apos;événement</Link>
        <div className="flex items-center gap-3">
          {fin && <Link href={showMoney ? "?montants=non" : "?"} className="link text-sm">{showMoney ? "Masquer les montants" : "Afficher les montants"}</Link>}
          <PrintButton />
        </div>
      </div>
      <DocShell>
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-rose-600">Récapitulatif de votre événement</p>
            <h1 className="mt-1 font-display text-4xl font-semibold">{e.name}</h1>
            <p className="text-ink-500">{formatDayLong(e.event_date)}{client ? ` · ${client.name}` : ""}</p>
          </div>
          <div className="text-right"><p className="font-display text-2xl font-semibold tracking-[0.14em]">BOHEMIA</p><p className="text-[11px] uppercase tracking-[0.3em] text-ink-400">Events</p></div>
        </header>
        <section className="grid gap-6 sm:grid-cols-2">
          <div><p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Lieu</p><p className="font-medium">{e.address ?? "À préciser"}</p></div>
          <div><p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Votre contact chez Bohemia</p><p className="font-medium">{mgr ? fullName(mgr) : company?.company_name}{mgr?.phone ? ` · ${mgr.phone}` : company?.phone ? ` · ${company.phone}` : ""}</p></div>
        </section>
        <section>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Horaires</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([["Installation", e.setup_at], ["Début", e.start_at], ["Fin", e.end_at], ["Démontage", e.teardown_at]] as [string, string | null][]).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-sand-50 px-3 py-2 print:border print:border-line"><p className="text-[11px] text-ink-400">{k}</p><p className="font-semibold">{v ? formatDateTime(v) : "—"}</p></div>
            ))}
          </div>
        </section>
        {lines.length > 0 && (
          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Ce qui est prévu</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {sections.map((sec) => (
                <div key={sec}><p className="mb-1 font-semibold text-rose-700">{sec}</p>
                  <ul className="space-y-0.5">{lines.filter((l) => (l.section ?? "Prestations") === sec).map((l) => <li key={l.id}>• {Number(l.qty) > 1 ? `${Number(l.qty)} × ` : ""}{l.label}{l.details ? <span className="text-ink-500"> ({l.details})</span> : ""}</li>)}</ul>
                </div>
              ))}
            </div>
          </section>
        )}
        {services.length > 0 && (
          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Intervenants</p>
            <ul className="space-y-0.5">{services.map((v) => <li key={v.id}>• {v.description}{supName.get(v.supplier_id) ? ` · ${supName.get(v.supplier_id)}` : ""}{v.service_time ? ` · arrivée ${v.service_time.slice(0, 5)}` : ""} <span className="text-xs text-ink-400">({SERVICE_STATUS[v.status].label.toLowerCase()})</span></li>)}</ul>
          </section>
        )}
        {proofs.length > 0 && (
          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Maquettes validées</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {proofs.map((p) => (
                <figure key={p.id} className="overflow-hidden rounded-lg border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {!p.file_path.endsWith(".pdf") && <img src={urls.get(p.file_path)} alt={p.title} className="aspect-[4/3] w-full object-cover" />}
                  <figcaption className="px-2 py-1 text-xs font-medium">{p.title}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}
        {showMoney && quote && (
          <section className="rounded-xl bg-sand-50 p-4 print:border print:border-line">
            <div className="flex flex-wrap justify-between gap-2 tabular-nums"><span>Total selon devis {quote.number}</span><b>{money2(quote.total_mad)} TTC</b></div>
            <div className="flex flex-wrap justify-between gap-2 tabular-nums"><span>Déjà réglé</span><span>{money2(paid)}</span></div>
            <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-1 font-bold tabular-nums"><span>Reste à régler</span><span>{money2(Math.max(Number(quote.total_mad) - paid, 0))}</span></div>
          </section>
        )}
        {e.notes && <section><p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Notes</p><p className="whitespace-pre-line">{e.notes}</p></section>}
        <DocFooter company={company} />
      </DocShell>
    </div>
  );
}
