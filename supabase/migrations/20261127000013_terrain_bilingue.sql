-- =====================================================================
-- BOHEMIA OS : écrans terrain (chauffeur, dépôt, installation), bilingues
-- - langue choisie par personne (fr / ar)
-- - codes articles et libellé arabe facultatif
-- - horaires et consignes de terrain sur l'événement
-- - documents terrain : BL, facture remise, photos d'installation, problèmes, manques
-- =====================================================================

alter table public.employees add column if not exists lang text not null default 'fr' check (lang in ('fr', 'ar'));

alter table public.stock_items
  add column if not exists code text,
  add column if not exists name_ar text;
create unique index if not exists stock_items_code_uq on public.stock_items (upper(code)) where code is not null;

alter table public.event_items add column if not exists finish text;   -- finition / couleur demandée

alter table public.events
  add column if not exists load_at timestamptz,               -- heure de chargement au dépôt
  add column if not exists access_notes text,                 -- accès camion, étage, ascenseur, électricité…
  add column if not exists site_contact_name text,
  add column if not exists site_contact_phone text,
  add column if not exists delivered_at timestamptz,
  add column if not exists delivered_by uuid references public.employees (id) on delete set null,
  add column if not exists invoice_handed_at timestamptz,
  add column if not exists invoice_handed_by uuid references public.employees (id) on delete set null;

-- Qui peut agir sur le terrain pour un événement : équipe de l'événement, dépôt, gestion des événements
create or replace function public.can_field(p_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_move_stock() or public.has_perm('events.manage')
    or exists (select 1 from public.event_team t where t.event_id = p_event and t.employee_id = public.current_employee_id())
$$;

create table if not exists public.field_docs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  kind text not null check (kind in ('bl', 'facture', 'photo_installation', 'probleme', 'manque', 'abime')),
  file_path text,
  note text,
  item_id uuid references public.stock_items (id) on delete set null,
  qty int check (qty is null or qty > 0),
  client_uid text unique,            -- identifiant créé par le téléphone : un renvoi après coupure ne crée pas de doublon
  created_by uuid references public.employees (id) on delete set null default public.current_employee_id(),
  created_at timestamptz not null default now()
);
create index if not exists field_docs_event_idx on public.field_docs (event_id, created_at desc);
alter table public.field_docs enable row level security;
drop policy if exists fdocs_read on public.field_docs;
create policy fdocs_read on public.field_docs for select to authenticated using (true);
drop policy if exists fdocs_insert on public.field_docs;
create policy fdocs_insert on public.field_docs for insert to authenticated
  with check (public.can_field(event_id) and created_by = public.current_employee_id());
drop trigger if exists t_audit on public.field_docs;
create trigger t_audit after insert or update or delete on public.field_docs for each row execute function public.audit_trigger();

-- Alerte : un manque, un article abîmé ou un problème prévient le responsable de l'événement, la direction et le dépôt
create or replace function public.field_docs_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_to uuid;
  v_ev text;
  v_item text;
  v_title text;
begin
  if new.kind not in ('manque', 'abime', 'probleme') then return new; end if;
  select name into v_ev from public.events where id = new.event_id;
  select name into v_item from public.stock_items where id = new.item_id;
  v_title := case new.kind
    when 'manque' then 'Il manque ' || coalesce(new.qty, 1) || ' × ' || coalesce(v_item, 'article')
    when 'abime' then 'Article abîmé : ' || coalesce(v_item, 'article')
    else 'Problème signalé' end;
  for v_to in
    select distinct x from (
      select manager_id as x from public.events where id = new.event_id
      union select e.id from public.employees e left join public.departments d on d.id = e.department_id
        where e.status = 'actif' and (e.role = 'admin' or (d.code = 'DEP' and new.kind <> 'probleme'))
    ) s where x is not null and x <> coalesce(new.created_by, '00000000-0000-0000-0000-000000000000'::uuid)
  loop
    perform public.notify(v_to, 'terrain', v_title || ' — ' || coalesce(v_ev, ''), coalesce(new.note, ''), '/evenements/' || new.event_id, 'terrain:' || new.id);
  end loop;
  return new;
end $$;
drop trigger if exists t_after on public.field_docs;
create trigger t_after after insert on public.field_docs for each row execute function public.field_docs_after();

-- Livraison confirmée / facture remise (chauffeur)
create or replace function public.field_mark(p_event uuid, p_what text, p_value boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_field(p_event) then raise exception 'Permission refusée'; end if;
  if p_what = 'livre' then
    update public.events set delivered_at = case when p_value then now() end,
      delivered_by = case when p_value then public.current_employee_id() end where id = p_event;
  elsif p_what = 'facture' then
    update public.events set invoice_handed_at = case when p_value then now() end,
      invoice_handed_by = case when p_value then public.current_employee_id() end where id = p_event;
  else
    raise exception 'Action invalide';
  end if;
end $$;

-- Chaque personne choisit sa langue
create or replace function public.set_my_lang(p_lang text)
returns void language sql security definer set search_path = public as $$
  update public.employees set lang = p_lang where id = public.current_employee_id() and p_lang in ('fr', 'ar')
$$;

revoke execute on function public.can_field(uuid) from public, anon;
revoke execute on function public.field_mark(uuid, text, boolean) from public, anon;
revoke execute on function public.set_my_lang(text) from public, anon;
grant execute on function public.can_field(uuid) to authenticated;
grant execute on function public.field_mark(uuid, text, boolean) to authenticated;
grant execute on function public.set_my_lang(text) to authenticated;

-- Stockage privé des photos terrain
insert into storage.buckets (id, name, public, file_size_limit) values ('field-docs', 'field-docs', false, 15728640)
on conflict (id) do nothing;
drop policy if exists "terrain lecture" on storage.objects;
create policy "terrain lecture" on storage.objects for select to authenticated using (bucket_id = 'field-docs');
drop policy if exists "terrain depot" on storage.objects;
create policy "terrain depot" on storage.objects for insert to authenticated with check (bucket_id = 'field-docs');
