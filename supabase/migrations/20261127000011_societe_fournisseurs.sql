-- =====================================================================
-- BOHEMIA OS : en-tête des devis et factures + coordonnées bancaires
-- des fournisseurs (lisibles par la Direction et la commerciale seulement).
-- Les données réelles (coordonnées, RIB) ne sont PAS dans le code :
-- elles se saisissent dans l'application (Paramètres, fiche fournisseur).
-- =====================================================================

alter table public.company_settings
  add column if not exists website text,
  add column if not exists signatory text;

create table if not exists public.supplier_bank (
  supplier_id uuid primary key references public.suppliers (id) on delete cascade,
  bank_name text,
  rib text check (rib is null or rib ~ '^[0-9 ]{10,40}$'),
  payment_mode text not null default 'virement' check (payment_mode in ('virement', 'especes', 'cheque', 'mixte')),
  invoices_ttc boolean not null default true,   -- le fournisseur nous remet une facture TTC
  updated_at timestamptz not null default now()
);
alter table public.supplier_bank enable row level security;
drop policy if exists supbank_all on public.supplier_bank;
create policy supbank_all on public.supplier_bank for all to authenticated
  using (public.has_perm('finance.view')) with check (public.has_perm('finance.view'));
drop trigger if exists t_touch on public.supplier_bank;
create trigger t_touch before update on public.supplier_bank for each row execute function public.touch_updated_at();
drop trigger if exists t_audit on public.supplier_bank;
create trigger t_audit after insert or update or delete on public.supplier_bank for each row execute function public.audit_trigger();
