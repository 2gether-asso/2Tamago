# 2Tamago : architecture

## Vue d'ensemble

```
web/  (SvelteKit 3, SPA statique)              shared/core/  (TypeScript pur)
   │  fetch /api/*  (cookie de session)          ├─ engine/     règles du jeu : simulate(), applyAction()
   │  simule localement avec @2tamago/core ◄─────┤              types, catalogue, humeurs
   ▼                                             └─ contracts/  schémas Zod des requêtes, types des réponses
Caddy  ── /api/* ──►  api/  (NestJS 12) ◄──── utilise les mêmes règles
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

SvelteKit garde Svelte (Svelte 5 et ses runes) et apporte un routeur client. Il est configuré en **SPA statique** (`ssr = false`, `adapter-static` avec `200.html` comme page de repli). Le front reste donc un ensemble de fichiers statiques, comme celui de 2Gatcha, servis par Caddy. Le rendu du compagnon est fait en **SVG** avec des animations CSS : c'est léger, net à toute taille, facile à teinter et à accessoiriser. Si un jour il faut une scène animée riche (le parc en direct), on pourra ajouter PixiJS dans un composant.

### 5. Identité : un jeton signé, une seule règle

- **Discord OAuth2** (code d'autorisation, `state` à usage unique dans un cookie) avec les scopes `identify` et `guilds.members.read`. Seuls les membres de `DISCORD_GUILD_ID` peuvent se connecter ; une panne de Discord n'est jamais prise pour « pas membre ». Détails, erreurs et annonces dans [DISCORD.md](DISCORD.md).
- L'API émet un **JWT HS256** (`@nestjs/jwt`) dans un cookie `HttpOnly`, `SameSite=Lax`, valable 30 jours. Un en-tête `Authorization: Bearer` est aussi accepté pour les scripts et un futur client WebSocket.
- Un **garde global** protège toutes les routes ; `@Public()` marque les exceptions. `@CurrentSession()` donne l'identité au contrôleur, et un joueur n'agit que sur ses propres données.
- Les administrateurs sont listés dans **une seule** variable (`ADMIN_DISCORD_IDS`), ce qui corrige l'éparpillement constaté dans 2Gatcha.
- En dev, `AUTH_DEV_LOGIN=true` permet de se connecter avec un simple pseudo. La configuration refuse de démarrer en production avec ce mode actif, ou sans `AUTH_SECRET` d'au moins 32 caractères.

Le front et l'API partagent la même origine (proxy Vite en dev, Caddy en prod), donc il n'y a pas de CORS et le cookie fonctionne sans configuration.

### 6. Des contrats partagés

Les corps de requête sont des schémas **Zod** dans `@2tamago/core/contracts`. L'API les valide avec le `StandardSchemaValidationPipe` de Nest 12 (`@Body({ schema })`), et le client web importe les mêmes types. Une erreur de règle du moteur (`GameError`) devient une réponse `409` avec un `code` stable et un message en français affichable tel quel.

## Backend (`api/src`)

Un module Nest par domaine :

| Module             | Contenu                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `config/`          | `AppConfig` : toutes les variables d'environnement validées une fois au démarrage, `Clock`, `GET /config` (réglages publics du front) |
| `database/`        | Schéma Drizzle, ouverture de la base et migrations, `DrizzleModule`                                                                   |
| `auth/`            | Garde global, cookie de session, Discord OAuth2, login de dev                                                                         |
| `announcements/`   | Annonces dans un salon Discord (webhook) : nouveaux joueurs, éclosions, croissance, premières rencontres                              |
| `players/`         | Joueurs, pièces (bonus quotidien, plafond journalier), inventaire                                                                     |
| `profile/`         | Profil public d'un joueur : statistiques calculées depuis les tables existantes, compagnon vivant                                     |
| `pets/`            | `GET /me`, adoption, actions du propriétaire, album, et `PetsService.mutate()`                                                        |
| `social/`          | Village (visites, caresses, cadeaux), promenades et rencontres                                                                        |
| `shop/`            | Achats                                                                                                                                |
| `activity/`        | Journal du joueur, écrit dans la transaction de l'action qui le produit                                                               |
| `feedback/`        | Avis des joueurs (bug, idée, autre), transmis à Sentry / GlitchTip                                                                    |
| `game/`, `health/` | Règles publiques et réglages admin, statistiques admin, sonde de santé                                                                |
| `common/`          | `Clock`, filtres d'exceptions (moteur, signalement des erreurs)                                                                       |

`Clock` est injectable, ce qui permet aux tests e2e de **voyager dans le temps** (faire éclore un œuf, laisser partir un compagnon délaissé).

### Routes (`/api/…`)

| Méthode et route                                                                                     | Rôle                                                                                  |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `GET /health` · `GET /game/rules` · `GET /auth/config` · `GET /config`                               | Publiques                                                                             |
| `GET /auth/discord` · `GET /auth/discord/callback` · `POST /auth/dev-login` · `POST /auth/logout`    | Connexion                                                                             |
| `GET /me`                                                                                            | Joueur, compagnon (rattrapé), inventaire et heure serveur, en un seul appel           |
| `POST /pet` · `POST /pet/actions` · `GET /album`                                                     | Adoption, actions (`{type: 'feed' \| 'play' \| …}`), album                            |
| `POST /pet/walk` · `POST /pet/walk/return`                                                           | Promenades                                                                            |
| `GET /village` · `GET /village/:petId` · `POST /village/:petId/caress` · `POST /village/:petId/gift` | Social                                                                                |
| `POST /shop/buy` · `GET /activity` · `POST /activity/read`                                           | Boutique, journal                                                                     |
| `GET /players/:playerId`                                                                             | Profil : joueur, statistiques, compagnon vivant                                       |
| `POST /feedback`                                                                                     | Avis d'un joueur (bug, idée, autre), transmis à Sentry / GlitchTip                    |
| `GET /admin/stats`                                                                                   | Admin : chiffres du jeu entier (joueurs, compagnons, économie, activité, équilibrage) |
| `GET /admin/rules` · `PUT /admin/rules`                                                              | Admin : réglages du jeu en base                                                       |

### Modèle de données

`players` · `pets` (état en JSONB, un seul vivant par joueur grâce à un index unique partiel) · `inventory` · `interactions` (caresses et cadeaux, une caresse par jour grâce à un index unique partiel) · `walks` · `encounters` (paires de promenades) · `activity`.

## Frontend (`web/src`)

| Emplacement                       | Rôle                                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/api.ts`                      | Client `fetch` typé par les contrats, avec une `ApiError` qui porte le `code`                                                               |
| `lib/game.svelte.ts`              | Store de jeu en runes : instantané reçu de l'API, prédiction locale avec `simulate()`, actions, minuteurs                                   |
| `lib/components/PetSprite.svelte` | Rendu SVG du compagnon (espèce, stade, forme, humeur, accessoire, motif et yeux des traits) et détection des caresses au pointeur           |
| `lib/theme.svelte.ts`             | Préférence jour / nuit / automatique, mémorisée dans `localStorage`                                                                         |
| `app.css`                         | Jetons de design et styles de base (voir ci-dessous)                                                                                        |
| `lib/i18n/`                       | Traductions françaises et anglaises : `t()`, langue courante, un module par domaine dans `locales/` (voir [I18N.md](I18N.md))               |
| `lib/texts.ts`                    | Mise en phrases des noms du jeu, événements, journal et notices de l'API, dans la langue courante                                           |
| `routes/`                         | `/` (maison), `/login`, `/village`, `/village/[petId]`, `/players/[id]` (profil), `/admin` et `/admin/stats`, `/shop`, `/journal`, `/album` |

### Apparence et thèmes

`app.css` définit les jetons (couleurs, rayons, polices) : la palette violet / cyan / rose et la police de marque Bungee sont celles des autres projets 2GETHER (2Gatcha), avec un thème jour pastel et un thème nuit « nébuleuse ». Inter et Bungee sont auto-hébergées (Fontsource). Le thème suit le système, sauf si `data-theme="light"` ou `"dark"` est posé sur `<html>` ; un petit script dans `app.html` l'applique avant le premier affichage pour éviter un flash. Les composants n'utilisent que des variables (`--surface`, `--accent`, `--scene-top`…), jamais de couleurs en dur, pour suivre le thème.

Le sprite écrit la silhouette de chaque espèce une seule fois (un `snippet` Svelte), en **deux parties** : l'arrière (oreilles, queue, épines) et le corps, qui le recouvre. Les motifs du pelage (taches, rayures, dégradé) sont découpés par un `mask` fait de cette silhouette, réduite de 1,5 px (`feMorphology`) pour s'arrêter au bord intérieur du contour au lieu de le recouvrir ; chaque partie a son propre masque, si bien qu'une rayure ne traverse jamais le contour du corps. On utilise un `mask` et non un `clipPath`, qui ignore silencieusement les groupes `<g>` (la silhouette de `kumo` en contient). Pour ajouter une espèce : l'ajouter à `SPECIES` et `SPECIES_LABELS` dans le moteur, puis dessiner sa silhouette (parties `back` et `front`) dans `PetSprite.svelte`; `PetSprite.spec.ts` vérifie que chaque espèce a ses motifs, ses yeux et sa propre forme. Les traits (tirage, tempéraments) sont dans `shared/core/src/engine/traits.ts`.

### Statistiques admin

`GET /api/admin/stats` (admins seulement) alimente l'onglet « Statistiques » de l'écran Admin. `AdminStatsService` (`api/src/game/`) lit les tables, remet les compagnons vivants à l'heure (lecture seule) et confie le tout à `buildAdminStats` (`admin-stats.ts`), une fonction **pure** testée sans base. Elle donne : les joueurs (inscrits, actifs aujourd'hui et sur 7 jours, nouveaux), les compagnons (par statut, stade et forme, moyennes des besoins), l'économie (pièces, objets dans les sacs), l'activité des 14 derniers jours (nouveaux joueurs, caresses, cadeaux, promenades) et l'**équilibrage**.

L'équilibrage regroupe les compagnons éclos par tempérament et par espèce : effectif, vivants, retraités, partis, taux de départ, vie moyenne, erreurs de soin par jour de jeu, lien et bonheur moyens. L'écran colore une valeur qui s'écarte de plus de 25 % de la moyenne des groupes (groupes de moins de 5 compagnons ignorés). Les espèces étant purement visuelles, leurs lignes doivent se ressembler : un écart signale un problème. Les tempéraments, eux, doivent être proches sans être identiques ; pour corriger, on ajuste `temperaments` dans les réglages (voir GAME_DESIGN.md). Le service charge tous les compagnons en mémoire : suffisant pour quelques centaines de joueurs, au-delà il faudra déplacer les sommes en SQL. « Actif aujourd'hui » s'appuie sur `last_seen_at`, mis à jour à la connexion et à la première visite du jour (bonus quotidien).

### Réglages du jeu en base

`GameRulesService` (`api/src/game/`) fournit les règles en vigueur : les valeurs par défaut du moteur et l'environnement (`GAME_TIME_SCALE`, `GAME_DEPARTURE`, et le décalage horaire de la nuit déduit de `GAME_TIMEZONE`), plus les **surcharges** stockées dans la table `game_settings` (clé `rules`, JSON). Les services lisent `current`, toujours à jour pour l'instance ; un admin les modifie via `PUT /api/admin/rules` (écran Admin du front) et le changement est immédiat, les autres instances le récupèrent en 30 s au plus. Le schéma Zod `rulesOverridesBody` (`shared/core`) refuse les clés inconnues et les valeurs absurdes. La vitesse du temps, le pas de simulation et le plafond de pas ne sont pas modifiables : les changer réécrirait la chronologie de tous les compagnons. Les surcharges des objets (`stageHours`, `night.stages`…) se fusionnent clé par clé, à tous les niveaux (`applyRulesOverrides`, dans le moteur). Pour tester l'écran en dev, `ADMIN_DISCORD_IDS=dev:<pseudo>` donne le rôle admin à un compte de connexion par pseudo.

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

- **Images** : chaque service a son `Dockerfile` (étapes `deps`, `build`, `prod`) et son `Dockerfile.dockerignore`, qui n'envoie au build que le service, `shared/core` et les fichiers de l'espace de travail. Le contexte de build est la racine du dépôt (`docker build -f api/Dockerfile .`), car les services dépendent de `shared/` et du lockfile.
  - `api` : Node 24 avec les seules dépendances de production. Les migrations sont une étape à part : le service `migrate` des fichiers compose (même image, `node dist/migrate.js`) s'exécute avant l'API, qui démarre avec `DATABASE_AUTO_MIGRATE=false`. Sans cette variable (dev, PGlite), l'API migre elle-même au démarrage.
  - `web` : Caddy, qui sert le site statique et relaie `/api/*` vers `API_UPSTREAM` (`api:3000` par défaut).
- **Dev (devcontainer)** : `make dev`, sans Docker, avec PGlite. Le `Makefile` réunit les commandes courantes.
- **Stack locale** (`docker-compose.yml`) : PostgreSQL, API et web construits depuis les sources (`make up`, <http://localhost:8080>). Le projet compose porte le même nom que celui du devcontainer : ses services sont donc sur le même réseau, et le devcontainer joint `db:5432` (`make db-up`) ou `web`.
- **Production et préproduction** (`docker-compose.prod.yml`) : un fichier autonome qui tire les images publiées (`REGISTRY`, `TAG`) et exige les secrets (`AUTH_SECRET`, `POSTGRES_PASSWORD`, Discord). Caddy gère le HTTPS avec `SITE_ADDRESS`.
- **CI** (GitHub Actions) : formatage, build, types et tests, puis publication sur `main` des images multi-architecture (amd64 et arm64) sur ghcr.io.
- Sauvegardes : à mettre en place avec `pg_dump` (voir la roadmap).

## Évolutions prévues

- **Temps réel** : un gateway `@nestjs/websockets` authentifié par le même JWT, qui diffusera les événements du journal (visites, rencontres) et le parc en direct. Avec plusieurs instances, il faudra un adaptateur Redis ou `LISTEN/NOTIFY` de PostgreSQL.
- **Notifications push** : pour prévenir sans simulation en tâche de fond, on peut calculer à l'avance la prochaine échéance (faim, caca, caprice) avec le moteur et la stocker, puis faire tourner un petit planificateur (`@nestjs/schedule`).
