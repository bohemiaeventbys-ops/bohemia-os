-- =====================================================================
-- BOHEMIA OS : fiche événement complète
-- - nombre de personnes (invités)
-- - matériaux à acheter / fabriquer (bois, plexi, vinyle, tissu…)
-- - finition / couleur demandée par article réservé
-- =====================================================================

alter table public.events add column if not exists guests int check (guests is null or guests >= 0);

create table if not exists public.event_materials (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  label text not null check (length(trim(label)) > 0),     -- ex. Plexi blanc 3 mm
  qty numeric(10, 2) check (qty is null or qty > 0),
  unit text,                                               -- m², plaques, mètres, rouleaux…
  note text,                                               -- pour quoi : arche, panneau de bienvenue…
  created_by uuid references public.employees (id) on delete set null default public.current_employee_id(),
  created_at timestamptz not null default now()
);
create index if not exists event_materials_event_idx on public.event_materials (event_id, created_at);
alter table public.event_materials enable row level security;
drop policy if exists emat_read on public.event_materials;
create policy emat_read on public.event_materials for select to authenticated using (true);
drop policy if exists emat_write on public.event_materials;
create policy emat_write on public.event_materials for all to authenticated
  using (public.has_perm('events.manage') or public.can_move_stock())
  with check (public.has_perm('events.manage') or public.can_move_stock());
drop trigger if exists t_audit on public.event_materials;
create trigger t_audit after insert or update or delete on public.event_materials for each row execute function public.audit_trigger();

-- Finition demandée sur un article réservé (doré, blanc mat…)
create or replace function public.stock_set_finish(p_line uuid, p_finish text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.can_move_stock() or public.has_perm('events.manage')) then raise exception 'Permission refusée'; end if;
  update public.event_items set finish = nullif(trim(p_finish), '') where id = p_line;
end $$;
revoke execute on function public.stock_set_finish(uuid, text) from public, anon;
grant execute on function public.stock_set_finish(uuid, text) to authenticated;
