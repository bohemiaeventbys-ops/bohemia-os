import Link from "next/link";
import { notFound } from "next/navigation";
import { eventCalc } from "@/lib/calc";
import { formatMAD } from "@/lib/format";
import { EVENT_STATUS } from "@/lib/labels";
import { MISSION_AR, ROLES, type Assignment, type RoleKey } from "@/lib/team";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedUrls } from "@/lib/storage";
import { PrintButton } from "@/components/print-button";
import type { ReactNode } from "react";
import { formatDate, hhmm, toLocalISODate, toLocalTime } from "@/lib/dates";
import { fullName } from "@/lib/format";
import { EVENT_TYPE } from "@/lib/labels";
import { PROOF_BUCKET } from "@/lib/clients";
import { designState, isApproved, isPdf, type Proof } from "@/lib/design";
import { FICHE, TYPE_AR, dayLong, isFicheLang, type FicheKey, type FicheLang } from "@/lib/fiche-i18n";
import { getLang } from "@/lib/lang";
import { STOCK_BUCKET, type EventItem, type StockItem } from "@/lib/stock";
import type { Employee, EventRow } from "@/lib/types";
import type { EventService, Supplier } from "@/lib/suppliers";
import type { EventMaterial } from "../materials-card";

export const metadata = { title: "Fiche événement" };

/**
 * Fiche de l'événement pour toute l'équipe (dépôt, chauffeurs, installation) : claire, peu de titres, imprimable en PDF.
 * Aucun montant, aucune donnée confidentielle.
 */
export default async function Fiche({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ version?: string; langue?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const s = await requireSession();
  // Version Direction : vérifiée côté serveur à chaque ouverture ; sinon on n'envoie aucun chiffre au navigateur
  const direction = sp.version === "direction";
  if (direction && !s.isAdmin) notFound();
  const lg: FicheLang = isFicheLang(sp.langue) ? sp.langue : await getLang();
  const ar = lg === "ar";
  /** Libellé dans la langue choisie ; en bilingue : français puis arabe */
  const L = (k: FicheKey): ReactNode => lg === "fr" ? FICHE[k][0] : lg === "ar" ? FICHE[k][1] : <>{FICHE[k][0]} <span lang="ar" dir="rtl" className="font-normal">· {FICHE[k][1]}</span></>;
  const both = (fr: string, arTxt: string | null | undefined): ReactNode => lg === "fr" || !arTxt ? fr : lg === "ar" ? <span lang="ar" dir="rtl">{arTxt}</span> : <>{fr} <span lang="ar" dir="rtl" className="font-normal text-ink-500">· {arTxt}</span></>;
  const supabase = await createClient();
  const { data: e } = await supabase.from("events").select("*").eq("id", id).maybeSingle<EventRow>();
  if (!e) notFound();
  const [{ data: team }, { data: lineData }, { data: matData }, { data: svcData }, { data: proofData }, { data: inspData }] = await Promise.all([
    supabase.from("event_assignments").select("*").eq("event_id", id).order("start_at", { nullsFirst: false }),
    supabase.from("event_items").select("*").eq("event_id", id).order("created_at"),
    supabase.from("event_materials").select("*").eq("event_id", id).order("created_at"),
    supabase.from("event_services").select("*").eq("event_id", id).neq("status", "annule").order("service_time"),
    supabase.from("design_proofs").select("*").eq("event_id", id).neq("status", "annule").order("created_at", { ascending: false }),
    supabase.from("event_inspirations").select("id, file_path, is_cover").eq("event_id", id).eq("on_sheet", true).order("is_cover", { ascending: false }).order("created_at").limit(6),
  ]);
  const assignments = (team ?? []) as Assignment[];
  const lines = (lineData ?? []) as EventItem[];
  const services = (svcData ?? []) as EventService[];
  const materials = (matData ?? []) as EventMaterial[];
  const ds = designState((proofData ?? []) as Proof[]);
  const proofs = ds.main ? [ds.main] : [];
  const ids = assignments.filter((a) => a.employee_id).map((a) => a.employee_id!).concat(e.manager_id ? [e.manager_id] : []);
  const [{ data: staff }, { data: itemData }, { data: supData }] = await Promise.all([
    ids.length ? supabase.from("employees").select("id, first_name, last_name").in("id", ids) : Promise.resolve({ data: [] }),
    lines.length ? supabase.from("stock_items").select("*").in("id", lines.map((l) => l.item_id)) : Promise.resolve({ data: [] }),
    services.length ? supabase.from("suppliers").select("id, name, phone, whatsapp").in("id", services.map((v) => v.supplier_id)) : Promise.resolve({ data: [] }),
  ]);
  const people = new Map(((staff ?? []) as Employee[]).map((p) => [p.id, p]));
  const items = new Map(((itemData ?? []) as StockItem[]).map((i) => [i.id, i]));
  const sup = new Map(((supData ?? []) as Supplier[]).map((x) => [x.id, x]));
  const [itemUrls, proofUrls] = await Promise.all([
    signedUrls(supabase, STOCK_BUCKET, [...items.values()].map((i) => i.photo_path).concat(lines.map((l) => l.ref_photo_path ?? null))),
    signedUrls(supabase, PROOF_BUCKET, [...proofs.flatMap((p) => [p.file_path, p.preview_path]), ...(inspData ?? []).map((i) => i.file_path as string)]),
  ]);
  const calc = direction ? await eventCalc(supabase, id, e.client_id ?? null) : null;

  const sortedLines = [...lines].sort((a, b) => (items.get(a.item_id)?.location ?? "~").localeCompare(items.get(b.item_id)?.location ?? "~") || (items.get(a.item_id)?.name ?? "").localeCompare(items.get(b.item_id)?.name ?? ""));
  const moments = ([["load", e.load_at], ["delivery", e.delivery_at], ["setup", e.setup_at], ["start", e.start_at], ["teardown", e.teardown_at]] as [FicheKey, string | null | undefined][]).filter(([, v]) => v);
  const contact = e.site_contact_name ?? e.client_name;
  const phone = e.site_contact_phone ?? e.client_phone;

  return (
    <div className="mx-auto max-w-4xl print:max-w-none">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-1 rounded-xl bg-paper p-1 ring-1 ring-line">
          {([["fr", "Français"], ["ar", "العربية"], ["bi", "Bilingue"]] as const).map(([k, t]) => (
            <Link key={k} href={`/evenements/${id}/fiche?langue=${k}${direction ? "&version=direction" : ""}`}
              className={`rounded-lg px-4 py-2 text-sm font-bold ${lg === k ? "bg-ink text-ivory" : "text-ink-500 hover:bg-sand-100"}`}>{t}</Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {s.isAdmin && (direction
            ? <Link href={`/evenements/${id}/fiche?langue=${lg}`} className="link text-sm">Voir la version équipe</Link>
            : <Link href={`/evenements/${id}/fiche?langue=${lg}&version=direction`} className="link text-sm">Version Direction (chiffrée)</Link>)}
          {s.can("events.manage") && <Link href={`/evenements/${id}/modifier`} className="rounded-xl bg-paper px-4 py-2.5 text-sm font-bold ring-1 ring-line-strong">Modifier</Link>}
          <PrintButton label="Imprimer / PDF" />
        </div>
      </div>

      <article dir={ar ? "rtl" : "ltr"} lang={ar ? "ar" : "fr"} className="fiche card space-y-7 bg-white p-5 sm:p-8 print:border-0 print:p-0 print:shadow-none">
        {/* En-tête */}
        <header className="flex items-start justify-between gap-4 border-b-4 border-olive-700 pb-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{e.name}</h1>
            <p className="mt-1 text-lg font-semibold text-olive-700">{lg === "ar" ? dayLong(e.event_date, "ar") : dayLong(e.event_date, "fr")}{lg === "bi" && <span lang="ar" dir="rtl" className="ms-2 font-normal text-ink-500">· {dayLong(e.event_date, "ar")}</span>}</p>
            <p className="text-ink-500">{both(EVENT_TYPE[e.event_type], TYPE_AR[e.event_type])}{e.client_name ? ` · ${e.client_name}` : ""}{!ar && ` · ${EVENT_STATUS[e.status].label}`}</p>
            <p className={`mt-1 inline-block rounded-full px-3 py-0.5 text-xs font-bold tracking-wide ${direction ? "bg-ochre-100 text-ochre-700" : "bg-sand-100 text-ink-500"}`}>{L(direction ? "direction" : "team")}</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-bohemia.png" alt="Bohemia" className="h-16 w-auto shrink-0" />
        </header>

        {/* L'essentiel en un coup d'œil */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Fact big label={L("guests")}>{e.guests ?? <span className="text-lg text-ochre-700">{L("todo")}</span>}</Fact>
          <Fact label={L("place")} className="sm:col-span-2">{e.address ?? L("tbd")}</Fact>
          <Fact label={L("contact")}>{contact ?? "—"}{phone && <span dir="ltr" className="block text-lg font-bold tabular-nums">{phone}</span>}</Fact>
          <Fact label={L("lead")}>{e.manager_id ? fullName(people.get(e.manager_id)) : "—"}</Fact>
          <Fact label={L("client")}>{e.client_name ?? "—"}</Fact>
        </div>

        {moments.length > 0 && (
          <div className={`grid grid-cols-2 gap-2 print:grid-cols-5 ${["", "sm:grid-cols-1", "sm:grid-cols-2", "sm:grid-cols-3", "sm:grid-cols-4", "sm:grid-cols-5"][moments.length]}`}>
            {moments.map(([l, v]) => (
              <div key={l} className="rounded-xl bg-mist-100 px-3 py-2 text-center print:border print:border-line">
                <p className="text-xs font-semibold uppercase text-mist-700">{L(l)}</p>
                <p dir="ltr" className="text-2xl font-bold tabular-nums">{toLocalTime(v)}</p>
                {toLocalISODate(v!) !== e.event_date && <p className="text-xs text-ink-500">{formatDate(v)}</p>}
              </div>
            ))}
          </div>
        )}
        {e.access_notes && <p className="rounded-xl bg-ochre-100 px-4 py-3 text-[15px] text-ochre-700"><b>{L("access")} : </b>{e.access_notes}</p>}

        {/* Design approuvé */}
        <section className="break-inside-avoid">
          <T>{L("design")}</T>
          {proofs.length === 0 ? <p className="text-ink-400">—</p> : proofs.map((p) => {
            const u = isPdf(p.file_path) ? (p.preview_path ? proofUrls.get(p.preview_path) : undefined) : proofUrls.get(p.file_path);
            const ok = isApproved(p);
            return (
              <figure key={p.id} className="overflow-hidden rounded-2xl ring-1 ring-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {u ? <img src={u} alt={p.title} className="max-h-[560px] w-full bg-sand-50 object-contain" />
                  : <a href={proofUrls.get(p.file_path)} target="_blank" rel="noreferrer" className="flex h-28 items-center justify-center bg-sand-50 font-semibold">{L("openPdf")}</a>}
                <figcaption className={`px-3 py-1.5 text-sm font-semibold ${ok ? "bg-sage-100 text-sage-800" : "bg-ochre-100 text-ochre-700"}`}>
                  {L(ok ? "approved" : p.status === "valide" ? "clientOnly" : "waiting")} · {p.title}{p.version > 1 ? ` (v${p.version})` : ""}
                </figcaption>
              </figure>
            );
          })}
        </section>

        {(inspData ?? []).length > 0 && (
          <section className="break-inside-avoid">
            <T>{L("inspirations")}</T>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {(inspData ?? []).map((i) => {
                const u = proofUrls.get(i.file_path as string);
                // eslint-disable-next-line @next/next/no-img-element
                return u ? <img key={i.id as string} src={u} alt="" className={`aspect-square w-full rounded-lg object-cover ${i.is_cover ? "ring-2 ring-ochre-400" : ""}`} /> : null;
              })}
            </div>
          </section>
        )}

        {/* Mobilier et matériel */}
        <section>
          <T>{L("furniture")} <span className="font-normal text-ink-500">· {lines.length} {L("items")}, {lines.reduce((a, l) => a + l.qty, 0)} {L("pieces")}</span></T>
          {lines.length === 0 ? <p className="text-ink-400">{L("noItems")}</p> : (
            <table className="w-full text-[15px]">
              <tbody>
                {sortedLines.map((l) => {
                  const i = items.get(l.item_id);
                  const u = i?.photo_path ? itemUrls.get(i.photo_path) : null;
                  const ref = l.ref_photo_path ? itemUrls.get(l.ref_photo_path) : null;
                  const specs = [i?.shape, i?.dimensions, i?.material].filter(Boolean).join(" · ");
                  const asks: [FicheKey, string][] = ([["color", l.color], ["finish", l.finish], ["vinyl", l.vinyl], ["zone", l.zone]] as [FicheKey, string | null | undefined][]).filter((x): x is [FicheKey, string] => !!x[1]);
                  return (
                    <tr key={l.id} className="break-inside-avoid border-b border-line align-middle">
                      <td className="w-7 py-2"><span className={`inline-block h-5 w-5 rounded border-2 ${l.status === "charge" || l.status === "retourne" ? "border-teal-600 bg-teal-500" : "border-ink-300"}`} /></td>
                      <td className="w-14 py-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {u ? <img src={u} alt="" className="h-12 w-12 rounded-lg object-cover" /> : <span className="block h-12 w-12 rounded-lg bg-sand-100" />}
                      </td>
                      <td className="py-2 ps-2">
                        <p className="font-semibold leading-tight">
                          {i?.code && <span dir="ltr" className="me-2 inline-block rounded bg-sand-100 px-1.5 font-mono text-sm font-bold text-ink">{i.code}</span>}
                          {i ? both(i.name, i.name_ar) : "Article"}
                        </p>
                        {specs && <p className="text-xs text-ink-500">{specs}</p>}
                        {asks.length > 0 && <p className="text-sm font-semibold text-plum-700">{asks.map(([k, v], n) => <span key={k}>{n > 0 && " · "}{L(k)} : {v}</span>)}</p>}
                        {(l.qty_short ?? 0) > 0 && <p className="text-sm font-bold text-clay-700">⚠ {L("missing")} : {l.qty_short}</p>}
                        {l.note && <p className="text-xs italic text-ink-500">{l.note}</p>}
                        {i && (i.qty_repair > 0 || i.qty_broken > 0) && <p className="text-xs text-ochre-700">{L("stockState")} : {i.qty_good} ✓{i.qty_repair ? ` · ${i.qty_repair} 🔧` : ""}{i.qty_broken ? ` · ${i.qty_broken} ✗` : ""}</p>}
                        {i?.location && <p className="text-xs text-ink-500">{i.location}</p>}
                      </td>
                      <td className="w-14 py-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {ref && <img src={ref} alt={String(FICHE.ref[0])} className="h-12 w-12 rounded-lg object-cover ring-2 ring-ochre-300" />}
                      </td>
                      <td dir="ltr" className="w-16 py-2 text-end text-2xl font-bold tabular-nums">×{l.qty}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        {materials.length > 0 && (
          <section className="break-inside-avoid">
            <T>{L("materials")}</T>
            <ul className="grid gap-2 sm:grid-cols-2">
              {materials.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 rounded-xl bg-teal-50 px-3 py-2 ring-1 ring-teal-100">
                  <span><b>{m.label}</b>{m.note && <span className="block text-sm text-ink-500">{m.note}</span>}</span>
                  {m.qty != null && <span className="text-lg font-bold tabular-nums">{Number(m.qty)} {m.unit ?? ""}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {services.length > 0 && (
          <section>
            <T>{L("suppliers")}</T>
            <div className="grid gap-3 sm:grid-cols-2">
              {services.map((v) => {
                const x = sup.get(v.supplier_id);
                return (
                  <div key={v.id} className="break-inside-avoid rounded-2xl bg-plum-50 px-4 py-3 ring-1 ring-plum-100">
                    <p className="flex items-baseline justify-between gap-2">
                      <b className="text-[16px]">{v.description}</b>
                      {(v.service_time || v.service_date) && <span className="font-bold tabular-nums">{v.service_date && v.service_date !== e.event_date ? `${formatDate(v.service_date)} ` : ""}{v.service_time ? hhmm(v.service_time) : ""}</span>}
                    </p>
                    <p className="text-sm text-ink-600">{x?.name}{x?.phone ? ` · ${x.phone}` : ""}</p>
                    {v.notes && <p className="mt-1 whitespace-pre-line text-sm">{v.notes}</p>}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="break-inside-avoid">
          <T>{L("team2")}</T>
          {assignments.length === 0 ? <p className="text-ink-400">{L("noTeam")}</p> : (
            <table className="w-full text-[15px]">
              <tbody>
                {assignments.map((a) => {
                  const r = ROLES[a.role as RoleKey];
                  return (
                    <tr key={a.id} className="border-b border-line">
                      <td className="py-1.5 font-semibold">{a.employee_id ? fullName(people.get(a.employee_id)) : <>{a.external_name} ({L("extra")})</>}{a.is_lead ? " ★" : ""}</td>
                      <td className="py-1.5 ps-2">{r ? both(r.fr, r.ar) : a.role}{a.mission ? <> · {both(a.mission, MISSION_AR[a.mission])}</> : ""}</td>
                      <td dir="ltr" className="py-1.5 ps-2 text-end font-bold tabular-nums">{a.start_at ? `${toLocalISODate(a.start_at) !== e.event_date ? formatDate(a.start_at) + " " : ""}${toLocalTime(a.start_at)}${a.end_at ? ` → ${toLocalTime(a.end_at)}` : ""}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        {calc && (
          <section className="break-inside-avoid rounded-2xl border-2 border-ochre-300 p-4">
            <T>Chiffres (Direction)</T>
            <div className="grid gap-2 sm:grid-cols-3">
              <Fact label={`Vendu ${calc.showTTC ? "TTC" : "HT"}`}>{formatMAD(calc.showTTC ? calc.soldTTC : calc.soldHT)}</Fact>
              <Fact label="Coût total HT (charges)">{formatMAD(calc.costHT)}</Fact>
              <Fact label="Résultat HT">{formatMAD(calc.margin)}{calc.marginPct != null ? ` (${calc.marginPct} %)` : ""}</Fact>
              <Fact label="Encaissé">{formatMAD(calc.received)}</Fact>
              <Fact label="Reste à encaisser">{formatMAD(calc.remaining)}</Fact>
              <Fact label="Total TTC">{formatMAD(calc.soldTTC)}</Fact>
            </div>
            <p className="mt-2 text-xs text-ink-500">Base de la marge : ventes HT − coûts HT. Encaissé = paiements réellement reçus.</p>
          </section>
        )}

        {e.notes && (
          <section className="break-inside-avoid">
            <T>{L("notes")}</T>
            <p className="whitespace-pre-line">{e.notes}</p>
          </section>
        )}
        {/* Zone de signature */}
        <section className="break-inside-avoid grid gap-3 pt-2 sm:grid-cols-3 print:grid-cols-3">
          {(["sPrep", "sDeliv", "sCheck"] as const).map((l) => (
            <div key={l} className="rounded-xl border-2 border-dashed border-line-strong p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{L(l)}</p>
              <p className="mt-4 text-sm text-ink-500">{L("name")} : ……………………</p>
              <p className="mt-2 text-sm text-ink-500">{L("date")} : ……/……/………</p>
              <p className="mt-2 h-12 text-sm text-ink-500">{L("sign")} :</p>
            </div>
          ))}
        </section>
      </article>
    </div>
  );
}

function T({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 text-lg font-bold text-ink">{children}</h2>;
}
function Fact({ label, children, big, className }: { label: ReactNode; children: ReactNode; big?: boolean; className?: string }) {
  return (
    <div className={`rounded-xl bg-sand-50 px-4 py-3 print:border print:border-line ${className ?? ""}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <div className={big ? "text-3xl font-bold tabular-nums" : "text-[15px] font-semibold"}>{children}</div>
    </div>
  );
}
