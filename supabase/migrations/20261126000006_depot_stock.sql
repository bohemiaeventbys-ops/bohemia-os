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
