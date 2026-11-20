import type { DayStatus, EventStatus, EventType, PunchKind, TaskPriority, TaskStatus, AppRole } from "./types";

export type Tone = "neutral" | "sand" | "sage" | "clay" | "ochre" | "mist" | "ink";

export const TASK_STATUS: Record<TaskStatus, { label: string; tone: Tone }> = {
  a_faire: { label: "À faire", tone: "neutral" },
  en_cours: { label: "En cours", tone: "mist" },
  bloque: { label: "Bloqué", tone: "clay" },
  en_attente: { label: "En attente", tone: "sand" },
  a_verifier: { label: "À vérifier", tone: "ochre" },
  a_corriger: { label: "À corriger", tone: "clay" },
  valide: { label: "Validé", tone: "sage" },
  termine: { label: "Terminé", tone: "ink" },
};
export const TASK_STATUS_ORDER: TaskStatus[] = ["a_faire", "en_cours", "en_attente", "bloque", "a_verifier", "a_corriger", "valide", "termine"];
export const OPEN_STATUSES: TaskStatus[] = ["a_faire", "en_cours", "bloque", "en_attente", "a_corriger"];
export const DONE_STATUSES: TaskStatus[] = ["valide", "termine"];

export const PRIORITY: Record<TaskPriority, { label: string; tone: Tone; rank: number }> = {
  urgente: { label: "Urgente", tone: "clay", rank: 0 },
  haute: { label: "Haute", tone: "ochre", rank: 1 },
  normale: { label: "Normale", tone: "neutral", rank: 2 },
  basse: { label: "Basse", tone: "sand", rank: 3 },
};

export const DAY_STATUS: Record<DayStatus, { label: string; tone: Tone }> = {
  a_l_heure: { label: "À l'heure", tone: "sage" },
  en_retard: { label: "En retard", tone: "clay" },
  sortie_autorisee: { label: "Sortie autorisée", tone: "ochre" },
  journee_terminee: { label: "Journée terminée", tone: "ink" },
  absent: { label: "Absent", tone: "clay" },
  conge: { label: "Congé", tone: "mist" },
  maladie: { label: "Maladie", tone: "mist" },
  recuperation: { label: "Récupération", tone: "mist" },
};
export const MANUAL_DAY_STATUSES: DayStatus[] = ["absent", "conge", "maladie", "recuperation", "sortie_autorisee"];

export const PUNCH_KIND: Record<PunchKind, string> = {
  arrivee: "Arrivée",
  sortie: "Sortie autorisée",
  retour: "Retour",
  depart: "Départ",
};

export const EVENT_TYPE: Record<EventType, string> = {
  mariage: "Mariage",
  anniversaire: "Anniversaire",
  baby_shower: "Baby shower",
  bapteme: "Baptême",
  corporate: "Corporate",
  ramadan: "Ramadan",
  stand: "Stand",
  ohmybox: "OHMYBOX",
  autre: "Autre",
};
export const EVENT_STATUS: Record<EventStatus, { label: string; tone: Tone }> = {
  prospect: { label: "Prospect", tone: "sand" },
  devis_envoye: { label: "Devis envoyé", tone: "ochre" },
  confirme: { label: "Confirmé", tone: "mist" },
  en_preparation: { label: "En préparation", tone: "ochre" },
  pret: { label: "Prêt", tone: "sage" },
  realise: { label: "Réalisé", tone: "ink" },
  cloture: { label: "Clôturé", tone: "neutral" },
  annule: { label: "Annulé", tone: "clay" },
};

export const ROLE: Record<AppRole, string> = {
  admin: "Administrateur / Direction",
  manager: "Responsable de département",
  employee: "Employé",
};

export const LEAVE_TYPE: Record<string, string> = {
  conge: "Congé", absence: "Absence", maladie: "Maladie", retard: "Retard", sortie_autorisee: "Sortie autorisée", recuperation: "Récupération",
};

export const WEEKDAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
