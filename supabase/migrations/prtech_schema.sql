-- =====================================================================
-- PR.TECH · pointage et marchés — schéma (appliqué le 01/10/2026)
-- Projet Supabase : Marine_AP2M_Project. Toutes les tables commencent par prtech_.
-- RLS activé sans policy : tout passe par les fonctions prtech_* (security definer)
-- qui vérifient le jeton du lien personnel.
-- Les secrets (clé VAPID privée, secret cron, jetons) ne sont PAS dans ce fichier.
-- =====================================================================

create table public.prtech_membres(
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  role text not null check (role in ('artisan','gestion')),
  jeton uuid not null unique default gen_random_uuid(),
  code text not null unique,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.prtech_clients(
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  mode text not null default 'jour' check (mode in ('jour','heure')),
  tarif numeric not null default 300,
  tel text, cree_par text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.prtech_chantiers(
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.prtech_clients(id) on delete restrict,
  nom text not null, court text, ville text, adresse text,
  couleur int not null default 0,
  debut date not null default current_date,
  jours_anterieurs numeric not null default 0,   -- jours faits avant la mise en service
  cree_par text, archive boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.prtech_contrats(
  id uuid primary key default gen_random_uuid(),
  chantier_id uuid not null references public.prtech_chantiers(id) on delete cascade,
  type text not null check (type in ('M','A')),
  num int not null default 1,
  jours numeric not null check (jours > 0),
  mode text not null default 'jour' check (mode in ('jour','heure')),
  prix numeric not null default 0,
  montant numeric,                                -- forfait HT du document ; vide = jours x prix
  statut text not null default 'a' check (statut in ('a','f','p')),
  num_facture text, date_facture date, date_paiement date, ref_commande text, document text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.prtech_journees(
  jour date primary key,
  absence text,
  lignes jsonb not null default '[]'::jsonb,     -- [{ch: uuid chantier, h: heures}]
  maj_par text, updated_at timestamptz not null default now()
);
create table public.prtech_push(
  id uuid primary key default gen_random_uuid(),
  membre_id uuid not null references public.prtech_membres(id) on delete cascade,
  endpoint text not null unique, p256dh text not null, auth text not null,
  appareil text, actif boolean not null default true,
  created_at timestamptz not null default now(), dernier_envoi timestamptz, dernier_echec text
);
create table public.prtech_reglages(
  cle text primary key, valeur text, public boolean not null default false, note text
);
-- RLS partout, aucune policy
alter table public.prtech_membres enable row level security;
alter table public.prtech_clients enable row level security;
alter table public.prtech_chantiers enable row level security;
alter table public.prtech_contrats enable row level security;
alter table public.prtech_journees enable row level security;
alter table public.prtech_push enable row level security;
alter table public.prtech_reglages enable row level security;

-- Fonctions (voir le détail dans l'historique des migrations Supabase) :
--   prtech_qui(jeton)                      -> membre ou erreur « lien invalide »
--   prtech_connexion(code)                 -> jeton
--   prtech_lire(jeton)                     -> tout (clients, chantiers, contrats, journées, réglages publics)
--   prtech_journee_enregistrer(jeton, jour, absence, lignes)
--   prtech_client_enregistrer(jeton, p) · prtech_chantier_enregistrer(jeton, p)
--   prtech_contrat_enregistrer(jeton, p) · prtech_contrat_supprimer(jeton, id)
--   prtech_cron_ok(secret)                 -> réservé au service (rappel de 20 h)
-- Tâche pg_cron : prtech-rappel-20h, '0 18,19 * * *' -> fonction prtech-notif {action:"rappel"}
