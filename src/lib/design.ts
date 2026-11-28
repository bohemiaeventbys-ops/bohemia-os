import type { DesignProof } from "./clients";

export type Proof = DesignProof & { preview_path?: string | null };

/** Les deux validations : infographiste (nom + date) et cliente (statut validé + date). */
export const isGraphicOk = (p: Proof) => !!p.graphic_ok_at;
export const isClientOk = (p: Proof) => p.status === "valide";
export const isApproved = (p: Proof) => isGraphicOk(p) && isClientOk(p);

/**
 * Design à montrer en premier.
 * - reference : la dernière version qui a les deux validations (sinon la dernière approuvée par la cliente)
 * - pending : une version plus récente, encore en attente
 * - history : les versions précédentes, gardées pour mémoire
 */
export function designState(all: Proof[]) {
  const list = all.filter((p) => p.status !== "annule").sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const reference = list.find(isApproved) ?? list.find(isClientOk) ?? null;
  const pending = list.find((p) => p !== reference && !isApproved(p) && (!reference || p.created_at > reference.created_at)) ?? null;
  const main = reference ?? pending;
  const history = all.filter((p) => p !== main && p !== pending).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return { reference, pending: reference ? pending : null, main, history, fullyApproved: !!reference && isApproved(reference) };
}

export const isPdf = (path: string) => /\.pdf$/i.test(path);
