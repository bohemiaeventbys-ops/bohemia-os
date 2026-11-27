import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, FileText, Lock, Mail, MapPin, Pencil, Phone, Plus, User } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
import { formatMAD } from "@/lib/format";
import { EVENT_STATUS, EVENT_TYPE } from "@/lib/labels";
import { INVOICE_KIND, INVOICE_STATUS, QUOTE_STATUS, type Client, type Invoice, type Quote } from "@/lib/clients";
import type { EventRow } from "@/lib/types";
import { ContactButtons } from "../../fournisseurs/contact-buttons";

export const metadata = { title: "Client" };

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requirePerm(["clients.manage", "events.manage", "finance.view"]);
  const supabase = await createClient();
  const { data: c } = await supabase.from("clients").select("*").eq("id", id).maybeSingle<Client>();
  if (!c) notFound();
  const fin = s.can("finance.view");
  const [{ data: ev }, { data: qu }, { data: inv }] = await Promise.all([
    supabase.from("events").select("*").eq("client_id", id).order("event_date", { ascending: false }),
    fin ? supabase.from("quotes").select("*").eq("client_id", id).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    fin ? supabase.from("invoices").select("*").eq("client_id", id).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  const events = (ev ?? []) as EventRow[];
  const quotes = (qu ?? []) as Quote[];
  const invoices = (inv ?? []) as Invoice[];
  const due = invoices.filter((i) => i.status !== "annulee").reduce((a, i) => a + Number(i.total_mad) - Number(i.paid_mad), 0);

  return (
    <>
      <PageHeader eyebrow={<Link href="/clients" className="hover:underline">Clients</Link>} title={c.name}
        subtitle={[c.kind === "entreprise" ? "Entreprise" : "Particulier", c.source ? `Connu par : ${c.source}` : null].filter(Boolean).join(" · ")}
        actions={<>
          <ContactButtons s={c} size="lg" />
          <ButtonLink href={`/clients/${id}/modifier`} variant="secondary" size="lg"><Pencil className="h-4 w-4" /> Modifier</ButtonLink>
        </>} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader icon={<CalendarDays />} tone="rose" title="Ses événements" subtitle={`${events.length} événement(s)`}
              action={s.can("events.manage") && <ButtonLink href={`/evenements/nouveau?client=${id}`} size="sm" variant="secondary"><Plus className="h-4 w-4" /> Événement</ButtonLink>} />
            {events.length === 0 ? <Empty title="Pas encore d'événement." /> : (
              <ul className="divide-y divide-line">
                {events.map((e) => (
                  <li key={e.id}>
                    <Link href={`/evenements/${e.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-sand-50">
                      <span className="min-w-0 flex-1"><span className="block font-semibold">{e.name}</span><span className="block text-sm text-ink-500">{formatDate(e.event_date)} · {EVENT_TYPE[e.event_type]}</span></span>
                      <Badge tone={EVENT_STATUS[e.status].tone}>{EVENT_STATUS[e.status].label}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {fin && (
            <Card>
              <CardHeader icon={<FileText />} tone="ink" title="Devis et factures" subtitle="Confidentiel : Direction et commerciale" />
              {quotes.length + invoices.length === 0 ? <Empty title="Aucun document." /> : (
                <ul className="divide-y divide-line">
                  {quotes.map((q) => (
                    <li key={q.id}><Link href={`/devis/${q.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-sand-50">
                      <span className="min-w-0 flex-1"><span className="block font-semibold">Devis {q.number}</span><span className="block text-sm text-ink-500">{q.title} · {formatDate(q.issue_date)}</span></span>
                      <span className="font-semibold tabular-nums">{formatMAD(q.total_mad)}</span><Badge tone={QUOTE_STATUS[q.status].tone}>{QUOTE_STATUS[q.status].label}</Badge>
                    </Link></li>
                  ))}
                  {invoices.map((i) => (
                    <li key={i.id}><Link href={`/factures/${i.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-sand-50">
                      <span className="min-w-0 flex-1"><span className="block font-semibold">{INVOICE_KIND[i.kind]} {i.number}</span><span className="block text-sm text-ink-500">{formatDate(i.issue_date)}</span></span>
                      <span className="font-semibold tabular-nums">{formatMAD(i.total_mad)}</span><Badge tone={INVOICE_STATUS[i.status].tone}>{INVOICE_STATUS[i.status].label}</Badge>
                    </Link></li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Coordonnées" />
            <CardBody className="space-y-3 text-sm">
              {c.contact_name && <p className="flex gap-2"><User className="h-4 w-4 text-ink-300" />{c.contact_name}</p>}
              {c.phone && <p className="flex gap-2 tabular-nums"><Phone className="h-4 w-4 text-ink-300" />{c.phone}</p>}
              {c.email && <p className="flex gap-2"><Mail className="h-4 w-4 text-ink-300" /><a className="link" href={`mailto:${c.email}`}>{c.email}</a></p>}
              {(c.address || c.city) && <p className="flex gap-2"><MapPin className="h-4 w-4 text-ink-300" />{[c.address, c.city].filter(Boolean).join(", ")}</p>}
              {c.ice && <p><span className="text-ink-400">ICE :</span> {c.ice}</p>}
              {c.notes && <p className="whitespace-pre-line rounded-xl bg-sand-50 p-3 text-ink-600">{c.notes}</p>}
            </CardBody>
          </Card>
          {fin && invoices.length > 0 && (
            <Card className="border-ochre-200">
              <CardHeader icon={<Lock />} tone="ochre" title="Reste à encaisser" />
              <CardBody><p className={`font-display text-3xl font-semibold ${due > 0 ? "text-clay-700" : "text-sage-700"}`}>{formatMAD(Math.max(due, 0))}</p></CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
