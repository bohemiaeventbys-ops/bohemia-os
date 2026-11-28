-- BOHEMIA OS : design validé deux fois, panneaux (forme, matière), couleur et vinyle par ligne, manques notés.
-- Peut être relancé sans risque.

-- ---------------------------------------------------------------- Design : deux validations par version
-- 1) « Validé par l'infographiste » : nom + date
-- 2) « Approuvé par la cliente » : statut « valide » + date (decided_at) + preuve d'accord (photo, capture WhatsApp…)
alter table public.design_proofs add column if not exists graphic_ok_at timestamptz;
alter table public.design_proofs add column if not exists graphic_ok_by uuid references public.employees (id) on delete set null;
alter table public.design_proofs add column if not exists client_proof_path text;

create or replace function public.proof_graphic_ok(p_proof uuid, p_ok boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_perm('design.manage') or public.has_perm('events.manage')) then raise exception 'Permission refusée'; end if;
  update public.design_proofs
     set graphic_ok_at = case when p_ok then now() end,
         graphic_ok_by = case when p_ok then public.current_employee_id() end
   where id = p_proof and status <> 'annule';
  if not found then raise exception 'Design introuvable'; end if;
end $$;
revoke execute on function public.proof_graphic_ok(uuid, boolean) from public, anon;
grant execute on function public.proof_graphic_ok(uuid, boolean) to authenticated;

-- Le nom de l'infographiste et la date ne se tapent pas à la main : seulement via la fonction
create or replace function public.proof_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and new.status is distinct from old.status and new.status <> 'annule' then
    raise exception 'Utilisez les boutons Validé / À modifier';
  end if;
  if current_user = 'authenticated' and new.share_token is distinct from old.share_token then
    raise exception 'Lien non modifiable';
  end if;
  if current_user = 'authenticated' and (new.graphic_ok_at is distinct from old.graphic_ok_at or new.graphic_ok_by is distinct from old.graphic_ok_by) then
    raise exception 'Utilisez le bouton « Validé par l''infographiste »';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- Stock : panneaux
alter table public.stock_items add column if not exists shape text;     -- rond, arche, rectangle…
alter table public.stock_items add column if not exists material text;  -- Forex, MDF, bois…

-- ---------------------------------------------------------------- Lignes : couleur, vinyle, manque
alter table public.event_items add column if not exists color text;
alter table public.event_items add column if not exists vinyl text;
alter table public.event_items add column if not exists qty_short int not null default 0;
alter table public.event_items drop constraint if exists event_items_qty_check;
alter table public.event_items drop constraint if exists event_items_qty_ok;
alter table public.event_items add constraint event_items_qty_ok check (qty >= 0 and qty_short >= 0 and (qty > 0 or qty_short > 0));

-- Réserver plusieurs articles d'un coup. Si "short" est vrai, on réserve ce qui reste et on note le manque.
create or replace function public.stock_reserve_many(p_event uuid, p_lines jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  l jsonb;
  v_item uuid;
  v_qty int;
  v_take int;
  v_avail int;
  v_name text;
  n int := 0;
begin
  if not public.can_move_stock() then raise exception 'Permission refusée'; end if;
  if jsonb_typeof(p_lines) <> 'array' then raise exception 'Liste invalide'; end if;
  perform 1 from public.stock_items where id in (select (x->>'item_id')::uuid from jsonb_array_elements(p_lines) x) order by id for update;
  for l in select * from jsonb_array_elements(p_lines) loop
    v_item := (l->>'item_id')::uuid;
    v_qty := (l->>'qty')::int;
    if v_qty is null or v_qty <= 0 then raise exception 'Quantité invalide'; end if;
    select name into v_name from public.stock_items where id = v_item;
    if v_name is null then raise exception 'Article introuvable'; end if;
    if exists (select 1 from public.event_items where event_id = p_event and item_id = v_item and status <> 'reserve') then
      raise exception '« % » est déjà préparé ou chargé : modifiez-le au dépôt', v_name;
    end if;
    v_avail := public.stock_available(v_item, p_event);
    v_take := least(v_qty, greatest(v_avail, 0));
    if v_take < v_qty and coalesce((l->>'short')::boolean, false) is not true then
      raise exception 'Pas assez de « % » à ces dates : % disponible(s)', v_name, v_avail;
    end if;
    insert into public.event_items (event_id, item_id, qty, qty_short, note, finish, zone, color, vinyl, ref_photo_path, created_by)
    values (p_event, v_item, v_take, v_qty - v_take, nullif(trim(l->>'note'), ''), nullif(trim(l->>'finish'), ''), nullif(trim(l->>'zone'), ''),
            nullif(trim(l->>'color'), ''), nullif(trim(l->>'vinyl'), ''), nullif(l->>'ref_photo_path', ''), public.current_employee_id())
    on conflict (event_id, item_id) do update set qty = excluded.qty, qty_short = excluded.qty_short,
      note = coalesce(excluded.note, public.event_items.note), finish = coalesce(excluded.finish, public.event_items.finish),
      zone = coalesce(excluded.zone, public.event_items.zone), color = coalesce(excluded.color, public.event_items.color),
      vinyl = coalesce(excluded.vinyl, public.event_items.vinyl), ref_photo_path = coalesce(excluded.ref_photo_path, public.event_items.ref_photo_path);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.stock_reserve_many(uuid, jsonb) from public, anon;
grant execute on function public.stock_reserve_many(uuid, jsonb) to authenticated;

-- Consignes d'une ligne : finition, zone, couleur, vinyle, photo de référence
drop function if exists public.stock_line_details(uuid, text, text, text);
create or replace function public.stock_line_details(p_line uuid, p_finish text, p_zone text, p_ref_photo text default null, p_color text default null, p_vinyl text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.can_move_stock() or public.has_perm('events.manage')) then raise exception 'Permission refusée'; end if;
  update public.event_items set finish = nullif(trim(p_finish), ''), zone = nullif(trim(p_zone), ''),
    color = nullif(trim(p_color), ''), vinyl = nullif(trim(p_vinyl), ''),
    ref_photo_path = coalesce(nullif(p_ref_photo, ''), ref_photo_path) where id = p_line;
end $$;
revoke execute on function public.stock_line_details(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.stock_line_details(uuid, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------- Agenda partagé : rendez-vous, appels, notes, rappels
-- Tout le monde voit et ajoute. Chacun modifie ou supprime ce qu'il a écrit (la direction : tout). Aucun montant ici.
create table if not exists public.agenda_entries (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  start_time time,
  end_time time,
  kind text not null default 'note' check (kind in ('rdv', 'appel', 'note', 'rappel')),
  title text not null check (length(trim(title)) between 1 and 200),
  details text check (details is null or length(details) <= 2000),
  phone text check (phone is null or length(phone) <= 40),
  event_id uuid references public.events (id) on delete set null,
  created_by uuid references public.employees (id) on delete set null default public.current_employee_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agenda_entries_day_idx on public.agenda_entries (day);
alter table public.agenda_entries enable row level security;
drop policy if exists agenda_read on public.agenda_entries;
drop policy if exists agenda_insert on public.agenda_entries;
drop policy if exists agenda_update on public.agenda_entries;
drop policy if exists agenda_delete on public.agenda_entries;
create policy agenda_read on public.agenda_entries for select to authenticated using (public.current_employee_id() is not null);
create policy agenda_insert on public.agenda_entries for insert to authenticated
  with check (public.current_employee_id() is not null and created_by = public.current_employee_id());
create policy agenda_update on public.agenda_entries for update to authenticated
  using (created_by = public.current_employee_id() or public.is_admin())
  with check (created_by = public.current_employee_id() or public.is_admin());
create policy agenda_delete on public.agenda_entries for delete to authenticated
  using (created_by = public.current_employee_id() or public.is_admin());
drop trigger if exists t_touch on public.agenda_entries;
create trigger t_touch before update on public.agenda_entries for each row execute function public.touch_updated_at();
grant select, insert, update, delete on public.agenda_entries to authenticated;
