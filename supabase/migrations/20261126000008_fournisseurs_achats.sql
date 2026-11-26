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
