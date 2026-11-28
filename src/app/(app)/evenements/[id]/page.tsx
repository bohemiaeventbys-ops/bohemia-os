import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CalendarClock, Calculator, FileText, Hammer, Lock, PackagePlus, Pencil, Plus, Sparkles, Warehouse } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { buttonClass } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { generateEventTasks } from "../../parametres/taches-auto/actions";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedUrls } from "@/lib/storage";
import { diffDays, formatDate, formatDateTime, formatDayLong, todayISO } from "@/lib/dates";
import { formatMAD } from "@/lib/format";
import { DONE_STATUSES, EVENT_STATUS, EVENT_TYPE } from "@/lib/labels";
import { sortTasks } from "@/lib/tasks";
import { eventCalc } from "@/lib/calc";
import { PROOF_BUCKET } from "@/lib/clients";
import { LINE_STATUS, STOCK_BUCKET, type EventItem, type StockItem } from "@/lib/stock";
import type { Employee, EventRow, Task } from "@/lib/types";
import { TaskTable } from "../../taches/task-row";
import { saveGuests } from "../actions";
import { ServicesCard } from "./services-card";
import { ClientDocsCard } from "./client-docs-card";
import { MaterialsCard } from "./materials-card";
import { TeamCard } from "./team-card";
import { DesignUpload } from "./design-upload";
import { DesignValidations, Inspirations, Zoomable } from "./event-widgets";
import { PrintChoice } from "@/components/print-choice";
import { designState, isPdf, type Proof } from "@/lib/design";
import { fullName } from "@/lib/format";

export default async function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ reserve?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const s = await requireSession();
  const supabase = await createClient();
  const { data: e } = await supabase.from("events").select("*").eq("id", id).maybeSingle<EventRow>();
  if (!e) notFound();
  const canEdit = s.can("events.manage");
  const canDesign = canEdit || s.can("design.manage");
  const canMove = canEdit || s.can("stock.move") || s.can("stock.manage");
  const showMoney = s.can("finance.view");

  const [{ data: staff }, { data: taskData }, { data: lineData }, { data: proofData }, { data: inspData }, { data: missing }] = await Promise.all([
    supabase.from("employees").select("*").eq("status", "actif").order("first_name"),
    supabase.from("tasks").select("*").eq("event_id", id),
    supabase.from("event_items").select("*").eq("event_id", id).order("created_at"),
    supabase.from("design_proofs").select("*").eq("event_id", id).neq("status", "annule").order("created_at", { ascending: false }),
    supabase.from("event_inspirations").select("id, file_path, is_cover").eq("event_id", id).order("created_at"),
    supabase.from("field_docs").select("item_id").eq("event_id", id).eq("kind", "manque"),
  ]);
  const people = (staff ?? []) as Employee[];
  const tasks = sortTasks((taskData ?? []) as Task[]);
  const done = tasks.filter((t) => DONE_STATUSES.includes(t.status)).length;
  const lines = (lineData ?? []) as EventItem[];
  const proofs = (proofData ?? []) as Proof[];
  const { reference, pending, main, history, fullyApproved } = designState(proofs);
  const missingItems = new Set((missing ?? []).map((m) => m.item_id as string));
  const { data: itemData } = lines.length ? await supabase.from("stock_items").select("*").in("id", lines.map((l) => l.item_id)) : { data: [] };
  const items = new Map(((itemData ?? []) as StockItem[]).map((i) => [i.id, i]));
  const [proofUrls, inspUrls, stockUrls] = await Promise.all([
    signedUrls(supabase, PROOF_BUCKET, [main?.file_path, main?.preview_path, main?.client_proof_path, pending?.preview_path, pending?.file_path, pending?.client_proof_path, ...history.slice(0, 8).flatMap((h) => [h.file_path, h.preview_path])]),
    signedUrls(supabase, PROOF_BUCKET, (inspData ?? []).map((i) => i.file_path as string)),
    signedUrls(supabase, STOCK_BUCKET, [...items.values()].map((i) => i.photo_path).concat(lines.map((l) => l.ref_photo_path ?? null))),
  ]);
  const staffMap = new Map(people.map((p) => [p.id, p]));
  const validations = (p: Proof) => ({
    graphic: p.graphic_ok_at ? { at: p.graphic_ok_at, by: p.graphic_ok_by ? (staffMap.get(p.graphic_ok_by) ? fullName(staffMap.get(p.graphic_ok_by)!) : "Infographiste") : null } : null,
    client: p.status === "valide" ? { at: p.decided_at, proofUrl: p.client_proof_path ? proofUrls.get(p.client_proof_path) ?? null : null } : null,
  });
  const calc = showMoney ? await eventCalc(supabase, id, e.client_id ?? null) : null;
  const days = diffDays(e.event_date, todayISO());
  const status = EVENT_STATUS[e.status];

  const proofImg = (p: Proof | null) => {
    if (!p) return null;
    const pdf = isPdf(p.file_path);
    return { img: pdf ? (p.preview_path ? proofUrls.get(p.preview_path) : null) : proofUrls.get(p.file_path), file: proofUrls.get(p.file_path), pdf };
  };
  const mainImg = proofImg(main);
  const pendingImg = pending ? proofImg(pending) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* En-tête : l'essentiel, une seule fois */}
      <header className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Badge tone={status.tone}>{status.label}</Badge>
              {days >= 0 && days <= 2 && <Badge tone="clay">{days === 0 ? "Aujourd'hui" : `J-${days}`}</Badge>}
              <span className="text-xs font-semibold text-ink-400">{EVENT_TYPE[e.event_type]}</span>
            </div>
            <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{e.name}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && <Link href={`/evenements/${id}/modifier`} className={buttonClass("secondary", "md")}><Pencil className="h-4 w-4" /> Modifier</Link>}
            <PrintChoice eventId={id} />
          </div>
        </div>
        <dl className="mt-4 grid gap-3 text-[15px] sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Client">{e.client_name ?? <Todo />}</Fact>
          <Fact label="Lieu">{e.address ?? <Todo />}</Fact>
          <Fact label="Date">{formatDayLong(e.event_date)}</Fact>
          <Fact label="Personnes">
            {canEdit ? (
              <ActionForm action={saveGuests} className="flex items-center gap-1.5">
                <input type="hidden" name="id" value={id} />
                <input name="guests" type="number" min={0} inputMode="numeric" defaultValue={e.guests ?? ""} placeholder="À renseigner" className="field h-10 w-28 text-center text-lg font-bold" />
                <SubmitButton size="sm" variant="secondary">OK</SubmitButton>
              </ActionForm>
            ) : e.guests ? <b className="text-xl">{e.guests}</b> : <Todo />}
          </Fact>
        </dl>
      </header>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {/* Design de l'événement */}
          <Card>
            <div id="design" className="scroll-mt-24" />
            <CardHeader icon={<Sparkles />} tone="rose" title="Design de l'événement"
              subtitle={fullyApproved ? "✓ Validé deux fois : c'est la référence pour l'installation" : reference ? "Approuvé par la cliente, à valider par l'infographiste" : main ? "En attente des validations" : "Pas encore de design"}
              action={canDesign ? <DesignUpload eventId={id} kind="design" /> : undefined} />
            {main && mainImg ? (
              <div className="space-y-3 p-5">
                <div className={`overflow-hidden rounded-2xl ring-2 ${fullyApproved ? "ring-sage-400" : "ring-ochre-300"}`}>
                  {mainImg.img ? <Zoomable src={mainImg.img} alt={main.title} href={mainImg.file ?? undefined} />
                    : mainImg.file ? <a href={mainImg.file} target="_blank" rel="noreferrer" className="flex h-40 items-center justify-center gap-2 bg-sand-50 font-bold"><FileText className="h-6 w-6" /> Ouvrir le PDF du design</a> : null}
                  <p className={`px-4 py-2 text-sm font-bold ${fullyApproved ? "bg-sage-100 text-sage-800" : "bg-ochre-100 text-ochre-700"}`}>
                    {fullyApproved ? "✓ Design approuvé pour l'installation" : "⏳ En attente"} · {main.title} v{main.version}{mainImg.pdf ? " · PDF" : ""}
                  </p>
                </div>
                <DesignValidations eventId={id} proofId={main.id} canEdit={canDesign} {...validations(main)} />
                {pending && pendingImg && (
                  <div className="space-y-3 rounded-2xl bg-ochre-50 p-3 ring-1 ring-ochre-200">
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {pendingImg.img ? <img src={pendingImg.img} alt="" className="h-20 w-20 rounded-lg object-cover" /> : <span className="grid h-20 w-20 place-items-center rounded-lg bg-paper"><FileText className="h-6 w-6" /></span>}
                      <p className="flex-1 text-sm"><b>Nouvelle version en attente</b> (v{pending.version}).<br />L&apos;installation garde le design approuvé ci-dessus tant que celle-ci n&apos;a pas ses deux validations.</p>
                    </div>
                    <DesignValidations eventId={id} proofId={pending.id} canEdit={canDesign} {...validations(pending)} />
                  </div>
                )}
              </div>
            ) : <Empty title="Aucun design pour l'instant.">{canDesign ? "Touchez « Ajouter un fichier » (image ou PDF)." : "Le graphisme l'ajoutera ici."}</Empty>}
            <div className="border-t border-line px-5 py-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-ink-600">Photos d&apos;inspiration{(inspData ?? []).length ? ` (${(inspData ?? []).length})` : ""}</p>
                {canDesign && <DesignUpload eventId={id} kind="inspiration" />}
              </div>
              {(inspData ?? []).length > 0
                ? <Inspirations eventId={id} canEdit={canDesign} list={(inspData ?? []).map((i) => ({ id: i.id as string, is_cover: i.is_cover as boolean, url: inspUrls.get(i.file_path as string) ?? null }))} />
                : <p className="text-sm text-ink-400">Aucune photo pour l&apos;instant.</p>}
            </div>
            {history.length > 0 && (
              <details className="border-t border-line px-5 py-3 text-sm">
                <summary className="cursor-pointer font-semibold text-ink-500">Versions précédentes ({history.length})</summary>
                <ul className="mt-2 space-y-1">
                  {history.map((h) => (
                    <li key={h.id} className="flex items-center justify-between gap-2">
                      <a href={proofUrls.get(h.file_path) ?? "#"} target="_blank" rel="noreferrer" className="link">{h.title} v{h.version}</a>
                      <span className="text-xs text-ink-400">{formatDate(h.created_at)} · {h.status === "valide" ? "approuvée" : h.status === "annule" ? "remplacée" : h.status === "a_modifier" ? "à modifier" : "en attente"}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>

          {/* Mobilier et matériel à prendre */}
          <Card>
            <div id="materiel" className="scroll-mt-24" />
            <CardHeader icon={<Warehouse />} tone="ochre" title="Mobilier et matériel à prendre"
              subtitle={lines.length ? `${lines.length} article(s) · ${lines.reduce((a, l) => a + l.qty, 0)} pièces réservées` : "Rien de sélectionné"}
              action={canMove ? <Link href={`/evenements/${id}/materiel/choisir`} className={buttonClass("secondary", "md")}><PackagePlus className="h-5 w-5" /> Ajouter depuis le stock</Link> : undefined} />
            {sp.reserve && <p className="mx-5 mt-3 rounded-xl bg-sage-100 px-3 py-2 text-sm font-bold text-sage-800">✓ {sp.reserve} article(s) enregistré(s) : le magasinier les voit dans « Terrain ».</p>}
            {lines.length === 0 ? <Empty title="Aucun article sélectionné.">{canMove ? "Touchez « Ajouter depuis le stock »." : ""}</Empty> : (
              <ul className="divide-y divide-line">
                {lines.map((l) => {
                  const i = items.get(l.item_id);
                  const ph = i?.photo_path ? stockUrls.get(i.photo_path) : null;
                  const ref = l.ref_photo_path ? stockUrls.get(l.ref_photo_path) : null;
                  const short = (l.qty_short ?? 0) > 0;
                  const miss = short || missingItems.has(l.item_id);
                  const st = miss ? { label: short ? `Manquant : ${l.qty_short}` : "Manquant", cls: "bg-clay-100 text-clay-700" }
                    : l.status === "reserve" ? { label: "Réservé", cls: "bg-mist-100 text-mist-700" } : { label: LINE_STATUS[l.status].label, cls: "bg-teal-100 text-teal-700" };
                  const specs = [i?.shape, i?.dimensions, i?.material].filter(Boolean).join(" · ");
                  const asks = [l.color && `Couleur : ${l.color}`, l.finish && `Finition : ${l.finish}`, l.vinyl && `Vinyle : ${l.vinyl}`, l.zone && `Zone : ${l.zone}`].filter(Boolean);
                  return (
                    <li key={l.id} className="flex items-start gap-3 px-5 py-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {ph ? <img src={ph} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" /> : <span className="h-14 w-14 shrink-0 rounded-lg bg-sand-100" />}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold leading-tight">{i?.name ?? "Article"}{i?.code && <span className="ms-2 font-mono text-xs font-bold text-ink-500">{i.code}</span>}</p>
                        {specs && <p className="text-xs text-ink-500">{specs}</p>}
                        {asks.length > 0 && <p className="mt-0.5 text-sm text-ink-600">{asks.join(" · ")}</p>}
                        <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${st.cls}`}>{miss && <AlertTriangle className="me-1 inline h-3 w-3" />}{st.label}</span>
                        {short && canMove && <Link href={`/evenements/${id}/materiel/choisir?cat=${i?.category_id ?? ""}`} className="ms-2 text-xs font-semibold text-clay-700 underline">Choisir un autre modèle</Link>}
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {ref && <img src={ref} alt="Référence" className="h-14 w-14 shrink-0 rounded-lg object-cover ring-2 ring-ochre-300" />}
                      <span className="w-12 shrink-0 text-end text-xl font-bold tabular-nums">×{l.qty}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {canMove && lines.length > 0 && <div className="border-t border-line px-5 py-3"><Link href={`/evenements/${id}/materiel`} className="link text-sm font-semibold">Consignes et suivi au dépôt →</Link></div>}
          </Card>

          <TeamCard eventId={id} eventDate={e.event_date} canEdit={canEdit} people={people} />

          <div id="prestataires" className="scroll-mt-24"><ServicesCard eventId={id} eventDate={e.event_date} s={s} event={e} /></div>

          <MaterialsCard eventId={id} canEdit={canMove} />

          {/* Moins utilisé : replié */}
          <Fold icon={<CalendarClock className="h-5 w-5" />} title="Horaires, accès et notes">
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <Fact label="Chargement">{formatDateTime(e.load_at ?? null)}</Fact>
              <Fact label="Livraison">{formatDateTime(e.delivery_at)}</Fact>
              <Fact label="Installation">{formatDateTime(e.setup_at)}</Fact>
              <Fact label="Début">{formatDateTime(e.start_at)}</Fact>
              <Fact label="Fin">{formatDateTime(e.end_at)}</Fact>
              <Fact label="Démontage">{formatDateTime(e.teardown_at)}</Fact>
              <Fact label="Contact sur place">{[e.site_contact_name, e.site_contact_phone].filter(Boolean).join(" · ") || "—"}</Fact>
              <Fact label="Accès" className="sm:col-span-2">{e.access_notes ?? "—"}</Fact>
              {e.notes && <Fact label="Notes" className="sm:col-span-3"><p className="whitespace-pre-line">{e.notes}</p></Fact>}
            </dl>
          </Fold>
          <Fold icon={<Hammer className="h-5 w-5" />} title={`Tâches (${done}/${tasks.length} terminées)`}>
            <div className="-mx-5">
              {(canEdit || s.can("tasks.create")) && (
                <div className="flex flex-wrap gap-2 px-5 pb-3">
                  <ActionForm action={generateEventTasks}><input type="hidden" name="id" value={id} /><SubmitButton size="sm" variant="secondary"><Sparkles className="h-3.5 w-3.5" /> Créer les tâches manquantes</SubmitButton></ActionForm>
                  <Link href={`/taches/nouvelle?evenement=${id}&date=${e.event_date}`} className={buttonClass("secondary", "sm")}><Plus className="h-3.5 w-3.5" /> Tâche</Link>
                </div>
              )}
              {tasks.length === 0 ? <Empty title="Aucune tâche liée." /> : <TaskTable tasks={tasks} people={new Map(people.map((p) => [p.id, p]))} events={new Map()} showEvent={false} />}
            </div>
          </Fold>
        </div>

        <div className="space-y-5">
          {calc && (
            <Card className="border-ochre-200">
              <CardHeader icon={<Calculator />} tone="ochre" title={<span className="flex items-center gap-2">Calcul <Lock className="h-4 w-4 text-ochre-700" /></span>}
                subtitle={`Automatique · ${calc.showTTC ? "client professionnel : vue TTC" : "client particulier : vue HT"}`} />
              <CardBody className="space-y-3 text-sm">
                <Row label={`Vendu ${calc.showTTC ? "TTC" : "HT"}`} v={calc.showTTC ? calc.soldTTC : calc.soldHT} strong />
                {calc.showTTC ? <Row label="dont TVA" v={calc.soldVAT} muted /> : calc.soldVAT > 0 && <Row label="TTC facturé" v={calc.soldTTC} muted />}
                <Row label="Coût total HT" v={calc.costHT} />
                <Row label="Encaissé" v={calc.received} tone="text-sage-700" strong />
                <Row label="Reste à encaisser" v={calc.remaining} tone={calc.remaining > 0 ? "text-clay-700" : "text-sage-700"} strong />
                <div className="rounded-xl bg-ochre-50 p-3">
                  <Row label="Résultat (HT)" v={calc.margin} strong tone={calc.margin >= 0 ? "text-sage-700" : "text-clay-700"} />
                  <p className="mt-1 text-xs text-ink-500">{calc.marginPct != null ? `Marge ${calc.marginPct} % · ` : ""}Base HT : ventes HT − coûts HT.</p>
                </div>
                <details className="text-xs text-ink-500">
                  <summary className="cursor-pointer font-semibold">Détail</summary>
                  <ul className="mt-2 space-y-1">
                    {calc.lines.map((l, i) => <li key={i} className="flex justify-between gap-2"><span>{l.label}</span><span className="tabular-nums">{formatMAD(l.ht)} HT</span></li>)}
                    {calc.source === "aucun" && <li>Aucun devis accepté ni facture : le vendu est à 0.</li>}
                    {calc.costs.map((c, i) => <li key={`c${i}`} className="flex justify-between gap-2"><span>− {c.label}</span><span className="tabular-nums">{formatMAD(c.ht)} HT</span></li>)}
                  </ul>
                </details>
                {s.isAdmin && <Link href={`/evenements/${id}/fiche?version=direction`} className={buttonClass("secondary", "md", "w-full justify-center")}><FileText className="h-4 w-4" /> Fiche technique Direction (chiffrée)</Link>}
              </CardBody>
            </Card>
          )}
          <ClientDocsCard eventId={id} clientId={e.client_id ?? null} s={s} />
          <p className="px-1 text-xs text-ink-400">Créé le {formatDate(e.created_at)}</p>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={className}><dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</dt><dd className="font-semibold">{children}</dd></div>;
}
function Todo() {
  return <span className="font-semibold text-ochre-700">À renseigner</span>;
}
function Fold({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <details className="card group">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 font-semibold"><span className="text-ink-400">{icon}</span>{title}<span className="ms-auto text-ink-300 group-open:rotate-180">▾</span></summary>
      <div className="border-t border-line px-5 py-4">{children}</div>
    </details>
  );
}
function Row({ label, v, strong, muted, tone }: { label: string; v: number; strong?: boolean; muted?: boolean; tone?: string }) {
  return (
    <p className={`flex items-baseline justify-between gap-3 ${muted ? "text-xs text-ink-400" : ""}`}>
      <span>{label}</span><span className={`tabular-nums ${strong ? "text-base font-bold" : "font-semibold"} ${tone ?? ""}`}>{formatMAD(v)}</span>
    </p>
  );
}
