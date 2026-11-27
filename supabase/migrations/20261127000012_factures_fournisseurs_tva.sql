-- =====================================================================
-- BOHEMIA OS : factures fournisseurs (n°, date, TVA) pour la rubrique TVA
-- (TVA collectée sur nos factures − TVA payée aux fournisseurs).
-- Les montants des dépenses restent saisis en TTC (amount_mad).
-- =====================================================================
alter table public.expenses
  add column if not exists invoice_number text,
  add column if not exists invoice_date date,
  add column if not exists vat_rate numeric(5, 2) not null default 0 check (vat_rate >= 0 and vat_rate <= 100);

create index if not exists expenses_supplier_idx on public.expenses (supplier_id);
create index if not exists expenses_invoice_date_idx on public.expenses (invoice_date);

-- Justificatif de paiement (capture du virement, reçu…)
alter table public.expenses add column if not exists proof_path text;
alter table public.payments add column if not exists proof_path text;
