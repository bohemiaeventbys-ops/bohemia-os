-- =====================================================================
-- BOHEMIA OS : livraison « fiche événement »
-- - équipe affectée (rôle, mission, horaires, renfort externe, responsable)
-- - inspirations (galerie, photo de couverture) et aperçu des designs PDF
-- - matériel : zone de pose, photo de référence, réservation groupée sûre
-- - stock : sous-catégories
-- - calcul : affichage HT / TTC par type de client
-- =====================================================================

-- ---------------------------------------------------------------- Équipe
create table if not exists public.event_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  employee_id uuid references public.employees (id) on delete cascade,
  external_name text,                    -- renfort externe
  external_phone text,
  role text not null check (role in ('commercial', 'infographiste', 'atelier', 'magasinier', 'chauffeur', 'installateur', 'responsable')),
  mission text,                          -- ex. Chargement, Livraison, Montage, Démontage
  start_at timestamptz,
  end_at timestamptz,
  is_lead boolean not null default false,
  created_by uuid references public.employees (id) on delete set null default public.current_employee_id(),
  created_at timestamptz not null default now(),
  constraint assign_who check (employee_id is not null or length(trim(coalesce(external_name, ''))) > 0),
  constraint assign_times check (start_at is null or end_at is null or end_at > start_at)
);
create index if not exists event_assignments_event_idx on public.event_assignments (event_id);
create index if not exists event_assignments_emp_idx on public.event_assignments (employee_id, start_at);
alter table public.event_assignments enable row level security;
drop policy if exists assign_read on public.event_assignments;
create policy assign_read on public.event_assignments for select to authenticated using (true);
drop policy if exists assign_write on public.event_assignments;
create policy assign_write on public.event_assignments for all to authenticated
  using (public.has_perm('events.manage')) with check (public.has_perm('events.manage'));
drop trigger if exists t_audit on public.event_assignments;
create trigger t_audit after insert or update or delete on public.event_assignments for each row execute function public.audit_trigger();

-- Garde l'équipe de l'événement à jour (droits terrain), le responsable principal, et prévient la personne
create or replace function public.event_assignments_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ev public.events;
begin
  if tg_op = 'DELETE' then
    if old.employee_id is not null and not exists (select 1 from public.event_assignments where event_id = old.event_id and employee_id = old.employee_id) then
      delete from public.event_team where event_id = old.event_id and employee_id = old.employee_id;
    end if;
    return old;
  end if;
  if new.employee_id is not null then
    insert into public.event_team (event_id, employee_id, role_label) values (new.event_id, new.employee_id, new.role)
    on conflict (event_id, employee_id) do nothing;
  end if;
  if new.is_lead then
    update public.event_assignments set is_lead = false where event_id = new.event_id and id <> new.id and is_lead;
    if new.employee_id is not null then update public.events set manager_id = new.employee_id where id = new.event_id; end if;
  end if;
  if tg_op = 'INSERT' and new.created_by is not null and new.employee_id is not null and new.employee_id <> coalesce(public.current_employee_id(), '00000000-0000-0000-0000-000000000000'::uuid) then
    select * into v_ev from public.events where id = new.event_id;
    perform public.notify(new.employee_id, 'mission',
      'Nouvelle mission : ' || coalesce(new.mission, new.role) || ' — ' || v_ev.name,
      coalesce(to_char(new.start_at at time zone 'Africa/Casablanca', 'DD/MM HH24:MI'), to_char(v_ev.event_date, 'DD/MM')) || coalesce(' · ' || v_ev.address, ''),
      '/evenements/' || new.event_id || '/fiche', 'mission:' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists t_after on public.event_assignments;
create trigger t_after after insert or update or delete on public.event_assignments for each row execute function public.event_assignments_after();

-- Les membres déjà dans l'équipe deviennent des affectations (rôle deviné, à corriger si besoin)
insert into public.event_assignments (event_id, employee_id, role, mission)
select t.event_id, t.employee_id,
  case
    when t.role_label ilike '%chauff%' or t.role_label ilike '%livr%' then 'chauffeur'
    when t.role_label ilike '%magas%' or t.role_label ilike '%dép%' or t.role_label ilike '%dep%' then 'magasinier'
    when t.role_label ilike '%infog%' or t.role_label ilike '%graph%' then 'infographiste'
    when t.role_label ilike '%atel%' then 'atelier'
    when t.role_label ilike '%commerc%' then 'commercial'
    when t.role_label ilike '%respons%' then 'responsable'
    else 'installateur' end,
  t.role_label
from public.event_team t
where not exists (select 1 from public.event_assignments a where a.event_id = t.event_id and a.employee_id = t.employee_id);

-- ---------------------------------------------------------------- Design et inspirations
alter table public.design_proofs add column if not exists preview_path text;   -- image de la 1re page d'un PDF

create table if not exists public.event_inspirations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  file_path text not null,
  caption text,
  is_cover boolean not null default false,
  on_sheet boolean not null default true,     -- reprise sur la fiche technique
  created_by uuid references public.employees (id) on delete set null default public.current_employee_id(),
  created_at timestamptz not null default now()
);
create index if not exists event_inspirations_event_idx on public.event_inspirations (event_id, created_at);
alter table public.event_inspirations enable row level security;
drop policy if exists insp_read on public.event_inspirations;
create policy insp_read on public.event_inspirations for select to authenticated using (true);
drop policy if exists insp_write on public.event_inspirations;
create policy insp_write on public.event_inspirations for all to authenticated
  using (public.has_perm('events.manage') or public.has_perm('design.manage'))
  with check (public.has_perm('events.manage') or public.has_perm('design.manage'));

-- ---------------------------------------------------------------- Matériel
alter table public.event_items
  add column if not exists zone text,                 -- zone de pose : entrée, scène, coin photo…
  add column if not exists ref_photo_path text;       -- photo de référence

-- Les dates de chargement comptent dans le créneau de l'événement
create or replace function public.event_span(p_event uuid, out d_from date, out d_to date)
language sql stable security definer set search_path = public as $$
  select least(coalesce((load_at at time zone 'Africa/Casablanca')::date, event_date - 1),
               coalesce((delivery_at at time zone 'Africa/Casablanca')::date, event_date - 1)),
         coalesce((teardown_at at time zone 'Africa/Casablanca')::date, event_date + 1)
  from public.events where id = p_event
$$;

-- Réserver plusieurs articles d'un coup : tout ou rien, avec verrou pour qu'une pièce ne soit jamais réservée deux fois.
-- p_lines = [{"item_id": "...", "qty": 2, "finish": "doré", "zone": "entrée", "note": "...", "ref_photo_path": "..."}]
create or replace function public.stock_reserve_many(p_event uuid, p_lines jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  l jsonb;
  v_item uuid;
  v_qty int;
  v_avail int;
  v_name text;
  n int := 0;
begin
  if not public.can_move_stock() then raise exception 'Permission refusée'; end if;
  if jsonb_typeof(p_lines) <> 'array' then raise exception 'Liste invalide'; end if;
  -- verrous dans un ordre fixe : deux personnes qui réservent en même temps passent l'une après l'autre
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
    if v_qty > v_avail then
      raise exception 'Pas assez de « % » à ces dates : % disponible(s)', v_name, v_avail;
    end if;
    insert into public.event_items (event_id, item_id, qty, note, finish, zone, ref_photo_path, created_by)
    values (p_event, v_item, v_qty, nullif(trim(l->>'note'), ''), nullif(trim(l->>'finish'), ''), nullif(trim(l->>'zone'), ''), nullif(l->>'ref_photo_path', ''), public.current_employee_id())
    on conflict (event_id, item_id) do update set qty = excluded.qty,
      note = coalesce(excluded.note, public.event_items.note), finish = coalesce(excluded.finish, public.event_items.finish),
      zone = coalesce(excluded.zone, public.event_items.zone), ref_photo_path = coalesce(excluded.ref_photo_path, public.event_items.ref_photo_path);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.stock_reserve_many(uuid, jsonb) from public, anon;
grant execute on function public.stock_reserve_many(uuid, jsonb) to authenticated;

-- Modifier les consignes d'une ligne (finition, zone, photo de référence)
create or replace function public.stock_line_details(p_line uuid, p_finish text, p_zone text, p_ref_photo text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.can_move_stock() or public.has_perm('events.manage')) then raise exception 'Permission refusée'; end if;
  update public.event_items set finish = nullif(trim(p_finish), ''), zone = nullif(trim(p_zone), ''),
    ref_photo_path = coalesce(nullif(p_ref_photo, ''), ref_photo_path) where id = p_line;
end $$;
revoke execute on function public.stock_line_details(uuid, text, text, text) from public, anon;
grant execute on function public.stock_line_details(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------- Stock : sous-catégories
alter table public.stock_categories add column if not exists parent_id uuid references public.stock_categories (id) on delete set null;

-- ---------------------------------------------------------------- Calcul : HT ou TTC selon le type de client
alter table public.company_settings add column if not exists ttc_client_kinds text[] not null default '{entreprise}';
