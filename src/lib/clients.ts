import type { Tone } from "./labels";

export interface Client {
  id: string; kind: "particulier" | "entreprise"; name: string; contact_name: string | null; phone: string | null; whatsapp: string | null;
  email: string | null; address: string | null; city: string | null; ice: string | null; source: string | null; notes: string | null; created_at: string;
}
export interface Quote {
  id: string; number: string; event_id: string | null; client_id: string | null; title: string; status: "brouillon" | "envoye" | "accepte" | "refuse" | "annule";
  issue_date: string; valid_until: string | null; vat_rate: number; discount_mad: number; deposit_pct: number; intro: string | null; terms: string | null;
  subtotal_mad: number; vat_mad: number; total_mad: number; sent_at: string | null; decided_at: string | null; created_at: string;
}
export interface QuoteLine { id: string; quote_id: string; section: string | null; label: string; details: string | null; qty: number; unit_price: number; sort_order: number }
export interface Contract {
  id: string; number: string; quote_id: string | null; event_id: string | null; client_id: string | null; body: string;
  status: "brouillon" | "envoye" | "signe" | "annule"; signed_at: string | null; signed_file_path: string | null; created_at: string;
}
export interface Invoice {
  id: string; number: string; kind: "acompte" | "solde" | "totale"; quote_id: string | null; event_id: string | null; client_id: string | null;
  issue_date: string; due_date: string | null; vat_rate: number; subtotal_mad: number; vat_mad: number; total_mad: number; paid_mad: number;
  status: "emise" | "partielle" | "payee" | "annulee"; notes: string | null; created_at: string;
}
export interface InvoiceLine { id: string; invoice_id: string; label: string; details: string | null; qty: number; unit_price: number; sort_order: number }
export interface Payment { id: string; invoice_id: string | null; event_id: string | null; amount_mad: number; paid_on: string; method: string; reference: string | null; note: string | null; proof_path?: string | null }
export interface DesignProof {
  id: string; event_id: string; title: string; version: number; file_path: string; note: string | null; status: "a_valider" | "valide" | "a_modifier" | "annule";
  share_token: string; production_steps: string[]; production_due: string | null; client_comment: string | null; decided_at: string | null; created_by: string | null; created_at: string;
  preview_path?: string | null; graphic_ok_at?: string | null; graphic_ok_by?: string | null; client_proof_path?: string | null;
}
export interface Company {
  company_name: string; legal_name: string; address: string | null; phone: string | null; email: string | null; ice: string | null; rc: string | null;
  if_number: string | null; patente: string | null; bank_name: string | null; rib: string | null; vat_rate: number; deposit_pct: number;
  quote_validity_days: number; quote_terms: string; contract_terms: string; website?: string | null; signatory?: string | null;
}

export const QUOTE_STATUS: Record<Quote["status"], { label: string; tone: Tone }> = {
  brouillon: { label: "Brouillon", tone: "neutral" }, envoye: { label: "Envoyé", tone: "mist" }, accepte: { label: "Accepté", tone: "sage" },
  refuse: { label: "Refusé", tone: "clay" }, annule: { label: "Annulé", tone: "neutral" },
};
export const INVOICE_STATUS: Record<Invoice["status"], { label: string; tone: Tone }> = {
  emise: { label: "À payer", tone: "ochre" }, partielle: { label: "Payée en partie", tone: "mist" }, payee: { label: "Payée", tone: "sage" }, annulee: { label: "Annulée", tone: "neutral" },
};
export const INVOICE_KIND = { acompte: "Facture d'acompte", solde: "Facture de solde", totale: "Facture" } as const;
export const CONTRACT_STATUS: Record<Contract["status"], { label: string; tone: Tone }> = {
  brouillon: { label: "À envoyer", tone: "neutral" }, envoye: { label: "Envoyé, à signer", tone: "ochre" }, signe: { label: "Signé", tone: "sage" }, annule: { label: "Annulé", tone: "neutral" },
};
export const PROOF_STATUS: Record<DesignProof["status"], { label: string; tone: Tone }> = {
  a_valider: { label: "Chez la cliente", tone: "ochre" }, valide: { label: "Validée", tone: "sage" }, a_modifier: { label: "À modifier", tone: "clay" }, annule: { label: "Remplacée", tone: "neutral" },
};
export const PRODUCTION_STEPS: Record<string, string> = {
  impression: "Impression", vinyle: "Vinyle (découpe + pose)", decoupe: "Découpe (MDF, forex)", peinture: "Peinture", pose: "Pose sur place",
};
export const QUOTE_SECTIONS = ["Décoration", "Mobilier", "Fleurs", "Ballons", "Papeterie", "Lumières", "Animation", "Installation & transport"];
export const PAY_METHODS = ["Espèces", "Virement", "Chèque", "Carte"];
export const PROOF_BUCKET = "design-proofs";
export const CLIENT_DOCS_BUCKET = "client-docs";

/** Montant en toutes lettres n'est pas exigé ; on écrit les montants avec 2 décimales sur les documents. */
export function money2(v: number | string | null | undefined) {
  const n = Number(v ?? 0);
  return `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n).replace(/ /g, " ")} DH`;
}
