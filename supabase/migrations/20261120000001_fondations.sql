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

-- Responsables de département (plusieurs possibles : Khaoula & Siham, Ayoub & Mohamed)
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
