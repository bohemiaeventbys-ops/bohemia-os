# Mettre BOHEMIA OS en ligne (environ 20 minutes)

Trois comptes gratuits : **GitHub** (le code), **Supabase** (les données et les photos), **Netlify** (le site).

## 1. GitHub : le code
1. Créez un compte sur <https://github.com> si besoin.
2. Bouton **New repository** → nom : `bohemia-os` → **Private** → **Create repository** (sans rien cocher d'autre).
3. Donnez l'accès à Claude : <https://claude.ai/connect-github>. Claude y envoie le code et toutes les mises à jour.

## 2. Supabase : la base de données
1. Créez un compte sur <https://supabase.com> → **New project**.
   - Nom : `bohemia` · Région : **Europe (Paris ou Frankfurt)** · Mot de passe : notez-le dans un endroit sûr.
2. Attendez 2 minutes que le projet soit prêt.
3. Menu **Database → Extensions** → cherchez **pg_cron** → activez-le (pour les rappels automatiques).
4. Menu **SQL Editor → New query** → collez tout le fichier `supabase/installation/bohemia-os-installation.sql` → **Run**.
   Vous devez voir « Success ». (Des messages « NOTICE » sont normaux.)
5. Menu **Project Settings → API** : gardez cette page ouverte, il faut 3 valeurs pour l'étape 3 :
   - **Project URL**
   - **anon public**
   - **service_role** (secrète : ne la donnez à personne, ne l'envoyez pas sur WhatsApp)
6. Menu **Authentication → Sign In / Providers → Email** : désactivez « Allow new users to sign up »
   (seule la Direction crée les comptes depuis la plateforme).

## 3. Netlify : le site
1. Sur <https://app.netlify.com> → **Add new site → Import an existing project → GitHub** → choisissez `bohemia-os`.
2. Avant de lancer, cliquez **Add environment variables** et ajoutez :
   | Nom | Valeur |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role |
3. **Deploy**. Après 3 à 5 minutes, le site est en ligne (adresse du type `bohemia-os.netlify.app`, modifiable dans **Site configuration → Change site name**).

## 4. Premier compte Direction
1. Ouvrez `https://<votre-site>.netlify.app/installation` et créez votre compte (email + mot de passe).
   Cette page se ferme d'elle-même dès que le premier compte existe.
2. **Équipe** : complétez chaque fiche (téléphone, CIN, date d'embauche…), puis **Créer un accès** pour ceux qui doivent se connecter.
3. **Paramètres → Postes de pointage** sur l'ordinateur du dépôt, puis ouvrez `/kiosque`.

## Coût
- Pour démarrer : **0 DH** (offres gratuites).
- Conseillé quand l'équipe l'utilise tous les jours : **Supabase Pro ≈ 25 $ / mois** (sauvegardes quotidiennes, pas de mise en veille).
- Netlify et GitHub restent gratuits pour cet usage.
