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
