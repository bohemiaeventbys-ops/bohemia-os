import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Check, MessageCircle, Palette, Plus, X } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input, Textarea } from "@/components/ui/field";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedUrls } from "@/lib/storage";
import { addDays, formatDate, formatDateTime } from "@/lib/dates";
import { PRODUCTION_STEPS, PROOF_BUCKET, PROOF_STATUS, type DesignProof } from "@/lib/clients";
import { waLink } from "@/lib/suppliers";
import type { EventRow } from "@/lib/types";
import { cancelProof, decideProof, uploadProof } from "./actions";

export const metadata = { title: "Conception" };

export default async function ConceptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireSession();
  const supabase = await createClient();
  const { data: e } = await supabase.from("events").select("*").eq("id", id).maybeSingle<EventRow>();
  if (!e) notFound();
  const { data } = await supabase.from("design_proofs").select("*").eq("event_id", id).order("created_at", { ascending: false });
  const proofs = (data ?? []) as DesignProof[];
  const urls = await signedUrls(supabase, PROOF_BUCKET, proofs.map((p) => p.file_path));
  const canEdit = s.can("design.manage") || s.can("events.manage");
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const phone = e.client_phone;
  const active = proofs.filter((p) => p.status !== "annule");
  const old = proofs.filter((p) => p.status === "annule");

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow={<Link href={`/evenements/${id}`} className="hover:underline">{e.name}</Link>} title="Conception de la déco"
        subtitle="Le graphiste dépose la maquette, la cliente la valide depuis son téléphone, et la production démarre toute seule." />

      {canEdit && (
        <Card className="mb-6">
          <details open={active.length === 0}>
            <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 font-semibold text-rose-700"><Plus className="h-5 w-5" /> Ajouter une maquette (ou une nouvelle version)</summary>
            <CardBody className="border-t border-line">
              <ActionForm action={uploadProof} resetOnSuccess className="space-y-4">
                <input type="hidden" name="event_id" value={id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nom" hint="Même nom = nouvelle version"><Input name="title" required placeholder="Ex. Panneau de bienvenue, Arche, Plan de table" list="proof-titles" /></Field>
                  <Field label="Fichier (image ou PDF)"><input type="file" name="file" required accept="image/*,application/pdf" className="field py-2.5" /></Field>
                </div>
                <datalist id="proof-titles">{Array.from(new Set(proofs.map((p) => p.title))).map((t) => <option key={t} value={t} />)}</datalist>
                <Field label="Message pour la cliente (facultatif)"><Textarea name="note" rows={2} placeholder="Ex. Voici la version avec les prénoms en doré, comme convenu." /></Field>
                <fieldset>
                  <legend className="label">Après validation, il faudra :</legend>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(PRODUCTION_STEPS).map(([k, v]) => (
                      <label key={k} className="cursor-pointer rounded-full bg-paper px-3.5 py-2 text-sm ring-1 ring-line has-[:checked]:bg-ink has-[:checked]:text-ivory has-[:checked]:ring-ink">
                        <input type="checkbox" name="steps" value={k} defaultChecked={k === "impression" || k === "pose"} className="sr-only" />{v}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <Field label="Fabrication terminée pour le" className="max-w-xs"><Input name="production_due" type="date" defaultValue={addDays(e.event_date, -2)} /></Field>
                <SubmitButton size="lg">Ajouter la maquette</SubmitButton>
              </ActionForm>
            </CardBody>
          </details>
        </Card>
      )}

      {active.length === 0 ? <Card><Empty icon={<Palette className="h-8 w-8" />} title="Pas encore de maquette pour cet événement." /></Card> : (
        <div className="grid gap-6 md:grid-cols-2">
          {active.map((p) => {
            const url = urls.get(p.file_path);
            const link = `${origin}/validation/${p.share_token}`;
            const msg = `Bonjour, voici la maquette « ${p.title} » pour ${e.name}. Vous pouvez la valider ou demander une modification ici : ${link}`;
            const wa = phone ? `${waLink(phone)}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
            return (
              <Card key={p.id} className="overflow-hidden">
                <a href={url} target="_blank" rel="noreferrer" className="block bg-sand-50">
                  {p.file_path.endsWith(".pdf")
                    ? <span className="flex aspect-[4/3] items-center justify-center text-sm font-semibold text-ink-500">PDF · ouvrir</span>
                    // eslint-disable-next-line @next/next/no-img-element
                    : <img src={url} alt={p.title} className="aspect-[4/3] w-full object-contain" />}
                </a>
                <CardBody className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div><p className="text-lg font-semibold">{p.title}</p><p className="text-xs text-ink-400">Version {p.version} · {formatDateTime(p.created_at)}</p></div>
                    <Badge tone={PROOF_STATUS[p.status].tone}>{PROOF_STATUS[p.status].label}</Badge>
                  </div>
                  {p.production_steps.length > 0 && <p className="text-sm text-ink-500">Ensuite : {p.production_steps.map((x) => PRODUCTION_STEPS[x]).join(", ")}{p.production_due ? ` · prêt le ${formatDate(p.production_due)}` : ""}</p>}
                  {p.client_comment && <p className={`rounded-lg p-3 text-sm ${p.status === "valide" ? "bg-sage-50" : "bg-clay-50"}`}>« {p.client_comment} »</p>}
                  {p.status === "valide" && <p className="text-sm text-sage-700">Validée le {formatDateTime(p.decided_at)}. Les tâches de production sont dans le planning.</p>}
                  {p.status === "a_valider" && canEdit && (
                    <>
                      <a href={wa} target="_blank" rel="noreferrer" className={buttonClass("success", "lg", "w-full")}><MessageCircle className="h-5 w-5" /> Envoyer à la cliente sur WhatsApp</a>
                      <p className="break-all text-xs text-ink-400">{link}</p>
                      <details className="text-sm">
                        <summary className="cursor-pointer text-ink-500">La cliente a répondu autrement (téléphone, en personne) ?</summary>
                        <ActionForm action={decideProof} className="mt-2 space-y-2">
                          <input type="hidden" name="id" value={p.id} />
                          <Input name="comment" placeholder="Sa réponse (obligatoire si modification)" />
                          <div className="grid grid-cols-2 gap-2">
                            <SubmitButton name="decision" value="ok" variant="success"><Check className="h-4 w-4" /> Validée</SubmitButton>
                            <SubmitButton name="decision" value="non" variant="danger"><X className="h-4 w-4" /> À modifier</SubmitButton>
                          </div>
                        </ActionForm>
                      </details>
                    </>
                  )}
                  {canEdit && p.status !== "valide" && (
                    <ActionForm action={cancelProof}><input type="hidden" name="id" value={p.id} /><SubmitButton variant="ghost" size="sm">Retirer</SubmitButton></ActionForm>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
      {old.length > 0 && <p className="mt-6 text-sm text-ink-400">{old.length} ancienne(s) version(s) conservée(s) dans l&apos;historique.</p>}
    </div>
  );
}
