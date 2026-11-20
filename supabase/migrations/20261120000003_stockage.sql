-- =====================================================================
-- BOHEMIA OS — Migration 3 : stockage des fichiers (Supabase Storage)
-- avatars : photos des employés (lecture connectés, écriture gestion équipe)
-- task-files : pièces jointes des tâches (accès si la tâche est visible)
-- Chemin des pièces jointes : <task_id>/<horodatage>-<nom du fichier>
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('avatars', 'avatars', false, 5242880), ('task-files', 'task-files', false, 52428800)
on conflict (id) do nothing;

create policy "avatars lecture" on storage.objects for select to authenticated
  using (bucket_id = 'avatars');
create policy "avatars ecriture" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and public.has_perm('employees.manage'));
create policy "avatars maj" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and public.has_perm('employees.manage'));
create policy "avatars suppression" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and public.has_perm('employees.manage'));

create policy "taches lecture" on storage.objects for select to authenticated
  using (bucket_id = 'task-files' and public.can_see_task(((storage.foldername(name))[1])::uuid));
create policy "taches depot" on storage.objects for insert to authenticated
  with check (bucket_id = 'task-files' and public.can_see_task(((storage.foldername(name))[1])::uuid));
create policy "taches suppression" on storage.objects for delete to authenticated
  using (bucket_id = 'task-files' and public.can_manage_task(((storage.foldername(name))[1])::uuid));
