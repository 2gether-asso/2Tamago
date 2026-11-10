# 2Tamago : architecture

## Vue d'ensemble

```
web/  (SvelteKit 3, SPA statique)              shared/core/  (TypeScript pur)
   │  fetch <API>/api/*  (jeton d'accès)          ├─ engine/     règles du jeu : simulate(), applyAction()
   │  simule localement avec @2tamago/core ◄─────┤              types, catalogue, humeurs
   ▼                                             └─ contracts/  schémas Zod des requêtes, types des réponses
reverse proxy (HTTPS) ──►  api/  (NestJS 12) ◄──── utilise les mêmes règles
                          │  Drizzle ORM
                          ▼
                      PostgreSQL  (PGlite embarqué en dev et en test)
```

Chaque service est un dossier à la racine (`api/`, `web/`) avec son `Dockerfile`, et le code partagé est dans `shared/`. L'espace de travail pnpm liste ces dossiers un par un : un futur service dans un autre langage (un bot Discord en Go, par exemple) se rangera à côté sans en faire partie.

| Paquet                          | Rôle                                                                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `shared/core` (`@2tamago/core`) | Le **moteur de jeu**, pur et déterministe, sans I/O, et les **contrats d'API** partagés. Toute règle du jeu vit ici.                |
| `api` (`@2tamago/api`)          | L'**autorité** : identité, persistance, économie, interactions entre joueurs. Il appelle le moteur et ne réimplémente aucune règle. |
| `web` (`@2tamago/web`)          | L'**interface**. Elle affiche l'état reçu de l'API et le fait avancer localement avec le même moteur entre deux appels.             |

## Décisions principales

### 1. Une simulation paresseuse et déterministe, partagée

Un Tamagotchi évolue en temps réel, même app fermée. Plutôt qu'une boucle serveur qui fait vieillir tous les compagnons, l'état stocke `simulatedAt`, et `simulate(state, now, rules)` rattrape le temps écoulé par pas fixes alignés sur une grille absolue.

- Aucune tâche planifiée : un compagnon que personne ne regarde ne coûte rien.
- Le résultat ne dépend pas de la fréquence des appels (un test le vérifie), donc le navigateur peut **prédire** l'état seconde par seconde sans interroger le serveur et sans diverger. Le front se resynchronise toutes les 60 s et au retour sur l'onglet.
- Les règles (`GameRules`) sont servies par `GET /api/game/rules`, ce qui garantit que les deux côtés utilisent les mêmes. `GAME_TIME_SCALE` accélère le temps pour tester.
- Le moteur se teste unitairement, sans base ni serveur.

L'état complet du compagnon est stocké en **JSONB** (`pets.state`), avec une version de forme (`v`). Seul `status` est copié dans une colonne pour les requêtes. Faire évoluer le moteur ne demande donc pas de migration SQL, seulement une montée de version de `v` si la forme change.

### 2. Des verrous par ligne, pas un verrou global

2Gatcha sérialise toutes les écritures derrière un verrou global, en mémoire. Ici, toute modification d'un compagnon passe par `PetsService.mutate()` :

1. ouvrir une transaction et faire `SELECT … FOR UPDATE` sur la ligne du compagnon ;
2. appeler le moteur (`applyAction` ou `simulate`) ;
3. faire les effets de bord dans la même transaction (pièces, inventaire, promenades, journal) ;
4. enregistrer.

Deux actions sur le même compagnon s'exécutent l'une après l'autre ; deux compagnons différents évoluent en parallèle. Les pièces et l'inventaire utilisent des mises à jour atomiques (`coins = coins - x WHERE coins >= x`). Les contraintes d'unicité font respecter les règles du jeu en base : un seul compagnon vivant par joueur, une caresse par jour et par compagnon, une seule rencontre par paire de promenades. L'API peut donc tourner sur plusieurs instances.

### 3. PostgreSQL partout, avec PGlite plutôt que SQLite

`DATABASE_URL` choisit le pilote (voir `api/src/database/database.ts`) :

| URL                     | Usage                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| `postgres://…`          | Production (`node-postgres`), et en dev avec `make db-up`                                 |
| `pglite://.data/pglite` | Développement : PostgreSQL embarqué (WASM), stocké dans un dossier, sans rien à installer |
| `memory://`             | Tests : une base neuve en mémoire pour chaque application                                 |

**Pourquoi PGlite et pas SQLite ?** PGlite est le même moteur PostgreSQL, compilé en WASM. Avec SQLite en dev et PostgreSQL en prod, il faudrait deux schémas Drizzle (`sqlite-core` et `pg-core` ne se partagent pas) et deux jeux de migrations, et ce qui serait testé ne serait pas ce qui tourne en production. Le code s'appuie en plus sur des fonctions que SQLite n'a pas, ou pas de la même façon :

- `SELECT … FOR UPDATE` pour les verrous par ligne ;
- `JSONB` typé pour l'état du compagnon ;
- `timestamptz` et `is distinct from` ;
- index uniques partiels (ceux-là existent aussi dans SQLite).

Le choix inverse, **SQLite partout** (comme 2Gatcha), reste défendable à notre échelle. Il impose cependant une seule instance d'API, des écritures sérialisées (`BEGIN IMMEDIATE`) au lieu des verrous par ligne, et des sauvegardes de fichier plutôt que `pg_dump`.

Côté inconvénients, PGlite n'accepte qu'une connexion à la fois, démarre plus lentement que SQLite et ne s'ouvre pas avec les outils SQLite. Pour inspecter les données avec un client PostgreSQL classique, utiliser `make db-up`.

Les migrations sont générées par `drizzle-kit` (`make db-generate`) dans `api/drizzle/`, versionnées, et appliquées soit par l'API au démarrage (dev), soit par une étape de déploiement dédiée (`node dist/migrate.js`, service `migrate` de compose). Contrairement au « schéma automatique » de 2Gatcha, elles sont explicites et relisibles.

### 3 bis. Pourquoi Drizzle plutôt que Prisma

Les deux conviennent. Drizzle l'a emporté pour ce projet :

- **Pas de génération de code** : le schéma est du TypeScript, et les types des requêtes en sont déduits. Prisma passe par un fichier `.prisma` et un client généré, une étape de plus en dev, en CI et dans le Dockerfile.
- **Proche du SQL** : `FOR UPDATE`, `ON CONFLICT DO NOTHING`, les mises à jour atomiques (`coins = coins - x WHERE coins >= x`) et les index partiels s'écrivent directement. Avec Prisma, le verrou de ligne et les index partiels passent par du SQL brut (`$queryRaw`, migration éditée à la main).
- **Colonnes JSON typées** : `jsonb().$type<PetState>()`.
- **Pilote PGlite natif**, et intégration officielle dans Nest 12 (`@nestjs/drizzle`).
- **ESM et image légère.**

Ce qu'on perd : l'outillage de Prisma (Studio, même si `drizzle-kit studio` existe, migrations interactives) et sa maturité. Il y a aussi deux points de vigilance : Drizzle prépare une v1, qui change les relations, et le projet reste sur la 0.45 stable ; `@nestjs/drizzle` est très jeune (v0.0.x), mais c'est une couche mince, facile à remplacer par un fournisseur maison.

### 4. Pourquoi SvelteKit en SPA plutôt qu'Astro

Astro + Svelte est très adapté à un site de contenu avec des îlots interactifs. Un jeu, lui, a besoin d'un **état client qui persiste d'une page à l'autre** : compagnon prédit en continu, minuteurs, pièces dans l'en-tête, et plus tard une connexion WebSocket. Avec Astro, chaque navigation recharge les îlots, sauf à tout faire tenir dans un seul îlot, ce qui revient à refaire une SPA.

SvelteKit garde Svelte (Svelte 5 et ses runes) et apporte un routeur client. Il est configuré en **SPA statique** (`ssr = false`, `adapter-static` avec `404.html` comme page de repli, que GitHub Pages sert pour toute route inconnue). Le front reste donc un ensemble de fichiers statiques, comme celui de 2Gatcha, déployés sur GitHub Pages. Le rendu du compagnon est fait en **SVG** avec des animations CSS : c'est léger, net à toute taille, facile à teinter et à accessoiriser. Si un jour il faut une scène animée riche (le parc en direct), on pourra ajouter PixiJS dans un composant.

### 5. Identité : des sessions courtes et liées à une clé, une seule règle

- **Discord OAuth2** (code d'autorisation ; le `state` est une valeur signée par l'API, sans cookie) avec les scopes `identify` et `guilds.members.read`. Seuls les membres de `DISCORD_GUILD_ID` peuvent se connecter ; une panne de Discord n'est jamais prise pour « pas membre ». Détails, erreurs et annonces dans [DISCORD.md](DISCORD.md).
- Aucun cookie, et aucune dépendance au site du front. L'API émet un **jeton d'accès** (JWT HS256, `@nestjs/jwt`, 30 minutes, `typ: access`) envoyé en `Authorization: Bearer`, renouvelé avec un **jeton de renouvellement** opaque (stocké haché en base, table `auth_sessions`) qui tourne à chaque usage. Détails de la session ci-dessous.
- Un **garde global** protège toutes les routes ; `@Public()` marque les exceptions. `@CurrentSession()` donne l'identité au contrôleur, et un joueur n'agit que sur ses propres données.
- Les administrateurs sont listés dans **une seule** variable (`ADMIN_DISCORD_IDS`), ce qui corrige l'éparpillement constaté dans 2Gatcha.
- En dev, `AUTH_DEV_LOGIN=true` permet de se connecter avec un simple pseudo. La configuration refuse de démarrer en production avec ce mode actif, ou sans `AUTH_SECRET` d'au moins 32 caractères.

En dev, le front et l'API partagent la même origine (proxy Vite) : pas de CORS. En production, le front (`tamago.2gether-asso.fr`) et l'API (`tamago-api.2gether-asso.fr`) sont sur deux origines : l'adresse de l'API est fixée à la construction du front (`VITE_API_URL`) et l'API autorise `WEB_ORIGIN` (CORS, sans cookies ni `credentials`).

**Connexion** (code d'autorisation avec PKCE, puis DPoP, RFC 7636 et 9449) :

1. Le front génère un secret PKCE (gardé dans `sessionStorage`) et ouvre `/api/auth/discord?code_challenge=…`. Le `state` envoyé à Discord est un JWT signé par l'API qui porte ce challenge (10 minutes).
2. Au retour de Discord, l'API vérifie le `state` et l'appartenance au serveur, puis redirige vers `WEB_ORIGIN/login?code=…` : un **code à usage unique** (60 s, stocké haché dans `auth_codes`), inutile sans le secret PKCE.
3. Le front crée une **clé ECDSA P-256 non exportable** (WebCrypto, gardée dans IndexedDB) et appelle `POST /api/auth/token` avec le code, le secret PKCE et une **preuve DPoP** : un JWT signé par cette clé, qui nomme la méthode et le chemin de la requête et ne sert qu'une fois (`auth_proofs`). L'API lie la session à l'empreinte de la clé.
4. Le jeton d'accès reste **en mémoire** (jamais stocké) ; le jeton de renouvellement est dans IndexedDB. Après un rechargement, le front renouvelle tout seul avant le premier appel.

**Renouvellement** (`POST /api/auth/refresh`, preuve DPoP obligatoire) : le front renouvelle une minute avant l'expiration, ou après un 401, uniquement quand il fait un vrai appel (un onglet oublié n'entretient pas la session). Les onglets se partagent un verrou (Web Locks) pour ne renouveler qu'une fois. Un jeton volé ne sert à rien sans la clé, qui ne peut pas être extraite du navigateur. Le jeton de renouvellement tourne à chaque usage : l'ancien reste accepté 30 secondes (deux onglets), mais s'il revient plus tard c'est qu'il a été copié, et **toute la session est révoquée**.

**Durée et contrôle de l'origine** (`api/src/auth/session-policy.ts`, réglable par `AUTH_*`) : à la connexion, l'API garde l'IP, le réseau (/24 en IPv4, /64 en IPv6), le User-Agent et la « famille » du client (navigateur et système, sans numéro de version). À chaque renouvellement :

| Situation                                       | Résultat                                                                                                                                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Même réseau que la connexion                    | Renouvelle pendant des jours : la session expire après 7 jours **sans** renouvellement (`AUTH_REFRESH_IDLE_DAYS`), 30 jours au plus (`AUTH_SESSION_MAX_DAYS`)                                                |
| Autre réseau (données mobiles, voyage)          | Toléré pendant 6 heures à partir du premier renouvellement depuis ce réseau (`AUTH_ROAMING_HOURS`), puis la session est fermée (`session_roaming`). Revenir sur le réseau d'origine remet le compteur à zéro |
| Autre navigateur ou autre système               | Session révoquée tout de suite (`session_suspicious`) ; une mise à jour du navigateur ne compte pas                                                                                                          |
| Inactive trop longtemps, ou au-delà de 30 jours | `session_expired`                                                                                                                                                                                            |

Les codes d'erreur (`invalid_grant`, `invalid_dpop`, `session_*`) sont des 401 avec un `code` : le front les traduit sur l'écran de connexion. L'IP du joueur est décrite plus bas (« IP du joueur derrière les proxys »). D'autres signaux seraient possibles (pays ou opérateur par base GeoIP, langue du navigateur) ; ils ne sont pas utilisés. La déconnexion (`POST /api/auth/logout`) révoque la session ; un jeton d'accès déjà émis reste valable jusqu'à 30 minutes. L'appartenance au serveur Discord n'est pas revérifiée au renouvellement.

**IP du joueur derrière les proxys** (`api/src/common/client-ip.ts`, `setup-app.ts`). L'IP stockée dans les sessions, utilisée par la limitation de débit (`ThrottlerGuard`) et les journaux est toujours `req.ip`, calculée ainsi :

- `TRUST_PROXY` : nombre de proxys de confiance devant l'API (défaut `1`, comme avant), ou liste d'adresses/sous-réseaux Express (`loopback, 10.99.0.0/16`). `0` ignore `X-Forwarded-For`. Express lit `X-Forwarded-For` de droite à gauche en sautant ces proxys : un client ne peut donc pas imposer une IP en ajoutant ses propres entrées.
- `CLIENT_IP_HEADER` (facultatif, vide par défaut) : en-tête posé par un bord de confiance et ne contenant que l'IP du joueur, par exemple `cf-connecting-ip` derrière Cloudflare. Il est lu **uniquement** s'il est configuré, et ignoré s'il ne contient pas exactement une IP valide (on retombe sur `X-Forwarded-For`). À ne configurer que si l'API n'est joignable qu'à travers ce bord : sinon n'importe qui peut l'envoyer.
- Sentry/GlitchTip : le SDK est lancé sans `sendDefaultPii`, aucune IP de joueur n'y est envoyée.

Chaîne de production (constatée) : Cloudflare → proxy → tunnel WireGuard → proxy → API. L'API reçoit `x-forwarded-for: "<IP réelle>, 10.99.0.1"` et `cf-connecting-ip: <IP réelle>`. Avec l'ancien réglage fixe (`trust proxy` à 1), `req.ip` valait `10.99.0.1` : **toutes les sessions et tous les joueurs partageaient l'IP du tunnel** (limitation de débit commune, contrôle de réseau sans effet). Réglage recommandé : `TRUST_PROXY=2` (le proxy côté API et celui de 10.99.0.1), et en plus `CLIENT_IP_HEADER=cf-connecting-ip` si le proxy d'entrée n'accepte que Cloudflare. Vérification : se connecter, ouvrir la page Compte (`/account`) et lire l'IP de la session actuelle. Ces variables sont transmises par `docker-compose.yml` (et donc `docker-compose.prod.yml`).

**Espace compte** (`api/src/account`, page web `/account`). `GET /account` liste les sessions vivantes du joueur (IP du dernier renouvellement, famille navigateur/système, dernière activité, expiration) en marquant celle de la requête (`sid` du jeton d'accès) ; `DELETE /account/sessions/:id` en révoque une (404 `no_session` si elle n'est pas au joueur : même réponse qu'une session inexistante), `DELETE /account/sessions` révoque toutes les autres. La garde vérifie la session à chaque requête, donc l'appareil révoqué est coupé tout de suite. `PUT /account/name` renomme avec le même schéma et le même filtre de mots que la modération (`name_not_allowed`) ; le nom choisi reste après une reconnexion Discord (`name_locked` en base). Colonne `name_by_admin` : un nom fixé par un modérateur est refusé au joueur (`name_locked`, 409) jusqu'à ce qu'un admin le libère. La migration reprend les verrouillages existants comme étant ceux d'un admin. `DELETE /account` supprime le compte : le corps `{ confirm }` doit reprendre le nom affiché (`confirmation_mismatch`, 409). Presque tout part en cascade avec la ligne `players` (compagnons, sac, sessions, journal, favoris, garderies, concours, abonnements push) ; seules les offres d'échange en attente _reçues_ par le joueur sont d'abord refusées (`TradesService.declineAllTo`, dans la même transaction) pour rendre aux proposeurs les objets et pièces mis de côté. Dans le journal de modération, la référence au joueur passe à `null` (`on delete set null`) mais les noms avant/après sont conservés : ce sont des noms affichés publiquement, gardés pour la traçabilité. Se reconnecter avec Discord crée un nouveau compte (autre identifiant, rien n'est récupéré). Non fait : retrouver le nom Discord de soi-même, avatar.

**Contrepartie** : le jeton d'accès est en mémoire et peut être lu par un script injecté pendant que la page est ouverte, et un script injecté peut appeler l'API en se faisant passer pour le joueur (aucune protection côté client n'empêche cela) ; en revanche il ne peut pas emporter la session, puisque la clé n'est pas extractible. On rend l'injection difficile : pas de `{@html}` ni de `innerHTML` (à ne pas introduire), et une **Content-Security-Policy** posée en `<meta>` à la construction (`csp()` dans `web/vite.config.ts`, hébergement statique oblige). Elle n'autorise que nos propres scripts (`script-src 'self'`, plus le hash du script d'amorçage de SvelteKit ; le script du thème est donc un fichier, `static/theme-init.js`, pas un script inline) et limite `connect-src` à l'origine du site, à l'API et à `CSP_CONNECT_SRC` : un script injecté ne peut ni s'exécuter en ligne ni envoyer le jeton ailleurs. Si `SENTRY_WEB_DSN` est utilisé, mettre l'hôte du DSN dans la variable `CSP_CONNECT_SRC` (variable de dépôt pour Pages, argument de build pour l'image web), sinon le navigateur bloque l'envoi des erreurs. La politique n'est pas active en développement (Vite en a besoin). Si IndexedDB est indisponible (certains modes privés), la clé et le jeton restent en mémoire et un rechargement oblige à se reconnecter.

### 6. Des contrats partagés

Les corps de requête sont des schémas **Zod** dans `@2tamago/core/contracts`. L'API les valide avec le `StandardSchemaValidationPipe` de Nest 12 (`@Body({ schema })`), et le client web importe les mêmes types. Une erreur de règle du moteur (`GameError`) devient une réponse `409` avec un `code` stable et un message en français affichable tel quel.

## Backend (`api/src`)

Un module Nest par domaine :

| Module                             | Contenu                                                                                                                                                                                              |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config/`                          | `AppConfig` : toutes les variables d'environnement validées une fois au démarrage, `Clock`, `GET /config` (réglages publics du front)                                                                |
| `database/`                        | Schéma Drizzle, ouverture de la base et migrations, `DrizzleModule`                                                                                                                                  |
| `auth/`                            | Garde global, sessions (DPoP, rotation, contrôle de l'origine), Discord OAuth2, login de dev                                                                                                         |
| `announcements/`                   | Annonces dans un salon Discord (webhook) : nouveaux joueurs, éclosions, croissance, premières rencontres                                                                                             |
| `players/`                         | Joueurs, pièces (bonus quotidien, plafond journalier), inventaire                                                                                                                                    |
| `profile/`                         | Profil public d'un joueur : statistiques calculées depuis les tables existantes, compagnon vivant                                                                                                    |
| `account/`                         | Espace compte : renommer son nom affiché, lister et révoquer ses sessions (`GET /account`, `PUT /account/name`, `DELETE /account`, `DELETE /account/sessions[/:id]`)                                 |
| `pets/`                            | `GET /me`, adoption, actions du propriétaire, album, et `PetsService.mutate()`                                                                                                                       |
| `social/`                          | Village (visites, caresses, cadeaux, tri par favoris et affinité), favoris, objectif communautaire de la semaine, garderie, échanges, promenades et rencontres                                       |
| `shop/`                            | Achats                                                                                                                                                                                               |
| `activity/`                        | Journal du joueur, écrit dans la transaction de l'action qui le produit                                                                                                                              |
| `feedback/`                        | Avis des joueurs (bug, idée, autre), transmis à Sentry / GlitchTip                                                                                                                                   |
| `game/`, `health/`                 | Règles publiques et réglages admin, statistiques admin, sonde de santé                                                                                                                               |
| `codes/`, `events/`, `moderation/` | Codes cadeaux (utilisation atomique, une par membre), événements programmés (`EventsService` : ce qui est en cours, à lire avant une transaction), modération des noms (filtre, renommages, journal) |
| `contests/`                        | Concours hebdomadaires (inscriptions, votes, classements, récompenses) ; l'état des compagnons y est mis à jour à la lecture, comme au village                                                       |
| `common/`                          | `Clock`, filtres d'exceptions (moteur, signalement des erreurs)                                                                                                                                      |

`Clock` est injectable, ce qui permet aux tests e2e de **voyager dans le temps** (faire éclore un œuf, laisser partir un compagnon délaissé).

### Routes (`/api/…`)

| Méthode et route                                                                                                                                                                                                    | Rôle                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health` · `GET /game/rules` · `GET /auth/config` · `GET /config`                                                                                                                                              | Publiques                                                                                                                                |
| `GET /auth/discord` · `GET /auth/discord/callback` · `POST /auth/dev-login` · `POST /auth/logout`                                                                                                                   | Connexion                                                                                                                                |
| `GET /me`                                                                                                                                                                                                           | Joueur, compagnon (rattrapé), inventaire et heure serveur, en un seul appel                                                              |
| `POST /pet` · `POST /pet/actions` · `GET /album`                                                                                                                                                                    | Adoption, actions (`{type: 'feed' \| 'play' \| …}`), album                                                                               |
| `POST /pet/walk` (corps facultatif `{ zone }`) · `POST /pet/walk/return`                                                                                                                                            | Promenades                                                                                                                               |
| `GET /village` · `GET /village/:petId` · `POST /village/:petId/caress` · `POST /village/:petId/gift` · `PUT` / `DELETE /players/:playerId/favorite` · `GET /community/goal` · `POST /community/goal/claim`          | Social                                                                                                                                   |
| `POST /shop/buy` · `GET /activity` · `POST /activity/read`                                                                                                                                                          | Boutique, journal                                                                                                                        |
| `GET /players/:playerId`                                                                                                                                                                                            | Profil : joueur, statistiques, compagnon vivant                                                                                          |
| `GET /account` · `PUT /account/name` · `DELETE /account` · `DELETE /account/sessions` · `DELETE /account/sessions/:id`                                                                                              | Compte : nom, connexions (IP du dernier renouvellement, navigateur, dernière activité), révocation d'une session ou de toutes les autres |
| `POST /feedback`                                                                                                                                                                                                    | Avis d'un joueur (bug, idée, autre), transmis à Sentry / GlitchTip                                                                       |
| `PUT` / `DELETE /push/subscription` · `POST /push/test`                                                                                                                                                             | Notifications                                                                                                                            |
| `GET /daycare` · `POST /daycare` · `POST /daycare/:id/accept` · `/decline` · `DELETE /daycare/:id` · `POST /daycare/:id/care`                                                                                       | Garderie                                                                                                                                 |
| `GET /trades` · `GET /trades/targets/:id` (sac et liste d'envies de l'autre) · `GET`/`PUT /wishlist` · `POST /wishlist/ask` · `POST /trades` · `POST /trades/:id/accept` · `/decline` · `DELETE /trades/:id`        | Échanges                                                                                                                                 |
| `GET /admin/stats`                                                                                                                                                                                                  | Admin : chiffres du jeu entier (joueurs, compagnons, économie, activité, équilibrage)                                                    |
| `GET /admin/rules` · `PUT /admin/rules`                                                                                                                                                                             | Admin : réglages du jeu en base                                                                                                          |
| `POST /codes/redeem`                                                                                                                                                                                                | Codes cadeaux (membres)                                                                                                                  |
| `GET /events`                                                                                                                                                                                                       | Événements en cours et annoncés (membres)                                                                                                |
| `GET /contests` · `POST /contests/enter` · `POST /contests/vote` · `POST /contests/:kind/claim`                                                                                                                     | Concours                                                                                                                                 |
| `GET` / `POST /admin/codes` · `DELETE /admin/codes/:id`                                                                                                                                                             | Codes cadeaux (admin)                                                                                                                    |
| `GET` / `POST /admin/events` · `DELETE /admin/events/:id`                                                                                                                                                           | Événements (admin)                                                                                                                       |
| `GET /admin/moderation/search` · `PUT /admin/moderation/pets/:petId/name` · `PUT` / `DELETE /admin/moderation/players/:playerId/name` · `GET` / `PUT /admin/moderation/blocked-words` · `GET /admin/moderation/log` | Modération (admin)                                                                                                                       |

### Modèle de données

`players` · `pets` (état en JSONB, un seul vivant par joueur grâce à un index unique partiel) · `inventory` · `interactions` (caresses et cadeaux, une caresse par jour grâce à un index unique partiel) · `walks` · `encounters` (paires de promenades) · `activity` · `favorites` (joueurs suivis) · `community_goals` et `community_claims` (objectif de la semaine et récompenses prises) · `contest_entries` et `contest_votes` · `gift_codes` et `gift_code_redemptions` · `game_events` · `moderation_log` (et `players.name_locked`) · `trades` (offres d'échange : objets donnés et demandés en JSON, pièces données et demandées, état, expiration) · `wishlist` (objets souhaités) et `wish_asks` (demandes d'objet, une par jour) · `daycares` (compagnon confié : invitation, séjour, historique ; un seul séjour ouvert par compagnon grâce à un index unique partiel) · `push_subscriptions` et `push_alerts` (navigateurs abonnés aux notifications, alertes déjà envoyées).

## Frontend (`web/src`)

| Emplacement                       | Rôle                                                                                                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/api.ts`                      | Client `fetch` typé par les contrats, avec une `ApiError` qui porte le `code`                                                                                                                                             |
| `lib/game.svelte.ts`              | Store de jeu en runes : instantané reçu de l'API, prédiction locale avec `simulate()`, actions, minuteurs                                                                                                                 |
| `lib/components/PetSprite.svelte` | Rendu SVG du compagnon (espèce, stade, forme, humeur, accessoire, motif et yeux des traits) et détection des caresses au pointeur                                                                                         |
| `lib/theme.svelte.ts`             | Préférence jour / nuit / automatique, mémorisée dans `localStorage`                                                                                                                                                       |
| `app.css`                         | Jetons de design et styles de base (voir ci-dessous)                                                                                                                                                                      |
| `lib/i18n/`                       | Traductions françaises et anglaises : `t()`, langue courante, un module par domaine dans `locales/` (voir [I18N.md](I18N.md))                                                                                             |
| `lib/texts.ts`                    | Mise en phrases des noms du jeu, événements, journal et notices de l'API, dans la langue courante                                                                                                                         |
| `routes/`                         | `/` (maison), `/login`, `/village`, `/village/[petId]`, `/contests`, `/players/[id]` (profil), `/admin` (réglages), `/admin/stats`, `/admin/codes`, `/admin/moderation` et `/admin/events`, `/shop`, `/journal`, `/album` |

### Apparence et thèmes

`app.css` définit les jetons (couleurs, rayons, polices) : la palette violet / cyan / rose et la police de marque Bungee sont celles des autres projets 2GETHER (2Gatcha), avec un thème jour pastel et un thème nuit « nébuleuse ». Inter et Bungee sont auto-hébergées (Fontsource). Le thème suit le système, sauf si `data-theme="light"` ou `"dark"` est posé sur `<html>` ; un petit script dans `app.html` l'applique avant le premier affichage pour éviter un flash. Les composants n'utilisent que des variables (`--surface`, `--accent`, `--scene-top`…), jamais de couleurs en dur, pour suivre le thème.

Le sprite écrit la silhouette de chaque espèce une seule fois (un `snippet` Svelte), en **deux parties** : l'arrière (oreilles, queue, épines, carapace) et le corps, qui le recouvre. Les motifs du pelage (taches, rayures, dégradé) sont découpés par un `mask` fait de cette silhouette, réduite de 1,5 px (`feMorphology`) pour s'arrêter au bord intérieur du contour au lieu de le recouvrir ; chaque partie a son propre masque, si bien qu'une rayure ne traverse jamais le contour du corps. On utilise un `mask` et non un `clipPath`, qui ignore silencieusement les groupes `<g>` (la silhouette de `kumo` en contient). Pour ajouter une espèce : l'ajouter à `SPECIES` et `SPECIES_LABELS` dans le moteur, puis dessiner sa silhouette (parties `back` et `front`) dans `PetSprite.svelte`; `PetSprite.spec.ts` vérifie que chaque espèce a ses motifs, ses yeux et sa propre forme. Les traits (tirage, tempéraments) sont dans `shared/core/src/engine/traits.ts`.

### Statistiques admin

`GET /api/admin/stats` (admins seulement) alimente l'onglet « Statistiques » de l'écran Admin. `AdminStatsService` (`api/src/game/`) lit les tables, remet les compagnons vivants à l'heure (lecture seule) et confie le tout à `buildAdminStats` (`admin-stats.ts`), une fonction **pure** testée sans base. Elle donne : les joueurs (inscrits, actifs aujourd'hui et sur 7 jours, nouveaux), les compagnons (par statut, stade et forme, moyennes des besoins), l'économie (pièces, objets dans les sacs), l'activité des 14 derniers jours (nouveaux joueurs, caresses, cadeaux, promenades) et l'**équilibrage**.

L'équilibrage regroupe les compagnons éclos par tempérament et par espèce : effectif, vivants, retraités, partis, taux de départ, vie moyenne, erreurs de soin par jour de jeu, lien et bonheur moyens. L'écran colore une valeur qui s'écarte de plus de 25 % de la moyenne des groupes (groupes de moins de 5 compagnons ignorés). Les espèces étant purement visuelles, leurs lignes doivent se ressembler : un écart signale un problème. Les tempéraments, eux, doivent être proches sans être identiques ; pour corriger, on ajuste `temperaments` dans les réglages (voir GAME_DESIGN.md). Le service charge tous les compagnons en mémoire : suffisant pour quelques centaines de joueurs, au-delà il faudra déplacer les sommes en SQL. « Actif aujourd'hui » s'appuie sur `last_seen_at`, mis à jour à la connexion et à la première visite du jour (bonus quotidien).

### Réglages du jeu en base

`GameRulesService` (`api/src/game/`) fournit les règles en vigueur : les valeurs par défaut du moteur et l'environnement (`GAME_TIME_SCALE`, `GAME_DEPARTURE`, et le décalage horaire de la nuit déduit de `GAME_TIMEZONE`), plus les **surcharges** stockées dans la table `game_settings` (clé `rules`, JSON). Les services lisent `current`, toujours à jour pour l'instance ; un admin les modifie via `PUT /api/admin/rules` (écran Admin du front) et le changement est immédiat, les autres instances le récupèrent en 30 s au plus. Le schéma Zod `rulesOverridesBody` (`shared/core`) refuse les clés inconnues et les valeurs absurdes. La vitesse du temps, le pas de simulation et le plafond de pas ne sont pas modifiables : les changer réécrirait la chronologie de tous les compagnons. Les surcharges des objets (`stageHours`, `night.stages`…) se fusionnent clé par clé, à tous les niveaux (`applyRulesOverrides`, dans le moteur). Pour tester l'écran en dev, `ADMIN_DISCORD_IDS=dev:<pseudo>` donne le rôle admin à un compte de connexion par pseudo.

### Notifications Web Push

Avec `VAPID_PUBLIC_KEY` et `VAPID_PRIVATE_KEY` (à générer avec `make vapid-keys`, et à garder : changer de clés invalide les abonnements existants), l'API prévient les joueurs abonnés quand leur compagnon a besoin d'eux. Sans les clés, rien n'est envoyé et l'écran de profil l'indique. `VAPID_SUBJECT` (un `mailto:` ou une URL https) est transmis aux services de push.

- **Abonnement** : le navigateur s'abonne (`PushManager.subscribe`, clé publique lue dans `GET /api/config`) puis l'enregistre avec `PUT /api/push/subscription` (point d'accès, clés et langue) ; `DELETE /api/push/subscription` l'oublie ; `POST /api/push/test` envoie une notification de test. Un navigateur est identifié par son point d'accès : s'il est enregistré par un autre joueur (navigateur partagé), il change de propriétaire, et la déconnexion le désenregistre. Un service de push qui répond 404 ou 410 fait supprimer l'abonnement.
- **Quoi, quand** : `PushNotifier` (`api/src/push/`) passe toutes les minutes sur les compagnons vivants des joueurs abonnés, calcule leur état à l'instant présent avec `simulate()` (aperçu, rien n'est écrit) et demande à `pushKindsOf()` ce qui mérite une alerte : promenade finie, maladie, caprice, faim. Un compagnon qui dort n'est jamais signalé, et le reste (ennui, saleté, fatigue) attend la prochaine visite.
- **Une fois par épisode** : la table `push_alerts` garde les alertes déjà envoyées et encore en cours. Une alerte n'est envoyée qu'à son début, et peut repartir quand elle s'est arrêtée (le compagnon a mangé, puis a de nouveau faim). L'écriture de la ligne précède l'envoi : avec plusieurs instances de l'API, une seule envoie. Si personne n'a reçu le message, la ligne est supprimée et l'envoi est retenté à la passe suivante.
- **Pas de phrase côté API** : le message ne contient que `{ kind, petName, locale }` (`PushPayload`). Le service worker (`web/src/service-worker.ts`) écrit le texte avec les mêmes messages que l'application (`push.msg.<kind>`, `translate()` est dans un module sans état Svelte pour cela), dans la langue envoyée par le navigateur à l'abonnement et mise à jour quand le joueur change de langue. Un nouveau type d'alerte demande donc un `PushKind`, son message dans les deux langues (un test le vérifie) et sa règle dans `pushKindsOf`.
- **Notifications d'événement** : tout n'est pas une alerte qui dure. Une invitation à la garderie est un événement : `DaycareService` appelle `PushService.notify()` tout de suite (sans passer par `PushNotifier`, sans ligne dans `push_alerts`), avec `playerName` (le propriétaire) dans le message. L'envoi est un coup de pouce qui peut échouer sans gêner l'invitation, déjà dans le journal. Les offres d'échange (`trade_offer`) fonctionnent de même, avec le nom de celui qui propose. Un clic sur la notification ouvre le village, où l'on répond.
- **Service worker** : il ne fait que cela (pas de cache hors ligne). SvelteKit l'enregistre tout seul ; la CSP l'autorise (`script-src 'self'`). Il est vérifié par un second `tsc` (`tsconfig.service-worker.json`), car ses globales ne sont pas celles de la page. Sur iPhone, les notifications ne fonctionnent que si 2Tamago est ajouté à l'écran d'accueil.

### Suivi des erreurs

Avec `SENTRY_DSN` (Sentry, ou GlitchTip qui parle le même protocole), l'API signale les erreurs inattendues (5xx) via un filtre d'exceptions global ; sans la variable, rien n'est envoyé. Les refus du moteur (409) et les erreurs 4xx ne sont pas signalés.

**Côté web**, le SDK `@sentry/browser` est chargé à la demande (un chunk à part) uniquement si l'API fournit un DSN. Comme le front est servi en fichiers statiques, il le lit au démarrage via `GET /api/config`, qui renvoie `SENTRY_WEB_DSN` (un DSN **public**, d'un projet navigateur distinct de celui de l'API) et `feedbackEnabled`. Le hook `init` de `hooks.client.ts` charge cette configuration ; `handleError` signale les erreurs inconnues (`kind === 'unknown'`) et le SDK capte lui-même les erreurs non interceptées et les rejets de promesses. Les erreurs levées avant la fin du chargement du SDK sont mises en attente puis envoyées. Aucune donnée personnelle n'est ajoutée.

**Avis des joueurs.** La modale « Donner un avis » (bouton 💬 de l'en-tête, visible seulement si `feedbackEnabled`) envoie `POST /api/feedback` (`{ type, message, page }`, 10 à 2000 caractères, 5 envois par minute). L'API le transforme (`api/src/feedback/feedback-report.ts`) en un message Sentry au format cohérent, signalé avec le `SENTRY_DSN` de l'API :

| Type  | Sévérité  | Titre                    |
| ----- | --------- | ------------------------ |
| Bug   | `error`   | `[Bug] première ligne`   |
| Idée  | `info`    | `[Idée] première ligne`  |
| Autre | `warning` | `[Autre] première ligne` |

Le titre est tronqué à 80 caractères ; le texte complet, la page et le navigateur sont dans les données supplémentaires. Les étiquettes `kind:feedback`, `feedback_type` et `page` permettent de filtrer, et le joueur (identifiant et pseudo) est associé au signalement. Deux avis identiques du même type se regroupent dans une même issue (empreinte calculée sur le texte), ce qui compte les « +1 ». Sans `SENTRY_DSN`, l'API répond 503 (`feedback_disabled`) et le bouton n'est pas affiché : un avis n'est jamais perdu en silence.

## Ajouter une fonctionnalité

1. **Une règle de jeu** (nouvelle action, nouvel effet) : l'ajouter au moteur (`shared/core/src/engine`) avec un test, puis au schéma de requête dans `contracts/` si le joueur peut la déclencher. L'API et le front en profitent sans autre changement.
2. **Des données** : modifier `api/src/database/schema.ts`, puis lancer `make db-generate` et versionner la migration produite.
3. **Un domaine** : créer un module Nest dans `api/src/<domaine>/`, passer par `PetsService.mutate()` pour toucher un compagnon, enregistrer les effets dans le journal avec la transaction en cours, et ajouter un scénario e2e.
4. **Un écran** : ajouter une route dans `web/src/routes/` et une méthode dans `lib/api.ts`.

## Tests

| Commande                                    | Contenu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @2tamago/core test`          | Moteur : déterminisme, décroissance, maladie, départ, évolution, actions ; traits et tempéraments (équilibre avantage / inconvénient) ; cycle de nuit et heures de coucher par stade ; surcharges de règles                                                                                                                                                                                                                                                                                                                           |
| `pnpm --filter @2tamago/api test`           | Tests unitaires (configuration, client Discord avec un `fetch` simulé, annonces et leur plafond, envoi du webhook, assemblage des statistiques admin, rapport d'avis, codes d'erreur, fuseau horaire) et scénarios e2e sur une base PGlite en mémoire (ou sur PostgreSQL si `TEST_DATABASE_URL` est défini, comme en CI) avec une horloge simulée : cycle de vie, départ, village, cadeaux, rencontres, profils, statistiques admin, avis, parcours complet de la connexion Discord avec un faux Discord, annonces avec un faux salon |
| `pnpm --filter @2tamago/web test` / `check` | Dictionnaires (clés, paramètres, pluriels, clés inutilisées, un message par code d'erreur), mise en phrases, rendu du sprite pour chaque espèce, motif et style d'yeux ; vérification de types Svelte                                                                                                                                                                                                                                                                                                                                 |
| `pnpm --filter @2tamago/web test:e2e`       | Navigateur (Playwright, Chromium, en français sauf les tests de langue) : deux joueurs adoptent, soignent, se rendent visite ; profils ; avis ; langue ; nuit et lumière ; écran Admin et statistiques ; messages d'erreur de connexion. Lance l'API compilée sur PGlite avec un temps accéléré (`make build` d'abord)                                                                                                                                                                                                                |

## Docker et environnements

- **Image** : l'API a son `Dockerfile` (étapes `deps`, `build`, `prod`) et son `Dockerfile.dockerignore`, qui n'envoie au build que le service, `shared/core` et les fichiers de l'espace de travail. Le front a aussi la sienne (`web/Dockerfile`) : nginx sans HTTPS, qui sert le site statique et relaie `/api/*` vers `API_UPSTREAM` (`api:3000` par défaut). Elle sert à la stack locale et aux installations sur une seule origine ; en production, le site est sur GitHub Pages. Le contexte de build est la racine du dépôt (`docker build -f api/Dockerfile .`), car les services dépendent de `shared/` et du lockfile.
  - `api` : Node 24 avec les seules dépendances de production. Les migrations sont une étape à part : le service `migrate` des fichiers compose (même image, `node dist/migrate.js`) s'exécute avant l'API, qui démarre avec `DATABASE_AUTO_MIGRATE=false`. Sans cette variable (dev, PGlite), l'API migre elle-même au démarrage.
- **Dev (devcontainer)** : `make dev`, sans Docker, avec PGlite. Le `Makefile` réunit les commandes courantes.
- **Stack locale** (`docker-compose.yml`) : PostgreSQL, API et web (nginx) construits depuis les sources (`make up`, <http://localhost:8080>, API aussi sur :3000). Le projet compose porte le même nom que celui du devcontainer : ses services sont donc sur le même réseau, et le devcontainer joint `db:5432` (`make db-up`) ou `api:3000`.
- **Production et préproduction** (`docker-compose.prod.yml`) : il étend les services de `docker-compose.yml` (les deux fichiers sont nécessaires sur le serveur) et tire les images publiées (`REGISTRY`, `TAG`) et exige les secrets (`AUTH_SECRET`, `POSTGRES_PASSWORD`, Discord). Elle ne lance que PostgreSQL et l'API (l'image web est facultative : `--profile web`), publiée sur `API_BIND:API_PORT` (`0.0.0.0` par défaut : pare-feu, ou `127.0.0.1` si le proxy est sur la même machine) : un reverse proxy placé devant (non fourni) gère le HTTPS pour `API_ORIGIN`.
- **CI** (GitHub Actions) : `ci.yml` (formatage, lint, build, types et tests), `docker.yml` (build des images de l'API et du web à chaque PR ; sur `main` et sur les tags `vX.Y.Z`, publication multi-architecture amd64 et arm64 sur ghcr.io) et `pages.yml` (build du site statique `web/build`, déployé sur GitHub Pages avec la variable `API_URL`).
- Sauvegardes : à mettre en place avec `pg_dump` (voir la roadmap).

## Évolutions prévues

- **Temps réel** : un gateway `@nestjs/websockets` authentifié par le même JWT, qui diffusera les événements du journal (visites, rencontres) et le parc en direct. Avec plusieurs instances, il faudra un adaptateur Redis ou `LISTEN/NOTIFY` de PostgreSQL.
- **Notifications push** : pour prévenir sans simulation en tâche de fond, on peut calculer à l'avance la prochaine échéance (faim, caca, caprice) avec le moteur et la stocker, puis faire tourner un petit planificateur (`@nestjs/schedule`).
