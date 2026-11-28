import "server-only";
import { cookies } from "next/headers";
import { isLang, type Lang } from "./i18n";
import { getSession } from "./auth";

/** Langue de l'écran : celle de la personne connectée, sinon celle choisie sur la page de connexion. */
export async function getLang(): Promise<Lang> {
  const s = await getSession().catch(() => null);
  const mine = s?.employee.lang;
  if (isLang(mine)) return mine;
  const c = (await cookies()).get("lang")?.value;
  return isLang(c) ? c : "fr";
}
