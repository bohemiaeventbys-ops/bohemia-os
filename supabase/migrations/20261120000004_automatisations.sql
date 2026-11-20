-- =====================================================================
-- BOHEMIA OS — Migration 4 : tâches planifiées (pg_cron)
-- Alerte des tâches en retard toutes les 15 minutes.
-- Si pg_cron n'est pas disponible, la migration continue sans erreur :
-- activez l'extension « pg_cron » dans Supabase (Database > Extensions) puis relancez ce bloc.
-- =====================================================================
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('bohemia-taches-en-retard', '*/15 * * * *', 'select public.notify_overdue_tasks()');
exception when others then
  raise notice 'pg_cron indisponible : alerte des tâches en retard non planifiée (%).', sqlerrm;
end $$;
