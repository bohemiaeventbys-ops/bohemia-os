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
import { PROOF_BUCKET, type DesignProof } from "@/lib/clients";
import { LINE_STATUS, STOCK_BUCKET, type EventItem, type StockItem } from "@/lib/stock";
import type { Employee, EventRow, Task } from "@/lib/types";
import { TaskTable } from "../../taches/task-row";
import { saveGuests } from "../actions";
import { ServicesCard } from "./services-card";
import { ClientDocsCard } from "./client-docs-card";
import { MaterialsCard } from "./materials-card";
import { TeamCard } from "./team-card";
import { DesignUpload } from "./design-upload";
import { ApproveDesign, Inspirations, Zoomable } from "./event-widgets";

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
  const proofs = (proofData ?? []) as (DesignProof & { preview_path?: string | null })[];
  // Design de référence : le dernier validé ; sinon le dernier envoyé (en attente)
  const reference = proofs.find((p) => p.status === "valide") ?? null;
  const pending = proofs.find((p) => p.status !== "valide" && (!reference || p.created_at > reference.created_at)) ?? null;
  const main = reference ?? pending;
  const missingItems = new Set((missing ?? []).map((m) => m.item_id as string));
  const { data: itemData } = lines.length ? await supabase.from("stock_items").select("*").in("id", lines.map((l) => l.item_id)) : { data: [] };
  const items = new Map(((itemData ?? []) as StockItem[]).map((i) => [i.id, i]));
  const [proofUrls, inspUrls, stockUrls] = await Promise.all([
    signedUrls(supabase, PROOF_BUCKET, [main?.file_path, main?.preview_path, pending?.preview_path, pending?.file_path]),
    signedUrls(supabase, PROOF_BUCKET, (inspData ?? []).map((i) => i.file_path as string)),
    signedUrls(supabase, STOCK_BUCKET, [...items.values()].map((i) => i.photo_path)),
  ]);
  const calc = showMoney ? await eventCalc(supabase, id, e.client_id ?? null) : null;
  const days = diffDays(e.event_date, todayISO());
  const status = EVENT_STATUS[e.status];

  const proofImg = (p: typeof main) => {
    if (!p) return null;
    const pdf = /\.pdf$/i.test(p.file_path);
    return { img: pdf ? (p.preview_path ? proofUrls.get(p.preview_path) : null) : proofUrls.get(p.file_path), file: proofUrls.get(p.file_path), pdf };
  };
  const mainImg = proofImg(main);
  const pendingImg = reference && pending ? proofImg(pending) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* En-tête : une seule fois, l'essentiel */}
      <header className="card overflow-hidden">
        <div className="space-y-3 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href="/evenements" className="text-xs font-semibold uppercase tracking-wider text-ink-400 hover:underline">Événements</Link>
              <h1 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">{e.name}</h1>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={status.tone}>{status.label}</Badge>
              {days >= 0 && days <= 2 && <Badge tone="clay">{days === 0 ? "Aujourd'hui" : `J-${days}`}</Badge>}
              {canEdit && <Link href={`/evenements/${id}/modifier`} className={buttonClass("ghost", "sm")}><Pencil className="h-4 w-4" /> Modifier</Link>}
            </div>
          </div>
          <dl className="grid gap-3 text-[15px] sm:grid-cols-2 lg:grid-cols-5">
            <Fact label="Client">{e.client_name ?? "—"}</Fact>
            <Fact label="Date">{formatDayLong(e.event_date)}<span className="block text-xs text-ink-400">{EVENT_TYPE[e.event_type]}</span></Fact>
            <Fact label="Lieu" className="lg:col-span-2">{e.address ?? "À préciser"}</Fact>
            <Fact label="Personnes">
              {canEdit ? (
                <ActionForm action={saveGuests} className="flex items-center gap-1.5">
                  <input type="hidden" name="id" value={id} />
                  <input name="guests" type="number" min={0} inputMode="numeric" defaultValue={e.guests ?? ""} placeholder="À renseigner" className="field h-10 w-28 text-center text-lg font-bold" />
                  <SubmitButton size="sm" variant="secondary">OK</SubmitButton>
                </ActionForm>
              ) : e.guests ? <b className="text-xl">{e.guests}</b> : <span className="font-semibold text-ochre-700">À renseigner</span>}
            </Fact>
          </dl>
        </div>
        {/* Actions principales, selon le rôle */}
        <div className="grid gap-2 border-t border-line bg-sand-50 p-3 sm:grid-cols-2 lg:grid-cols-4">
          {canDesign && <DesignUpload eventId={id} kind="design" />}
          {canDesign && <DesignUpload eventId={id} kind="inspiration" />}
          {canMove && <Link href={`/evenements/${id}/materiel/choisir`} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-ochre-500 px-4 text-[15px] font-bold text-white shadow-card"><PackagePlus className="h-5 w-5" /> Choisir le matériel</Link>}
          <Link href={`/evenements/${id}/fiche`} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-ink px-4 text-[15px] font-bold text-ivory shadow-card"><FileText className="h-5 w-5" /> Ouvrir la fiche technique</Link>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {/* Design */}
          <Card>
            <CardHeader icon={<Sparkles />} tone="rose" title="Design" subtitle={reference ? "✓ Validé : c'est la référence pour l'installation" : main ? "En attente de validation" : "Pas encore de design"} />
            {main && mainImg ? (
              <div className="space-y-3 px-5 pb-5">
                <div className={`overflow-hidden rounded-2xl ring-2 ${reference ? "ring-sage-400" : "ring-ochre-300"}`}>
                  {mainImg.img ? <Zoomable src={mainImg.img} alt={main.title} href={mainImg.file ?? undefined} />
                    : mainImg.file ? <a href={mainImg.file} target="_blank" rel="noreferrer" className="flex h-40 items-center justify-center gap-2 bg-sand-50 font-bold"><FileText className="h-6 w-6" /> Ouvrir le PDF du design</a> : null}
                  <p className={`px-4 py-2 text-sm font-bold ${reference ? "bg-sage-100 text-sage-700" : "bg-ochre-100 text-ochre-700"}`}>{reference ? "✓ Design validé" : "⏳ À valider"} · {main.title} v{main.version}{mainImg.pdf ? " · PDF" : ""}</p>
                </div>
                {!reference && canDesign && <ApproveDesign eventId={id} proofId={main.id} />}
                {pending && pendingImg && (
                  <div className="flex items-center gap-3 rounded-xl bg-ochre-50 p-3 ring-1 ring-ochre-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {pendingImg.img && <img src={pendingImg.img} alt="" className="h-16 w-16 rounded-lg object-cover" />}
                    <p className="flex-1 text-sm"><b>Nouvelle version en attente</b> (v{pending.version}). L&apos;installation garde le design validé jusqu&apos;à sa validation.</p>
                    {canDesign && <div className="w-56"><ApproveDesign eventId={id} proofId={pending.id} /></div>}
                  </div>
                )}
              </div>
            ) : <Empty title="Aucun design pour l'instant.">{canDesign ? "Touchez « Ajouter le design » en haut (image ou PDF)." : "Le graphisme l'ajoutera ici."}</Empty>}
            {(inspData ?? []).length > 0 && (
              <div className="border-t border-line px-5 py-4">
                <p className="mb-2 text-sm font-bold text-ink-600">Inspirations</p>
                <Inspirations eventId={id} canEdit={canDesign} list={(inspData ?? []).map((i) => ({ id: i.id as string, is_cover: i.is_cover as boolean, url: inspUrls.get(i.file_path as string) ?? null }))} />
              </div>
            )}
          </Card>

          {/* Matériel */}
          <Card>
            <div id="materiel" className="scroll-mt-24" />
            <CardHeader icon={<Warehouse />} tone="ochre" title="Matériel du dépôt"
              subtitle={lines.length ? `${lines.length} article(s) · ${lines.reduce((a, l) => a + l.qty, 0)} pièces` : "Rien de réservé"}
              action={canMove ? <Link href={`/evenements/${id}/materiel`} className={buttonClass("ghost", "sm")}>Suivi dépôt</Link> : undefined} />
            {sp.reserve && <p className="mx-5 mb-3 rounded-xl bg-sage-100 px-3 py-2 text-sm font-bold text-sage-700">✓ {sp.reserve} article(s) réservé(s) : le magasinier les voit dans « Terrain ».</p>}
            {lines.length === 0 ? <Empty title="Aucun matériel réservé.">{canMove ? "Touchez « Choisir le matériel »." : ""}</Empty> : (
              <ul className="divide-y divide-line">
                {lines.map((l) => {
                  const i = items.get(l.item_id);
                  const ph = i?.photo_path ? stockUrls.get(i.photo_path) : null;
                  const miss = missingItems.has(l.item_id);
                  const st = miss ? { label: "Manquant", cls: "bg-clay-100 text-clay-700" } : l.status === "reserve" ? { label: "Réservé", cls: "bg-mist-100 text-mist-700" } : { label: LINE_STATUS[l.status].label, cls: "bg-teal-100 text-teal-700" };
                  return (
                    <li key={l.id} className="flex items-center gap-3 px-5 py-2.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {ph ? <img src={ph} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" /> : <span className="h-12 w-12 shrink-0 rounded-lg bg-sand-100" />}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold leading-tight">{i?.name ?? "Article"}{i?.code && <span className="ms-2 font-mono text-xs text-ink-400">{i.code}</span>}</p>
                        <p className="text-xs text-ink-500">{[l.finish, l.zone && `Zone : ${l.zone}`].filter(Boolean).join(" · ")}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${st.cls}`}>{miss && <AlertTriangle className="me-1 inline h-3 w-3" />}{st.label}</span>
                      <span className="w-12 shrink-0 text-end text-xl font-bold tabular-nums">×{l.qty}</span>
                    </li>
                  );
                })}
              </ul>
            )}
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
