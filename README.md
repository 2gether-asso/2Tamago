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

Prérequis : Node 24 et pnpm (le devcontainer les fournit).

```bash
pnpm install
pnpm dev
```

Ouvrir <http://localhost:4321> et se connecter avec un pseudo (mode dev). Pas de Docker ni de base à installer : en dev, l'API utilise PGlite et stocke ses données dans `apps/api/.data/`. Au premier lancement, `apps/api/.env` est créé à partir de `.env.example`.

Pour voir le jeu avancer vite, mettre `GAME_TIME_SCALE=60` dans `apps/api/.env` : une journée de jeu dure alors 24 minutes.

Pour se connecter avec Discord en local, créer une application sur le [portail développeur Discord](https://discord.com/developers/applications), ajouter `http://localhost:4321/api/auth/discord/callback` aux redirections, puis renseigner `DISCORD_*` dans `apps/api/.env`.

## Commandes

| Commande                                 | Effet                                                                |
| ---------------------------------------- | -------------------------------------------------------------------- |
| `pnpm dev`                               | Moteur (watch), API sur :3000 et front sur :4321 (qui relaie `/api`) |
| `pnpm build`                             | Build des trois paquets                                              |
| `pnpm test`                              | Tests du moteur, de l'API (dont les e2e) et du front                 |
| `pnpm check`                             | Vérification des types                                               |
| `pnpm format`                            | Prettier                                                             |
| `pnpm --filter @2tamago/api db:generate` | Génère une migration SQL après une modification de `schema.ts`       |

## Structure

```
packages/core/     Moteur de jeu (règles, simulation) et contrats d'API partagés
apps/api/          API NestJS : auth, joueurs, compagnons, village, boutique, journal
apps/web/          Front SvelteKit
deploy/            compose.yml de production, Caddyfile, .env.example
docs/              Fonctionnalités, architecture, règles du jeu
```

## Documentation

- [docs/FEATURES.md](docs/FEATURES.md) : fonctionnalités livrées et roadmap
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) : structure, choix techniques et comment ajouter une fonctionnalité
- [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) : règles et équilibrage

## Mettre en production

Sur le serveur, avec Docker :

```bash
cd deploy
cp .env.example .env   # renseigner le domaine, les secrets et Discord
docker compose up -d
```

Caddy obtient le certificat HTTPS tout seul pour `SITE_ADDRESS`. Pour mettre à jour : `docker compose pull && docker compose up -d`.
