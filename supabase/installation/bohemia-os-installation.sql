-- BOHEMIA OS : installation complète en une fois (Supabase > SQL Editor > New query > coller > Run)
-- Généré à partir de supabase/migrations/ (9 fichiers).


-- ==================== 20261120000001_fondations.sql ====================
-- =====================================================================
-- BOHEMIA OS — Migration 1 : fondations (Phase 1 + Phase 2)
-- Organisation, employés, rôles & permissions, horaires, pointage,
-- tâches, événements (socle), congés (socle), notifications, journal.
-- Fuseau horaire métier : Africa/Casablanca. Devise : MAD.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Types énumérés
-- ---------------------------------------------------------------------
create type public.app_role as enum ('admin', 'manager', 'employee');
create type public.employee_status as enum ('actif', 'inactif', 'suspendu');
create type public.punch_kind as enum ('arrivee', 'sortie', 'retour', 'depart');
create type public.day_status as enum (
  'a_l_heure', 'en_retard', 'sortie_autorisee', 'journee_terminee',
  'absent', 'conge', 'maladie', 'recuperation'
);
create type public.task_status as enum (
  'a_faire', 'en_cours', 'bloque', 'en_attente', 'a_verifier', 'a_corriger', 'valide', 'termine'
);
create type public.task_priority as enum ('basse', 'normale', 'haute', 'urgente');
create type public.event_type as enum (
  'mariage', 'anniversaire', 'baby_shower', 'bapteme', 'corporate', 'ramadan', 'stand', 'ohmybox', 'autre'
);
create type public.event_status as enum (
  'prospect', 'devis_envoye', 'confirme', 'en_preparation', 'pret', 'realise', 'cloture', 'annule'
);
create type public.leave_type as enum ('conge', 'absence', 'maladie', 'retard', 'sortie_autorisee', 'recuperation');
create type public.leave_status as enum ('en_attente', 'validee', 'refusee', 'annulee');

-- ---------------------------------------------------------------------
-- Paramètres de l'entreprise (une seule ligne)
-- ---------------------------------------------------------------------
create table public.company_settings (
  id boolean primary key default true check (id),
  company_name text not null default 'Bohemia Events',
  timezone text not null default 'Africa/Casablanca',
  currency text not null default 'MAD',
  overdue_notify_management boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.company_settings default values;

-- ---------------------------------------------------------------------
-- Horaires de travail configurables
-- days : {"1":{"start":"09:00","end":"18:00"}, ...} (1 = lundi … 7 = dimanche)
-- un jour absent de l'objet = jour non travaillé
-- ---------------------------------------------------------------------
create table public.work_schedules (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  days jsonb not null default '{}'::jsonb,
  grace_minutes int not null default 10 check (grace_minutes between 0 and 120),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index work_schedules_one_default on public.work_schedules (is_default) where is_default;

-- ---------------------------------------------------------------------
-- Départements (modifiables depuis l'interface)
-- ---------------------------------------------------------------------
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text unique,
  description text,
  scope text[] not null default '{}',        -- domaines gérés (affichage)
  color text not null default '#A39382',     -- teinte douce pour le calendrier
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Employés (un employé peut exister sans compte de connexion)
-- ---------------------------------------------------------------------
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  first_name text not null,
  last_name text not null default '',
  email text,
  phone text,
  job_title text,
  department_id uuid references public.departments (id) on delete set null,
  role public.app_role not null default 'employee',
  status public.employee_status not null default 'actif',
  hire_date date,
  schedule_id uuid references public.work_schedules (id) on delete set null,
  photo_path text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index employees_department_idx on public.employees (department_id);

-- PIN de pointage : table séparée, jamais lisible depuis l'API
create table public.employee_pins (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  pin_hash text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

-- Responsables de département (plusieurs possibles : Khaoula & Sihem, Ayoub & Mohamed)
create table public.department_managers (
  department_id uuid not null references public.departments (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  primary key (department_id, employee_id)
);

-- ---------------------------------------------------------------------
-- Permissions : valeurs par défaut par rôle + surcharges par utilisateur
-- ---------------------------------------------------------------------
create table public.permissions (
  key text primary key,
  label text not null,
  module text not null,
  sort_order int not null default 100
);

create table public.role_permissions (
  role public.app_role not null,
  permission text not null references public.permissions (key) on delete cascade,
  primary key (role, permission)
);

create table public.employee_permissions (
  employee_id uuid not null references public.employees (id) on delete cascade,
  permission text not null references public.permissions (key) on delete cascade,
  granted boolean not null,           -- true = accordée, false = retirée
  primary key (employee_id, permission)
);

-- ---------------------------------------------------------------------
-- Fonctions d'identité et d'autorisation (SECURITY DEFINER, sans récursion RLS)
-- ---------------------------------------------------------------------
create or replace function public.current_employee_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.employees where user_id = auth.uid() and status = 'actif'
$$;

create or replace function public.current_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.employees where user_id = auth.uid() and status = 'actif'
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.employees where user_id = auth.uid() and status = 'actif'), false)
$$;

create or replace function public.has_perm(p text)
returns boolean language sql stable security definer set search_path = public as $$
  with me as (
    select id, role from public.employees where user_id = auth.uid() and status = 'actif'
  )
  select coalesce((
    select case
      when me.role = 'admin' then true
      else coalesce(
        (select ep.granted from public.employee_permissions ep where ep.employee_id = me.id and ep.permission = p),
        exists (select 1 from public.role_permissions rp where rp.role = me.role and rp.permission = p)
      )
    end
    from me
  ), false)
$$;

-- Départements dont l'utilisateur courant est responsable
create or replace function public.managed_department_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select dm.department_id from public.department_managers dm
  where dm.employee_id = public.current_employee_id()
$$;

create or replace function public.manages_employee(emp uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.employees e
    where e.id = emp and e.department_id in (select public.managed_department_ids())
  )
$$;

-- ---------------------------------------------------------------------
-- Journal d'audit générique (qui, quoi, quand, avant/après)
-- ---------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid,
  actor_employee_id uuid,
  table_name text not null,
  record_id text,
  action text not null,               -- INSERT / UPDATE / DELETE / ou action métier
  summary text,
  old_data jsonb,
  new_data jsonb
);
create index audit_log_table_record_idx on public.audit_log (table_name, record_id);
create index audit_log_occurred_idx on public.audit_log (occurred_at desc);

create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_id text;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old) - 'pin_hash'; end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new) - 'pin_hash'; end if;
  if tg_op = 'UPDATE' and v_old - 'updated_at' = v_new - 'updated_at' then
    return new;
  end if;
  v_id := coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'employee_id', v_old ->> 'employee_id');
  insert into public.audit_log (actor_user_id, actor_employee_id, table_name, record_id, action, old_data, new_data)
  values (auth.uid(), public.current_employee_id(), tg_table_name, v_id, tg_op, v_old, v_new);
  return coalesce(new, old);
end $$;

create or replace function public.log_action(p_table text, p_record text, p_action text, p_summary text, p_data jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log (actor_user_id, actor_employee_id, table_name, record_id, action, summary, new_data)
  values (auth.uid(), public.current_employee_id(), p_table, p_record, p_action, p_summary, p_data)
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Événements (socle — enrichi en Phase 3 : fiches techniques, sous-sections)
-- ---------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_type public.event_type not null default 'autre',
  status public.event_status not null default 'confirme',
  client_name text,
  client_phone text,
  event_date date not null,
  address text,
  delivery_at timestamptz,
  setup_at timestamptz,
  start_at timestamptz,
  end_at timestamptz,
  teardown_at timestamptz,
  manager_id uuid references public.employees (id) on delete set null,
  budget_mad numeric(12, 2),
  notes text,
  created_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index events_date_idx on public.events (event_date);

create table public.event_team (
  event_id uuid not null references public.events (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  role_label text,
  primary key (event_id, employee_id)
);

-- ---------------------------------------------------------------------
-- Pointage
-- time_punches : pointages bruts, jamais supprimés (annulés via correction)
-- attendance_days : synthèse par employé et par jour (recalculée)
-- attendance_corrections : toute correction (auteur, date, motif, avant/après)
-- kiosk_devices : ordinateurs autorisés à servir de kiosque
-- ---------------------------------------------------------------------
create table public.kiosk_devices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  token_hash text not null unique,
  allowed_ip text,                        -- facultatif : IP publique du bureau
  is_active boolean not null default true,
  created_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table public.time_punches (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  work_date date not null,
  kind public.punch_kind not null,
  punched_at timestamptz not null default now(),
  source text not null default 'kiosque' check (source in ('kiosque', 'correction')),
  kiosk_id uuid references public.kiosk_devices (id) on delete set null,
  voided boolean not null default false,
  created_at timestamptz not null default now()
);
create index time_punches_emp_date_idx on public.time_punches (employee_id, work_date);

create table public.attendance_days (
  employee_id uuid not null references public.employees (id) on delete cascade,
  work_date date not null,
  scheduled_start time,
  scheduled_end time,
  first_in timestamptz,
  last_out timestamptz,
  status public.day_status not null,
  late_minutes int not null default 0,
  worked_minutes int not null default 0,
  overtime_minutes int not null default 0,
  manual_status boolean not null default false,  -- statut fixé par la direction
  note text,
  updated_at timestamptz not null default now(),
  primary key (employee_id, work_date)
);
create index attendance_days_date_idx on public.attendance_days (work_date);

create table public.attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  work_date date not null,
  punch_id uuid references public.time_punches (id) on delete set null,
  action text not null check (action in ('ajout', 'modification', 'annulation', 'statut')),
  old_value jsonb,
  new_value jsonb,
  reason text not null check (length(trim(reason)) >= 3),
  corrected_by uuid not null references public.employees (id),
  corrected_at timestamptz not null default now()
);
create index attendance_corrections_emp_idx on public.attendance_corrections (employee_id, work_date);

-- ---------------------------------------------------------------------
-- Congés & absences (socle — écrans complets en Phase 6)
-- ---------------------------------------------------------------------
create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  leave_type public.leave_type not null default 'conge',
  start_date date not null,
  end_date date not null,
  comment text,
  status public.leave_status not null default 'en_attente',
  reviewed_by uuid references public.employees (id) on delete set null,
  reviewed_at timestamptz,
  review_comment text,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index leave_requests_dates_idx on public.leave_requests (start_date, end_date);

-- ---------------------------------------------------------------------
-- Tâches
-- ---------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  description text,
  instructions text,
  expected_result text,
  assignee_id uuid references public.employees (id) on delete set null,
  department_id uuid references public.departments (id) on delete set null,
  event_id uuid references public.events (id) on delete set null,
  priority public.task_priority not null default 'normale',
  status public.task_status not null default 'a_faire',
  planned_date date,             -- jour de réalisation prévu (planning)
  planned_time time,             -- heure de réalisation prévue
  due_date date,
  due_time time,
  requires_validation boolean not null default true,
  blocked_reason text,
  started_at timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz,
  source_task_id uuid references public.tasks (id) on delete set null,  -- duplication
  created_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_assignee_idx on public.tasks (assignee_id, status);
create index tasks_planned_idx on public.tasks (planned_date);
create index tasks_due_idx on public.tasks (due_date);
create index tasks_event_idx on public.tasks (event_id);

create table public.task_collaborators (
  task_id uuid not null references public.tasks (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  primary key (task_id, employee_id)
);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid not null references public.employees (id),
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index task_comments_task_idx on public.task_comments (task_id, created_at);

create table public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Historique lisible des tâches (statuts, réassignations, deadlines…)
create table public.task_history (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks (id) on delete cascade,
  actor_id uuid references public.employees (id) on delete set null,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);
create index task_history_task_idx on public.task_history (task_id, created_at);

-- ---------------------------------------------------------------------
-- Notifications internes
-- ---------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.employees (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_id, read_at, created_at desc);
create unique index notifications_dedupe_idx on public.notifications (recipient_id, dedupe_key) where dedupe_key is not null;

create or replace function public.notify(p_recipient uuid, p_kind text, p_title text, p_body text, p_link text, p_dedupe text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_recipient is null then return; end if;
  -- on ne se notifie pas soi-même
  if p_recipient = public.current_employee_id() then return; end if;
  insert into public.notifications (recipient_id, kind, title, body, link, dedupe_key)
  values (p_recipient, p_kind, p_title, p_body, p_link, p_dedupe)
  on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
end $$;

-- =====================================================================
-- Triggers updated_at + audit
-- =====================================================================
create trigger t_touch before update on public.work_schedules for each row execute function public.touch_updated_at();
create trigger t_touch before update on public.departments for each row execute function public.touch_updated_at();
create trigger t_touch before update on public.employees for each row execute function public.touch_updated_at();
create trigger t_touch before update on public.events for each row execute function public.touch_updated_at();
create trigger t_touch before update on public.tasks for each row execute function public.touch_updated_at();

create trigger t_audit after insert or update or delete on public.departments for each row execute function public.audit_trigger();
create trigger t_audit after insert or update or delete on public.employees for each row execute function public.audit_trigger();
create trigger t_audit after insert or update or delete on public.department_managers for each row execute function public.audit_trigger();
create trigger t_audit after insert or update or delete on public.employee_permissions for each row execute function public.audit_trigger();
create trigger t_audit after insert or update or delete on public.role_permissions for each row execute function public.audit_trigger();
create trigger t_audit after insert or update or delete on public.work_schedules for each row execute function public.audit_trigger();
create trigger t_audit after insert or update or delete on public.events for each row execute function public.audit_trigger();
create trigger t_audit after insert or update or delete on public.tasks for each row execute function public.audit_trigger();
create trigger t_audit after insert or update or delete on public.attendance_corrections for each row execute function public.audit_trigger();
create trigger t_audit after insert or update or delete on public.kiosk_devices for each row execute function public.audit_trigger();
create trigger t_audit after insert or update or delete on public.leave_requests for each row execute function public.audit_trigger();
create trigger t_audit after update on public.company_settings for each row execute function public.audit_trigger();

-- =====================================================================
-- Pointage : logique métier côté base (heure serveur, jamais l'heure du poste)
-- =====================================================================
create or replace function public.local_today()
returns date language sql stable as $$
  select (now() at time zone 'Africa/Casablanca')::date
$$;

-- Horaire prévu d'un employé pour une date (null si jour non travaillé)
create or replace function public.scheduled_hours(p_employee uuid, p_date date, out start_t time, out end_t time, out grace int)
language plpgsql stable security definer set search_path = public as $$
declare
  s public.work_schedules;
  d jsonb;
begin
  select ws.* into s from public.employees e
  left join public.work_schedules ws on ws.id = e.schedule_id
  where e.id = p_employee;
  if s.id is null then
    select * into s from public.work_schedules where is_default limit 1;
  end if;
  if s.id is null then return; end if;
  d := s.days -> extract(isodow from p_date)::int::text;
  grace := s.grace_minutes;
  if d is null or d ->> 'start' is null then return; end if;
  start_t := (d ->> 'start')::time;
  end_t := (d ->> 'end')::time;
end $$;

-- Recalcule la synthèse d'une journée à partir des pointages non annulés
create or replace function public.recompute_attendance_day(p_employee uuid, p_date date)
returns void language plpgsql security definer set search_path = public as $$
declare
  sh record;
  p record;
  v_first timestamptz;
  v_last_out timestamptz;
  v_last_kind public.punch_kind;
  v_open timestamptz;
  v_worked int := 0;
  v_late int := 0;
  v_sched_start timestamptz;
  v_sched_minutes int := 0;
  v_status public.day_status;
  v_existing public.attendance_days;
begin
  select * into sh from public.scheduled_hours(p_employee, p_date);
  select * into v_existing from public.attendance_days where employee_id = p_employee and work_date = p_date;

  for p in
    select kind, punched_at from public.time_punches
    where employee_id = p_employee and work_date = p_date and not voided
    order by punched_at
  loop
    if p.kind in ('arrivee', 'retour') then
      if v_first is null then v_first := p.punched_at; end if;
      v_open := p.punched_at;
    elsif p.kind in ('sortie', 'depart') and v_open is not null then
      v_worked := v_worked + floor(extract(epoch from (p.punched_at - v_open)) / 60)::int;
      v_open := null;
      if p.kind = 'depart' then v_last_out := p.punched_at; end if;
    end if;
    v_last_kind := p.kind;
  end loop;

  -- aucun pointage valide : on supprime la synthèse sauf statut manuel
  if v_first is null then
    if v_existing.manual_status then
      update public.attendance_days set first_in = null, last_out = null, worked_minutes = 0,
        late_minutes = 0, overtime_minutes = 0, updated_at = now()
      where employee_id = p_employee and work_date = p_date;
    else
      delete from public.attendance_days where employee_id = p_employee and work_date = p_date;
    end if;
    return;
  end if;

  if sh.start_t is not null then
    v_sched_start := (p_date + sh.start_t) at time zone 'Africa/Casablanca';
    v_late := greatest(0, floor(extract(epoch from (v_first - v_sched_start)) / 60)::int);
    if v_late <= coalesce(sh.grace, 0) then v_late := 0; end if;
    v_sched_minutes := floor(extract(epoch from (sh.end_t - sh.start_t)) / 60)::int;
  end if;

  v_status := case
    when v_last_kind = 'depart' then 'journee_terminee'
    when v_last_kind = 'sortie' then 'sortie_autorisee'
    when v_late > 0 then 'en_retard'
    else 'a_l_heure'
  end;

  insert into public.attendance_days as a (employee_id, work_date, scheduled_start, scheduled_end, first_in, last_out,
    status, late_minutes, worked_minutes, overtime_minutes, updated_at)
  values (p_employee, p_date, sh.start_t, sh.end_t, v_first, v_last_out, v_status, v_late, v_worked,
    case when v_last_kind = 'depart' and v_sched_minutes > 0 then greatest(0, v_worked - v_sched_minutes) else 0 end, now())
  on conflict (employee_id, work_date) do update set
    scheduled_start = excluded.scheduled_start,
    scheduled_end = excluded.scheduled_end,
    first_in = excluded.first_in,
    last_out = excluded.last_out,
    status = case when a.manual_status then a.status else excluded.status end,
    late_minutes = excluded.late_minutes,
    worked_minutes = excluded.worked_minutes,
    overtime_minutes = excluded.overtime_minutes,
    updated_at = now();
end $$;

-- Liste des employés pour l'écran kiosque (poste autorisé uniquement)
create or replace function public.kiosk_employees(p_token text)
returns table (id uuid, first_name text, last_name text, photo_path text, department text, last_kind public.punch_kind, has_pin boolean)
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_kiosk uuid;
begin
  select k.id into v_kiosk from public.kiosk_devices k
  where k.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and k.is_active;
  if v_kiosk is null then raise exception 'KIOSQUE_NON_AUTORISE'; end if;
  update public.kiosk_devices set last_seen_at = now() where kiosk_devices.id = v_kiosk;
  return query
    select e.id, e.first_name, e.last_name, e.photo_path, d.name,
      (select tp.kind from public.time_punches tp
        where tp.employee_id = e.id and tp.work_date = public.local_today() and not tp.voided
        order by tp.punched_at desc limit 1),
      exists (select 1 from public.employee_pins ep where ep.employee_id = e.id)
    from public.employees e
    left join public.departments d on d.id = e.department_id
    where e.status = 'actif'
    order by e.first_name, e.last_name;
end $$;

-- Pointage depuis le kiosque : vérifie le poste, le PIN, la séquence logique
create or replace function public.kiosk_punch(p_token text, p_employee uuid, p_pin text, p_kind public.punch_kind, p_ip text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_kiosk public.kiosk_devices;
  v_pin public.employee_pins;
  v_last public.punch_kind;
  v_today date := public.local_today();
  v_now timestamptz := now();
  v_day public.attendance_days;
  v_emp public.employees;
begin
  select * into v_kiosk from public.kiosk_devices
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and is_active;
  if v_kiosk.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ce poste n''est pas autorisé pour le pointage.');
  end if;
  if v_kiosk.allowed_ip is not null and coalesce(p_ip, '') <> v_kiosk.allowed_ip then
    return jsonb_build_object('ok', false, 'error', 'Pointage refusé : réseau non autorisé.');
  end if;

  select * into v_emp from public.employees where id = p_employee and status = 'actif';
  if v_emp.id is null then
    return jsonb_build_object('ok', false, 'error', 'Employé introuvable ou inactif.');
  end if;

  select * into v_pin from public.employee_pins where employee_id = p_employee for update;
  if v_pin.employee_id is null then
    return jsonb_build_object('ok', false, 'error', 'Aucun code PIN défini. Contactez la direction.');
  end if;
  if v_pin.locked_until is not null and v_pin.locked_until > v_now then
    return jsonb_build_object('ok', false, 'error', 'Trop de tentatives. Réessayez dans quelques minutes.');
  end if;
  if extensions.crypt(p_pin, v_pin.pin_hash) <> v_pin.pin_hash then
    update public.employee_pins set
      failed_attempts = failed_attempts + 1,
      locked_until = case when failed_attempts + 1 >= 5 then v_now + interval '5 minutes' else null end
    where employee_id = p_employee;
    return jsonb_build_object('ok', false, 'error', 'Code PIN incorrect.');
  end if;
  update public.employee_pins set failed_attempts = 0, locked_until = null where employee_id = p_employee;

  select kind into v_last from public.time_punches
  where employee_id = p_employee and work_date = v_today and not voided
  order by punched_at desc limit 1;

  if p_kind = 'arrivee' and v_last is not null then
    return jsonb_build_object('ok', false, 'error', 'Arrivée déjà enregistrée aujourd''hui.');
  elsif p_kind = 'sortie' and (v_last is null or v_last not in ('arrivee', 'retour')) then
    return jsonb_build_object('ok', false, 'error', 'Vous devez être présent pour déclarer une sortie.');
  elsif p_kind = 'retour' and (v_last is distinct from 'sortie') then
    return jsonb_build_object('ok', false, 'error', 'Aucune sortie en cours.');
  elsif p_kind = 'depart' and (v_last is null or v_last not in ('arrivee', 'retour')) then
    return jsonb_build_object('ok', false, 'error', case when v_last = 'depart' then 'Départ déjà enregistré.' when v_last = 'sortie' then 'Pointez votre retour avant le départ.' else 'Aucune arrivée enregistrée aujourd''hui.' end);
  end if;

  insert into public.time_punches (employee_id, work_date, kind, punched_at, source, kiosk_id)
  values (p_employee, v_today, p_kind, v_now, 'kiosque', v_kiosk.id);

  perform public.recompute_attendance_day(p_employee, v_today);
  select * into v_day from public.attendance_days where employee_id = p_employee and work_date = v_today;

  return jsonb_build_object(
    'ok', true,
    'employee', trim(v_emp.first_name || ' ' || v_emp.last_name),
    'kind', p_kind,
    'at', v_now,
    'status', v_day.status,
    'late_minutes', v_day.late_minutes,
    'worked_minutes', v_day.worked_minutes,
    'overtime_minutes', v_day.overtime_minutes
  );
end $$;

-- Définir / changer le PIN (direction ou permission employees.manage)
create or replace function public.set_employee_pin(p_employee uuid, p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.has_perm('employees.manage') then raise exception 'Permission refusée'; end if;
  if p_pin !~ '^[0-9]{4,6}$' then raise exception 'Le PIN doit contenir 4 à 6 chiffres'; end if;
  insert into public.employee_pins (employee_id, pin_hash) values (p_employee, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)))
  on conflict (employee_id) do update set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null, updated_at = now();
  perform public.log_action('employee_pins', p_employee::text, 'PIN', 'Code PIN défini ou modifié');
end $$;

-- Corrections de pointage : uniquement via cette fonction, toujours tracées
create or replace function public.correct_punch(
  p_action text,              -- 'ajout' | 'modification' | 'annulation'
  p_employee uuid,
  p_date date,
  p_reason text,
  p_punch uuid default null,
  p_kind public.punch_kind default null,
  p_time timestamptz default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.current_employee_id();
  v_old public.time_punches;
  v_new_id uuid;
begin
  if not (public.has_perm('attendance.correct')) then raise exception 'Permission refusée'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'Le motif est obligatoire'; end if;
  if p_employee = v_me and not public.is_admin() then raise exception 'Vous ne pouvez pas corriger votre propre pointage'; end if;

  if p_action = 'ajout' then
    if p_kind is null or p_time is null then raise exception 'Type et heure requis'; end if;
    insert into public.time_punches (employee_id, work_date, kind, punched_at, source)
    values (p_employee, p_date, p_kind, p_time, 'correction') returning id into v_new_id;
    insert into public.attendance_corrections (employee_id, work_date, punch_id, action, old_value, new_value, reason, corrected_by)
    values (p_employee, p_date, v_new_id, 'ajout', null, jsonb_build_object('kind', p_kind, 'at', p_time), p_reason, v_me);
  elsif p_action in ('modification', 'annulation') then
    select * into v_old from public.time_punches where id = p_punch and employee_id = p_employee and not voided;
    if v_old.id is null then raise exception 'Pointage introuvable'; end if;
    -- le pointage d'origine n'est jamais modifié : il est annulé, et remplacé si besoin
    update public.time_punches set voided = true where id = v_old.id;
    if p_action = 'modification' then
      insert into public.time_punches (employee_id, work_date, kind, punched_at, source)
      values (p_employee, p_date, coalesce(p_kind, v_old.kind), coalesce(p_time, v_old.punched_at), 'correction')
      returning id into v_new_id;
    end if;
    insert into public.attendance_corrections (employee_id, work_date, punch_id, action, old_value, new_value, reason, corrected_by)
    values (p_employee, p_date, v_old.id, p_action,
      jsonb_build_object('kind', v_old.kind, 'at', v_old.punched_at),
      case when p_action = 'modification' then jsonb_build_object('kind', coalesce(p_kind, v_old.kind), 'at', coalesce(p_time, v_old.punched_at), 'punch_id', v_new_id) end,
      p_reason, v_me);
  else
    raise exception 'Action inconnue';
  end if;

  perform public.recompute_attendance_day(p_employee, p_date);
end $$;

-- Statut manuel d'une journée (absent, congé, maladie, récupération…) — tracé
create or replace function public.set_day_status(p_employee uuid, p_date date, p_status public.day_status, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_old public.attendance_days;
begin
  if not public.has_perm('attendance.correct') then raise exception 'Permission refusée'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'Le motif est obligatoire'; end if;
  select * into v_old from public.attendance_days where employee_id = p_employee and work_date = p_date;
  insert into public.attendance_days (employee_id, work_date, status, manual_status, note)
  values (p_employee, p_date, p_status, true, p_reason)
  on conflict (employee_id, work_date) do update set status = excluded.status, manual_status = true, note = excluded.note, updated_at = now();
  insert into public.attendance_corrections (employee_id, work_date, action, old_value, new_value, reason, corrected_by)
  values (p_employee, p_date, 'statut',
    case when v_old.employee_id is not null then jsonb_build_object('status', v_old.status, 'manual', v_old.manual_status) end,
    jsonb_build_object('status', p_status), p_reason, public.current_employee_id());
end $$;

-- Rétablir le statut calculé automatiquement
create or replace function public.clear_day_status(p_employee uuid, p_date date, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_old public.attendance_days;
begin
  if not public.has_perm('attendance.correct') then raise exception 'Permission refusée'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'Le motif est obligatoire'; end if;
  select * into v_old from public.attendance_days where employee_id = p_employee and work_date = p_date;
  if v_old.employee_id is null or not v_old.manual_status then return; end if;
  update public.attendance_days set manual_status = false, note = null where employee_id = p_employee and work_date = p_date;
  delete from public.attendance_days where employee_id = p_employee and work_date = p_date and first_in is null;
  insert into public.attendance_corrections (employee_id, work_date, action, old_value, new_value, reason, corrected_by)
  values (p_employee, p_date, 'statut', jsonb_build_object('status', v_old.status, 'manual', true), jsonb_build_object('status', 'automatique'), p_reason, public.current_employee_id());
  perform public.recompute_attendance_day(p_employee, p_date);
end $$;

-- =====================================================================
-- Tâches : visibilité, transitions de statut, historique, notifications
-- =====================================================================
create or replace function public.can_see_task(p_task uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task and (
      public.has_perm('tasks.view_all')
      or t.assignee_id = public.current_employee_id()
      or t.created_by = public.current_employee_id()
      or t.department_id in (select public.managed_department_ids())
      or exists (select 1 from public.task_collaborators c where c.task_id = t.id and c.employee_id = public.current_employee_id())
    )
  )
$$;

create or replace function public.can_manage_task(p_task uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task and (
      public.has_perm('tasks.manage')
      or t.created_by = public.current_employee_id()
      or t.department_id in (select public.managed_department_ids())
    )
  )
$$;

create or replace function public.status_label(s public.task_status)
returns text language sql immutable as $$
  select case s
    when 'a_faire' then 'À faire' when 'en_cours' then 'En cours' when 'bloque' then 'Bloqué'
    when 'en_attente' then 'En attente' when 'a_verifier' then 'À vérifier' when 'a_corriger' then 'À corriger'
    when 'valide' then 'Validé' when 'termine' then 'Terminé' end
$$;

-- Changement de statut par l'employé (ou un responsable), avec règles de transition
create or replace function public.task_set_status(p_task uuid, p_status public.task_status, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  t public.tasks;
  v_me uuid := public.current_employee_id();
  v_manager boolean;
  v_worker boolean;
begin
  select * into t from public.tasks where id = p_task for update;
  if t.id is null then raise exception 'Tâche introuvable'; end if;
  v_manager := public.can_manage_task(p_task) or (public.has_perm('tasks.validate') and public.can_see_task(p_task));
  v_worker := t.assignee_id = v_me or exists (select 1 from public.task_collaborators c where c.task_id = p_task and c.employee_id = v_me);
  if not (v_manager or v_worker) then raise exception 'Permission refusée'; end if;

  if not v_manager then
    -- règles pour l'employé
    if p_status in ('valide', 'a_corriger') then raise exception 'Seule la direction peut valider ou demander une correction'; end if;
    if p_status = 'termine' and t.requires_validation then raise exception 'Cette tâche doit être soumise à validation'; end if;
    if t.status in ('valide', 'termine') then raise exception 'Tâche déjà clôturée'; end if;
  end if;
  if p_status = 'bloque' and coalesce(trim(p_note), '') = '' then raise exception 'Indiquez la raison du blocage'; end if;
  if p_status = 'a_corriger' and coalesce(trim(p_note), '') = '' then raise exception 'Indiquez ce qui doit être corrigé'; end if;

  update public.tasks set
    status = p_status,
    blocked_reason = case when p_status = 'bloque' then p_note else null end,
    started_at = case when p_status = 'en_cours' and started_at is null then now() else started_at end,
    submitted_at = case when p_status = 'a_verifier' then now() else submitted_at end,
    completed_at = case when p_status in ('valide', 'termine') then now() when p_status in ('a_faire', 'en_cours', 'a_corriger') then null else completed_at end
  where id = p_task;

  if p_note is not null and length(trim(p_note)) > 0 then
    insert into public.task_comments (task_id, author_id, body)
    values (p_task, v_me, '[' || public.status_label(p_status) || '] ' || p_note);
  end if;
end $$;

create or replace function public.tasks_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.current_employee_id();
  v_link text := '/taches/' || new.id;
  v_mgr uuid;
begin
  if tg_op = 'INSERT' then
    insert into public.task_history (task_id, actor_id, action, details)
    values (new.id, v_me, 'creation', jsonb_build_object('assignee_id', new.assignee_id, 'due_date', new.due_date, 'status', new.status));
    perform public.notify(new.assignee_id, 'tache_attribuee', 'Nouvelle tâche : ' || new.title,
      case when new.due_date is not null then 'Échéance le ' || to_char(new.due_date, 'DD/MM/YYYY') end, v_link);
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.task_history (task_id, actor_id, action, details)
    values (new.id, v_me, 'statut', jsonb_build_object('de', old.status, 'vers', new.status, 'raison', new.blocked_reason));
    if new.status = 'a_verifier' then
      perform public.notify(new.created_by, 'tache_a_verifier', 'À vérifier : ' || new.title, 'La tâche a été soumise à validation.', v_link);
      for v_mgr in select dm.employee_id from public.department_managers dm where dm.department_id = new.department_id and dm.employee_id is distinct from new.created_by loop
        perform public.notify(v_mgr, 'tache_a_verifier', 'À vérifier : ' || new.title, 'La tâche a été soumise à validation.', v_link);
      end loop;
    elsif new.status = 'bloque' then
      perform public.notify(new.created_by, 'tache_bloquee', 'Tâche bloquée : ' || new.title, new.blocked_reason, v_link);
      for v_mgr in select dm.employee_id from public.department_managers dm where dm.department_id = new.department_id and dm.employee_id is distinct from new.created_by loop
        perform public.notify(v_mgr, 'tache_bloquee', 'Tâche bloquée : ' || new.title, new.blocked_reason, v_link);
      end loop;
    elsif new.status = 'termine' and new.assignee_id is distinct from new.created_by then
      perform public.notify(new.created_by, 'tache_terminee', 'Tâche terminée : ' || new.title, null, v_link);
      perform public.notify(new.assignee_id, 'tache_terminee', 'Tâche clôturée : ' || new.title, null, v_link);
    elsif new.status in ('valide', 'a_corriger') then
      perform public.notify(new.assignee_id, 'tache_' || new.status,
        case when new.status = 'valide' then 'Tâche validée : ' else 'Correction demandée : ' end || new.title, null, v_link);
    end if;
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    insert into public.task_history (task_id, actor_id, action, details)
    values (new.id, v_me, 'reassignation', jsonb_build_object('de', old.assignee_id, 'vers', new.assignee_id));
    perform public.notify(new.assignee_id, 'tache_attribuee', 'Nouvelle tâche : ' || new.title,
      case when new.due_date is not null then 'Échéance le ' || to_char(new.due_date, 'DD/MM/YYYY') end, v_link);
  end if;

  if (new.due_date, new.due_time) is distinct from (old.due_date, old.due_time) then
    insert into public.task_history (task_id, actor_id, action, details)
    values (new.id, v_me, 'deadline', jsonb_build_object('de', concat_ws(' ', old.due_date, old.due_time), 'vers', concat_ws(' ', new.due_date, new.due_time)));
    perform public.notify(new.assignee_id, 'tache_modifiee', 'Échéance modifiée : ' || new.title,
      coalesce('Nouvelle échéance le ' || to_char(new.due_date, 'DD/MM/YYYY'), 'Échéance retirée'), v_link);
  elsif (new.title, new.description, new.instructions, new.expected_result, new.planned_date, new.planned_time, new.priority, new.event_id)
        is distinct from (old.title, old.description, old.instructions, old.expected_result, old.planned_date, old.planned_time, old.priority, old.event_id)
        and new.assignee_id is not distinct from old.assignee_id then
    insert into public.task_history (task_id, actor_id, action, details) values (new.id, v_me, 'modification', null);
    perform public.notify(new.assignee_id, 'tache_modifiee', 'Tâche modifiée : ' || new.title, null, v_link,
      'mod:' || new.id || ':' || to_char(now(), 'YYYYMMDDHH24MI'));
  end if;
  return new;
end $$;
create trigger t_tasks_after after insert or update on public.tasks for each row execute function public.tasks_after_change();

create or replace function public.task_comment_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  t public.tasks;
begin
  select * into t from public.tasks where id = new.task_id;
  if new.author_id <> coalesce(t.assignee_id, '00000000-0000-0000-0000-000000000000') then
    perform public.notify(t.assignee_id, 'commentaire', 'Commentaire sur : ' || t.title, left(new.body, 140), '/taches/' || t.id);
  end if;
  if new.author_id <> coalesce(t.created_by, '00000000-0000-0000-0000-000000000000') and t.created_by is distinct from t.assignee_id then
    perform public.notify(t.created_by, 'commentaire', 'Commentaire sur : ' || t.title, left(new.body, 140), '/taches/' || t.id);
  end if;
  return new;
end $$;
create trigger t_comment_after after insert on public.task_comments for each row execute function public.task_comment_after_insert();

create or replace function public.task_collaborator_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  t public.tasks;
begin
  select * into t from public.tasks where id = new.task_id;
  perform public.notify(new.employee_id, 'tache_collaboration', 'Vous collaborez sur : ' || t.title, null, '/taches/' || t.id);
  return new;
end $$;
create trigger t_collab_after after insert on public.task_collaborators for each row execute function public.task_collaborator_after_insert();

-- Dupliquer une tâche (avec décalage de jours facultatif)
create or replace function public.duplicate_task(p_task uuid, p_shift_days int default 0)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_new uuid;
begin
  if not (public.has_perm('tasks.create') and public.can_see_task(p_task)) then raise exception 'Permission refusée'; end if;
  insert into public.tasks (title, description, instructions, expected_result, assignee_id, department_id, event_id, priority,
    planned_date, planned_time, due_date, due_time, requires_validation, source_task_id, created_by)
  select title, description, instructions, expected_result, assignee_id, department_id, event_id, priority,
    planned_date + p_shift_days, planned_time, due_date + p_shift_days, due_time, requires_validation, id, public.current_employee_id()
  from public.tasks where id = p_task
  returning id into v_new;
  insert into public.task_collaborators (task_id, employee_id)
  select v_new, employee_id from public.task_collaborators where task_id = p_task;
  return v_new;
end $$;

-- Dupliquer un planning hebdomadaire (toutes les tâches planifiées d'une semaine → semaine suivante)
create or replace function public.duplicate_week(p_week_start date, p_target_start date, p_department uuid default null, p_employee uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  if not public.has_perm('tasks.create') then raise exception 'Permission refusée'; end if;
  for r in
    select id from public.tasks
    where planned_date between p_week_start and p_week_start + 6
      and (p_department is null or department_id = p_department)
      and (p_employee is null or assignee_id = p_employee)
      and public.can_see_task(id)
  loop
    perform public.duplicate_task(r.id, p_target_start - p_week_start);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Alerte des tâches en retard (à planifier toutes les 15 min via pg_cron)
create or replace function public.notify_overdue_tasks()
returns int language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
  v_now_local timestamp := now() at time zone 'Africa/Casablanca';
  v_admin uuid;
  v_notify_mgmt boolean;
begin
  select overdue_notify_management into v_notify_mgmt from public.company_settings;
  for r in
    select t.* from public.tasks t
    where t.status not in ('valide', 'termine', 'a_verifier')
      and t.due_date is not null
      and (t.due_date + coalesce(t.due_time, time '23:59')) < v_now_local
  loop
    insert into public.notifications (recipient_id, kind, title, body, link, dedupe_key)
    select r.assignee_id, 'tache_en_retard', 'Tâche en retard : ' || r.title, 'Échéance dépassée.', '/taches/' || r.id, 'overdue:' || r.id
    where r.assignee_id is not null
    on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
    if v_notify_mgmt then
      for v_admin in
        select id from public.employees where role = 'admin' and status = 'actif'
        union select employee_id from public.department_managers where department_id = r.department_id
      loop
        insert into public.notifications (recipient_id, kind, title, body, link, dedupe_key)
        values (v_admin, 'tache_en_retard', 'Tâche en retard : ' || r.title, 'Responsable : ' || coalesce((select first_name || ' ' || last_name from public.employees where id = r.assignee_id), 'non assignée'), '/taches/' || r.id, 'overdue:' || r.id)
        on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
      end loop;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Notifications sur les congés
create or replace function public.leave_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid;
begin
  if tg_op = 'INSERT' then
    for v_admin in select id from public.employees where role = 'admin' and status = 'actif' loop
      perform public.notify(v_admin, 'conge_en_attente', 'Demande de congé en attente', null, '/conges');
    end loop;
  elsif new.status is distinct from old.status and new.status in ('validee', 'refusee') then
    perform public.notify(new.employee_id, 'conge_' || new.status, 'Votre demande de congé a été ' || case when new.status = 'validee' then 'validée' else 'refusée' end, new.review_comment, '/conges');
  end if;
  return new;
end $$;
create trigger t_leave_after after insert or update on public.leave_requests for each row execute function public.leave_after_change();

-- Notification lors de l'ajout dans une équipe d'événement
create or replace function public.event_team_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ev public.events;
begin
  select * into ev from public.events where id = new.event_id;
  perform public.notify(new.employee_id, 'evenement_equipe', 'Vous êtes dans l''équipe : ' || ev.name, 'Le ' || to_char(ev.event_date, 'DD/MM/YYYY'), '/evenements/' || ev.id);
  return new;
end $$;
create trigger t_event_team_after after insert on public.event_team for each row execute function public.event_team_after_insert();

-- =====================================================================
-- Recherche globale
-- =====================================================================
create or replace function public.global_search(q text)
returns table (kind text, id uuid, title text, subtitle text, link text)
language sql stable security invoker set search_path = public as $$
  with term as (select '%' || replace(replace(trim(q), '%', ''), '_', '') || '%' as t)
  (select 'employe', e.id, trim(e.first_name || ' ' || e.last_name), coalesce(e.job_title, ''), '/equipe/' || e.id
     from public.employees e, term where (e.first_name || ' ' || e.last_name || ' ' || coalesce(e.job_title, '')) ilike term.t limit 8)
  union all
  (select 'tache', t.id, t.title, public.status_label(t.status), '/taches/' || t.id
     from public.tasks t, term where (t.title || ' ' || coalesce(t.description, '')) ilike term.t limit 8)
  union all
  (select 'evenement', ev.id, ev.name, coalesce(ev.client_name, '') || ' · ' || to_char(ev.event_date, 'DD/MM/YYYY'), '/evenements/' || ev.id
     from public.events ev, term where (ev.name || ' ' || coalesce(ev.client_name, '') || ' ' || coalesce(ev.address, '')) ilike term.t limit 8)
  union all
  (select 'departement', d.id, d.name, coalesce(d.description, ''), '/equipe?departement=' || d.id
     from public.departments d, term where d.name ilike term.t limit 5)
$$;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.company_settings enable row level security;
alter table public.work_schedules enable row level security;
alter table public.departments enable row level security;
alter table public.employees enable row level security;
alter table public.employee_pins enable row level security;
alter table public.department_managers enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.employee_permissions enable row level security;
alter table public.audit_log enable row level security;
alter table public.events enable row level security;
alter table public.event_team enable row level security;
alter table public.kiosk_devices enable row level security;
alter table public.time_punches enable row level security;
alter table public.attendance_days enable row level security;
alter table public.attendance_corrections enable row level security;
alter table public.leave_requests enable row level security;
alter table public.tasks enable row level security;
alter table public.task_collaborators enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_attachments enable row level security;
alter table public.task_history enable row level security;
alter table public.notifications enable row level security;

-- Paramètres & référentiels : lecture pour tous les connectés, écriture direction
create policy settings_read on public.company_settings for select to authenticated using (true);
create policy settings_write on public.company_settings for update to authenticated using (public.has_perm('settings.manage'));

create policy schedules_read on public.work_schedules for select to authenticated using (true);
create policy schedules_write on public.work_schedules for all to authenticated using (public.has_perm('settings.manage')) with check (public.has_perm('settings.manage'));

create policy departments_read on public.departments for select to authenticated using (true);
create policy departments_write on public.departments for all to authenticated using (public.has_perm('settings.manage')) with check (public.has_perm('settings.manage'));

create policy dm_read on public.department_managers for select to authenticated using (true);
create policy dm_write on public.department_managers for all to authenticated using (public.has_perm('settings.manage')) with check (public.has_perm('settings.manage'));

create policy permissions_read on public.permissions for select to authenticated using (true);
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);
create policy role_permissions_write on public.role_permissions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy emp_perm_read on public.employee_permissions for select to authenticated
  using (employee_id = public.current_employee_id() or public.has_perm('employees.manage'));
create policy emp_perm_write on public.employee_permissions for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Employés : annuaire visible par tous les connectés ; écriture réservée.
-- Le rôle ne peut être modifié que par un administrateur (voir trigger ci-dessous).
create policy employees_read on public.employees for select to authenticated using (true);
create policy employees_insert on public.employees for insert to authenticated with check (public.has_perm('employees.manage'));
create policy employees_update on public.employees for update to authenticated using (public.has_perm('employees.manage')) with check (public.has_perm('employees.manage'));
create policy employees_delete on public.employees for delete to authenticated using (public.is_admin());

create or replace function public.employees_guard_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;  -- service / migrations
  if (tg_op = 'INSERT' and new.role = 'admin' or tg_op = 'UPDATE' and new.role is distinct from old.role) and not public.is_admin() then
    raise exception 'Seul un administrateur peut attribuer un rôle';
  end if;
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id and not public.is_admin() then
    raise exception 'Seul un administrateur peut lier un compte';
  end if;
  return new;
end $$;
create trigger t_employees_guard before insert or update on public.employees for each row execute function public.employees_guard_role();

-- employee_pins : aucune policy → inaccessible via l'API (fonctions uniquement)

create policy audit_read on public.audit_log for select to authenticated using (public.has_perm('audit.view'));

-- Événements (socle)
create policy events_read on public.events for select to authenticated using (true);
create policy events_write on public.events for all to authenticated using (public.has_perm('events.manage')) with check (public.has_perm('events.manage'));
create policy event_team_read on public.event_team for select to authenticated using (true);
create policy event_team_write on public.event_team for all to authenticated using (public.has_perm('events.manage')) with check (public.has_perm('events.manage'));

-- Kiosques : gestion direction ; les jetons ne sont stockés qu'en empreinte
create policy kiosk_read on public.kiosk_devices for select to authenticated using (public.has_perm('settings.manage'));
create policy kiosk_insert on public.kiosk_devices for insert to authenticated with check (public.has_perm('settings.manage'));
create policy kiosk_update on public.kiosk_devices for update to authenticated using (public.has_perm('settings.manage'));
create policy kiosk_delete on public.kiosk_devices for delete to authenticated using (public.has_perm('settings.manage'));

-- Pointage : lecture seule (soi-même, responsables, direction). Aucune écriture directe.
create policy punches_read on public.time_punches for select to authenticated
  using (employee_id = public.current_employee_id() or public.has_perm('attendance.view_all') or public.manages_employee(employee_id));
create policy days_read on public.attendance_days for select to authenticated
  using (employee_id = public.current_employee_id() or public.has_perm('attendance.view_all') or public.manages_employee(employee_id));
create policy corrections_read on public.attendance_corrections for select to authenticated
  using (employee_id = public.current_employee_id() or public.has_perm('attendance.view_all') or public.manages_employee(employee_id));

-- Congés
create policy leave_read on public.leave_requests for select to authenticated
  using (employee_id = public.current_employee_id() or public.has_perm('leaves.manage') or public.has_perm('calendar.view_all') or public.manages_employee(employee_id));
create policy leave_insert on public.leave_requests for insert to authenticated
  with check ((employee_id = public.current_employee_id() and status = 'en_attente') or public.has_perm('leaves.manage'));
create policy leave_update on public.leave_requests for update to authenticated
  using (public.has_perm('leaves.manage') or (employee_id = public.current_employee_id() and status = 'en_attente'));

-- Tâches
create policy tasks_read on public.tasks for select to authenticated using (public.can_see_task(id));
create policy tasks_insert on public.tasks for insert to authenticated with check (
  public.has_perm('tasks.create') and created_by = public.current_employee_id()
  and (public.has_perm('tasks.manage') or department_id in (select public.managed_department_ids()) or assignee_id = public.current_employee_id() or public.has_perm('tasks.assign_any'))
);
create policy tasks_update on public.tasks for update to authenticated using (public.can_manage_task(id)) with check (public.can_manage_task(id));
create policy tasks_delete on public.tasks for delete to authenticated using (public.has_perm('tasks.manage') or created_by = public.current_employee_id());

create policy collab_read on public.task_collaborators for select to authenticated using (public.can_see_task(task_id));
create policy collab_write on public.task_collaborators for all to authenticated using (public.can_manage_task(task_id)) with check (public.can_manage_task(task_id));

create policy comments_read on public.task_comments for select to authenticated using (public.can_see_task(task_id));
create policy comments_insert on public.task_comments for insert to authenticated
  with check (author_id = public.current_employee_id() and public.can_see_task(task_id));

create policy attachments_read on public.task_attachments for select to authenticated using (public.can_see_task(task_id));
create policy attachments_insert on public.task_attachments for insert to authenticated
  with check (uploaded_by = public.current_employee_id() and public.can_see_task(task_id));
create policy attachments_delete on public.task_attachments for delete to authenticated
  using (uploaded_by = public.current_employee_id() or public.can_manage_task(task_id));

create policy history_read on public.task_history for select to authenticated using (public.can_see_task(task_id));

-- Notifications : chacun ne voit et ne marque que les siennes
create policy notif_read on public.notifications for select to authenticated using (recipient_id = public.current_employee_id());
create policy notif_update on public.notifications for update to authenticated using (recipient_id = public.current_employee_id());
create policy notif_delete on public.notifications for delete to authenticated using (recipient_id = public.current_employee_id());

-- Droits d'exécution : fonctions kiosque réservées au serveur (clé service)
revoke execute on function public.kiosk_punch(text, uuid, text, public.punch_kind, text) from public, anon, authenticated;
revoke execute on function public.kiosk_employees(text) from public, anon, authenticated;
revoke execute on function public.recompute_attendance_day(uuid, date) from public, anon, authenticated;
revoke execute on function public.notify_overdue_tasks() from public, anon, authenticated;
revoke execute on function public.notify(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.log_action(text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.kiosk_punch(text, uuid, text, public.punch_kind, text) to service_role;
grant execute on function public.kiosk_employees(text) to service_role;
grant execute on function public.notify_overdue_tasks() to service_role;

-- ==================== 20261120000002_donnees_initiales.sql ====================
-- =====================================================================
-- BOHEMIA OS — Migration 2 : données de référence
-- Catalogue des permissions, droits par rôle, horaires, départements,
-- responsables. Tout est ensuite modifiable depuis l'interface.
-- =====================================================================

insert into public.permissions (key, label, module, sort_order) values
  ('dashboard.direction', 'Voir le tableau de bord direction', 'Dashboard', 10),
  ('employees.view', 'Voir les fiches complètes des employés', 'Équipe', 20),
  ('employees.manage', 'Créer et modifier les employés (PIN, photo, horaires)', 'Équipe', 21),
  ('attendance.view_all', 'Voir les présences de toute l''équipe', 'Pointage', 30),
  ('attendance.correct', 'Corriger les pointages et statuts (avec motif)', 'Pointage', 31),
  ('tasks.create', 'Créer des tâches', 'Tâches', 40),
  ('tasks.assign_any', 'Attribuer des tâches à n''importe quel employé', 'Tâches', 41),
  ('tasks.view_all', 'Voir toutes les tâches', 'Tâches', 42),
  ('tasks.manage', 'Modifier et supprimer toutes les tâches', 'Tâches', 43),
  ('tasks.validate', 'Valider les tâches soumises', 'Tâches', 44),
  ('events.manage', 'Créer et modifier les événements', 'Événements', 50),
  ('calendar.view_all', 'Voir le calendrier complet (congés, tâches de tous)', 'Calendrier', 60),
  ('leaves.manage', 'Valider les congés et absences', 'Congés', 70),
  ('settings.manage', 'Modifier les paramètres (départements, horaires, kiosques)', 'Paramètres', 80),
  ('audit.view', 'Consulter le journal des actions', 'Paramètres', 81);

-- Responsable de département : son équipe (le périmètre est limité à ses départements par la base)
insert into public.role_permissions (role, permission) values
  ('manager', 'employees.view'),
  ('manager', 'tasks.create'),
  ('manager', 'tasks.validate'),
  ('manager', 'calendar.view_all');
-- Employé : aucun droit étendu par défaut (ses données uniquement)
-- Administrateur / Direction : tous les droits (implicite)

insert into public.work_schedules (name, days, grace_minutes, is_default) values
  ('Bureau — Lun-Ven 9h-18h, Sam 9h-13h',
   '{"1":{"start":"09:00","end":"18:00"},"2":{"start":"09:00","end":"18:00"},"3":{"start":"09:00","end":"18:00"},"4":{"start":"09:00","end":"18:00"},"5":{"start":"09:00","end":"18:00"},"6":{"start":"09:00","end":"13:00"}}',
   10, true),
  ('Atelier & dépôt — Lun-Sam 8h30-17h30',
   '{"1":{"start":"08:30","end":"17:30"},"2":{"start":"08:30","end":"17:30"},"3":{"start":"08:30","end":"17:30"},"4":{"start":"08:30","end":"17:30"},"5":{"start":"08:30","end":"17:30"},"6":{"start":"08:30","end":"17:30"}}',
   10, false);

insert into public.departments (name, code, description, scope, color, sort_order) values
  ('Commercial & Clients', 'COM', 'Prospects, clients, devis, fiches événement et coordination',
   array['Prospects','Clients','Demandes','Appels','Rendez-vous','Devis','Suivi client','Commandes','Validation client','Fiches événement','Fiches techniques','Coordination'], '#B08D74', 10),
  ('Graphisme & Production visuelle', 'GRA', 'Graphisme, grands formats, impression, découpe et pose vinyle',
   array['Graphisme','Panneaux','Grands formats','Impression','Découpe','Vinyle','Pose vinyle','Fichiers de production','Préparation des fichiers','Suivi des productions','Contrôle qualité'], '#7E8A93', 20),
  ('OHMYBOX & Papeterie', 'OMB', 'Boxes, papeterie, personnalisation et conception des panneaux événementiels',
   array['OHMYBOX','Papeterie','Personnalisation','Produits','Commandes','Production','Préparation des boxes','Packaging','Stickers','Invitations','Articles personnalisés','Design des panneaux'], '#C2A48C', 30),
  ('Fleurs & Décoration', 'FLD', 'Compositions florales, structures, achats et stock floral',
   array['Fleurs','Compositions florales','Bouquets','Structures florales','Achats de fleurs','Préparation','Stock floral','Réception','Matériel de décoration'], '#8C9A7E', 40),
  ('Achats & Matériaux', 'ACH', 'MDF, forex, polypro, vinyle, consommables et fournisseurs',
   array['MDF','Forex','Polypro','Vinyle','Bois','Peinture','Colle','Consommables','Matériel de production','Fournisseurs','Demandes d''achat','Réception'], '#A39382', 50),
  ('Dépôt & Logistique', 'DEP', 'Stock, matériel, préparation, chargement, retours et inventaire',
   array['Stock','Matériel','Entrées','Sorties','Réservations','Préparation événement','Chargement','Déchargement','Retour','Inventaire','Casse','Perte','Réparation','Rangement'], '#8A7F72', 60),
  ('Transport', 'TRA', 'Véhicules, chauffeurs, trajets, gasoil et entretien',
   array['Véhicules','Chauffeurs','Trajets','Kilométrage','Gasoil','Dépenses','Entretien','Disponibilité','Livraisons','Installations','Retours'], '#6F7378', 70);

-- Responsables connus (sans compte de connexion pour l'instant : à compléter depuis l'interface)
with d as (select id, code from public.departments),
     s as (select id from public.work_schedules where is_default),
     a as (select id from public.work_schedules where name like 'Atelier%'),
     ins as (
       insert into public.employees (first_name, job_title, department_id, role, schedule_id) values
         ('Cédoua',   'Responsable Commercial & Clients', (select id from d where code = 'COM'), 'manager', (select id from s)),
         ('Mustapha', 'Responsable Graphisme & Production', (select id from d where code = 'GRA'), 'manager', (select id from a)),
         ('Khaoula',  'Responsable OHMYBOX & Papeterie · Design panneaux', (select id from d where code = 'OMB'), 'manager', (select id from s)),
         ('Sihem',    'Responsable OHMYBOX & Papeterie', (select id from d where code = 'OMB'), 'manager', (select id from s)),
         ('Ayoub',    'Responsable Dépôt & Logistique', (select id from d where code = 'DEP'), 'manager', (select id from a)),
         ('Mohamed',  'Responsable Dépôt & Logistique', (select id from d where code = 'DEP'), 'manager', (select id from a))
       returning id, department_id
     )
insert into public.department_managers (department_id, employee_id)
select department_id, id from ins;

-- ==================== 20261120000003_stockage.sql ====================
-- =====================================================================
-- BOHEMIA OS — Migration 3 : stockage des fichiers (Supabase Storage)
-- avatars : photos des employés (lecture connectés, écriture gestion équipe)
-- task-files : pièces jointes des tâches (accès si la tâche est visible)
-- Chemin des pièces jointes : <task_id>/<horodatage>-<nom du fichier>
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('avatars', 'avatars', false, 5242880), ('task-files', 'task-files', false, 52428800)
on conflict (id) do nothing;

create policy "avatars lecture" on storage.objects for select to authenticated
  using (bucket_id = 'avatars');
create policy "avatars ecriture" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and public.has_perm('employees.manage'));
create policy "avatars maj" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and public.has_perm('employees.manage'));
create policy "avatars suppression" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and public.has_perm('employees.manage'));

create policy "taches lecture" on storage.objects for select to authenticated
  using (bucket_id = 'task-files' and public.can_see_task(((storage.foldername(name))[1])::uuid));
create policy "taches depot" on storage.objects for insert to authenticated
  with check (bucket_id = 'task-files' and public.can_see_task(((storage.foldername(name))[1])::uuid));
create policy "taches suppression" on storage.objects for delete to authenticated
  using (bucket_id = 'task-files' and public.can_manage_task(((storage.foldername(name))[1])::uuid));

-- ==================== 20261120000004_automatisations.sql ====================
-- =====================================================================
-- BOHEMIA OS — Migration 4 : tâches planifiées (pg_cron)
-- Alerte des tâches en retard toutes les 15 minutes.
-- Si pg_cron n'est pas disponible, la migration continue sans erreur :
-- activez l'extension « pg_cron » dans Supabase (Database > Extensions) puis relancez ce bloc.
-- =====================================================================
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('bohemia-taches-en-retard', '*/15 * * * *', 'select public.notify_overdue_tasks()');
exception when others then
  raise notice 'pg_cron indisponible : alerte des tâches en retard non planifiée (%).', sqlerrm;
end $$;

-- ==================== 20261120000005_finances_conges.sql ====================
-- =====================================================================
-- BOHEMIA OS — Migration 5
-- 1) Finances des événements confidentielles : budget, devis, paiement
--    visibles uniquement avec la permission finance.view
--    (Direction + commerciale Cédoua par défaut).
-- 2) Module Congés & absences : règles d'annulation, notifications aux
--    responsables, historique.
-- =====================================================================

insert into public.permissions (key, label, module, sort_order) values
  ('finance.view', 'Voir et modifier les montants (budgets, devis, paiements)', 'Finances', 55);

-- Table séparée : la sécurité s'applique à la ligne entière, impossible à contourner par l'API
create table public.event_finances (
  event_id uuid primary key references public.events (id) on delete cascade,
  budget_mad numeric(12, 2),
  quote_mad numeric(12, 2),
  paid_mad numeric(12, 2),
  payment_status text not null default 'non_paye' check (payment_status in ('non_paye', 'acompte', 'paye')),
  notes text,
  updated_at timestamptz not null default now()
);
insert into public.event_finances (event_id, budget_mad)
select id, budget_mad from public.events where budget_mad is not null;
alter table public.events drop column budget_mad;

alter table public.event_finances enable row level security;
create policy finances_all on public.event_finances for all to authenticated
  using (public.has_perm('finance.view')) with check (public.has_perm('finance.view'));
create trigger t_touch before update on public.event_finances for each row execute function public.touch_updated_at();
create trigger t_audit after insert or update or delete on public.event_finances for each row execute function public.audit_trigger();

-- La commerciale (Cédoua) voit les montants
insert into public.employee_permissions (employee_id, permission, granted)
select id, 'finance.view', true from public.employees where first_name = 'Cédoua'
on conflict do nothing;

-- Congés : un employé peut créer ou annuler sa propre demande en attente, jamais la valider
drop policy if exists leave_update on public.leave_requests;
create policy leave_update on public.leave_requests for update to authenticated
  using (public.has_perm('leaves.manage') or (employee_id = public.current_employee_id() and status = 'en_attente'))
  with check (public.has_perm('leaves.manage') or (employee_id = public.current_employee_id() and status in ('en_attente', 'annulee')));

-- Validation / refus : uniquement via cette fonction (auteur, date, commentaire tracés)
create or replace function public.review_leave(p_leave uuid, p_status public.leave_status, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('leaves.manage') then raise exception 'Permission refusée'; end if;
  if p_status not in ('validee', 'refusee') then raise exception 'Statut invalide'; end if;
  if p_status = 'refusee' and coalesce(trim(p_comment), '') = '' then raise exception 'Indiquez le motif du refus'; end if;
  update public.leave_requests set status = p_status, reviewed_by = public.current_employee_id(), reviewed_at = now(), review_comment = p_comment
  where id = p_leave;
end $$;

-- Notifications : direction + personnes autorisées à valider + responsables du département
create or replace function public.leave_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_to uuid;
  v_name text;
begin
  select trim(first_name || ' ' || last_name) into v_name from public.employees where id = new.employee_id;
  if tg_op = 'INSERT' and new.status = 'en_attente' then
    for v_to in
      select e.id from public.employees e where e.status = 'actif' and (e.role = 'admin'
        or exists (select 1 from public.employee_permissions ep where ep.employee_id = e.id and ep.permission = 'leaves.manage' and ep.granted))
      union
      select dm.employee_id from public.department_managers dm join public.employees x on x.id = new.employee_id where dm.department_id = x.department_id
    loop
      perform public.notify(v_to, 'conge_en_attente', 'Demande de congé : ' || v_name,
        to_char(new.start_date, 'DD/MM') || ' → ' || to_char(new.end_date, 'DD/MM/YYYY'), '/conges?vue=validation');
    end loop;
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('validee', 'refusee') then
    perform public.notify(new.employee_id, 'conge_' || new.status,
      'Votre demande du ' || to_char(new.start_date, 'DD/MM') || ' a été ' || case when new.status = 'validee' then 'validée' else 'refusée' end,
      new.review_comment, '/conges');
  end if;
  return new;
end $$;

-- Couleurs plus vives (mais douces) pour distinguer les départements partout dans l'interface
update public.departments d set color = c.color
from (values ('COM', '#C9707E'), ('GRA', '#5E86A6'), ('OMB', '#C9963A'), ('FLD', '#6E8A58'),
             ('ACH', '#8E6FB0'), ('DEP', '#C46A47'), ('TRA', '#4F9585')) as c(code, color)
where d.code = c.code;

-- ==================== 20261126000006_depot_stock.sql ====================
-- =====================================================================
-- BOHEMIA OS — Migration 6 : Dépôt & Stock
-- Inventaire avec photos et état, matériel réservé par événement,
-- sortie / chargement (photo) / retour avec état, réparations et rebut.
--
-- Principe des quantités : chaque article a 3 compteurs
--   qty_good   : en bon état, utilisable
--   qty_repair : à réparer (crée une tâche pour le dépôt)
--   qty_broken : cassé, à trier / jeter
-- Le disponible pour une date = qty_good − ce qui est réservé sur les
-- événements qui se chevauchent (de la livraison au démontage).
-- Toutes les écritures de mouvements passent par des fonctions contrôlées.
-- =====================================================================

insert into public.permissions (key, label, module, sort_order) values
  ('stock.manage', 'Gérer l''inventaire (ajouter, modifier, réparer, jeter)', 'Dépôt & Stock', 90),
  ('stock.move', 'Préparer, charger et enregistrer les retours de matériel', 'Dépôt & Stock', 91);

insert into public.role_permissions (role, permission) values ('manager', 'stock.move') on conflict do nothing;

-- Le dépôt et le transport gèrent les mouvements, le dépôt gère l'inventaire
insert into public.employee_permissions (employee_id, permission, granted)
select e.id, p.perm, true
from public.employees e join public.departments d on d.id = e.department_id
cross join (values ('stock.move'), ('stock.manage')) as p(perm)
where d.code = 'DEP' or (d.code = 'TRA' and p.perm = 'stock.move')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------
create type public.stock_move_kind as enum ('entree', 'sortie', 'retour', 'reparation', 'rebut', 'ajustement');
create type public.event_item_status as enum ('reserve', 'prepare', 'charge', 'retourne');

create table public.stock_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text not null default 'box',
  color text not null default 'sand',
  sort_order int not null default 100
);

create table public.stock_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  category_id uuid references public.stock_categories (id) on delete set null,
  themes text[] not null default '{}',          -- ex. {Bohème, Ramadan, Baby}
  unit text not null default 'pièce',
  qty_good int not null default 0 check (qty_good >= 0),
  qty_repair int not null default 0 check (qty_repair >= 0),
  qty_broken int not null default 0 check (qty_broken >= 0),
  location text,                                -- ex. Dépôt allée B, étagère 3
  dimensions text,
  color text,
  photo_path text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index stock_items_category_idx on public.stock_items (category_id);
create index stock_items_themes_idx on public.stock_items using gin (themes);

-- Matériel prévu pour un événement
create table public.event_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  item_id uuid not null references public.stock_items (id) on delete restrict,
  qty int not null check (qty > 0),
  note text,
  status public.event_item_status not null default 'reserve',
  prepared_by uuid references public.employees (id) on delete set null,
  prepared_at timestamptz,
  loaded_by uuid references public.employees (id) on delete set null,
  loaded_at timestamptz,
  loaded_photo_path text,
  returned_by uuid references public.employees (id) on delete set null,
  returned_at timestamptz,
  qty_returned_good int,
  qty_returned_repair int,
  qty_returned_broken int,
  qty_missing int,
  return_note text,
  return_photo_path text,
  created_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (event_id, item_id)
);
create index event_items_item_idx on public.event_items (item_id);

-- Journal des mouvements (jamais modifié)
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.stock_items (id) on delete cascade,
  event_id uuid references public.events (id) on delete set null,
  kind public.stock_move_kind not null,
  qty int not null,
  detail text,
  photo_path text,
  by_employee uuid references public.employees (id) on delete set null default public.current_employee_id(),
  created_at timestamptz not null default now()
);
create index stock_movements_item_idx on public.stock_movements (item_id, created_at desc);

create trigger t_touch before update on public.stock_items for each row execute function public.touch_updated_at();
create trigger t_audit after insert or update or delete on public.stock_items for each row execute function public.audit_trigger();
create trigger t_audit after insert or update or delete on public.event_items for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------
-- Disponibilité
-- ---------------------------------------------------------------------
-- Période d'occupation d'un événement : de la livraison (ou la veille) au démontage (ou le lendemain)
create or replace function public.event_span(p_event uuid, out d_from date, out d_to date)
language sql stable security definer set search_path = public as $$
  select coalesce((delivery_at at time zone 'Africa/Casablanca')::date, event_date - 1),
         coalesce((teardown_at at time zone 'Africa/Casablanca')::date, event_date + 1)
  from public.events where id = p_event
$$;

-- Quantité disponible pour un événement (ce qu'il a déjà réservé lui-même n'est pas compté)
create or replace function public.stock_available(p_item uuid, p_event uuid)
returns int language sql stable security definer set search_path = public as $$
  with span as (select * from public.event_span(p_event))
  select greatest(0, i.qty_good - coalesce((
    select sum(ei.qty) from public.event_items ei
    join public.events e on e.id = ei.event_id
    cross join span
    cross join lateral public.event_span(e.id) o
    where ei.item_id = p_item and ei.event_id <> p_event and ei.status <> 'retourne' and e.status <> 'annule'
      and o.d_from <= span.d_to and o.d_to >= span.d_from
  ), 0))::int
  from public.stock_items i where i.id = p_item
$$;

-- ---------------------------------------------------------------------
-- Actions (fonctions contrôlées)
-- ---------------------------------------------------------------------
create or replace function public.can_move_stock()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_perm('stock.move') or public.has_perm('stock.manage') or public.has_perm('events.manage')
$$;

-- Réserver (ou changer la quantité) d'un article pour un événement
create or replace function public.stock_reserve(p_event uuid, p_item uuid, p_qty int, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_avail int;
  v_name text;
begin
  if not public.can_move_stock() then raise exception 'Permission refusée'; end if;
  if p_qty is null or p_qty < 0 then raise exception 'Quantité invalide'; end if;
  if p_qty = 0 then
    delete from public.event_items where event_id = p_event and item_id = p_item and status = 'reserve';
    return;
  end if;
  if exists (select 1 from public.event_items where event_id = p_event and item_id = p_item and status <> 'reserve') then
    raise exception 'Ce matériel est déjà préparé ou chargé : modifiez-le au dépôt';
  end if;
  v_avail := public.stock_available(p_item, p_event);
  if p_qty > v_avail then
    select name into v_name from public.stock_items where id = p_item;
    raise exception 'Pas assez de « % » disponible à ces dates : % disponible(s)', v_name, v_avail;
  end if;
  insert into public.event_items (event_id, item_id, qty, note, created_by)
  values (p_event, p_item, p_qty, p_note, public.current_employee_id())
  on conflict (event_id, item_id) do update set qty = excluded.qty, note = coalesce(excluded.note, public.event_items.note);
end $$;

-- Marquer préparé (posé au quai) ou chargé dans la voiture (avec photo)
create or replace function public.stock_set_step(p_line uuid, p_step public.event_item_status, p_photo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  l public.event_items;
begin
  if not public.can_move_stock() then raise exception 'Permission refusée'; end if;
  select * into l from public.event_items where id = p_line for update;
  if l.id is null then raise exception 'Ligne introuvable'; end if;
  if l.status = 'retourne' then raise exception 'Matériel déjà revenu'; end if;
  if p_step = 'prepare' then
    update public.event_items set status = 'prepare', prepared_by = public.current_employee_id(), prepared_at = now() where id = p_line;
  elsif p_step = 'charge' then
    update public.event_items set status = 'charge', loaded_by = public.current_employee_id(), loaded_at = now(),
      loaded_photo_path = coalesce(p_photo, loaded_photo_path) where id = p_line;
    if l.status <> 'charge' then
      insert into public.stock_movements (item_id, event_id, kind, qty, detail, photo_path)
      values (l.item_id, l.event_id, 'sortie', l.qty, 'Chargé pour l''événement', p_photo);
    end if;
  elsif p_step = 'reserve' then
    if l.status = 'charge' then raise exception 'Déjà chargé : enregistrez le retour'; end if;
    update public.event_items set status = 'reserve', prepared_by = null, prepared_at = null where id = p_line;
  else
    raise exception 'Étape invalide';
  end if;
end $$;

-- Retour au dépôt : on compte ce qui revient en bon état, à réparer, cassé, manquant
create or replace function public.stock_return(p_line uuid, p_good int, p_repair int, p_broken int, p_missing int,
  p_note text default null, p_photo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  l public.event_items;
  v_item public.stock_items;
  v_event text;
  v_dep uuid;
  v_to uuid;
  v_off int;
begin
  if not public.can_move_stock() then raise exception 'Permission refusée'; end if;
  select * into l from public.event_items where id = p_line for update;
  if l.id is null then raise exception 'Ligne introuvable'; end if;
  if l.status = 'retourne' then raise exception 'Retour déjà enregistré'; end if;
  p_good := coalesce(p_good, 0); p_repair := coalesce(p_repair, 0); p_broken := coalesce(p_broken, 0); p_missing := coalesce(p_missing, 0);
  if least(p_good, p_repair, p_broken, p_missing) < 0 then raise exception 'Quantités invalides'; end if;
  if p_good + p_repair + p_broken + p_missing <> l.qty then
    raise exception 'Le total (%) doit être égal à la quantité sortie (%)', p_good + p_repair + p_broken + p_missing, l.qty;
  end if;
  if (p_repair + p_broken + p_missing) > 0 and coalesce(trim(p_note), '') = '' and p_photo is null then
    raise exception 'Ajoutez une photo ou un mot pour expliquer les dégâts';
  end if;

  select * into v_item from public.stock_items where id = l.item_id for update;
  v_off := p_repair + p_broken + p_missing;
  update public.stock_items set qty_good = greatest(0, qty_good - v_off), qty_repair = qty_repair + p_repair, qty_broken = qty_broken + p_broken
  where id = l.item_id;
  update public.event_items set status = 'retourne', returned_by = public.current_employee_id(), returned_at = now(),
    qty_returned_good = p_good, qty_returned_repair = p_repair, qty_returned_broken = p_broken, qty_missing = p_missing,
    return_note = p_note, return_photo_path = p_photo
  where id = p_line;
  insert into public.stock_movements (item_id, event_id, kind, qty, detail, photo_path)
  values (l.item_id, l.event_id, 'retour', l.qty,
    format('Bon état %s · à réparer %s · cassé %s · manquant %s%s', p_good, p_repair, p_broken, p_missing, coalesce(' — ' || p_note, '')), p_photo);

  -- Tâche automatique pour le dépôt
  if p_repair > 0 or p_broken > 0 or p_missing > 0 then
    select name into v_event from public.events where id = l.event_id;
    select id into v_dep from public.departments where code = 'DEP';
    select employee_id into v_to from public.department_managers where department_id = v_dep order by employee_id limit 1;
    if p_repair > 0 then
      insert into public.tasks (title, description, assignee_id, department_id, priority, planned_date, due_date, requires_validation, created_by)
      values (format('Réparer : %s (%s)', v_item.name, p_repair), format('Revenu abîmé de « %s ». %s', v_event, coalesce(p_note, '')),
        v_to, v_dep, 'normale', public.local_today() + 1, public.local_today() + 7, false, public.current_employee_id());
    end if;
    if p_broken > 0 then
      insert into public.tasks (title, description, assignee_id, department_id, priority, planned_date, due_date, requires_validation, created_by)
      values (format('Trier ou jeter : %s (%s cassé%s)', v_item.name, p_broken, case when p_broken > 1 then 's' else '' end), format('Revenu cassé de « %s ». %s', v_event, coalesce(p_note, '')),
        v_to, v_dep, 'basse', public.local_today() + 1, public.local_today() + 7, false, public.current_employee_id());
    end if;
    -- Manquant : la direction est prévenue
    if p_missing > 0 then
      for v_to in select id from public.employees where role = 'admin' and status = 'actif' loop
        perform public.notify(v_to, 'stock_manquant', format('Matériel manquant : %s × %s', p_missing, v_item.name),
          format('Au retour de « %s »', v_event), '/stock/' || l.item_id);
      end loop;
    end if;
  end if;
end $$;

-- Réparation terminée : retour en bon état
create or replace function public.stock_repaired(p_item uuid, p_qty int, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_move_stock() then raise exception 'Permission refusée'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Quantité invalide'; end if;
  update public.stock_items set qty_repair = qty_repair - p_qty, qty_good = qty_good + p_qty where id = p_item and qty_repair >= p_qty;
  if not found then raise exception 'Pas autant d''articles à réparer'; end if;
  insert into public.stock_movements (item_id, kind, qty, detail) values (p_item, 'reparation', p_qty, coalesce(p_note, 'Réparé'));
end $$;

-- Jeter (cassés ou à réparer devenus irrécupérables)
create or replace function public.stock_discard(p_item uuid, p_qty int, p_from text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('stock.manage') then raise exception 'Permission refusée'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Quantité invalide'; end if;
  if p_from = 'broken' then
    update public.stock_items set qty_broken = qty_broken - p_qty where id = p_item and qty_broken >= p_qty;
  elsif p_from = 'repair' then
    update public.stock_items set qty_repair = qty_repair - p_qty where id = p_item and qty_repair >= p_qty;
  elsif p_from = 'good' then
    update public.stock_items set qty_good = qty_good - p_qty where id = p_item and qty_good >= p_qty;
  else
    raise exception 'Origine invalide';
  end if;
  if not found then raise exception 'Quantité supérieure au stock'; end if;
  insert into public.stock_movements (item_id, kind, qty, detail) values (p_item, 'rebut', p_qty, coalesce(p_note, 'Jeté'));
end $$;

-- Signaler un dégât au dépôt (hors événement)
create or replace function public.stock_flag(p_item uuid, p_qty int, p_to text, p_note text, p_photo text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_move_stock() then raise exception 'Permission refusée'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Quantité invalide'; end if;
  if p_to = 'repair' then
    update public.stock_items set qty_good = qty_good - p_qty, qty_repair = qty_repair + p_qty where id = p_item and qty_good >= p_qty;
  elsif p_to = 'broken' then
    update public.stock_items set qty_good = qty_good - p_qty, qty_broken = qty_broken + p_qty where id = p_item and qty_good >= p_qty;
  else
    raise exception 'Destination invalide';
  end if;
  if not found then raise exception 'Pas autant d''articles en bon état'; end if;
  insert into public.stock_movements (item_id, kind, qty, detail, photo_path)
  values (p_item, 'ajustement', p_qty, case when p_to = 'repair' then 'Signalé à réparer' else 'Signalé cassé' end || coalesce(' — ' || p_note, ''), p_photo);
end $$;

-- Entrée en stock (achat, fabrication) ou correction d'inventaire
create or replace function public.stock_adjust(p_item uuid, p_delta int, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('stock.manage') then raise exception 'Permission refusée'; end if;
  if p_delta is null or p_delta = 0 then raise exception 'Quantité invalide'; end if;
  update public.stock_items set qty_good = qty_good + p_delta where id = p_item and qty_good + p_delta >= 0;
  if not found then raise exception 'Le stock ne peut pas devenir négatif'; end if;
  insert into public.stock_movements (item_id, kind, qty, detail)
  values (p_item, case when p_delta > 0 then 'entree' else 'ajustement' end::public.stock_move_kind, p_delta, coalesce(p_note, 'Inventaire'));
end $$;

-- ---------------------------------------------------------------------
-- Sécurité
-- ---------------------------------------------------------------------
alter table public.stock_categories enable row level security;
alter table public.stock_items enable row level security;
alter table public.event_items enable row level security;
alter table public.stock_movements enable row level security;

create policy cat_read on public.stock_categories for select to authenticated using (true);
create policy cat_write on public.stock_categories for all to authenticated
  using (public.has_perm('stock.manage')) with check (public.has_perm('stock.manage'));

create policy items_read on public.stock_items for select to authenticated using (true);
create policy items_insert on public.stock_items for insert to authenticated with check (public.has_perm('stock.manage'));
-- Les quantités ne bougent que par les fonctions ci-dessus (trigger de garde)
create policy items_update on public.stock_items for update to authenticated
  using (public.has_perm('stock.manage')) with check (public.has_perm('stock.manage'));

create policy evitems_read on public.event_items for select to authenticated using (true);
create policy moves_read on public.stock_movements for select to authenticated using (true);
-- Aucune écriture directe sur event_items / stock_movements : uniquement via les fonctions

create or replace function public.stock_items_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Appel direct par l'API (rôle authenticated) : on interdit de toucher aux compteurs à la main
  if current_user = 'authenticated' and (new.qty_good, new.qty_repair, new.qty_broken) is distinct from (old.qty_good, old.qty_repair, old.qty_broken) then
    raise exception 'Les quantités se modifient par une entrée, une réparation ou un retour (traçabilité)';
  end if;
  return new;
end $$;
create trigger t_guard before update on public.stock_items for each row execute function public.stock_items_guard();

revoke execute on function public.event_span(uuid) from public, anon;
revoke execute on function public.stock_available(uuid, uuid) from public, anon;
revoke execute on function public.stock_reserve(uuid, uuid, int, text) from public, anon;
revoke execute on function public.stock_set_step(uuid, public.event_item_status, text) from public, anon;
revoke execute on function public.stock_return(uuid, int, int, int, int, text, text) from public, anon;
revoke execute on function public.stock_repaired(uuid, int, text) from public, anon;
revoke execute on function public.stock_discard(uuid, int, text, text) from public, anon;
revoke execute on function public.stock_flag(uuid, int, text, text, text) from public, anon;
revoke execute on function public.stock_adjust(uuid, int, text) from public, anon;
grant execute on function public.stock_available(uuid, uuid) to authenticated;
grant execute on function public.stock_reserve(uuid, uuid, int, text) to authenticated;
grant execute on function public.stock_set_step(uuid, public.event_item_status, text) to authenticated;
grant execute on function public.stock_return(uuid, int, int, int, int, text, text) to authenticated;
grant execute on function public.stock_repaired(uuid, int, text) to authenticated;
grant execute on function public.stock_discard(uuid, int, text, text) to authenticated;
grant execute on function public.stock_flag(uuid, int, text, text, text) to authenticated;
grant execute on function public.stock_adjust(uuid, int, text) to authenticated;
-- les droits réels sont vérifiés à l'intérieur de chaque fonction

-- ---------------------------------------------------------------------
-- Photos
-- items/<item_id>/<fichier>  ·  events/<event_id>/<fichier>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('stock-photos', 'stock-photos', false, 15728640)
on conflict (id) do nothing;

create policy "stock lecture" on storage.objects for select to authenticated
  using (bucket_id = 'stock-photos');
create policy "stock depot" on storage.objects for insert to authenticated
  with check (bucket_id = 'stock-photos' and public.can_move_stock());
create policy "stock suppression" on storage.objects for delete to authenticated
  using (bucket_id = 'stock-photos' and public.has_perm('stock.manage'));

-- ---------------------------------------------------------------------
-- Catégories de départ (modifiables)
-- ---------------------------------------------------------------------
insert into public.stock_categories (name, icon, color, sort_order) values
  ('Panneaux & estrades', 'panel', 'clay', 10),
  ('Tables & mobilier', 'table', 'ochre', 20),
  ('Figurines polypro', 'shapes', 'plum', 30),
  ('Structures & métal', 'frame', 'mist', 40),
  ('Bois & MDF', 'trees', 'sand', 50),
  ('Tissus & nappes', 'fabric', 'rose', 60),
  ('Vases & contenants', 'vase', 'teal', 70),
  ('Décoration', 'sparkles', 'rose', 80),
  ('Ballons', 'balloon', 'plum', 90),
  ('Lumières', 'light', 'ochre', 100),
  ('Câbles & rallonges', 'cable', 'mist', 110),
  ('Outillage & machines', 'tool', 'neutral', 120),
  ('Papeterie & OHMYBOX', 'gift', 'sage', 130);

-- ==================== 20261126000007_taches_automatiques.sql ====================
-- =====================================================================
-- BOHEMIA OS — Migration 7 : tâches automatiques
-- 1. Modèles de tâches par type d'événement : à la saisie (ou confirmation)
--    d'un événement, chacun reçoit sa tâche avec sa date limite.
--    Si la date de l'événement change, les dates des tâches non commencées suivent.
-- 2. Tâches de la semaine hors événements (ranger, réparer, jeter…),
--    créées chaque lundi.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Modèles de tâches d'événement
-- ---------------------------------------------------------------------
create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  description text,
  expected_result text,
  department_id uuid references public.departments (id) on delete set null,
  assignee_id uuid references public.employees (id) on delete set null,   -- vide = responsable du département
  event_types public.event_type[] not null default '{}',                  -- vide = tous les types
  offset_days int not null default -1,                                    -- jours par rapport au jour J (négatif = avant)
  due_time time,
  priority public.task_priority not null default 'normale',
  requires_validation boolean not null default false,
  step text not null default 'production',                                -- regroupement sur la fiche technique
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks add column template_id uuid references public.task_templates (id) on delete set null;
alter table public.tasks add column auto_generated boolean not null default false;
create unique index tasks_event_template_uq on public.tasks (event_id, template_id) where template_id is not null and event_id is not null;

create trigger t_touch before update on public.task_templates for each row execute function public.touch_updated_at();
create trigger t_audit after insert or update or delete on public.task_templates for each row execute function public.audit_trigger();

-- Personne par défaut d'un département : son responsable, sinon le premier employé actif du département
create or replace function public.department_lead(p_department uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select dm.employee_id from public.department_managers dm
     join public.employees e on e.id = dm.employee_id and e.status = 'actif'
     where dm.department_id = p_department order by e.first_name limit 1),
    (select e.id from public.employees e where e.department_id = p_department and e.status = 'actif' order by e.first_name limit 1))
$$;

-- Crée les tâches manquantes d'un événement à partir des modèles. Renvoie le nombre créé.
create or replace function public.generate_event_tasks(p_event uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  e public.events;
  t public.task_templates;
  v_due date;
  v_n int := 0;
  v_today date := public.local_today();
begin
  if auth.uid() is not null and not (public.has_perm('events.manage') or public.has_perm('tasks.create')) then raise exception 'Permission refusée'; end if;
  select * into e from public.events where id = p_event;
  if e.id is null or e.status in ('prospect', 'annule', 'realise', 'cloture') then return 0; end if;
  for t in
    select * from public.task_templates
    where is_active and (cardinality(event_types) = 0 or e.event_type = any (event_types))
    order by sort_order
  loop
    v_due := e.event_date + t.offset_days;
    -- Événement saisi tard : la tâche est pour aujourd'hui, en priorité haute
    insert into public.tasks (title, description, expected_result, assignee_id, department_id, event_id, priority,
      planned_date, due_date, due_time, requires_validation, created_by, template_id, auto_generated)
    values (t.title, t.description, t.expected_result,
      coalesce(t.assignee_id, public.department_lead(t.department_id)), t.department_id, e.id,
      case when v_due < v_today and t.priority in ('normale', 'basse') then 'haute' else t.priority end,
      greatest(v_due, v_today), greatest(v_due, v_today), t.due_time, t.requires_validation,
      coalesce(public.current_employee_id(), e.created_by), t.id, true)
    on conflict (event_id, template_id) where template_id is not null and event_id is not null do nothing;
    if found then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end $$;

-- Saisie, confirmation ou changement de date d'un événement
create or replace function public.events_auto_tasks()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_shift int;
begin
  if tg_op = 'INSERT' then
    perform public.generate_event_tasks(new.id);
  elsif new.status is distinct from old.status and old.status = 'prospect' then
    perform public.generate_event_tasks(new.id);
  end if;
  if tg_op = 'UPDATE' and new.event_date is distinct from old.event_date then
    v_shift := new.event_date - old.event_date;
    update public.tasks set
      due_date = greatest(due_date + v_shift, public.local_today()),
      planned_date = greatest(coalesce(planned_date, due_date) + v_shift, public.local_today())
    where event_id = new.id and auto_generated and status in ('a_faire', 'en_attente');
  end if;
  if tg_op = 'UPDATE' and new.status = 'annule' and old.status <> 'annule' then
    update public.tasks set status = 'termine', completed_at = now(), blocked_reason = 'Événement annulé'
    where event_id = new.id and auto_generated and status in ('a_faire', 'en_attente');
  end if;
  return new;
end $$;
create trigger t_auto_tasks after insert or update of status, event_date on public.events
  for each row execute function public.events_auto_tasks();

-- ---------------------------------------------------------------------
-- Tâches de la semaine (hors événements)
-- ---------------------------------------------------------------------
create table public.recurring_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  description text,
  department_id uuid references public.departments (id) on delete set null,
  assignee_id uuid references public.employees (id) on delete set null,   -- vide = responsable du département
  weekday int not null check (weekday between 1 and 7),                   -- 1 = lundi
  due_time time,
  priority public.task_priority not null default 'normale',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tasks add column recurring_id uuid references public.recurring_tasks (id) on delete set null;
create unique index tasks_recurring_day_uq on public.tasks (recurring_id, planned_date) where recurring_id is not null;
create trigger t_touch before update on public.recurring_tasks for each row execute function public.touch_updated_at();
create trigger t_audit after insert or update or delete on public.recurring_tasks for each row execute function public.audit_trigger();

-- Crée les tâches de la semaine qui commence le lundi p_week_start (idempotent)
create or replace function public.generate_week_tasks(p_week_start date default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_start date := coalesce(p_week_start, date_trunc('week', public.local_today())::date);
  r public.recurring_tasks;
  v_day date;
  v_n int := 0;
begin
  if auth.uid() is not null and not (public.has_perm('tasks.create') or public.is_admin()) then raise exception 'Permission refusée'; end if;
  for r in select * from public.recurring_tasks where is_active loop
    v_day := v_start + (r.weekday - 1);
    insert into public.tasks (title, description, assignee_id, department_id, priority, planned_date, due_date, due_time,
      requires_validation, created_by, recurring_id, auto_generated)
    values (r.title, r.description, coalesce(r.assignee_id, public.department_lead(r.department_id)), r.department_id, r.priority,
      v_day, v_day, r.due_time, false, public.current_employee_id(), r.id, true)
    on conflict (recurring_id, planned_date) where recurring_id is not null do nothing;
    if found then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end $$;

-- ---------------------------------------------------------------------
-- Sécurité
-- ---------------------------------------------------------------------
alter table public.task_templates enable row level security;
alter table public.recurring_tasks enable row level security;
create policy tpl_read on public.task_templates for select to authenticated using (true);
create policy tpl_write on public.task_templates for all to authenticated
  using (public.has_perm('settings.manage')) with check (public.has_perm('settings.manage'));
create policy rec_read on public.recurring_tasks for select to authenticated using (true);
create policy rec_write on public.recurring_tasks for all to authenticated
  using (public.has_perm('settings.manage')) with check (public.has_perm('settings.manage'));

revoke execute on function public.generate_event_tasks(uuid) from public, anon;
grant execute on function public.generate_event_tasks(uuid) to authenticated;
revoke execute on function public.generate_week_tasks(date) from public, anon;
grant execute on function public.generate_week_tasks(date) to authenticated, service_role;

-- Chaque lundi à 6 h (heure du Maroc ≈ UTC+1) : tâches de la semaine
do $$
begin
  perform cron.schedule('bohemia-taches-semaine', '0 5 * * 1', 'select public.generate_week_tasks()');
exception when others then
  raise notice 'pg_cron indisponible : tâches de la semaine à générer depuis le planning (%).', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- Modèles de départ (modifiables dans Paramètres > Tâches automatiques)
-- J = jour de l'événement. Les types : mariage, anniversaire, baby_shower,
-- bapteme, corporate, ramadan, stand, ohmybox, autre.
-- ---------------------------------------------------------------------
with d as (select id, code from public.departments)
insert into public.task_templates (title, description, department_id, event_types, offset_days, due_time, priority, requires_validation, step, sort_order)
select t.title, t.descr, d.id, t.types::public.event_type[], t.off, t.tm::time, t.prio::public.task_priority, t.val, t.step, t.so
from (values
  ('Envoyer le devis, le contrat et la facture d''acompte', 'Vérifier les montants, faire signer le contrat, encaisser l''acompte.', 'COM', '{}', -30, null, 'haute', false, 'commercial', 10),
  ('Compléter la fiche de l''événement', 'Horaires de livraison, installation, démontage, adresse exacte, contact sur place.', 'COM', '{}', -21, null, 'haute', false, 'commercial', 20),
  ('Concevoir la décoration et les panneaux', 'Moodboard, plan d''implantation, maquettes des panneaux selon le thème.', 'OMB', '{mariage,anniversaire,baby_shower,bapteme,corporate,ramadan,stand,autre}', -18, null, 'haute', true, 'conception', 30),
  ('Faire valider la déco par la cliente', 'Envoyer la conception, noter les retours. Rien n''est imprimé avant la validation.', 'COM', '{mariage,anniversaire,baby_shower,bapteme,corporate,ramadan,stand,autre}', -14, null, 'urgente', false, 'conception', 40),
  ('Préparer les fichiers d''impression', 'Formats, fonds perdus, découpe. Envoyer à l''imprimerie si sous-traité.', 'GRA', '{mariage,anniversaire,baby_shower,bapteme,corporate,ramadan,stand,autre}', -10, null, 'normale', true, 'production', 50),
  ('Acheter la matière première manquante', 'MDF, forex, polypro, vinyle, peinture… selon la fiche technique.', 'ACH', '{mariage,anniversaire,baby_shower,bapteme,corporate,ramadan,stand,autre}', -10, null, 'normale', false, 'achats', 55),
  ('Imprimer, découper et poser le vinyle', 'Panneaux, stickers, lettrage. Photo de chaque pièce finie.', 'GRA', '{mariage,anniversaire,baby_shower,bapteme,corporate,ramadan,stand,autre}', -6, null, 'normale', true, 'production', 60),
  ('Peindre les panneaux et estrades selon le thème', null, 'OMB', '{mariage,anniversaire,baby_shower,bapteme,corporate,ramadan,stand}', -5, null, 'normale', false, 'production', 65),
  ('Réserver le matériel de l''événement', 'Dans Dépôt & Stock : tables, structures, vases, lumières, câbles…', 'DEP', '{}', -7, null, 'normale', false, 'logistique', 70),
  ('Commander les fleurs', null, 'FLD', '{mariage,anniversaire,baby_shower,bapteme,corporate}', -5, null, 'normale', false, 'fleurs', 75),
  ('Réaliser les compositions florales', 'Photo des compositions terminées.', 'FLD', '{mariage,anniversaire,baby_shower,bapteme,corporate}', -1, '17:00', 'haute', false, 'fleurs', 80),
  ('Préparer les coffrets OHMYBOX', 'Assemblage, personnalisation, emballage, photo du lot fini.', 'OMB', '{ohmybox}', -2, null, 'haute', true, 'production', 85),
  ('Préparer et charger le matériel', 'Cocher « préparé » puis photo dans la voiture pour chaque article.', 'DEP', '{}', -1, '17:00', 'haute', false, 'logistique', 90),
  ('Livraison et installation', 'Photo de l''installation terminée.', 'TRA', '{}', 0, null, 'urgente', false, 'logistique', 95),
  ('Récupérer le matériel et le ranger au dépôt', 'Compter au retour : bon état, à réparer, cassé, manquant.', 'DEP', '{}', 1, '18:00', 'haute', false, 'logistique', 100)
) as t(title, descr, code, types, off, tm, prio, val, step, so)
join d on d.code = t.code;

with d as (select id, code from public.departments)
insert into public.recurring_tasks (title, description, department_id, weekday, priority)
select t.title, t.descr, d.id, t.wd, t.prio::public.task_priority
from (values
  ('Ranger le dépôt', 'Remettre chaque article à sa place, allées dégagées.', 'DEP', 1, 'normale'),
  ('Réparer le matériel abîmé', 'Voir Dépôt & Stock > À réparer.', 'DEP', 3, 'normale'),
  ('Trier et jeter ce qui ne sert plus', 'Matériel cassé ou irrécupérable : le noter « jeté » dans le stock.', 'DEP', 5, 'basse'),
  ('Ranger et nettoyer l''atelier', null, 'GRA', 6, 'normale'),
  ('Classer les figurines polypro par thème', null, 'OMB', 4, 'basse')
) as t(title, descr, code, wd, prio)
join d on d.code = t.code;

-- ==================== 20261126000008_fournisseurs_achats.sql ====================
-- =====================================================================
-- BOHEMIA OS — Migration 8 : fournisseurs, prestataires, achats, dépenses
-- - suppliers : fournisseurs de matière, prestataires (moquette, animation…),
--   sous-traitants (imprimerie, menuiserie…). Contacts visibles par l'équipe.
-- - event_services : prestations commandées pour un événement.
-- - purchase_requests / purchase_lines : demande → validation → commande →
--   réception (entrée automatique dans le stock).
-- - expenses : tous les montants payés ou à payer (prestations, achats, autres).
--   CONFIDENTIEL : direction + commerciale (finance.view), comme les budgets.
--   Base de la rentabilité par événement (étape 5).
-- =====================================================================

insert into public.permissions (key, label, module, sort_order) values
  ('suppliers.manage', 'Ajouter et modifier les fournisseurs et prestataires', 'Fournisseurs & achats', 100),
  ('purchases.validate', 'Valider ou refuser les demandes d''achat', 'Fournisseurs & achats', 101),
  ('purchases.manage', 'Commander et réceptionner les achats', 'Fournisseurs & achats', 102);

-- Achats & Matériaux : commandes, réceptions, fournisseurs ; Commercial : fournisseurs et prestataires
insert into public.employee_permissions (employee_id, permission, granted)
select e.id, p.perm, true
from public.employees e join public.departments d on d.id = e.department_id
cross join (values ('suppliers.manage'), ('purchases.manage')) as p(perm)
where d.code = 'ACH' or (d.code = 'COM' and p.perm = 'suppliers.manage')
on conflict do nothing;

create type public.supplier_kind as enum ('fournisseur', 'prestataire', 'sous_traitant');
create type public.service_status as enum ('a_reserver', 'reserve', 'confirme', 'realise', 'annule');
create type public.purchase_status as enum ('demande', 'validee', 'refusee', 'commandee', 'recue', 'annulee');

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  kind public.supplier_kind not null default 'fournisseur',
  categories text[] not null default '{}',     -- ex. {Moquette} {Animation} {Imprimerie} {MDF, Forex}
  contact_name text,
  phone text,
  whatsapp text,
  email text,
  address text,
  notes text,
  rating int check (rating between 1 and 5),
  is_active boolean not null default true,
  created_by uuid references public.employees (id) on delete set null default public.current_employee_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index suppliers_categories_idx on public.suppliers using gin (categories);

create table public.event_services (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  description text not null check (length(trim(description)) > 0),   -- ex. Moquette rouge 40 m², DJ + animation 4 h
  service_date date,
  service_time time,
  status public.service_status not null default 'a_reserver',
  notes text,
  created_by uuid references public.employees (id) on delete set null default public.current_employee_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index event_services_event_idx on public.event_services (event_id);
create index event_services_supplier_idx on public.event_services (supplier_id);

create table public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  details text,
  event_id uuid references public.events (id) on delete set null,
  supplier_id uuid references public.suppliers (id) on delete set null,
  needed_by date,
  status public.purchase_status not null default 'demande',
  requested_by uuid references public.employees (id) on delete set null default public.current_employee_id(),
  decided_by uuid references public.employees (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  ordered_by uuid references public.employees (id) on delete set null,
  ordered_at timestamptz,
  received_by uuid references public.employees (id) on delete set null,
  received_at timestamptz,
  received_photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index purchase_requests_status_idx on public.purchase_requests (status);

create table public.purchase_lines (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.purchase_requests (id) on delete cascade,
  label text not null check (length(trim(label)) > 0),
  qty numeric(10, 2) not null default 1 check (qty > 0),
  unit text not null default 'pièce',
  stock_item_id uuid references public.stock_items (id) on delete set null,   -- si renseigné : entre dans le stock à la réception
  sort_order int not null default 0
);

-- Montants (confidentiels)
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events (id) on delete set null,
  supplier_id uuid references public.suppliers (id) on delete set null,
  service_id uuid references public.event_services (id) on delete cascade,
  purchase_id uuid references public.purchase_requests (id) on delete cascade,
  label text not null,
  amount_mad numeric(12, 2) not null check (amount_mad >= 0),
  paid_mad numeric(12, 2) not null default 0 check (paid_mad >= 0),
  due_date date,
  paid_at date,
  payment_method text,          -- espèces, virement, chèque
  invoice_path text,
  created_by uuid references public.employees (id) on delete set null default public.current_employee_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index expenses_event_idx on public.expenses (event_id);
create unique index expenses_service_uq on public.expenses (service_id) where service_id is not null;
create unique index expenses_purchase_uq on public.expenses (purchase_id) where purchase_id is not null;

create trigger t_touch before update on public.suppliers for each row execute function public.touch_updated_at();
create trigger t_touch before update on public.event_services for each row execute function public.touch_updated_at();
create trigger t_touch before update on public.purchase_requests for each row execute function public.touch_updated_at();
create trigger t_touch before update on public.expenses for each row execute function public.touch_updated_at();
create trigger t_audit after insert or update or delete on public.suppliers for each row execute function public.audit_trigger();
create trigger t_audit after insert or update or delete on public.event_services for each row execute function public.audit_trigger();
create trigger t_audit after insert or update or delete on public.purchase_requests for each row execute function public.audit_trigger();
create trigger t_audit after insert or update or delete on public.expenses for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------
-- Circuit des achats
-- ---------------------------------------------------------------------
create or replace function public.purchase_decide(p_request uuid, p_ok boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('purchases.validate') then raise exception 'Permission refusée'; end if;
  if not p_ok and coalesce(trim(p_note), '') = '' then raise exception 'Indiquez pourquoi la demande est refusée'; end if;
  update public.purchase_requests set status = case when p_ok then 'validee' else 'refusee' end::public.purchase_status,
    decided_by = public.current_employee_id(), decided_at = now(), decision_note = p_note
  where id = p_request and status = 'demande';
  if not found then raise exception 'Demande déjà traitée'; end if;
end $$;

create or replace function public.purchase_order(p_request uuid, p_supplier uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('purchases.manage') then raise exception 'Permission refusée'; end if;
  update public.purchase_requests set status = 'commandee', ordered_by = public.current_employee_id(), ordered_at = now(),
    supplier_id = coalesce(p_supplier, supplier_id)
  where id = p_request and status = 'validee';
  if not found then raise exception 'La demande doit être validée avant d''être commandée'; end if;
end $$;

-- Réception : les lignes reliées à un article du stock y entrent automatiquement
create or replace function public.purchase_receive(p_request uuid, p_photo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  l public.purchase_lines;
  v_title text;
begin
  if not (public.has_perm('purchases.manage') or public.has_perm('stock.manage')) then raise exception 'Permission refusée'; end if;
  update public.purchase_requests set status = 'recue', received_by = public.current_employee_id(), received_at = now(),
    received_photo_path = coalesce(p_photo, received_photo_path)
  where id = p_request and status in ('validee', 'commandee')
  returning title into v_title;
  if not found then raise exception 'Cet achat ne peut pas être réceptionné'; end if;
  for l in select * from public.purchase_lines where request_id = p_request and stock_item_id is not null loop
    update public.stock_items set qty_good = qty_good + ceil(l.qty)::int where id = l.stock_item_id;
    insert into public.stock_movements (item_id, kind, qty, detail, photo_path)
    values (l.stock_item_id, 'entree', ceil(l.qty)::int, 'Achat reçu : ' || v_title, p_photo);
  end loop;
end $$;

-- Notifications
create or replace function public.purchase_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_to uuid;
  v_link text := '/achats/' || new.id;
begin
  if tg_op = 'INSERT' then
    for v_to in
      select e.id from public.employees e where e.status = 'actif' and (e.role = 'admin'
        or exists (select 1 from public.employee_permissions ep where ep.employee_id = e.id and ep.permission = 'purchases.validate' and ep.granted))
    loop
      perform public.notify(v_to, 'achat_demande', 'Demande d''achat : ' || new.title, coalesce('Pour le ' || to_char(new.needed_by, 'DD/MM'), null), v_link);
    end loop;
  elsif new.status is distinct from old.status then
    if new.status in ('validee', 'refusee') then
      perform public.notify(new.requested_by, 'achat_' || new.status,
        'Achat ' || case when new.status = 'validee' then 'validé' else 'refusé' end || ' : ' || new.title, new.decision_note, v_link);
      if new.status = 'validee' then
        for v_to in select e.id from public.employees e join public.departments d on d.id = e.department_id
          where d.code = 'ACH' and e.status = 'actif' loop
          perform public.notify(v_to, 'achat_a_commander', 'À commander : ' || new.title, coalesce('Pour le ' || to_char(new.needed_by, 'DD/MM'), null), v_link);
        end loop;
      end if;
    elsif new.status = 'recue' then
      perform public.notify(new.requested_by, 'achat_recu', 'Achat reçu : ' || new.title, null, v_link);
    end if;
  end if;
  return new;
end $$;
create trigger t_notify after insert or update of status on public.purchase_requests
  for each row execute function public.purchase_after_change();

-- ---------------------------------------------------------------------
-- Sécurité
-- ---------------------------------------------------------------------
alter table public.suppliers enable row level security;
alter table public.event_services enable row level security;
alter table public.purchase_requests enable row level security;
alter table public.purchase_lines enable row level security;
alter table public.expenses enable row level security;

create policy sup_read on public.suppliers for select to authenticated using (true);
create policy sup_write on public.suppliers for all to authenticated
  using (public.has_perm('suppliers.manage')) with check (public.has_perm('suppliers.manage'));

create policy svc_read on public.event_services for select to authenticated using (true);
create policy svc_write on public.event_services for all to authenticated
  using (public.has_perm('events.manage') or public.has_perm('suppliers.manage'))
  with check (public.has_perm('events.manage') or public.has_perm('suppliers.manage'));

-- Achats : chacun voit les siennes ; acheteurs et validateurs voient tout
create or replace function public.can_see_purchase(p_request uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_perm('purchases.manage') or public.has_perm('purchases.validate') or public.has_perm('stock.manage')
    or exists (select 1 from public.purchase_requests r where r.id = p_request and r.requested_by = public.current_employee_id())
$$;
create policy pur_read on public.purchase_requests for select to authenticated using (public.can_see_purchase(id));
create policy pur_insert on public.purchase_requests for insert to authenticated
  with check (requested_by = public.current_employee_id() and status = 'demande');
-- Modifier : le demandeur tant que c'est en demande (ou pour annuler) ; les acheteurs ; les statuts passent par les fonctions
create policy pur_update on public.purchase_requests for update to authenticated
  using ((requested_by = public.current_employee_id() and status = 'demande') or public.has_perm('purchases.manage'))
  with check ((requested_by = public.current_employee_id() and status in ('demande', 'annulee')) or public.has_perm('purchases.manage'));

create policy pl_read on public.purchase_lines for select to authenticated using (public.can_see_purchase(request_id));
create policy pl_write on public.purchase_lines for all to authenticated
  using (exists (select 1 from public.purchase_requests r where r.id = request_id
    and ((r.requested_by = public.current_employee_id() and r.status = 'demande') or public.has_perm('purchases.manage'))))
  with check (exists (select 1 from public.purchase_requests r where r.id = request_id
    and ((r.requested_by = public.current_employee_id() and r.status = 'demande') or public.has_perm('purchases.manage'))));

create policy exp_all on public.expenses for all to authenticated
  using (public.has_perm('finance.view')) with check (public.has_perm('finance.view'));

-- Garde : le statut d'une demande ne change que par les fonctions (sauf annulation par le demandeur)
create or replace function public.purchase_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and new.status is distinct from old.status
     and not (new.status = 'annulee' and old.status in ('demande', 'validee')) then
    raise exception 'Utilisez les boutons Valider, Commander ou Réceptionner';
  end if;
  return new;
end $$;
create trigger t_guard before update on public.purchase_requests for each row execute function public.purchase_guard();

revoke execute on function public.purchase_decide(uuid, boolean, text) from public, anon;
revoke execute on function public.purchase_order(uuid, uuid) from public, anon;
revoke execute on function public.purchase_receive(uuid, text) from public, anon;
grant execute on function public.purchase_decide(uuid, boolean, text) to authenticated;
grant execute on function public.purchase_order(uuid, uuid) to authenticated;
grant execute on function public.purchase_receive(uuid, text) to authenticated;

-- Photos de réception et factures (dossier purchases/<id>/ et expenses/<id>/)
insert into storage.buckets (id, name, public, file_size_limit) values ('purchase-files', 'purchase-files', false, 15728640)
on conflict (id) do nothing;
create policy "achats lecture" on storage.objects for select to authenticated
  using (bucket_id = 'purchase-files' and (public.has_perm('purchases.manage') or public.has_perm('finance.view') or public.has_perm('stock.manage')));
create policy "achats depot" on storage.objects for insert to authenticated
  with check (bucket_id = 'purchase-files' and (public.has_perm('purchases.manage') or public.has_perm('finance.view') or public.has_perm('stock.manage')));

-- Prestataires principaux connus (à compléter : téléphone, WhatsApp…)
insert into public.suppliers (name, kind, categories, notes) values
  ('Moquette (prestataire principal)', 'prestataire', '{Moquette}', 'À compléter : nom exact, téléphone, tarifs au m².'),
  ('Mouna — Animation', 'prestataire', '{Animation}', 'À compléter : téléphone, formules.'),
  ('Imprimerie (sous-traitance grand format)', 'sous_traitant', '{Imprimerie,Vinyle}', 'À compléter.');

-- ==================== 20261126000009_fiche_employe_outillage.sql ====================
-- =====================================================================
-- BOHEMIA OS : fiche employé complète (données personnelles réservées
-- à la Direction), seuil d'alerte du stock, prêt d'outillage (visseuses…)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Données personnelles : table séparée, lisible par la Direction seulement
-- ---------------------------------------------------------------------
create table public.employee_private (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  cin text,                      -- n° de carte d'identité nationale
  birth_date date,
  address text,
  emergency_name text,           -- personne à prévenir
  emergency_phone text,
  contract_type text,            -- CDI, CDD, ANAPEC, stage, journalier, freelance
  contract_end date,
  cnss_number text,
  bank_rib text,
  updated_at timestamptz not null default now()
);
alter table public.employee_private enable row level security;
create policy emp_private_admin on public.employee_private for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create trigger t_touch before update on public.employee_private for each row execute function public.touch_updated_at();
create trigger t_audit after insert or update or delete on public.employee_private for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------
-- Stock : seuil d'alerte (« si un truc manque »)
-- ---------------------------------------------------------------------
alter table public.stock_items add column min_qty int not null default 0 check (min_qty >= 0);

create or replace function public.stock_low_alert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_to uuid;
begin
  if new.min_qty > 0 and new.qty_good < new.min_qty
     and (old.qty_good >= old.min_qty or old.qty_good > new.qty_good or old.min_qty <> new.min_qty) then
    for v_to in
      select e.id from public.employees e left join public.departments d on d.id = e.department_id
      where e.status = 'actif' and (e.role = 'admin' or d.code in ('DEP', 'ACH'))
    loop
      perform public.notify(v_to, 'stock_bas', 'Stock bas : ' || new.name,
        'Il reste ' || new.qty_good || ' en bon état (minimum ' || new.min_qty || ').', '/stock/' || new.id,
        'stock_bas:' || new.id || ':' || new.qty_good);
    end loop;
  end if;
  return new;
end $$;
create trigger t_low_alert after update of qty_good, min_qty on public.stock_items
  for each row execute function public.stock_low_alert();

-- ---------------------------------------------------------------------
-- Prêt d'outillage : qui a pris la visseuse, quand elle revient
-- ---------------------------------------------------------------------
create table public.tool_loans (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.stock_items (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete restrict,
  qty int not null default 1 check (qty > 0),
  event_id uuid references public.events (id) on delete set null,
  taken_at timestamptz not null default now(),
  due_back date,
  returned_at timestamptz,
  returned_ok boolean,
  note text,
  created_by uuid references public.employees (id) on delete set null default public.current_employee_id()
);
create index tool_loans_open_idx on public.tool_loans (item_id) where returned_at is null;
alter table public.tool_loans enable row level security;
create policy loans_read on public.tool_loans for select to authenticated using (true);

create or replace function public.tool_lend(p_item uuid, p_employee uuid, p_qty int, p_due date default null, p_event uuid default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_free int;
  v_id uuid;
begin
  if not public.can_move_stock() then raise exception 'Permission refusée'; end if;
  select i.qty_good - coalesce((select sum(l.qty) from public.tool_loans l where l.item_id = i.id and l.returned_at is null), 0)
    into v_free from public.stock_items i where i.id = p_item;
  if v_free is null then raise exception 'Article introuvable'; end if;
  if p_qty > v_free then raise exception 'Il n''en reste que % au dépôt', greatest(v_free, 0); end if;
  insert into public.tool_loans (item_id, employee_id, qty, due_back, event_id, note)
  values (p_item, p_employee, p_qty, p_due, p_event, p_note) returning id into v_id;
  return v_id;
end $$;

create or replace function public.tool_return(p_loan uuid, p_ok boolean default true, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  l public.tool_loans;
begin
  if not public.can_move_stock() then raise exception 'Permission refusée'; end if;
  update public.tool_loans set returned_at = now(), returned_ok = p_ok, note = coalesce(p_note, note)
  where id = p_loan and returned_at is null returning * into l;
  if not found then raise exception 'Déjà rendu'; end if;
  if not p_ok then
    perform public.stock_flag(l.item_id, l.qty, 'repair', coalesce(p_note, 'Rendu abîmé'));
  end if;
end $$;

revoke execute on function public.tool_lend(uuid, uuid, int, date, uuid, text) from public, anon;
revoke execute on function public.tool_return(uuid, boolean, text) from public, anon;
grant execute on function public.tool_lend(uuid, uuid, int, date, uuid, text) to authenticated;
grant execute on function public.tool_return(uuid, boolean, text) to authenticated;

-- Outillage de départ (à compléter dans l'inventaire)
insert into public.stock_items (name, category_id, unit, min_qty, notes)
select v.name, c.id, 'pièce', v.min_qty, 'À compléter : quantité, emplacement, photo.'
from (values ('Visseuse sans fil', 2), ('Perceuse', 1), ('Agrafeuse murale', 2), ('Escabeau', 1), ('Pistolet à colle', 2)) as v(name, min_qty)
cross join public.stock_categories c where c.name = 'Outillage & machines'
  and not exists (select 1 from public.stock_items i where i.name = v.name);
