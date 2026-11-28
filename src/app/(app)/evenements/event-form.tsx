import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { fullName } from "@/lib/format";
import { toLocalISODate, toLocalTime } from "@/lib/dates";
import { EVENT_STATUS, EVENT_TYPE } from "@/lib/labels";
import type { Employee, EventRow } from "@/lib/types";
import type { Lang } from "@/lib/i18n";
import { TYPE_AR } from "@/lib/fiche-i18n";

function t(v: string | null | undefined) {
  return v ? toLocalTime(v) : "";
}
function d(v: string | null | undefined, fallback?: string) {
  return v ? toLocalISODate(v) : fallback ?? "";
}

export function EventFields({ e, employees, clients = [], clientId, lang = "fr" }: { e?: EventRow; employees: Employee[]; clients?: { id: string; name: string; phone: string | null }[]; clientId?: string; lang?: Lang }) {
  const L = (fr: string, ar: string) => (lang === "ar" ? ar : fr);
  const moments: [string, string, string | null | undefined][] = [
    ["load", L("Chargement au dépôt", "التحميل من المخزن"), e?.load_at], ["delivery", L("Livraison", "التوصيل"), e?.delivery_at], ["setup", L("Installation", "التركيب"), e?.setup_at], ["start", L("Début", "البداية"), e?.start_at],
    ["end", L("Fin", "النهاية"), e?.end_at], ["teardown", L("Démontage", "التفكيك"), e?.teardown_at],
  ];
  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <Field label={L("Nom de l'événement", "اسم الحفل")} className="md:col-span-2"><Input name="name" defaultValue={e?.name} required placeholder="Ex. Mariage Salma & Youssef" /></Field>
        <Field label={L("Type", "النوع")}><Select name="event_type" defaultValue={e?.event_type ?? "mariage"}>{Object.entries(EVENT_TYPE).map(([k, v]) => <option key={k} value={k}>{lang === "ar" ? TYPE_AR[k] ?? v : v}</option>)}</Select></Field>
        <Field label={L("Client (fiche existante)", "الزبون (موجود)")}>
          <Select name="client_id" defaultValue={clientId ?? e?.client_id ?? ""}>
            <option value="">{L("Nouveau client : remplir à droite", "زبون جديد : عمر الخانات")}</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>)}
          </Select>
        </Field>
        <Field label={L("Ou nom du nouveau client", "ولا سمية الزبون الجديد")} hint={L("Une fiche client est créée automatiquement", "كتتصاوب بطاقة الزبون أوتوماتيكيا")}><Input name="client_name" defaultValue={e?.client_id ? "" : e?.client_name ?? ""} placeholder="Ex. Famille Alaoui" /></Field>
        <Field label={L("Téléphone du nouveau client", "تيليفون الزبون الجديد")}><Input name="client_phone" type="tel" defaultValue={e?.client_id ? "" : e?.client_phone ?? ""} /></Field>
        <Field label={L("Statut", "الحالة")}><Select name="status" defaultValue={e?.status ?? "confirme"}>{Object.entries(EVENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        <Field label={L("Date", "التاريخ")}><Input type="date" name="event_date" defaultValue={e?.event_date} required /></Field>
        <Field label={L("Nombre de personnes", "عدد الأشخاص")}><Input type="number" name="guests" min={0} inputMode="numeric" defaultValue={e?.guests ?? ""} placeholder="Ex. 150" /></Field>
        <Field label={L("Adresse / lieu", "العنوان / المكان")}><Input name="address" defaultValue={e?.address ?? ""} /></Field>
        <Field label={L("Responsable", "المسؤول")}><Select name="manager_id" defaultValue={e?.manager_id ?? ""}><option value="">—</option>{employees.map((x) => <option key={x.id} value={x.id}>{fullName(x)}</option>)}</Select></Field>
      </section>
      <section>
        <p className="label">{L("Horaires (heure de Casablanca)", "الأوقات (توقيت الدار البيضاء)")}</p>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          {moments.map(([k, label, v]) => (
            <div key={k} className="rounded-xl border border-line bg-sand-50 p-3">
              <p className="mb-2 text-xs font-medium text-ink-500">{label}</p>
              <label className="block text-[11px] text-ink-500">{L("Jour (vide = jour de l'événement)", "النهار (خاوي = نهار الحفل)")}
                <Input type="date" name={`${k}_date`} defaultValue={d(v, e?.event_date)} className="mb-2 mt-0.5 h-10 py-1 text-sm" />
              </label>
              <label className="block text-[11px] text-ink-500">{L("Heure", "الساعة")}
                <Input type="time" name={k} defaultValue={t(v)} className="mt-0.5 h-10 py-1 text-sm" />
              </label>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-400">{L("Laissez la date vide pour utiliser la date de l'événement. Pour une livraison la veille ou un démontage le lendemain, indiquez la date.", "خلي التاريخ خاوي باش ياخد نهار الحفل. إلا كان التوصيل نهار قبل ولا التفكيك نهار من بعد، كتب التاريخ.")}</p>
      </section>
      <section className="rounded-2xl border border-teal-200 bg-teal-50/40 p-4">
        <p className="label">{L("Pour l'équipe terrain (chauffeur, installation)", "لفريق الميدان (السائق، التركيب)")}</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={L("Contact sur place", "جهة الاتصال فالبلاصة")}><Input name="site_contact_name" defaultValue={e?.site_contact_name ?? ""} placeholder="Ex. M. Bennani, wedding planner" /></Field>
          <Field label={L("Téléphone du contact sur place", "تيليفون جهة الاتصال")}><Input name="site_contact_phone" type="tel" defaultValue={e?.site_contact_phone ?? ""} /></Field>
          <Field label={L("Consignes d'accès", "تعليمات الدخول")} className="md:col-span-2"><Textarea name="access_notes" defaultValue={e?.access_notes ?? ""} rows={2} placeholder="Ex. Entrée camion par la rue arrière, 2e étage sans ascenseur, prise électrique côté jardin" /></Field>
        </div>
      </section>
      <Field label={L("Notes", "ملاحظات")}><Textarea name="notes" defaultValue={e?.notes ?? ""} rows={4} /></Field>
    </div>
  );
}
