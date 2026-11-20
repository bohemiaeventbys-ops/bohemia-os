const mad = new Intl.NumberFormat("fr-MA", { style: "decimal", minimumFractionDigits: 0, maximumFractionDigits: 2 });
/** Montant en dirhams : « 12 500 DH » */
export function formatMAD(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  return `${mad.format(Number(v))} DH`;
}
export function fullName(e: { first_name: string; last_name?: string | null } | null | undefined): string {
  if (!e) return "—";
  return `${e.first_name} ${e.last_name ?? ""}`.trim();
}
export function initials(e: { first_name: string; last_name?: string | null }): string {
  return ((e.first_name?.[0] ?? "") + (e.last_name?.[0] ?? "")).toUpperCase();
}
