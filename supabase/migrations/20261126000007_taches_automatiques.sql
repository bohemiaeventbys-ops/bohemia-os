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
