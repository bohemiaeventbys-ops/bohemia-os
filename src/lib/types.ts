export type AppRole = "admin" | "manager" | "employee";
export type TaskStatus = "a_faire" | "en_cours" | "bloque" | "en_attente" | "a_verifier" | "a_corriger" | "valide" | "termine";
export type TaskPriority = "basse" | "normale" | "haute" | "urgente";
export type DayStatus = "a_l_heure" | "en_retard" | "sortie_autorisee" | "journee_terminee" | "absent" | "conge" | "maladie" | "recuperation";
export type PunchKind = "arrivee" | "sortie" | "retour" | "depart";
export type EventType = "mariage" | "anniversaire" | "baby_shower" | "bapteme" | "corporate" | "ramadan" | "stand" | "ohmybox" | "autre";
export type EventStatus = "prospect" | "devis_envoye" | "confirme" | "en_preparation" | "pret" | "realise" | "cloture" | "annule";

export interface Department {
  id: string; name: string; code: string | null; description: string | null; scope: string[];
  color: string; sort_order: number; is_active: boolean;
}
export interface Employee {
  id: string; user_id: string | null; first_name: string; last_name: string; email: string | null; phone: string | null;
  job_title: string | null; department_id: string | null; role: AppRole; status: "actif" | "inactif" | "suspendu";
  hire_date: string | null; schedule_id: string | null; photo_path: string | null; notes: string | null; created_at: string; lang?: "fr" | "ar";
}
export interface WorkSchedule {
  id: string; name: string; days: Record<string, { start: string; end: string }>; grace_minutes: number; is_default: boolean;
}
export interface Task {
  id: string; title: string; description: string | null; instructions: string | null; expected_result: string | null;
  assignee_id: string | null; department_id: string | null; event_id: string | null; priority: TaskPriority; status: TaskStatus;
  planned_date: string | null; planned_time: string | null; due_date: string | null; due_time: string | null;
  requires_validation: boolean; blocked_reason: string | null; started_at: string | null; submitted_at: string | null;
  completed_at: string | null; created_by: string | null; created_at: string; updated_at: string; source_task_id: string | null;
}
export interface EventRow {
  id: string; name: string; event_type: EventType; status: EventStatus; client_name: string | null; client_phone: string | null; client_id?: string | null;
  event_date: string; address: string | null; delivery_at: string | null; setup_at: string | null; start_at: string | null;
  end_at: string | null; teardown_at: string | null; manager_id: string | null; notes: string | null;
  created_by: string | null; created_at: string;
  load_at?: string | null; access_notes?: string | null; site_contact_name?: string | null; site_contact_phone?: string | null;
  delivered_at?: string | null; invoice_handed_at?: string | null; guests?: number | null;
}
export interface AttendanceDay {
  employee_id: string; work_date: string; scheduled_start: string | null; scheduled_end: string | null; first_in: string | null;
  last_out: string | null; status: DayStatus; late_minutes: number; worked_minutes: number; overtime_minutes: number;
  manual_status: boolean; note: string | null;
}
export interface Punch {
  id: string; employee_id: string; work_date: string; kind: PunchKind; punched_at: string; source: "kiosque" | "correction"; voided: boolean;
}
export interface NotificationRow {
  id: string; kind: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string;
}
export interface LeaveRequest {
  id: string; employee_id: string; leave_type: string; start_date: string; end_date: string; status: string; comment: string | null;
  reviewed_by?: string | null; reviewed_at?: string | null; review_comment?: string | null; created_at?: string;
}

export type EventFinance = {
  event_id: string; budget_mad: number | null; quote_mad: number | null; paid_mad: number | null;
  payment_status: "non_paye" | "acompte" | "paye"; notes: string | null; updated_at: string;
};
