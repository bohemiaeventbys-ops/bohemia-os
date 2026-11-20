# BOHEMIA OS

Plateforme de gestion interne de **Bohemia Events** (Casablanca).
Next.js 15 · TypeScript · Supabase (PostgreSQL, Auth, Storage) · Tailwind CSS.
Interface en français · devise MAD (DH) · fuseau horaire Africa/Casablanca.

## Ce que contient cette première version (phases 1 et 2)

| Module | Fonctionnalités |
| --- | --- |
| Connexion | Comptes par email + mot de passe, page d'installation du premier compte Direction |
| Rôles & permissions | Direction / Responsable de département / Employé, permissions par rôle modifiables, ajustement individuel (accorder / retirer) |
| Équipe | Fiches employés (photo, fonction, département, horaires, téléphone, statut, date d'entrée), PIN de pointage, création d'accès, historique |
| Départements | 7 départements créés (Commercial & Clients, Graphisme, OHMYBOX & Papeterie, Fleurs & Déco, Achats, Dépôt & Logistique, Transport), responsables multiples, tout est modifiable |
| Pointage | Kiosque sur ordinateur autorisé uniquement, PIN personnel, Arrivée / Sortie autorisée / Retour / Départ, calcul à l'heure / en retard / heures sup., suivi en direct, historique jour / semaine / mois, corrections tracées (auteur, date, motif) |
| Tâches | Statuts complets, priorités, collaborateurs, événement associé, fichiers, commentaires, historique, blocage avec raison, soumission à validation, duplication |
| Ma journée | Tâches du jour, en retard, urgentes, à venir, mes événements, mes notifications, mes documents, mon pointage |
| Planning hebdomadaire | Vue employés × jours ou départements × jours, ajout rapide, duplication d'une semaine entière |
| Calendrier | Jour / semaine / mois / week-ends · événements, livraisons, installations, démontages, tâches, congés · filtres |
| Événements (socle) | Fiche événement (client, type, horaires, lieu, budget, responsable, équipe), tâches liées et progression |
| Dashboard direction | Présence, retards, absences, tâches du jour / en retard / bloquées / à vérifier, événements semaine et week-end, section URGENT automatique |
| Notifications | Automatiques (tâche attribuée, modifiée, bloquée, à vérifier, validée, à corriger, en retard, commentaire, équipe d'événement), reliées à l'élément |
| Recherche globale | Employés, tâches, événements, départements |
| Journal | Historique de toutes les actions administratives |

Les modules des phases 3 à 7 apparaissent dans la navigation de la direction avec leur phase prévue.

## Installation

### 1. Créer le projet Supabase
1. Créez un projet sur <https://supabase.com> (région Europe recommandée, ex. Frankfurt ou Paris).
2. Dans **Project Settings → API**, notez l'URL, la clé `anon` et la clé `service_role`.

### 2. Créer la base de données
Avec la CLI Supabase (recommandé) :
```bash
npx supabase login
npx supabase link --project-ref <votre-ref>
npx supabase db push
```
Ou, sans CLI : ouvrez **SQL Editor** dans Supabase et exécutez, dans l'ordre, les fichiers de `supabase/migrations/`.

Pour les alertes de tâches en retard toutes les 15 minutes : activez l'extension **pg_cron** (Database → Extensions) avant la migration 4, ou relancez son contenu ensuite.

### 3. Lancer l'application
```bash
cp .env.example .env.local   # puis remplir les 3 clés
npm install
npm run dev                  # http://localhost:3000
```
Ouvrez <http://localhost:3000/installation> pour créer le compte Direction (cette page se désactive ensuite).

### 4. Mettre en ligne (Vercel conseillé)
Importez le dépôt GitHub dans Vercel et ajoutez les 3 variables d'environnement. Aucune autre configuration n'est nécessaire.

## Mettre en place le kiosque de pointage
1. Sur l'ordinateur de pointage, connectez-vous avec un compte Direction.
2. **Paramètres → Postes de pointage → Enregistrer cet ordinateur** (option : restreindre à l'IP du bureau).
3. Ouvrez `/kiosque` en plein écran (F11) et déconnectez-vous : le kiosque reste actif.
4. Dans **Équipe**, définissez le PIN de chaque employé.

Sécurité du pointage :
- seuls les navigateurs enregistrés (jeton secret dans un cookie non lisible en JavaScript, empreinte SHA-256 en base) peuvent pointer ;
- les téléphones et tablettes sont refusés ;
- l'heure enregistrée est celle du serveur de base de données, jamais celle du poste ;
- le PIN est haché (bcrypt), verrouillé 5 minutes après 5 erreurs ;
- aucun employé ne peut écrire directement dans les tables de pointage : seules des fonctions contrôlées le font ;
- une correction n'efface jamais le pointage d'origine : elle l'annule, le remplace et enregistre l'auteur, la date et le motif.

## Structure du code
```
supabase/migrations/     Schéma, sécurité (RLS), fonctions métier, données initiales
src/app/(app)/           Pages de l'application connectée
src/app/kiosque/         Kiosque de pointage (sans connexion, poste autorisé)
src/app/connexion/       Connexion · src/app/installation/ premier compte
src/components/          Design system (boutons, cartes, badges, formulaires…) et mise en page
src/lib/                 Accès Supabase, session & permissions, dates Casablanca, libellés
docs/ARCHITECTURE.md     Architecture, modèle de données, permissions, feuille de route
```
