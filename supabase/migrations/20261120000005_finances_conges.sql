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
