export type ActionResult = { ok?: string; error?: string; redirect?: string } | null;

export function fail(error: unknown): ActionResult {
  if (typeof error === "string") return { error };
  if (error && typeof error === "object" && "message" in error) {
    const msg = String((error as { message: string }).message);
    if (msg.includes("row-level security")) return { error: "Action non autorisée pour votre profil." };
    if (msg.includes("duplicate key")) return { error: "Cet élément existe déjà." };
    return { error: msg };
  }
  return { error: "Une erreur est survenue." };
}

export function str(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}
