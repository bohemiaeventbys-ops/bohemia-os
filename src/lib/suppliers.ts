import type { Tone } from "./labels";

export interface Supplier {
  id: string; name: string; kind: "fournisseur" | "prestataire" | "sous_traitant"; categories: string[];
  contact_name: string | null; phone: string | null; whatsapp: string | null; email: string | null; address: string | null;
  notes: string | null; rating: number | null; is_active: boolean; created_at: string;
}
export interface EventService {
  id: string; event_id: string; supplier_id: string; description: string; service_date: string | null; service_time: string | null;
  status: "a_reserver" | "reserve" | "confirme" | "realise" | "annule"; notes: string | null; created_at: string;
}
export interface Purchase {
  id: string; title: string; details: string | null; event_id: string | null; supplier_id: string | null; needed_by: string | null;
  status: "demande" | "validee" | "refusee" | "commandee" | "recue" | "annulee"; requested_by: string | null; decided_by: string | null;
  decided_at: string | null; decision_note: string | null; ordered_by: string | null; ordered_at: string | null; received_by: string | null;
  received_at: string | null; received_photo_path: string | null; created_at: string;
}
export interface PurchaseLine { id: string; request_id: string; label: string; qty: number; unit: string; stock_item_id: string | null; sort_order: number }
export interface Expense {
  id: string; event_id: string | null; supplier_id: string | null; service_id: string | null; purchase_id: string | null; label: string;
  amount_mad: number; paid_mad: number; due_date: string | null; paid_at: string | null; payment_method: string | null; created_at: string;
}

export const SUPPLIER_KIND: Record<Supplier["kind"], { label: string; plural: string; tone: Tone }> = {
  fournisseur: { label: "Fournisseur", plural: "Fournisseurs", tone: "mist" },
  prestataire: { label: "Prestataire", plural: "Prestataires", tone: "rose" },
  sous_traitant: { label: "Sous-traitant", plural: "Sous-traitants", tone: "ochre" },
};
export const SUPPLIER_CATEGORIES = ["Moquette", "Animation", "Imprimerie", "Vinyle", "MDF", "Forex", "Polypro", "Bois", "Peinture", "Tissus", "Fleurs", "Ballons", "Location de mobilier", "Son & lumière", "Traiteur", "Photographe", "Transport", "Menuiserie", "Quincaillerie"];
export const SERVICE_STATUS: Record<EventService["status"], { label: string; tone: Tone }> = {
  a_reserver: { label: "À réserver", tone: "clay" },
  reserve: { label: "Réservé", tone: "ochre" },
  confirme: { label: "Confirmé", tone: "sage" },
  realise: { label: "Réalisé", tone: "ink" },
  annule: { label: "Annulé", tone: "neutral" },
};
export const PURCHASE_STATUS: Record<Purchase["status"], { label: string; tone: Tone }> = {
  demande: { label: "À valider", tone: "ochre" },
  validee: { label: "Validé : à commander", tone: "mist" },
  refusee: { label: "Refusé", tone: "clay" },
  commandee: { label: "Commandé : à recevoir", tone: "plum" },
  recue: { label: "Reçu", tone: "sage" },
  annulee: { label: "Annulé", tone: "neutral" },
};

/** Lien WhatsApp à partir d'un numéro marocain (06…, 07…, +212…) */
export function waLink(n: string | null | undefined) {
  if (!n) return null;
  let d = n.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = "212" + d.slice(1);
  return `https://wa.me/${d}`;
}
export function telLink(n: string | null | undefined) {
  return n ? `tel:${n.replace(/[^\d+]/g, "")}` : null;
}

export const PURCHASE_BUCKET = "purchase-files";
export const PURCHASE_UNITS = ["pièce", "m", "m²", "kg", "litre", "rouleau", "plaque", "boîte", "lot"];

/** « 24 pièces », « 3 rouleaux », « 6 m » */
export function qtyUnit(qty: number, unit: string) {
  const n = Number(qty);
  if (n <= 1 || /^(m|m²|kg)$/.test(unit) || unit.endsWith("s") || unit.endsWith("x")) return `${n} ${unit}`;
  return `${n} ${unit.endsWith("eau") ? unit + "x" : unit + "s"}`;
}
