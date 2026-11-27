-- =====================================================================
-- BOHEMIA OS — Migration 2 : données de référence
-- Catalogue des permissions, droits par rôle, horaires, départements,
-- responsables. Tout est ensuite modifiable depuis l'interface.
-- =====================================================================

insert into public.permissions (key, label, module, sort_order) values
  ('dashboard.direction', 'Voir le tableau de bord direction', 'Dashboard', 10),
  ('employees.view', 'Voir les fiches complètes des employés', 'Équipe', 20),
  ('employees.manage', 'Créer et modifier les employés (PIN, photo, horaires)', 'Équipe', 21),
  ('attendance.view_all', 'Voir les présences de toute l''équipe', 'Pointage', 30),
  ('attendance.correct', 'Corriger les pointages et statuts (avec motif)', 'Pointage', 31),
  ('tasks.create', 'Créer des tâches', 'Tâches', 40),
  ('tasks.assign_any', 'Attribuer des tâches à n''importe quel employé', 'Tâches', 41),
  ('tasks.view_all', 'Voir toutes les tâches', 'Tâches', 42),
  ('tasks.manage', 'Modifier et supprimer toutes les tâches', 'Tâches', 43),
  ('tasks.validate', 'Valider les tâches soumises', 'Tâches', 44),
  ('events.manage', 'Créer et modifier les événements', 'Événements', 50),
  ('calendar.view_all', 'Voir le calendrier complet (congés, tâches de tous)', 'Calendrier', 60),
  ('leaves.manage', 'Valider les congés et absences', 'Congés', 70),
  ('settings.manage', 'Modifier les paramètres (départements, horaires, kiosques)', 'Paramètres', 80),
  ('audit.view', 'Consulter le journal des actions', 'Paramètres', 81);

-- Responsable de département : son équipe (le périmètre est limité à ses départements par la base)
insert into public.role_permissions (role, permission) values
  ('manager', 'employees.view'),
  ('manager', 'tasks.create'),
  ('manager', 'tasks.validate'),
  ('manager', 'calendar.view_all');
-- Employé : aucun droit étendu par défaut (ses données uniquement)
-- Administrateur / Direction : tous les droits (implicite)

insert into public.work_schedules (name, days, grace_minutes, is_default) values
  ('Bureau — Lun-Ven 9h-18h, Sam 9h-13h',
   '{"1":{"start":"09:00","end":"18:00"},"2":{"start":"09:00","end":"18:00"},"3":{"start":"09:00","end":"18:00"},"4":{"start":"09:00","end":"18:00"},"5":{"start":"09:00","end":"18:00"},"6":{"start":"09:00","end":"13:00"}}',
   10, true),
  ('Atelier & dépôt — Lun-Sam 8h30-17h30',
   '{"1":{"start":"08:30","end":"17:30"},"2":{"start":"08:30","end":"17:30"},"3":{"start":"08:30","end":"17:30"},"4":{"start":"08:30","end":"17:30"},"5":{"start":"08:30","end":"17:30"},"6":{"start":"08:30","end":"17:30"}}',
   10, false);

insert into public.departments (name, code, description, scope, color, sort_order) values
  ('Commercial & Clients', 'COM', 'Prospects, clients, devis, fiches événement et coordination',
   array['Prospects','Clients','Demandes','Appels','Rendez-vous','Devis','Suivi client','Commandes','Validation client','Fiches événement','Fiches techniques','Coordination'], '#B08D74', 10),
  ('Graphisme & Production visuelle', 'GRA', 'Graphisme, grands formats, impression, découpe et pose vinyle',
   array['Graphisme','Panneaux','Grands formats','Impression','Découpe','Vinyle','Pose vinyle','Fichiers de production','Préparation des fichiers','Suivi des productions','Contrôle qualité'], '#7E8A93', 20),
  ('OHMYBOX & Papeterie', 'OMB', 'Boxes, papeterie, personnalisation et conception des panneaux événementiels',
   array['OHMYBOX','Papeterie','Personnalisation','Produits','Commandes','Production','Préparation des boxes','Packaging','Stickers','Invitations','Articles personnalisés','Design des panneaux'], '#C2A48C', 30),
  ('Fleurs & Décoration', 'FLD', 'Compositions florales, structures, achats et stock floral',
   array['Fleurs','Compositions florales','Bouquets','Structures florales','Achats de fleurs','Préparation','Stock floral','Réception','Matériel de décoration'], '#8C9A7E', 40),
  ('Achats & Matériaux', 'ACH', 'MDF, forex, polypro, vinyle, consommables et fournisseurs',
   array['MDF','Forex','Polypro','Vinyle','Bois','Peinture','Colle','Consommables','Matériel de production','Fournisseurs','Demandes d''achat','Réception'], '#A39382', 50),
  ('Dépôt & Logistique', 'DEP', 'Stock, matériel, préparation, chargement, retours et inventaire',
   array['Stock','Matériel','Entrées','Sorties','Réservations','Préparation événement','Chargement','Déchargement','Retour','Inventaire','Casse','Perte','Réparation','Rangement'], '#8A7F72', 60),
  ('Transport', 'TRA', 'Véhicules, chauffeurs, trajets, gasoil et entretien',
   array['Véhicules','Chauffeurs','Trajets','Kilométrage','Gasoil','Dépenses','Entretien','Disponibilité','Livraisons','Installations','Retours'], '#6F7378', 70);

-- Responsables connus (sans compte de connexion pour l'instant : à compléter depuis l'interface)
with d as (select id, code from public.departments),
     s as (select id from public.work_schedules where is_default),
     a as (select id from public.work_schedules where name like 'Atelier%'),
     ins as (
       insert into public.employees (first_name, job_title, department_id, role, schedule_id) values
         ('Douae',    'Commerciale & chargée installation', (select id from d where code = 'COM'), 'manager', (select id from s)),
         ('Moustafa', 'Infographiste · machiniste', (select id from d where code = 'GRA'), 'manager', (select id from a)),
         ('Khaoula',  'Infographiste · machiniste', (select id from d where code = 'OMB'), 'manager', (select id from s)),
         ('Siham',    'Infographiste · machiniste', (select id from d where code = 'OMB'), 'manager', (select id from s)),
         ('Ayoub',    'Responsable Dépôt & Logistique', (select id from d where code = 'DEP'), 'manager', (select id from a)),
         ('Mohamed',  'Responsable Dépôt & Logistique', (select id from d where code = 'DEP'), 'manager', (select id from a))
       returning id, department_id
     )
insert into public.department_managers (department_id, employee_id)
select department_id, id from ins;
