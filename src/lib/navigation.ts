import type { Session } from "./auth";
import type { Tone } from "./labels";
import { hasKey, t, type Lang } from "./i18n";

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: string;
  phase?: number; // module prévu dans une phase ultérieure
  tone?: Tone;
  short?: string; // libellé court pour la barre du téléphone
}

export const UPCOMING: Record<string, { label: string; phase: number; icon: string; summary: string; features: string[] }> = {
  transport: { label: "Transport & Véhicules", phase: 5, icon: "truck", summary: "Les deux véhicules, trajets, kilométrage, gasoil et entretien.", features: ["Fiches véhicules, assurance, entretien", "Trajets par événement", "Gasoil avec ticket", "Rapports mensuels"] },
  commissions: { label: "Commissions", phase: 6, icon: "award", summary: "Commissions de performance configurables, contrôlées par la direction.", features: ["Règles : type, montant, critères, période", "Statuts : en attente → payée", "Tableau mensuel", "Aucune pénalité automatique"] },
  rapports: { label: "Rapports", phase: 6, icon: "chart", summary: "Rapports employés, événements, stock, véhicules et production, exports Excel/PDF.", features: ["Présences, retards, taux de réalisation", "Budgets et dépenses par événement", "Stock et pertes", "Exports Excel et PDF"] },
};

export function buildNav(s: Session, lang: Lang = "fr") {
  const managerish = s.isAdmin || s.managedDepartmentIds.length > 0;
  const main: NavItem[] = [];
  if (s.can("dashboard.direction") || managerish) main.push({ key: "dashboard", label: "Tableau de bord", href: "/", icon: "layout", tone: "ink" });
  main.push({ key: "terrain", label: "Terrain", href: "/terrain", icon: "truck", tone: "teal" });
  main.push({ key: "ma-journee", label: "Ma journée", href: "/ma-journee", icon: "sun", tone: "ochre" });
  main.push({ key: "calendrier", label: "Calendrier", href: "/calendrier", icon: "calendar", tone: "mist" });
  main.push({ key: "evenements", label: "Événements", href: "/evenements", icon: "sparkles", tone: "rose" });
  main.push({ key: "taches", label: managerish ? "Tâches" : "Mes tâches", href: "/taches", icon: "check", tone: "sage" });
  if (s.can("employees.view") || s.can("employees.manage") || managerish) main.push({ key: "equipe", label: "Équipe", href: "/equipe", icon: "users", tone: "plum" });
  main.push({ key: "pointage", label: s.can("attendance.view_all") || managerish ? "Pointage" : "Mon pointage", href: "/pointage", icon: "clock", tone: "teal" });
  if (s.can("clients.manage") || s.can("events.manage") || s.can("finance.view")) main.push({ key: "clients", label: "Clients", href: "/clients", icon: "contact", tone: "rose" });
  if (s.can("finance.view")) main.push({ key: "devis", label: "Devis & factures", href: "/devis", icon: "receipt", tone: "ink" });
  if (s.can("finance.view")) main.push({ key: "tva", label: "TVA", href: "/tva", icon: "receipt", tone: "ochre" });
  main.push({ key: "stock", label: "Dépôt & Stock", href: "/stock", icon: "warehouse", tone: "ochre" });
  main.push({ key: "achats", label: "Achats", href: "/achats", icon: "shopping", tone: "teal" });
  main.push({ key: "fournisseurs", label: "Fournisseurs", href: "/fournisseurs", icon: "store", tone: "plum" });
  main.push({ key: "conges", label: s.can("leaves.manage") || s.isAdmin ? "Congés & absences" : "Mes congés", href: "/conges", icon: "plane", tone: "clay" });

  const upcoming: NavItem[] = s.isAdmin
    ? Object.entries(UPCOMING).map(([key, u]) => ({ key, label: u.label, href: `/modules/${key}`, icon: u.icon, phase: u.phase }))
    : [];

  const bottom: NavItem[] = [{ key: "notifications", label: "Notifications", href: "/notifications", icon: "bell", tone: "clay" }];
  if (s.can("settings.manage") || s.can("audit.view")) bottom.push({ key: "parametres", label: "Paramètres", href: "/parametres", icon: "settings", tone: "neutral" });
  const tr = (i: NavItem): NavItem => {
    const own = i.label === "Mes tâches" ? "nav.mes-taches" : i.label === "Mon pointage" ? "nav.mon-pointage" : i.label === "Mes congés" ? "nav.mes-conges" : `nav.${i.key}`;
    const short = `short.${i.key}`;
    return { ...i, label: hasKey(own) ? t(lang, own) : i.label, short: hasKey(short) ? t(lang, short) : i.short };
  };
  return { main: main.map(tr), upcoming, bottom: bottom.map(tr) };
}
