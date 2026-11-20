# BOHEMIA OS — Architecture (Phase 1)

## Principes
1. **Une information saisie une seule fois.** Les employés, départements, événements et tâches sont des entités uniques référencées par tous les modules (pointage, planning, calendrier, dashboard, notifications, et demain production, dépôt, transport, achats).
2. **La sécurité est dans la base.** Chaque table a des règles RLS (Row Level Security) PostgreSQL : même un appel direct à l'API ne contourne pas les permissions. Les opérations sensibles (pointage, corrections, changement de statut de tâche, PIN) passent par des fonctions SQL contrôlées.
3. **Tout est historisé.** Un trigger générique alimente `audit_log` (qui, quoi, quand, avant/après) ; les tâches ont en plus un historique lisible (`task_history`) ; les corrections de pointage ont leur propre journal.
4. **Rien n'est codé en dur.** Départements, responsables, horaires, permissions par rôle et par personne, postes de pointage : tout se modifie depuis Paramètres.
5. **Le temps est celui de Casablanca.** Les horodatages sont stockés en UTC (`timestamptz`) ; les dates métier (jour de travail, échéances) sont calculées dans le fuseau `Africa/Casablanca`, y compris pendant le passage à UTC+0 du Ramadan.

## Choix techniques
| Besoin | Choix | Pourquoi |
| --- | --- | --- |
| Application web | Next.js 15 (App Router, Server Components, Server Actions) | Pages rendues côté serveur, formulaires qui écrivent directement en base sans API à maintenir |
| Base de données | Supabase PostgreSQL | Relationnel (un ERP est très relationnel), RLS, fonctions, triggers, sauvegardes automatiques |
| Authentification | Supabase Auth (email + mot de passe) | Les comptes sont créés par la direction ; pas d'inscription libre |
| Fichiers | Supabase Storage (buckets privés, URL signées 1 h) | Photos, PDF, documents, avec les mêmes règles d'accès que les tâches |
| Style | Tailwind CSS + composants maison | Identité Bohemia (beige, nude, taupe, anthracite), pas de bibliothèque générique reconnaissable |
| Icônes | Lucide (trait fin 1,5) | Icônes fines et cohérentes |
| Typographie | Inter (interface) + Cormorant Garamond (titres) | Lisibilité + élégance événementielle |

## Modèle de données (phases 1-2)
```
departments ──< department_managers >── employees ──< employee_permissions >── permissions ──< role_permissions
                                           │  └── employee_pins (PIN haché, jamais lisible)
                                           │  └── work_schedules (horaires par jour + tolérance)
                                           ├──< time_punches (pointages bruts, jamais supprimés)
                                           ├──< attendance_days (synthèse par jour : statut, retard, heures, heures sup.)
                                           ├──< attendance_corrections (auteur, motif, avant/après)
                                           ├──< leave_requests (socle congés)
                                           └──< notifications
events ──< event_team >── employees
events ──< tasks ──< task_collaborators / task_comments / task_attachments / task_history
kiosk_devices (empreinte du jeton, IP autorisée)
audit_log (toutes les modifications)
company_settings
```

## Rôles et permissions
- **Direction (admin)** : tous les droits, toujours.
- **Responsable de département** : par défaut voit les fiches de l'équipe, crée et valide des tâches, voit le calendrier complet. Son périmètre (tâches, présences) est limité aux départements dont il est responsable — c'est la base qui l'impose.
- **Employé** : ses tâches (et celles où il collabore), son pointage, ses événements, ses notifications.
- Chaque permission peut être **accordée ou retirée individuellement** sur la fiche employé.

Catalogue : `dashboard.direction`, `employees.view`, `employees.manage`, `attendance.view_all`, `attendance.correct`, `tasks.create`, `tasks.assign_any`, `tasks.view_all`, `tasks.manage`, `tasks.validate`, `events.manage`, `calendar.view_all`, `leaves.manage`, `settings.manage`, `audit.view`. Chaque nouveau module ajoutera ses permissions au catalogue.

## Cycle de vie d'une tâche
```
À faire → En cours ⇄ En attente (pause)
             ↘ Bloqué (raison obligatoire) → En cours
             ↘ À vérifier (soumise) → Validé            (direction)
                                    ↘ À corriger → En cours
             ↘ Terminé (si aucune validation requise, ou clôture direction)
```
L'employé ne peut ni valider, ni demander une correction, ni clôturer une tâche qui exige une validation. Chaque transition est historisée et notifie les bonnes personnes.

## Pointage
- `kiosk_punch` vérifie : poste autorisé (+ IP si configurée), employé actif, PIN (verrouillage après 5 erreurs), séquence logique (pas deux arrivées, pas de départ sans arrivée…), puis enregistre avec l'heure serveur et recalcule la journée.
- Statut calculé : à l'heure / en retard (au-delà de la tolérance), sortie autorisée, journée terminée ; heures travaillées = somme des périodes de présence ; heures sup. = au-delà de la durée prévue.
- Statuts manuels (absent, congé, maladie, récupération, sortie autorisée) posés par la direction avec motif, réversibles et tracés.
- Suivi en direct : présent, en retard, pas encore arrivé, non arrivé en retard, absent, congé, repos, parti.

## Automatisations déjà actives
| Déclencheur | Effet |
| --- | --- |
| Tâche créée / réassignée | Apparaît dans le planning et « Ma journée » du responsable + notification |
| Deadline ou contenu modifié | Historique + notification |
| Tâche soumise / bloquée | Notification au créateur et aux responsables du département |
| Tâche validée / à corriger | Notification au responsable de la tâche |
| Commentaire | Notification aux personnes concernées |
| Ajout à l'équipe d'un événement | Notification |
| Toutes les 15 min (pg_cron) | Alerte des tâches en retard à l'employé, à la direction et au responsable |
| Événement à J-2 | Remontée URGENT si tâches ouvertes, pas d'équipe, installation non renseignée, devis non confirmé |

## Feuille de route
- **Phase 3 — Événements** : fiche technique unique (décoration, production, logistique, achats), checklist intelligente et indicateur de progression, clients.
- **Phase 4 — Production** : Validation Studio (versions, validation, refus, passage en production), production, achats (demande → validation → commande → réception).
- **Phase 5 — Logistique** : dépôt et stock avec réservations par événement (le disponible ne peut pas devenir incohérent), listes de préparation, retours, véhicules, trajets, gasoil.
- **Phase 6 — Management** : commissions, congés complets, rapports, exports.
- **Phase 7 — Automatisation** : emails, WhatsApp Business, fournisseurs, imports CSV/Excel, exports Excel/PDF.
