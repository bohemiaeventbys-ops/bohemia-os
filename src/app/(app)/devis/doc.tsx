import type { ReactNode } from "react";
import { formatDate } from "@/lib/dates";
import { money2, type Client, type Company } from "@/lib/clients";

/** Mise en page commune des documents clients (devis, facture, contrat, récap) : imprimable en A4. */
export function DocShell({ children }: { children: ReactNode }) {
  return <article className="card mx-auto max-w-4xl space-y-8 bg-white p-6 text-[13px] leading-relaxed sm:p-12 print:max-w-none print:border-0 print:p-0 print:shadow-none">{children}</article>;
}

export function DocHeader({ company, kind, number, date, extra }: { company: Company | null; kind: string; number: string; date: string; extra?: ReactNode }) {
  return (
    <header className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-6 border-b-4 border-[#E5399B] pb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-bohemia.png" alt="Bohemia Event" className="h-20 w-auto" />
        <div className="text-right">
          <p className="text-2xl font-bold text-[#1FA9C9]">{kind} {number}</p>
          <p className="text-ink-500">Casablanca, le {formatDate(date)}</p>
          {extra}
        </div>
      </div>
      <div className="space-y-0.5 text-xs text-ink-500">
        <p className="text-sm font-bold text-ink">{company?.legal_name ?? "BOHEMIA EVENTS SARL"}</p>
        {company?.address && <p className="whitespace-pre-line italic">{company.address}</p>}
        {company?.phone && <p className="italic">Téléphone : {company.phone}</p>}
        {company?.ice && <p>ICE : {company.ice}</p>}
      </div>
    </header>
  );
}

export function ClientBlock({ client, event }: { client: Client | null; event?: { name: string; event_date: string; address: string | null } | null }) {
  return (
    <section className="grid gap-6 sm:grid-cols-2">
      <div className="rounded-xl bg-sand-50 p-4 print:border print:border-line">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Client</p>
        <p className="text-base font-semibold">{client?.name ?? "—"}</p>
        {client?.contact_name && <p>{client.contact_name}</p>}
        {client?.address && <p>{[client.address, client.city].filter(Boolean).join(", ")}</p>}
        {client?.phone && <p>{client.phone}</p>}
        {client?.ice && <p>ICE : {client.ice}</p>}
      </div>
      {event && (
        <div className="rounded-xl bg-sand-50 p-4 print:border print:border-line">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Événement</p>
          <p className="text-base font-semibold">{event.name}</p>
          <p>{formatDate(event.event_date)}</p>
          {event.address && <p>{event.address}</p>}
        </div>
      )}
    </section>
  );
}

export function LinesTable({ lines }: { lines: { id: string; section?: string | null; label: string; details: string | null; qty: number; unit_price: number }[] }) {
  let last: string | null | undefined = undefined;
  return (
    <table className="w-full">
      <thead>
        <tr className="border-b-2 border-ink text-left text-[11px] uppercase tracking-wider text-ink-500">
          <th className="py-2">Désignation</th><th className="w-14 py-2 text-center">Qté</th><th className="w-28 py-2 text-right">P.U. HT</th><th className="w-32 py-2 text-right">Total HT</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => {
          const head = l.section && l.section !== last ? l.section : null;
          last = l.section;
          return [
            head && <tr key={`${l.id}-h`}><td colSpan={4} className="pb-1 pt-4 text-xs font-bold uppercase tracking-wider text-rose-700">{head}</td></tr>,
            <tr key={l.id} className="border-b border-line/70 align-top">
              <td className="py-2 pr-3"><p className="font-medium">{l.label}</p>{l.details && <p className="text-xs text-ink-500">{l.details}</p>}</td>
              <td className="py-2 text-center tabular-nums">{Number(l.qty)}</td>
              <td className="py-2 text-right tabular-nums">{money2(l.unit_price)}</td>
              <td className="py-2 text-right font-medium tabular-nums">{money2(Number(l.qty) * Number(l.unit_price))}</td>
            </tr>,
          ];
        })}
      </tbody>
    </table>
  );
}

export function Totals({ rows }: { rows: [string, number, boolean?][] }) {
  return (
    <dl className="ml-auto w-full max-w-xs space-y-1 tabular-nums">
      {rows.map(([k, v, strong]) => (
        <div key={k} className={`flex justify-between gap-4 ${strong ? "border-t-2 border-ink pt-1.5 text-base font-bold" : ""}`}><dt className={strong ? "" : "text-ink-500"}>{k}</dt><dd>{money2(v)}</dd></div>
      ))}
    </dl>
  );
}

export function DocFooter({ company, signature = false }: { company: Company | null; signature?: boolean }) {
  return (
    <footer className="space-y-6">
      {signature && company?.signatory && (
        <p className="ml-auto w-full max-w-xs bg-sand-50 py-1 text-center text-xs text-ink-600">Signature {company.signatory}</p>
      )}
      <div className="grid gap-4 border-t border-ink pt-3 text-[11px] text-ink-500 sm:grid-cols-3 print:grid-cols-3">
        <div>
          <p className="mb-1 font-bold text-ink">Siège social</p>
          {company?.address && <p className="whitespace-pre-line">{company.address}</p>}
          {company?.ice && <p>ICE : {company.ice}</p>}
          {company?.if_number && <p>IF : {company.if_number}</p>}
          {company?.rc && <p>RC : {company.rc}</p>}
          {company?.patente && <p>Patente : {company.patente}</p>}
        </div>
        <div>
          <p className="mb-1 font-bold text-ink">Coordonnées</p>
          <p>{company?.company_name ?? "Bohemia Events"}</p>
          {company?.phone && <p>Téléphone : {company.phone}</p>}
          {company?.email && <p>E-mail : {company.email}</p>}
          {company?.website && <p className="text-[#1FA9C9] underline">{company.website}</p>}
        </div>
        <div>
          <p className="mb-1 font-bold text-ink">Détails bancaires</p>
          {company?.bank_name && <p>Banque : {company.bank_name}</p>}
          {company?.rib && <p>RIB : {company.rib}</p>}
        </div>
      </div>
      <div className="h-3 bg-[#E5399B] print:[print-color-adjust:exact]" />
    </footer>
  );
}
