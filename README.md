# prtech-pointage

Appli de pointage et de suivi des marchés de **PR.TECH** (Patrice Renaud EI).

- **Patrice, sur son téléphone** : il note chaque jour son chantier et ses heures. Il reçoit un rappel à 20 h si la journée n'est pas notée. Il envoie un état de chantier ou de client en PDF.
- **Marine, sur ordinateur** : elle saisit les marchés et les avenants en jours, suit le planning qui se recale tout seul, la facturation (45 jours fin de mois) et l'écart entre jours vendus et heures faites.

## Comment ça marche

| Élément | Où |
|---|---|
| Appli (PWA) | ce dépôt, publié par GitHub Pages |
| Données | Supabase, projet `Marine_AP2M_Project`, tables `prtech_*` |
| Accès | lien personnel `?k=<jeton>` ou code `PRT-XXXXXX` (table `prtech_membres`) |
| Rappel de 20 h | fonction `prtech-notif` + tâche pg_cron `prtech-rappel-20h` |
| Contrats, factures | jamais dans ce dépôt : Drive `PRTECH okok/3 - Contrats` ou `prtech-documents/` (ignoré par git) |

Les tables ont la sécurité RLS activée sans aucune règle : la clé publique ne lit rien directement. Tout passe par les fonctions `prtech_*`, qui vérifient le jeton.

## Fichiers

- `index.html`, `prtech-app.js`, `prtech-style.css` : l'appli
- `prtech-sw.js` : hors ligne et notifications
- `prtech-manifest.webmanifest`, `prtech-*.png` : installation sur le téléphone
- `supabase/migrations/` : le schéma de la base
- `supabase/functions/prtech-notif/` : la fonction des notifications
