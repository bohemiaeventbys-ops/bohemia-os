export type Assignment = {
  id: string; event_id: string; employee_id: string | null; external_name: string | null; external_phone: string | null;
  role: RoleKey; mission: string | null; start_at: string | null; end_at: string | null; is_lead: boolean;
};
export type RoleKey = "commercial" | "infographiste" | "atelier" | "magasinier" | "chauffeur" | "installateur" | "responsable";
export const ROLES: Record<RoleKey, { fr: string; ar: string; tone: string }> = {
  responsable: { fr: "Responsable sur place", ar: "المسؤول فالبلاصة", tone: "bg-ink text-ivory" },
  commercial: { fr: "Commercial", ar: "التجاري", tone: "bg-rose-100 text-rose-700" },
  infographiste: { fr: "Infographiste", ar: "المصمم", tone: "bg-plum-100 text-plum-700" },
  atelier: { fr: "Atelier", ar: "الورشة", tone: "bg-ochre-100 text-ochre-700" },
  magasinier: { fr: "Magasinier", ar: "مول المخزن", tone: "bg-clay-100 text-clay-700" },
  chauffeur: { fr: "Chauffeur", ar: "السائق", tone: "bg-mist-100 text-mist-700" },
  installateur: { fr: "Installateur", ar: "المركب", tone: "bg-teal-100 text-teal-700" },
};
export const MISSIONS = ["Chargement", "Livraison", "Montage", "Présence sur place", "Démontage", "Retour au dépôt", "Impression / atelier"];

/** Deux créneaux se chevauchent (sans heure = journée entière de l'événement) */
export function overlaps(a: { s: number; e: number }, b: { s: number; e: number }) {
  return a.s < b.e && b.s < a.e;
}
