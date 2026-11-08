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

Les migrations sont générées par `drizzle-kit` (`make db-generate`) dans `api/drizzle/`, versionnées, et appliquées par l'API au démarrage. Contrairement au « schéma automatique » de 2Gatcha, elles sont explicites et relisibles.

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

- **Discord OAuth2** (code d'autorisation, `state` dans un cookie) avec le scope `guilds.members.read`. Seuls les membres de `DISCORD_GUILD_ID` peuvent se connecter.
- L'API émet un **JWT HS256** (`@nestjs/jwt`) dans un cookie `HttpOnly`, `SameSite=Lax`, valable 30 jours. Un en-tête `Authorization: Bearer` est aussi accepté pour les scripts et un futur client WebSocket.
- Un **garde global** protège toutes les routes ; `@Public()` marque les exceptions. `@CurrentSession()` donne l'identité au contrôleur, et un joueur n'agit que sur ses propres données.
- Les administrateurs sont listés dans **une seule** variable (`ADMIN_DISCORD_IDS`), ce qui corrige l'éparpillement constaté dans 2Gatcha.
- En dev, `AUTH_DEV_LOGIN=true` permet de se connecter avec un simple pseudo. La configuration refuse de démarrer en production avec ce mode actif, ou sans `AUTH_SECRET` d'au moins 32 caractères.

Le front et l'API partagent la même origine (proxy Vite en dev, Caddy en prod), donc il n'y a pas de CORS et le cookie fonctionne sans configuration.

### 6. Des contrats partagés

Les corps de requête sont des schémas **Zod** dans `@2tamago/core/contracts`. L'API les valide avec le `StandardSchemaValidationPipe` de Nest 12 (`@Body({ schema })`), et le client web importe les mêmes types. Une erreur de règle du moteur (`GameError`) devient une réponse `409` avec un `code` stable et un message en français affichable tel quel.

## Backend (`api/src`)

Un module Nest par domaine :

| Module             | Contenu                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| `config/`          | `AppConfig` : toutes les variables d'environnement validées une fois au démarrage, `Clock`, `GAME_RULES` |
| `database/`        | Schéma Drizzle, ouverture de la base et migrations, `DrizzleModule`                                      |
| `auth/`            | Garde global, cookie de session, Discord OAuth2, login de dev                                            |
| `players/`         | Joueurs, pièces (bonus quotidien, plafond journalier), inventaire                                        |
| `pets/`            | `GET /me`, adoption, actions du propriétaire, album, et `PetsService.mutate()`                           |
| `social/`          | Village (visites, caresses, cadeaux), promenades et rencontres                                           |
| `shop/`            | Achats                                                                                                   |
| `activity/`        | Journal du joueur, écrit dans la transaction de l'action qui le produit                                  |
| `game/`, `health/` | Règles publiques, sonde de santé                                                                         |

`Clock` est injectable, ce qui permet aux tests e2e de **voyager dans le temps** (faire éclore un œuf, laisser partir un compagnon délaissé).

### Routes (`/api/…`)

| Méthode et route                                                                                     | Rôle                                                                        |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `GET /health` · `GET /game/rules` · `GET /auth/config`                                               | Publiques                                                                   |
| `GET /auth/discord` · `GET /auth/discord/callback` · `POST /auth/dev-login` · `POST /auth/logout`    | Connexion                                                                   |
| `GET /me`                                                                                            | Joueur, compagnon (rattrapé), inventaire et heure serveur, en un seul appel |
| `POST /pet` · `POST /pet/actions` · `GET /album`                                                     | Adoption, actions (`{type: 'feed' \| 'play' \| …}`), album                  |
| `POST /pet/walk` · `POST /pet/walk/return`                                                           | Promenades                                                                  |
| `GET /village` · `GET /village/:petId` · `POST /village/:petId/caress` · `POST /village/:petId/gift` | Social                                                                      |
| `POST /shop/buy` · `GET /activity` · `POST /activity/read`                                           | Boutique, journal                                                           |

### Modèle de données

`players` · `pets` (état en JSONB, un seul vivant par joueur grâce à un index unique partiel) · `inventory` · `interactions` (caresses et cadeaux, une caresse par jour grâce à un index unique partiel) · `walks` · `encounters` (paires de promenades) · `activity`.

## Frontend (`web/src`)

| Emplacement                       | Rôle                                                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `lib/api.ts`                      | Client `fetch` typé par les contrats, avec une `ApiError` qui porte le `code`                             |
| `lib/game.svelte.ts`              | Store de jeu en runes : instantané reçu de l'API, prédiction locale avec `simulate()`, actions, minuteurs |
| `lib/components/PetSprite.svelte` | Rendu SVG du compagnon (espèce, stade, forme, humeur, accessoire) et détection des caresses au pointeur   |
| `lib/texts.ts`                    | Tous les textes de l'interface, en français                                                               |
| `routes/`                         | `/` (maison), `/login`, `/village`, `/village/[petId]`, `/shop`, `/journal`, `/album`                     |

## Ajouter une fonctionnalité

1. **Une règle de jeu** (nouvelle action, nouvel effet) : l'ajouter au moteur (`shared/core/src/engine`) avec un test, puis au schéma de requête dans `contracts/` si le joueur peut la déclencher. L'API et le front en profitent sans autre changement.
2. **Des données** : modifier `api/src/database/schema.ts`, puis lancer `make db-generate` et versionner la migration produite.
3. **Un domaine** : créer un module Nest dans `api/src/<domaine>/`, passer par `PetsService.mutate()` pour toucher un compagnon, enregistrer les effets dans le journal avec la transaction en cours, et ajouter un scénario e2e.
4. **Un écran** : ajouter une route dans `web/src/routes/` et une méthode dans `lib/api.ts`.

## Tests

| Commande                                    | Contenu                                                                                                                                                                                                                                             |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @2tamago/core test`          | Moteur : déterminisme, décroissance, maladie, départ, évolution, actions                                                                                                                                                                            |
| `pnpm --filter @2tamago/api test`           | Configuration, et scénarios e2e sur une base PGlite en mémoire (ou sur PostgreSQL si `TEST_DATABASE_URL` est défini, comme en CI) avec une horloge simulée (cycle de vie, départ puis nouvelle adoption, village, cadeaux, rencontres en promenade) |
| `pnpm --filter @2tamago/web test` / `check` | Textes, et vérification de types Svelte                                                                                                                                                                                                             |

## Docker et environnements

- **Images** : chaque service a son `Dockerfile` (étapes `deps`, `build`, `prod`) et son `Dockerfile.dockerignore`, qui n'envoie au build que le service, `shared/core` et les fichiers de l'espace de travail. Le contexte de build est la racine du dépôt (`docker build -f api/Dockerfile .`), car les services dépendent de `shared/` et du lockfile.
  - `api` : Node 24 avec les seules dépendances de production. L'API applique les migrations au démarrage.
  - `web` : Caddy, qui sert le site statique et relaie `/api/*` vers `API_UPSTREAM` (`api:3000` par défaut).
- **Dev (devcontainer)** : `make dev`, sans Docker, avec PGlite. Le `Makefile` réunit les commandes courantes.
- **Stack locale** (`docker-compose.yml`) : PostgreSQL, API et web construits depuis les sources (`make up`, <http://localhost:8080>). Le projet compose porte le même nom que celui du devcontainer : ses services sont donc sur le même réseau, et le devcontainer joint `db:5432` (`make db-up`) ou `web`.
- **Production et préproduction** (`docker-compose.prod.yml`) : un fichier autonome qui tire les images publiées (`REGISTRY`, `TAG`) et exige les secrets (`AUTH_SECRET`, `POSTGRES_PASSWORD`, Discord). Caddy gère le HTTPS avec `SITE_ADDRESS`.
- **CI** (GitHub Actions) : formatage, build, types et tests, puis publication sur `main` des images multi-architecture (amd64 et arm64) sur ghcr.io.
- Sauvegardes : à mettre en place avec `pg_dump` (voir la roadmap).

## Évolutions prévues

- **Temps réel** : un gateway `@nestjs/websockets` authentifié par le même JWT, qui diffusera les événements du journal (visites, rencontres) et le parc en direct. Avec plusieurs instances, il faudra un adaptateur Redis ou `LISTEN/NOTIFY` de PostgreSQL.
- **Réglages en base** : les `GameRules` sont aujourd'hui construites depuis l'environnement. Les lire depuis une table éditable par les admins ne change que le fournisseur `GAME_RULES`.
- **Notifications push** : pour prévenir sans simulation en tâche de fond, on peut calculer à l'avance la prochaine échéance (faim, caca, caprice) avec le moteur et la stocker, puis faire tourner un petit planificateur (`@nestjs/schedule`).
