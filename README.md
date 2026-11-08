# 2Tamago

Le compagnon virtuel de **2GETHER**. On adopte un œuf, on prend soin de la créature qui en sort (la nourrir, la laver, la soigner, la recadrer, jouer avec elle) pendant qu'elle grandit en temps réel. On la caresse, on lui apprend des tours, on la promène. Et on n'est pas seul : on rend visite aux compagnons des autres membres, on leur offre des friandises, et nos compagnons se croisent en promenade.

Le jeu reprend la boucle de soins de Tamagotchi, le lien affectif de Nintendogs et y ajoute un multijoueur asynchrone. Voir [docs/FEATURES.md](docs/FEATURES.md).

## Stack

|               |                                                                        |
| ------------- | ---------------------------------------------------------------------- |
| Front         | SvelteKit 3 (Svelte 5) en SPA statique, rendu SVG                      |
| API           | NestJS 12 (ESM), Drizzle ORM, Zod                                      |
| Base          | PostgreSQL, ou PGlite embarqué en dev et en test                       |
| Règles du jeu | `@2tamago/core` : moteur TypeScript pur, partagé par le front et l'API |
| Déploiement   | Docker : Caddy + API + PostgreSQL, CI GitHub Actions                   |

## Démarrer

Prérequis : le devcontainer (Node 24, pnpm, Docker CLI). `make` affiche toutes les commandes.

```bash
make dev
```

Ouvrir <http://localhost:4321> et se connecter avec un pseudo (mode dev). Il n'y a pas de base à installer : en dev, l'API utilise PGlite et stocke ses données dans `api/.data/`. Au premier lancement, `api/.env` est créé à partir de `api/.env.example`.

- Pour voir le jeu avancer vite, mettre `GAME_TIME_SCALE=60` dans `api/.env` : une journée de jeu dure alors 24 minutes.
- Pour développer contre un vrai PostgreSQL : `make db-up`, puis `DATABASE_URL=postgres://tamago:tamago@db:5432/tamago` dans `api/.env`.
- Pour se connecter avec Discord en local, créer une application sur le [portail développeur Discord](https://discord.com/developers/applications), ajouter `http://localhost:4321/api/auth/discord/callback` aux redirections, puis renseigner `DISCORD_*` dans `api/.env`. Le guide complet (connexion, annonces dans un salon, dépannage) est dans [docs/DISCORD.md](docs/DISCORD.md).

## Commandes

| Commande                                                                                  | Effet                                                                           |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `make dev`                                                                                | Moteur (watch), API sur :3000 et front sur :4321 (qui relaie `/api`)            |
| `make build` / `make test` / `make test-e2e` / `make check` / `make lint` / `make format` | Build, tests (moteur, API avec e2e, front), types, Biome (lint), Prettier       |
| `make ci`                                                                                 | Ce que lance la CI                                                              |
| `make db-generate`                                                                        | Génère une migration SQL après une modification de `api/src/database/schema.ts` |
| `make db-up` / `make db-down`                                                             | PostgreSQL seul, joignable depuis le devcontainer à l'adresse `db:5432`         |
| `make up` / `make down` / `make logs`                                                     | Stack complète construite depuis les sources, sur <http://localhost:8080>       |

## Structure

Chaque service est à la racine avec son `Dockerfile`, et le code partagé est dans `shared/`. Un futur service écrit dans un autre langage se rangera à côté, sans faire partie de l'espace de travail pnpm.

```
api/                    API NestJS : auth Discord, joueurs et profils, compagnons, village, boutique, journal, avis, annonces, statistiques admin
web/                    Front SvelteKit, et le Caddyfile de son image
shared/core/            Moteur de jeu (règles, simulation) et contrats d'API partagés
docs/                   Fonctionnalités, architecture, règles du jeu, traductions, Discord
docker-compose.yml      Stack locale construite depuis les sources (PostgreSQL + API + web)
docker-compose.prod.yml Production ou préproduction, à partir des images publiées
Makefile                Commandes courantes
```

## Documentation

- [docs/FEATURES.md](docs/FEATURES.md) : fonctionnalités livrées et roadmap
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) : structure, choix techniques et comment ajouter une fonctionnalité
- [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) : règles et équilibrage
- [docs/I18N.md](docs/I18N.md) : l'interface en français et en anglais, et comment ajouter un texte
- [docs/DISCORD.md](docs/DISCORD.md) : connexion Discord, annonces dans un salon, dépannage

## Mettre en production

Le workflow `docker.yml` publie les images `ghcr.io/2gether-asso/2tamago-api` et `2tamago-web` à chaque push sur `main` (tag `latest`) et pour chaque tag `vX.Y.Z` (tags `X.Y.Z`, `X.Y`, `X`). Sur le serveur, seuls `docker-compose.prod.yml`, le `Makefile` (facultatif) et un `.env` sont nécessaires :

```bash
cp .env.example .env   # renseigner SITE_ADDRESS, les secrets et Discord
make prod-pull prod-up
```

Caddy obtient le certificat HTTPS tout seul pour `SITE_ADDRESS`. Pour mettre à jour, relancer `make prod-pull prod-up`. Pour une préproduction, utiliser un autre dossier avec son propre `.env` et un autre `TAG`.
