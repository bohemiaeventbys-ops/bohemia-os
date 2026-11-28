"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { fail, str, type ActionResult } from "@/lib/action";
import { localToISO } from "@/lib/dates";

function ts(fd: FormData, date: string, key: string) {
  const t = str(fd, key);
  if (!t) return null;
  const d = str(fd, `${key}_date`) ?? date;
  return localToISO(d, t);
}

function payload(fd: FormData) {
  const date = str(fd, "event_date");
  if (!date) return null;
  return {
    name: str(fd, "name"),
    event_type: str(fd, "event_type") ?? "autre",
    status: str(fd, "status") ?? "confirme",
    client_name: str(fd, "client_name"),
    client_phone: str(fd, "client_phone"),
    event_date: date,
    address: str(fd, "address"),
    load_at: ts(fd, date, "load"),
    delivery_at: ts(fd, date, "delivery"),
    setup_at: ts(fd, date, "setup"),
    start_at: ts(fd, date, "start"),
    end_at: ts(fd, date, "end"),
    teardown_at: ts(fd, date, "teardown"),
    manager_id: str(fd, "manager_id"),
    notes: str(fd, "notes"),
    access_notes: str(fd, "access_notes"),
    guests: (() => { const n = Number(str(fd, "guests")); return Number.isInteger(n) && n > 0 ? n : null; })(),
    site_contact_name: str(fd, "site_contact_name"),
    site_contact_phone: str(fd, "site_contact_phone"),
  };
}

/** Relie l'événement à une fiche client : choisie dans la liste, ou créée à partir du nom saisi. */
async function withClient(supabase: Awaited<ReturnType<typeof createClient>>, fd: FormData, p: NonNullable<ReturnType<typeof payload>>) {
  let clientId = str(fd, "client_id");
  if (clientId) {
    const { data: c } = await supabase.from("clients").select("name, phone").eq("id", clientId).maybeSingle();
    if (c) return { ...p, client_id: clientId, client_name: c.name as string, client_phone: (c.phone as string | null) ?? p.client_phone };
  }
  if (p.client_name) {
    const { data: found } = await supabase.from("clients").select("id").ilike("name", p.client_name).limit(1).maybeSingle();
    if (found) clientId = found.id as string;
    else {
      const { data: created } = await supabase.from("clients").insert({ name: p.client_name, phone: p.client_phone }).select("id").single();
      clientId = (created?.id as string | undefined) ?? null;
    }
  }
  return { ...p, client_id: clientId };
}

export async function createEvent(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  const p0 = payload(fd);
  if (!p0?.name) return { error: "Nom et date de l'événement obligatoires." };
  const supabase = await createClient();
  const p = await withClient(supabase, fd, p0);
  const { data, error } = await supabase.from("events").insert({ ...p, created_by: s.employee.id }).select("id").single();
  if (error) return fail(error);
  revalidatePath("/evenements");
  return { redirect: `/evenements/${data.id}` };
}

/** « Nouvel événement » avec design et matériel : crée l'événement et renvoie son id (le navigateur envoie ensuite le design et réserve le stock). */
export async function createEventWithId(fd: FormData): Promise<{ id: string } | { error: string }> {
  const r = await createEvent(null, fd);
  const id = r?.redirect?.split("/").pop();
  if (id) return { id };
  return { error: r?.error ?? "Création impossible." };
}

export async function updateEvent(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  const p0 = payload(fd);
  if (!id || !p0?.name) return { error: "Nom et date obligatoires." };
  const supabase = await createClient();
  const p = await withClient(supabase, fd, p0);
  const { data, error } = await supabase.from("events").update(p).eq("id", id).select("id");
  if (error) return fail(error);
  if (!data?.length) return { error: "Modification non autorisée." };
  revalidatePath(`/evenements/${id}`);
  return { redirect: `/evenements/${id}` };
}

export async function addTeamMember(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  const emp = str(fd, "employee_id");
  if (!id || !emp) return { error: "Choisissez un employé." };
  const supabase = await createClient();
  const { error } = await supabase.from("event_team").insert({ event_id: id, employee_id: emp, role_label: str(fd, "role_label") });
  if (error) return fail(error);
  revalidatePath(`/evenements/${id}`);
  return { ok: "Ajouté à l'équipe (notifié)." };
}

export async function removeTeamMember(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  const emp = str(fd, "employee_id");
  const supabase = await createClient();
  const { error } = await supabase.from("event_team").delete().eq("event_id", id!).eq("employee_id", emp!);
  if (error) return fail(error);
  revalidatePath(`/evenements/${id}`);
  return { ok: "Retiré." };
}

function amount(fd: FormData, key: string) {
  const v = str(fd, key);
  if (!v) return null;
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export async function saveFinances(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  if (!s.can("finance.view")) return { error: "Réservé à la direction et à la commerciale." };
  const id = str(fd, "id");
  if (!id) return { error: "Événement introuvable." };
  const status = str(fd, "payment_status") ?? "non_paye";
  const supabase = await createClient();
  const { error } = await supabase.from("event_finances").upsert({
    event_id: id,
    budget_mad: amount(fd, "budget_mad"),
    quote_mad: amount(fd, "quote_mad"),
    paid_mad: amount(fd, "paid_mad"),
    payment_status: ["non_paye", "acompte", "paye"].includes(status) ? status : "non_paye",
    notes: str(fd, "finance_notes"),
  });
  if (error) return fail(error);
  revalidatePath(`/evenements/${id}`);
  revalidatePath("/evenements");
  return { ok: "Montants enregistrés." };
}

/* ------------------------- Matériaux à acheter / fabriquer ------------------------- */
export async function addMaterial(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const eventId = str(fd, "event_id");
  const label = str(fd, "label");
  if (!eventId || !label) return { error: "Écrivez le matériau." };
  const q = Number((str(fd, "qty") ?? "").replace(",", "."));
  const supabase = await createClient();
  const { error } = await supabase.from("event_materials").insert({
    event_id: eventId, label, qty: Number.isFinite(q) && q > 0 ? q : null, unit: str(fd, "unit"), note: str(fd, "note"),
  });
  if (error) return fail(error);
  revalidatePath(`/evenements/${eventId}`);
  return { ok: "Ajouté." };
}

export async function deleteMaterial(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  const eventId = str(fd, "event_id");
  if (!id) return { error: "Action invalide." };
  const supabase = await createClient();
  const { error } = await supabase.from("event_materials").delete().eq("id", id);
  if (error) return fail(error);
  if (eventId) revalidatePath(`/evenements/${eventId}`);
  return { ok: "Retiré." };
}

/* ------------------------- Équipe : affectations ------------------------- */
const ROLE_KEYS = ["commercial", "infographiste", "atelier", "magasinier", "chauffeur", "installateur", "responsable"];

export async function addAssignment(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const s = await requireSession();
  if (!s.can("events.manage")) return { error: "Réservé aux responsables des événements." };
  const eventId = str(fd, "event_id");
  const who = str(fd, "employee_id");
  const role = str(fd, "role");
  if (!eventId || !role || !ROLE_KEYS.includes(role)) return { error: "Choisissez la personne et son rôle." };
  const external = who === "externe";
  const extName = str(fd, "external_name");
  if (!who || (external && !extName)) return { error: external ? "Écrivez le nom du renfort." : "Choisissez la personne." };
  const day = str(fd, "day");
  const start = day && str(fd, "start") ? localToISO(day, str(fd, "start")!) : null;
  let end = day && str(fd, "end") ? localToISO(day, str(fd, "end")!) : null;
  if (start && end && end <= start) end = new Date(new Date(end).getTime() + 86400000).toISOString(); // fin après minuit
  const supabase = await createClient();
  const { data: row, error } = await supabase.from("event_assignments").insert({
    event_id: eventId, employee_id: external ? null : who, external_name: external ? extName : null, external_phone: external ? str(fd, "external_phone") : null,
    role, mission: str(fd, "mission"), start_at: start, end_at: end, is_lead: fd.get("is_lead") === "on",
  }).select("id").single();
  if (error) return fail(error);
  revalidatePath(`/evenements/${eventId}`);
  revalidatePath(`/evenements/${eventId}/fiche`);
  revalidatePath("/semaine");
  // Déjà prise ailleurs au même moment ?
  if (!external && start) {
    const { data: others } = await supabase.from("event_assignments").select("start_at, end_at, events(name)")
      .eq("employee_id", who).neq("id", row.id).lt("start_at", end ?? new Date(new Date(start).getTime() + 3600000).toISOString())
      .gt("end_at", start);
    const o = (others ?? [])[0] as unknown as { events: { name: string } | null } | undefined;
    if (o) return { ok: `Ajouté. Attention : cette personne est déjà prise au même moment (${o.events?.name ?? "autre mission"}).` };
  }
  return { ok: "Ajouté : la mission apparaît dans son planning." };
}

export async function removeAssignment(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  const eventId = str(fd, "event_id");
  if (!id) return { error: "Action invalide." };
  const supabase = await createClient();
  const { error } = await supabase.from("event_assignments").delete().eq("id", id);
  if (error) return fail(error);
  if (eventId) { revalidatePath(`/evenements/${eventId}`); revalidatePath(`/evenements/${eventId}/fiche`); }
  revalidatePath("/semaine");
  return { ok: "Retiré." };
}

export async function saveGuests(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const id = str(fd, "id");
  const n = Number(str(fd, "guests"));
  if (!id || !Number.isInteger(n) || n < 0 || n > 100000) return { error: "Nombre invalide." };
  const supabase = await createClient();
  const { error } = await supabase.from("events").update({ guests: n || null }).eq("id", id);
  if (error) return fail(error);
  revalidatePath(`/evenements/${id}`);
  return { ok: "Enregistré." };
}
