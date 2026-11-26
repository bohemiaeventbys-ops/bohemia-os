import Link from "next/link";
import { notFound } from "next/navigation";
import { FileSignature } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Textarea } from "@/components/ui/field";
import { PrintButton } from "@/components/print-button";
import { requirePerm } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedUrls } from "@/lib/storage";
import { formatDate, formatDateTime } from "@/lib/dates";
import { CLIENT_DOCS_BUCKET, CONTRACT_STATUS, money2, type Client, type Company, type Contract, type Quote } from "@/lib/clients";
import type { EventRow } from "@/lib/types";
import { saveContract, setContractStatus } from "../../devis/actions";
import { ClientBlock, DocFooter, DocHeader, DocShell } from "../../devis/doc";

export const metadata = { title: "Contrat" };

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePerm("finance.view");
  const supabase = await createClient();
  const { data: c } = await supabase.from("contracts").select("*").eq("id", id).maybeSingle<Contract>();
  if (!c) notFound();
  const [{ data: company }, { data: client }, { data: event }, { data: quote }] = await Promise.all([
    supabase.from("company_settings").select("*").single<Company>(),
    c.client_id ? supabase.from("clients").select("*").eq("id", c.client_id).maybeSingle<Client>() : Promise.resolve({ data: null }),
    c.event_id ? supabase.from("events").select("*").eq("id", c.event_id).maybeSingle<EventRow>() : Promise.resolve({ data: null }),
    c.quote_id ? supabase.from("quotes").select("*").eq("id", c.quote_id).maybeSingle<Quote>() : Promise.resolve({ data: null }),
  ]);
  const urls = await signedUrls(supabase, CLIENT_DOCS_BUCKET, [c.signed_file_path]);
  const signed = c.signed_file_path ? urls.get(c.signed_file_path) : undefined;
  const ev = event as EventRow | null;

  return (
    <div className="space-y-6">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 print:hidden">
        <span className="flex items-center gap-3 text-sm">
          {quote && <Link href={`/devis/${quote.id}`} className="link">← Devis {quote.number}</Link>}
          <Badge tone={CONTRACT_STATUS[c.status].tone}>{CONTRACT_STATUS[c.status].label}</Badge>
        </span>
        <PrintButton />
      </div>

      <Card className="mx-auto max-w-4xl print:hidden">
        <CardHeader icon={<FileSignature />} tone="rose" title="Où en est le contrat ?" subtitle="Imprimez-le ou enregistrez-le en PDF, faites-le signer, puis ajoutez la photo du contrat signé." />
        <CardBody className="flex flex-wrap items-end gap-3">
          {c.status === "brouillon" && (
            <ActionForm action={setContractStatus}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="status" value="envoye" /><SubmitButton size="lg">Envoyé au client</SubmitButton></ActionForm>
          )}
          {c.status !== "signe" && c.status !== "annule" && (
            <ActionForm action={setContractStatus} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={c.id} /><input type="hidden" name="status" value="signe" />
              <label className="text-sm"><span className="label">Photo ou PDF du contrat signé</span><input type="file" name="file" accept="image/*,application/pdf" capture="environment" className="block text-sm" /></label>
              <SubmitButton size="lg" variant="success">Contrat signé</SubmitButton>
            </ActionForm>
          )}
          {c.status === "signe" && <p className="text-sm">Signé le {formatDate(c.signed_at)}. {signed && <a href={signed} target="_blank" rel="noreferrer" className="link">Voir le contrat signé</a>}</p>}
        </CardBody>
        {c.status !== "signe" && (
          <details className="border-t border-line">
            <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-rose-700">Modifier le texte du contrat</summary>
            <CardBody className="border-t border-line">
              <ActionForm action={saveContract} className="space-y-3">
                <input type="hidden" name="id" value={c.id} />
                <Textarea name="body" rows={18} defaultValue={c.body} className="font-mono text-xs" />
                <SubmitButton>Enregistrer</SubmitButton>
              </ActionForm>
            </CardBody>
          </details>
        )}
      </Card>

      <DocShell>
        <DocHeader company={company} kind="Contrat de prestation" number={c.number} date={c.created_at.slice(0, 10)} />
        <section className="space-y-2">
          <p><b>Entre</b> {company?.legal_name ?? "Bohemia Events"}{company?.address ? `, ${company.address.replace(/\n/g, ", ")}` : ""}{company?.ice ? `, ICE ${company.ice}` : ""}, ci-après « le prestataire »,</p>
          <p><b>Et</b> {client?.name ?? "—"}{client?.address ? `, ${client.address}` : ""}{client?.phone ? `, tél. ${client.phone}` : ""}, ci-après « le client ».</p>
        </section>
        <ClientBlock client={client} event={ev} />
        {ev && (
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([["Installation", ev.setup_at], ["Début", ev.start_at], ["Fin", ev.end_at], ["Démontage", ev.teardown_at]] as [string, string | null][]).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-sand-50 px-3 py-2 print:border print:border-line"><p className="text-[11px] text-ink-400">{k}</p><p className="font-semibold">{v ? formatDateTime(v) : "—"}</p></div>
            ))}
          </section>
        )}
        {quote && <p className="font-medium">Montant total : {money2(quote.total_mad)} TTC, selon le devis n° {quote.number}.</p>}
        <section className="whitespace-pre-line">{c.body}</section>
        <section className="grid gap-6 pt-4 sm:grid-cols-2">
          {["Le prestataire", "Le client"].map((w) => (
            <div key={w} className="rounded-xl border border-dashed border-line p-4"><p className="font-semibold">{w}</p><p className="text-xs text-ink-400">Signature précédée de « lu et approuvé »</p><div className="h-20" /></div>
          ))}
        </section>
        <DocFooter company={company} />
      </DocShell>
    </div>
  );
}
