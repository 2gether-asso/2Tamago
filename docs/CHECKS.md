# Vérifications ciblées (`BASE`)

Pour relire plus vite, les cibles de vérification peuvent se limiter à ce qui a changé depuis un commit de référence, comme le diff d'une PR :

```sh
BASE=origin/main make check-format lint check check-build test
BASE=origin/main make test-e2e
```

`BASE` est n'importe quelle référence git. La comparaison part du **merge-base** de `BASE` et de `HEAD` (donc des seuls changements de la branche) et inclut les fichiers **non commités et non suivis**. Sans `BASE`, chaque cible traite tout, comme avant. La logique est dans `scripts/affected.mjs`.

| Cible          | Avec `BASE`                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `format`       | Prettier réécrit les seuls fichiers modifiés (`.prettierignore` respecté)                                              |
| `check-format` | Prettier vérifie les seuls fichiers modifiés                                                                           |
| `lint`         | Biome ne lit que les fichiers modifiés                                                                                 |
| `check`        | Types des seuls paquets touchés (pas de granularité fichier)                                                           |
| `check-build`  | Build des seuls paquets touchés, moteur d'abord                                                                        |
| `test`         | `vitest --changed` : seuls les tests qui importent du code modifié (API : unitaires et e2e)                            |
| `test-e2e`     | Playwright : tout si l'API, le front ou le moteur changent ; `--only-changed` si seuls `web/e2e` changent ; rien sinon |

`make build` reste **global** (il sert aux déploiements) et ignore `BASE`.

## Quels paquets sont touchés

- Un fichier de `api/` ou `web/` touche ce paquet.
- Un fichier de `shared/core/` touche le moteur **et** ses dépendants `api` et `web`, qui sont alors traités en entier : le graphe d'imports de Vitest s'arrête à la frontière du paquet.
- `package.json` racine, `pnpm-lock.yaml`, `pnpm-workspace.yaml` et `tsconfig.base.json` touchent tout.
- Les autres fichiers (docs, workflows, Dockerfiles…) ne déclenchent ni test, ni type-check, ni build ; seuls le format et le lint les regardent.

## Limites

Ces cibles **ne garantissent pas l'exhaustivité** : elles servent à relire et à itérer vite. Une dépendance que le graphe d'imports ne voit pas (fichier lu à l'exécution, configuration, schéma de base) peut échapper à `--changed`. La CI, `make ci` et tout `make <cible>` sans `BASE` restent exhaustifs : c'est eux qui font foi avant de fusionner.

`BASE=… make ci` n'est pas exhaustif non plus, puisque `BASE` s'applique aux cibles qu'il enchaîne.
