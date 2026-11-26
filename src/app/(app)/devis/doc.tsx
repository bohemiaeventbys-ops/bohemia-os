import type { ReactNode } from "react";
import { formatDate } from "@/lib/dates";
import { money2, type Client, type Company } from "@/lib/clients";

/** Mise en page commune des documents clients (devis, facture, contrat, récap) : imprimable en A4. */
export function DocShell({ children }: { children: ReactNode }) {
  return <article className="card mx-auto max-w-4xl space-y-8 bg-white p-6 text-[13px] leading-relaxed sm:p-12 print:max-w-none print:border-0 print:p-0 print:shadow-none">{children}</article>;
}

export function DocHeader({ company, kind, number, date, extra }: { company: Company | null; kind: string; number: string; date: string; extra?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-6 border-b border-line pb-6">
      <div>
        <p className="font-display text-3xl font-semibold tracking-[0.16em]">BOHEMIA</p>
        <p className="text-[11px] uppercase tracking-[0.3em] text-ink-400">Events</p>
        <div className="mt-3 space-y-0.5 text-xs text-ink-500">
          {company?.legal_name && <p className="font-semibold text-ink-600">{company.legal_name}</p>}
          {company?.address && <p className="whitespace-pre-line">{company.address}</p>}
          {company?.phone && <p>{company.phone}</p>}
          {company?.email && <p>{company.email}</p>}
        </div>
      </div>
      <div className="text-right">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-rose-600">{kind}</p>
        <p className="mt-1 font-display text-3xl font-semibold">N° {number}</p>
        <p className="text-ink-500">Casablanca, le {formatDate(date)}</p>
        {extra}
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

export function DocFooter({ company }: { company: Company | null }) {
  const ids = [company?.ice && `ICE ${company.ice}`, company?.rc && `RC ${company.rc}`, company?.if_number && `IF ${company.if_number}`, company?.patente && `Patente ${company.patente}`].filter(Boolean);
  const bank = [company?.bank_name, company?.rib && `RIB ${company.rib}`].filter(Boolean);
  if (!ids.length && !bank.length) return null;
  return (
    <footer className="border-t border-line pt-4 text-center text-[11px] text-ink-400">
      {ids.length > 0 && <p>{company?.legal_name} · {ids.join(" · ")}</p>}
      {bank.length > 0 && <p>{bank.join(" · ")}</p>}
    </footer>
  );
}
