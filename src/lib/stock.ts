import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tone } from "./labels";

export const STOCK_BUCKET = "stock-photos";

export interface StockCategory { id: string; name: string; icon: string; color: Tone; sort_order: number }
export interface StockItem {
  id: string; name: string; category_id: string | null; themes: string[]; unit: string;
  qty_good: number; qty_repair: number; qty_broken: number; min_qty: number; location: string | null; dimensions: string | null;
  color: string | null; photo_path: string | null; notes: string | null; is_active: boolean; created_at: string; updated_at: string;
  code?: string | null; name_ar?: string | null;
}
export interface EventItem {
  id: string; event_id: string; item_id: string; qty: number; note: string | null; status: "reserve" | "prepare" | "charge" | "retourne";
  prepared_at: string | null; loaded_at: string | null; loaded_photo_path: string | null; loaded_by: string | null;
  returned_at: string | null; qty_returned_good: number | null; qty_returned_repair: number | null; qty_returned_broken: number | null;
  qty_missing: number | null; return_note: string | null; return_photo_path: string | null; finish?: string | null;
}
export interface StockMovement { id: string; item_id: string; event_id: string | null; kind: string; qty: number; detail: string | null; photo_path: string | null; by_employee: string | null; created_at: string }

export const LINE_STATUS: Record<EventItem["status"], { label: string; tone: Tone }> = {
  reserve: { label: "Réservé", tone: "mist" },
  prepare: { label: "Préparé", tone: "ochre" },
  charge: { label: "Chargé", tone: "teal" },
  retourne: { label: "Revenu", tone: "sage" },
};
export const MOVE_KIND: Record<string, string> = {
  entree: "Entrée", sortie: "Sortie", retour: "Retour", reparation: "Réparé", rebut: "Jeté", ajustement: "Signalement / inventaire",
};

/** Suggestions de thèmes (les thèmes restent libres) */
export const THEME_SUGGESTIONS = ["Bohème", "Champêtre", "Oriental", "Ramadan", "Mariage", "Baby shower", "Anniversaire", "Kids", "Noël", "Doré", "Blanc", "Rose poudré", "Corporate"];

export function totalQty(i: Pick<StockItem, "qty_good" | "qty_repair" | "qty_broken">) {
  return i.qty_good + i.qty_repair + i.qty_broken;
}

/** Envoie une photo (déjà réduite côté navigateur) et renvoie son chemin */
export async function uploadStockPhoto(supabase: SupabaseClient, prefix: string, f: FormDataEntryValue | null): Promise<{ path: string | null; error?: string }> {
  if (!(f instanceof File) || f.size === 0) return { path: null };
  if (!f.type.startsWith("image/")) return { path: null, error: "Le fichier doit être une photo." };
  if (f.size > 15 * 1024 * 1024) return { path: null, error: "Photo trop lourde (15 Mo max)." };
  const ext = f.type === "image/png" ? "png" : f.type === "image/webp" ? "webp" : "jpg";
  const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(STOCK_BUCKET).upload(path, f, { contentType: f.type });
  if (error) return { path: null, error: `Envoi de la photo impossible : ${error.message}` };
  return { path };
}

export interface ToolLoan {
  id: string; item_id: string; employee_id: string; qty: number; event_id: string | null; taken_at: string; due_back: string | null;
  returned_at: string | null; returned_ok: boolean | null; note: string | null;
}
/** Sous le seuil d'alerte (« il faut racheter ») */
export function isLow(i: Pick<StockItem, "qty_good" | "min_qty">) {
  return i.min_qty > 0 && i.qty_good < i.min_qty;
}
