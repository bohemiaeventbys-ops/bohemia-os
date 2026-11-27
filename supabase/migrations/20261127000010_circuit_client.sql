-- =====================================================================
-- BOHEMIA OS : circuit client
-- clients → devis → contrat → factures et paiements (confidentiel)
-- conception de la déco → validation par la cliente (lien sans compte)
-- → tâches de production (impression, vinyle, découpe, peinture, pose)
-- =====================================================================

insert into public.permissions (key, label, module, sort_order) values
  ('clients.manage', 'Gérer les fiches clients', 'Clients', 70),
  ('design.manage', 'Envoyer des maquettes à valider par la cliente', 'Conception', 71)
on conflict (key) do nothing;
insert into public.role_permissions (role, permission) values ('manager', 'design.manage') on conflict do nothing;
-- Commercial : clients ; Graphisme : maquettes
insert into public.employee_permissions (employee_id, permission, granted)
select e.id, 'clients.manage', true from public.employees e join public.departments d on d.id = e.department_id where d.code = 'COM'
on conflict do nothing;
insert into public.employee_permissions (employee_id, permission, granted)
select e.id, 'design.manage', true from public.employees e join public.departments d on d.id = e.department_id where d.code in ('GRA', 'OMB')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Coordonnées de l'entreprise pour les documents
-- ---------------------------------------------------------------------
alter table public.company_settings
  add column legal_name text not null default 'Bohemia Events',
  add column address text,
  add column phone text,
  add column email text,
  add column ice text,
  add column rc text,
  add column if_number text,
  add column patente text,
  add column bank_name text,
  add column rib text,
  add column vat_rate numeric(5, 2) not null default 20,
  add column deposit_pct numeric(5, 2) not null default 50,
  add column quote_validity_days int not null default 15,
  add column quote_terms text not null default
'Devis valable 15 jours. Acompte de 50 % à la confirmation, solde au plus tard 48 h avant l''événement.
Toute modification après validation de la maquette peut entraîner un supplément.
Le matériel loué reste la propriété de Bohemia Events : toute casse ou perte sera facturée.',
  add column contract_terms text not null default
'Article 1 — Objet
Le présent contrat a pour objet la conception, la fourniture et l''installation de la décoration de l''événement décrit ci-dessus, conformément au devis {{devis}} accepté par le client.

Article 2 — Prix et paiement
Le prix total est de {{total}} TTC. Un acompte de {{acompte}} est versé à la signature ; le solde est réglé au plus tard 48 heures avant l''événement.

Article 3 — Validation de la décoration
Les maquettes sont soumises au client avant fabrication. Toute modification demandée après validation peut entraîner un supplément et un délai.

Article 4 — Installation et démontage
Le client garantit l''accès au lieu aux horaires prévus : installation le {{installation}}, démontage le {{demontage}}. Tout retard d''accès indépendant de Bohemia Events ne pourra lui être reproché.

Article 5 — Matériel
Le matériel mis à disposition reste la propriété de Bohemia Events. Toute casse, perte ou dégradation constatée au démontage sera facturée au prix de remplacement.

Article 6 — Annulation
En cas d''annulation par le client moins de 30 jours avant l''événement, l''acompte reste acquis à Bohemia Events. Moins de 7 jours avant, 100 % du montant est dû.

Article 7 — Litiges
Les parties s''efforceront de régler à l''amiable tout différend. À défaut, les tribunaux de Casablanca sont seuls compétents.';

-- ---------------------------------------------------------------------
-- Clients
-- ---------------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'particulier' check (kind in ('particulier', 'entreprise')),
  name text not null check (length(trim(name)) > 0),
  contact_name text,
  phone text,
  whatsapp text,
  email text,
  address text,
  city text default 'Casablanca',
  ice text,
  source text,                 -- Instagram, bouche-à-oreille, site…
  notes text,
  created_by uuid references public.employees (id) on delete set null default public.current_employee_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clients_name_idx on public.clients (lower(name));
alter table public.events add column client_id uuid references public.clients (id) on delete set null;
create index events_client_idx on public.events (client_id);

-- Les événements existants : une fiche client par nom distinct
insert into public.clients (name, phone)
select distinct on (lower(trim(client_name))) trim(client_name), client_phone from public.events
where coalesce(trim(client_name), '') <> '' order by lower(trim(client_name)), created_at desc;
update public.events e set client_id = c.id from public.clients c
where e.client_id is null and lower(trim(e.client_name)) = lower(c.name);

-- ---------------------------------------------------------------------
-- Numérotation : DV-2026-0001, FA-2026-0001, CT-2026-0001
-- ---------------------------------------------------------------------
create table public.doc_counters (prefix text not null, year int not null, last int not null default 0, primary key (prefix, year));
create or replace function public.next_doc_number(p_prefix text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_year int := extract(year from public.local_today())::int;
  v_n int;
begin
  insert into public.doc_counters (prefix, year, last) values (p_prefix, v_year, 1)
  on conflict (prefix, year) do update set last = public.doc_counters.last + 1
  returning last into v_n;
  return p_prefix || '-' || v_year || '-' || lpad(v_n::text, 4, '0');
end $$;
revoke execute on function public.next_doc_number(text) from public, anon;
grant execute on function public.next_doc_number(text) to authenticated;

-- ---------------------------------------------------------------------
-- Devis
-- ---------------------------------------------------------------------
create type public.quote_status as enum ('brouillon', 'envoye', 'accepte', 'refuse', 'annule');
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default public.next_doc_number('DV'),
  event_id uuid references public.events (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  title text not null default 'Décoration',
  status public.quote_status not null default 'brouillon',
  issue_date date not null default public.local_today(),
  valid_until date,
  vat_rate numeric(5, 2) not null default 20 check (vat_rate between 0 and 30),
  discount_mad numeric(12, 2) not null default 0 check (discount_mad >= 0),
  deposit_pct numeric(5, 2) not null default 50 check (deposit_pct between 0 and 100),
  intro text,
  terms text,
  subtotal_mad numeric(12, 2) not null default 0,     -- HT après remise
  vat_mad numeric(12, 2) not null default 0,
  total_mad numeric(12, 2) not null default 0,        -- TTC
  sent_at timestamptz,
  decided_at timestamptz,
  created_by uuid references public.employees (id) on delete set null default public.current_employee_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quotes_event_idx on public.quotes (event_id);
create table public.quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  section text,                -- Décoration, Mobilier, Fleurs, Animation…
  label text not null check (length(trim(label)) > 0),
  details text,
  qty numeric(10, 2) not null default 1 check (qty > 0),
  unit_price numeric(12, 2) not null default 0 check (unit_price >= 0),
  sort_order int not null default 0
);
create index quote_lines_quote_idx on public.quote_lines (quote_id, sort_order);

create or replace function public.quote_recompute(p_quote uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_sum numeric;
  q public.quotes;
begin
  select * into q from public.quotes where id = p_quote;
  if not found then return; end if;
  select coalesce(sum(round(qty * unit_price, 2)), 0) into v_sum from public.quote_lines where quote_id = p_quote;
  v_sum := greatest(v_sum - q.discount_mad, 0);
  update public.quotes set subtotal_mad = v_sum, vat_mad = round(v_sum * q.vat_rate / 100, 2),
    total_mad = v_sum + round(v_sum * q.vat_rate / 100, 2)
  where id = p_quote;
end $$;
create or replace function public.quote_lines_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.quote_recompute(coalesce(new.quote_id, old.quote_id));
  return null;
end $$;
create trigger t_recompute after insert or update or delete on public.quote_lines for each row execute function public.quote_lines_after();
create or replace function public.quotes_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or (new.discount_mad, new.vat_rate) is distinct from (old.discount_mad, old.vat_rate) then
    perform public.quote_recompute(new.id);
  end if;
  -- Devis accepté : le montant devient celui de l'événement, et un prospect devient confirmé
  if new.status = 'accepte' and (tg_op = 'INSERT' or old.status is distinct from 'accepte') and new.event_id is not null then
    insert into public.event_finances (event_id, quote_mad) values (new.event_id, new.total_mad)
    on conflict (event_id) do update set quote_mad = excluded.quote_mad, updated_at = now();
    update public.events set status = 'confirme' where id = new.event_id and status in ('prospect', 'devis_envoye');
  elsif new.status = 'envoye' and (tg_op = 'INSERT' or old.status is distinct from 'envoye') and new.event_id is not null then
    update public.events set status = 'devis_envoye' where id = new.event_id and status = 'prospect';
  end if;
  return null;
end $$;
create trigger t_after after insert or update on public.quotes for each row execute function public.quotes_after();
-- Le total d'un devis accepté suit les modifications de lignes
create or replace function public.quote_total_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'accepte' and new.event_id is not null and new.total_mad is distinct from old.total_mad then
    update public.event_finances set quote_mad = new.total_mad, updated_at = now() where event_id = new.event_id;
  end if;
  return null;
end $$;
create trigger t_total_sync after update of total_mad on public.quotes for each row execute function public.quote_total_sync();

-- ---------------------------------------------------------------------
-- Contrats
-- ---------------------------------------------------------------------
create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default public.next_doc_number('CT'),
  quote_id uuid references public.quotes (id) on delete set null,
  event_id uuid references public.events (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  body text not null,
  status text not null default 'brouillon' check (status in ('brouillon', 'envoye', 'signe', 'annule')),
  signed_at date,
  signed_file_path text,
  created_by uuid references public.employees (id) on delete set null default public.current_employee_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Factures et paiements
-- ---------------------------------------------------------------------
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default public.next_doc_number('FA'),
  kind text not null default 'totale' check (kind in ('acompte', 'solde', 'totale')),
  quote_id uuid references public.quotes (id) on delete set null,
  event_id uuid references public.events (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  issue_date date not null default public.local_today(),
  due_date date,
  vat_rate numeric(5, 2) not null default 20,
  subtotal_mad numeric(12, 2) not null default 0,
  vat_mad numeric(12, 2) not null default 0,
  total_mad numeric(12, 2) not null default 0,
  paid_mad numeric(12, 2) not null default 0,
  status text not null default 'emise' check (status in ('emise', 'partielle', 'payee', 'annulee')),
  notes text,
  created_by uuid references public.employees (id) on delete set null default public.current_employee_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index invoices_event_idx on public.invoices (event_id);
create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  label text not null,
  details text,
  qty numeric(10, 2) not null default 1,
  unit_price numeric(12, 2) not null default 0,
  sort_order int not null default 0
);
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references public.invoices (id) on delete cascade,
  event_id uuid references public.events (id) on delete set null,
  amount_mad numeric(12, 2) not null check (amount_mad > 0),
  paid_on date not null default public.local_today(),
  method text not null default 'Virement',   -- Espèces, Virement, Chèque, Carte
  reference text,
  note text,
  created_by uuid references public.employees (id) on delete set null default public.current_employee_id(),
  created_at timestamptz not null default now()
);
create index payments_event_idx on public.payments (event_id);

create or replace function public.invoice_recompute(p_invoice uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_sub numeric;
  v_paid numeric;
  i public.invoices;
begin
  select * into i from public.invoices where id = p_invoice;
  if not found then return; end if;
  select coalesce(sum(round(qty * unit_price, 2)), 0) into v_sub from public.invoice_lines where invoice_id = p_invoice;
  select coalesce(sum(amount_mad), 0) into v_paid from public.payments where invoice_id = p_invoice;
  update public.invoices set subtotal_mad = v_sub, vat_mad = round(v_sub * vat_rate / 100, 2),
    total_mad = v_sub + round(v_sub * vat_rate / 100, 2), paid_mad = v_paid,
    status = case when status = 'annulee' then 'annulee'
                  when v_paid >= v_sub + round(v_sub * vat_rate / 100, 2) and v_sub > 0 then 'payee'
                  when v_paid > 0 then 'partielle' else 'emise' end
  where id = p_invoice;
end $$;
create or replace function public.invoice_lines_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.invoice_recompute(coalesce(new.invoice_id, old.invoice_id));
  return null;
end $$;
create trigger t_recompute after insert or update or delete on public.invoice_lines for each row execute function public.invoice_lines_after();

-- Paiement : met à jour la facture et le « déjà payé » de l'événement
create or replace function public.payments_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_event uuid := coalesce(new.event_id, old.event_id);
  v_paid numeric;
  v_quote numeric;
begin
  if coalesce(new.invoice_id, old.invoice_id) is not null then perform public.invoice_recompute(coalesce(new.invoice_id, old.invoice_id)); end if;
  if v_event is not null then
    select coalesce(sum(amount_mad), 0) into v_paid from public.payments where event_id = v_event;
    select quote_mad into v_quote from public.event_finances where event_id = v_event;
    insert into public.event_finances (event_id, paid_mad, payment_status)
    values (v_event, v_paid, case when v_paid <= 0 then 'non_paye' when v_quote is not null and v_paid >= v_quote then 'paye' else 'acompte' end)
    on conflict (event_id) do update set paid_mad = excluded.paid_mad, payment_status = excluded.payment_status, updated_at = now();
  end if;
  return null;
end $$;
create trigger t_after after insert or update or delete on public.payments for each row execute function public.payments_after();

-- Facture créée à partir d'un devis : totale, acompte (x %) ou solde (total − factures déjà émises)
create or replace function public.invoice_from_quote(p_quote uuid, p_kind text, p_pct numeric default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  q public.quotes;
  v_id uuid;
  v_already numeric;
  v_ht numeric;
  v_due int;
begin
  if not public.has_perm('finance.view') then raise exception 'Permission refusée'; end if;
  select * into q from public.quotes where id = p_quote;
  if not found then raise exception 'Devis introuvable'; end if;
  if q.status <> 'accepte' then raise exception 'Le devis doit être accepté avant de facturer'; end if;
  insert into public.invoices (kind, quote_id, event_id, client_id, vat_rate, due_date)
  values (p_kind, q.id, q.event_id, q.client_id, q.vat_rate, public.local_today() + 7) returning id into v_id;
  if p_kind = 'totale' then
    insert into public.invoice_lines (invoice_id, label, details, qty, unit_price, sort_order)
    select v_id, label, details, qty, unit_price, sort_order from public.quote_lines where quote_id = q.id;
    if q.discount_mad > 0 then
      -- remise portée sur une ligne négative impossible (prix ≥ 0) : on l'intègre en une ligne récapitulative
      delete from public.invoice_lines where invoice_id = v_id;
      insert into public.invoice_lines (invoice_id, label, details, qty, unit_price)
      values (v_id, q.title || ' — selon devis ' || q.number, 'Remise de ' || q.discount_mad || ' DH incluse', 1, q.subtotal_mad);
    end if;
  elsif p_kind = 'acompte' then
    v_ht := round(q.subtotal_mad * coalesce(p_pct, q.deposit_pct) / 100, 2);
    insert into public.invoice_lines (invoice_id, label, qty, unit_price)
    values (v_id, 'Acompte de ' || trim(to_char(coalesce(p_pct, q.deposit_pct), 'FM990.##')) || ' % sur devis ' || q.number || ' — ' || q.title, 1, v_ht);
  else
    select coalesce(sum(subtotal_mad), 0) into v_already from public.invoices
    where quote_id = q.id and id <> v_id and status <> 'annulee';
    v_ht := greatest(q.subtotal_mad - v_already, 0);
    insert into public.invoice_lines (invoice_id, label, details, qty, unit_price)
    values (v_id, 'Solde sur devis ' || q.number || ' — ' || q.title, case when v_already > 0 then 'Déduction des acomptes facturés : ' || v_already || ' DH HT' end, 1, v_ht);
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Maquettes à valider par la cliente → production
-- ---------------------------------------------------------------------
create table public.design_proofs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),   -- Panneau de bienvenue, Arche, Plan de table…
  version int not null default 1,
  file_path text not null,
  note text,                                             -- message pour la cliente
  status text not null default 'a_valider' check (status in ('a_valider', 'valide', 'a_modifier', 'annule')),
  share_token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  production_steps text[] not null default '{}',         -- impression, vinyle, decoupe, peinture, pose
  production_due date,
  client_comment text,
  decided_at timestamptz,
  created_by uuid references public.employees (id) on delete set null default public.current_employee_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proof_steps_ok check (production_steps <@ array['impression', 'vinyle', 'decoupe', 'peinture', 'pose']::text[])
);
create index design_proofs_event_idx on public.design_proofs (event_id);
alter table public.tasks add column proof_id uuid references public.design_proofs (id) on delete set null;

-- Après la décision de la cliente : tâches de production, ou correction
create or replace function public.proof_after_decision()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  e public.events;
  v_step text;
  v_dep uuid;
  v_gra uuid := (select id from public.departments where code = 'GRA');
  v_due date;
  v_label text;
begin
  if new.status is not distinct from old.status then return new; end if;
  select * into e from public.events where id = new.event_id;
  if new.status = 'valide' then
    perform public.notify(new.created_by, 'maquette_validee', 'Maquette validée : ' || new.title, coalesce(e.name, '') || coalesce(' — « ' || new.client_comment || ' »', ''), '/evenements/' || new.event_id || '/conception');
    foreach v_step in array new.production_steps loop
      v_label := case v_step when 'impression' then 'Imprimer' when 'vinyle' then 'Découper et poser le vinyle' when 'decoupe' then 'Découper'
                             when 'peinture' then 'Peindre' else 'Poser sur place' end;
      v_dep := case when v_step = 'pose' then (select id from public.departments where code = 'DEP') else v_gra end;
      v_due := case when v_step = 'pose' then e.event_date
                    else greatest(coalesce(new.production_due, e.event_date - 2), public.local_today()) end;
      insert into public.tasks (title, description, assignee_id, department_id, event_id, priority, planned_date, due_date,
        requires_validation, created_by, auto_generated, proof_id)
      values (v_label || ' : ' || new.title, 'Maquette validée par la cliente (version ' || new.version || '). Prendre une photo de l''article fini.',
        public.department_lead(v_dep), v_dep, new.event_id,
        case when v_due - public.local_today() <= 2 then 'haute' else 'normale' end::public.task_priority,
        v_due, v_due, true, new.created_by, true, new.id);
    end loop;
  elsif new.status = 'a_modifier' then
    perform public.notify(new.created_by, 'maquette_a_modifier', 'À modifier : ' || new.title, new.client_comment, '/evenements/' || new.event_id || '/conception');
    insert into public.tasks (title, description, assignee_id, department_id, event_id, priority, planned_date, due_date, requires_validation, created_by, auto_generated, proof_id)
    values ('Corriger la maquette : ' || new.title, 'Demande de la cliente : ' || coalesce(new.client_comment, '—'),
      coalesce(new.created_by, public.department_lead(v_gra)), v_gra, new.event_id, 'haute',
      public.local_today(), public.local_today() + 1, false, new.created_by, true, new.id);
  end if;
  return new;
end $$;
create trigger t_decision after update of status on public.design_proofs for each row execute function public.proof_after_decision();

-- Décision depuis le lien envoyé à la cliente (appelée côté serveur avec la clé de service)
create or replace function public.proof_client_decide(p_token text, p_ok boolean, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not p_ok and coalesce(trim(p_comment), '') = '' then raise exception 'Dites-nous ce qu''il faut modifier'; end if;
  update public.design_proofs set status = case when p_ok then 'valide' else 'a_modifier' end,
    client_comment = nullif(trim(p_comment), ''), decided_at = now()
  where share_token = p_token and status = 'a_valider';
  if not found then raise exception 'Cette maquette a déjà reçu une réponse'; end if;
end $$;
revoke execute on function public.proof_client_decide(text, boolean, text) from public, anon, authenticated;
grant execute on function public.proof_client_decide(text, boolean, text) to service_role;

-- Validation en interne (la cliente a répondu sur WhatsApp, au téléphone…)
create or replace function public.proof_decide(p_proof uuid, p_ok boolean, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_perm('design.manage') or public.has_perm('events.manage')) then raise exception 'Permission refusée'; end if;
  if not p_ok and coalesce(trim(p_comment), '') = '' then raise exception 'Indiquez ce qu''il faut modifier'; end if;
  update public.design_proofs set status = case when p_ok then 'valide' else 'a_modifier' end,
    client_comment = nullif(trim(p_comment), ''), decided_at = now()
  where id = p_proof and status = 'a_valider';
  if not found then raise exception 'Cette maquette a déjà reçu une réponse'; end if;
end $$;
revoke execute on function public.proof_decide(uuid, boolean, text) from public, anon;
grant execute on function public.proof_decide(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- Sécurité
-- ---------------------------------------------------------------------
create trigger t_touch before update on public.clients for each row execute function public.touch_updated_at();
create trigger t_touch before update on public.quotes for each row execute function public.touch_updated_at();
create trigger t_touch before update on public.contracts for each row execute function public.touch_updated_at();
create trigger t_touch before update on public.invoices for each row execute function public.touch_updated_at();
create trigger t_touch before update on public.design_proofs for each row execute function public.touch_updated_at();
create trigger t_audit after insert or update or delete on public.quotes for each row execute function public.audit_trigger();
create trigger t_audit after insert or update or delete on public.invoices for each row execute function public.audit_trigger();
create trigger t_audit after insert or update or delete on public.payments for each row execute function public.audit_trigger();
create trigger t_audit after insert or update or delete on public.contracts for each row execute function public.audit_trigger();

alter table public.clients enable row level security;
alter table public.doc_counters enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_lines enable row level security;
alter table public.contracts enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.payments enable row level security;
alter table public.design_proofs enable row level security;

create policy clients_read on public.clients for select to authenticated
  using (public.has_perm('clients.manage') or public.has_perm('events.manage') or public.has_perm('finance.view'));
create policy clients_write on public.clients for all to authenticated
  using (public.has_perm('clients.manage') or public.has_perm('events.manage'))
  with check (public.has_perm('clients.manage') or public.has_perm('events.manage'));

-- Devis, contrats, factures, paiements : Direction et commerciale uniquement
create policy quotes_all on public.quotes for all to authenticated using (public.has_perm('finance.view')) with check (public.has_perm('finance.view'));
create policy qlines_all on public.quote_lines for all to authenticated using (public.has_perm('finance.view')) with check (public.has_perm('finance.view'));
create policy contracts_all on public.contracts for all to authenticated using (public.has_perm('finance.view')) with check (public.has_perm('finance.view'));
create policy invoices_all on public.invoices for all to authenticated using (public.has_perm('finance.view')) with check (public.has_perm('finance.view'));
create policy ilines_all on public.invoice_lines for all to authenticated using (public.has_perm('finance.view')) with check (public.has_perm('finance.view'));
create policy payments_all on public.payments for all to authenticated using (public.has_perm('finance.view')) with check (public.has_perm('finance.view'));

create policy proofs_read on public.design_proofs for select to authenticated using (true);
create policy proofs_write on public.design_proofs for insert to authenticated
  with check (public.has_perm('design.manage') or public.has_perm('events.manage'));
create policy proofs_update on public.design_proofs for update to authenticated
  using (public.has_perm('design.manage') or public.has_perm('events.manage'))
  with check (public.has_perm('design.manage') or public.has_perm('events.manage'));
create policy proofs_delete on public.design_proofs for delete to authenticated
  using (status = 'a_valider' and (public.has_perm('design.manage') or public.has_perm('events.manage')));
-- La décision passe par les fonctions (traçabilité)
create or replace function public.proof_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and new.status is distinct from old.status and new.status <> 'annule' then
    raise exception 'Utilisez les boutons Validé / À modifier';
  end if;
  if current_user = 'authenticated' and new.share_token is distinct from old.share_token then
    raise exception 'Lien non modifiable';
  end if;
  return new;
end $$;
create trigger t_guard before update on public.design_proofs for each row execute function public.proof_guard();

revoke execute on function public.invoice_from_quote(uuid, text, numeric) from public, anon;
grant execute on function public.invoice_from_quote(uuid, text, numeric) to authenticated;
revoke execute on function public.quote_recompute(uuid) from public, anon, authenticated;
revoke execute on function public.invoice_recompute(uuid) from public, anon, authenticated;

-- Fichiers : maquettes (lisibles par l'équipe) et documents signés (finance)
insert into storage.buckets (id, name, public, file_size_limit) values ('design-proofs', 'design-proofs', false, 26214400)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit) values ('client-docs', 'client-docs', false, 15728640)
on conflict (id) do nothing;
create policy "maquettes lecture" on storage.objects for select to authenticated using (bucket_id = 'design-proofs');
create policy "maquettes depot" on storage.objects for insert to authenticated
  with check (bucket_id = 'design-proofs' and (public.has_perm('design.manage') or public.has_perm('events.manage')));
create policy "documents clients lecture" on storage.objects for select to authenticated
  using (bucket_id = 'client-docs' and public.has_perm('finance.view'));
create policy "documents clients depot" on storage.objects for insert to authenticated
  with check (bucket_id = 'client-docs' and public.has_perm('finance.view'));

-- Équipe : prénoms et fonctions corrigés (27 nov)
update public.employees set first_name = 'Douae', job_title = 'Commerciale & chargée installation' where first_name in ('Cédoua', 'Doha');
update public.employees set first_name = 'Moustafa', job_title = 'Infographiste · machiniste' where first_name = 'Mustapha';
update public.employees set first_name = 'Siham', job_title = 'Infographiste · machiniste' where first_name = 'Sihem';
update public.employees set job_title = 'Infographiste · machiniste' where first_name = 'Khaoula';
insert into public.employees (first_name, job_title, department_id, role, schedule_id)
select v.fn, v.jt, (select id from public.departments where code = 'COM'), 'manager', (select id from public.work_schedules where is_default limit 1)
from (values ('Ghita', 'Cheffe de projet'), ('Sara', 'Gérante')) as v(fn, jt)
where not exists (select 1 from public.employees e where e.first_name = v.fn);
