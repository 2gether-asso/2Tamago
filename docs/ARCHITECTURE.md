# 2Tamago : architecture

## Vue d'ensemble

```
apps/web  (SvelteKit 3, SPA statique)          packages/core  (TypeScript pur)
   │  fetch /api/*  (cookie de session)          ├─ engine/     règles du jeu : simulate(), applyAction()
   │  simule localement avec @2tamago/core ◄─────┤              types, catalogue, humeurs
   ▼                                             └─ contracts/  schémas Zod des requêtes, types des réponses
Caddy  ── /api/* ──►  apps/api  (NestJS 12) ◄──── utilise les mêmes règles
                          │  Drizzle ORM
                          ▼
                      PostgreSQL  (PGlite embarqué en dev et en test)
```

C'est un monorepo pnpm de trois paquets :

| Paquet                            | Rôle                                                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core` (`@2tamago/core`) | Le **moteur de jeu**, pur et déterministe, sans I/O, et les **contrats d'API** partagés. Toute règle du jeu vit ici.                |
| `apps/api` (`@2tamago/api`)       | L'**autorité** : identité, persistance, économie, interactions entre joueurs. Il appelle le moteur et ne réimplémente aucune règle. |
| `apps/web` (`@2tamago/web`)       | L'**interface**. Elle affiche l'état reçu de l'API et le fait avancer localement avec le même moteur entre deux appels.             |

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

### 3. PostgreSQL partout, sans Docker en dev

`DATABASE_URL` choisit le pilote (voir `apps/api/src/database/database.ts`) :

| URL                     | Usage                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| `postgres://…`          | Production (`node-postgres`)                                                              |
| `pglite://.data/pglite` | Développement : PostgreSQL embarqué (WASM), stocké dans un dossier, sans rien à installer |
| `memory://`             | Tests : une base neuve en mémoire pour chaque application                                 |

C'est le même moteur SQL dans les trois cas. Les migrations sont générées par `drizzle-kit` (`pnpm --filter @2tamago/api db:generate`) dans `apps/api/drizzle/`, versionnées, et appliquées par l'API au démarrage. Contrairement au « schéma automatique » de 2Gatcha, elles sont explicites et relisibles.

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

## Backend (`apps/api/src`)

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

## Frontend (`apps/web/src`)

| Emplacement                       | Rôle                                                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `lib/api.ts`                      | Client `fetch` typé par les contrats, avec une `ApiError` qui porte le `code`                             |
| `lib/game.svelte.ts`              | Store de jeu en runes : instantané reçu de l'API, prédiction locale avec `simulate()`, actions, minuteurs |
| `lib/components/PetSprite.svelte` | Rendu SVG du compagnon (espèce, stade, forme, humeur, accessoire) et détection des caresses au pointeur   |
| `lib/texts.ts`                    | Tous les textes de l'interface, en français                                                               |
| `routes/`                         | `/` (maison), `/login`, `/village`, `/village/[petId]`, `/shop`, `/journal`, `/album`                     |

## Ajouter une fonctionnalité

1. **Une règle de jeu** (nouvelle action, nouvel effet) : l'ajouter au moteur (`packages/core/src/engine`) avec un test, puis au schéma de requête dans `contracts/` si le joueur peut la déclencher. L'API et le front en profitent sans autre changement.
2. **Des données** : modifier `apps/api/src/database/schema.ts`, puis lancer `pnpm --filter @2tamago/api db:generate` et versionner la migration produite.
3. **Un domaine** : créer un module Nest dans `apps/api/src/<domaine>/`, passer par `PetsService.mutate()` pour toucher un compagnon, enregistrer les effets dans le journal avec la transaction en cours, et ajouter un scénario e2e.
4. **Un écran** : ajouter une route dans `apps/web/src/routes/` et une méthode dans `lib/api.ts`.

## Tests

| Commande                                    | Contenu                                                                                                                                                                                |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @2tamago/core test`          | Moteur : déterminisme, décroissance, maladie, départ, évolution, actions                                                                                                               |
| `pnpm --filter @2tamago/api test`           | Configuration, et scénarios e2e sur une vraie base PGlite en mémoire avec une horloge simulée (cycle de vie, départ puis nouvelle adoption, village, cadeaux, rencontres en promenade) |
| `pnpm --filter @2tamago/web test` / `check` | Textes, et vérification de types Svelte                                                                                                                                                |

## Déploiement

- La CI GitHub Actions vérifie le formatage, le build, les types et les tests, puis publie sur `main` deux images multi-architecture : `ghcr.io/<owner>/2tamago-api` (Node 24) et `ghcr.io/<owner>/2tamago-web` (Caddy et le site statique).
- `deploy/compose.yml` lance `web` (Caddy, HTTPS automatique avec `SITE_ADDRESS`), `api` et `db` (PostgreSQL 17). Mise à jour : `docker compose pull && docker compose up -d`. L'API applique les migrations au démarrage.
- Sauvegardes : à mettre en place avec `pg_dump` (voir la roadmap).

## Évolutions prévues

- **Temps réel** : un gateway `@nestjs/websockets` authentifié par le même JWT, qui diffusera les événements du journal (visites, rencontres) et le parc en direct. Avec plusieurs instances, il faudra un adaptateur Redis ou `LISTEN/NOTIFY` de PostgreSQL.
- **Réglages en base** : les `GameRules` sont aujourd'hui construites depuis l'environnement. Les lire depuis une table éditable par les admins ne change que le fournisseur `GAME_RULES`.
- **Notifications push** : pour prévenir sans simulation en tâche de fond, on peut calculer à l'avance la prochaine échéance (faim, caca, caprice) avec le moteur et la stocker, puis faire tourner un petit planificateur (`@nestjs/schedule`).
