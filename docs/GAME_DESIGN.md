# 2Tamago : règles du jeu

Toutes les valeurs sont dans [`shared/core/src/engine/rules.ts`](../shared/core/src/engine/rules.ts) (`DEFAULT_RULES`). Ce document en explique le sens. Les durées sont en **heures de jeu**. Avec `GAME_TIME_SCALE=1`, une heure de jeu dure une heure réelle ; avec `60`, une journée de jeu dure 24 minutes.

## Simulation

- Le compagnon est simulé **par pas de 5 minutes de jeu**, alignés sur une grille absolue. Le résultat est donc le même qu'on simule en une fois ou en plusieurs appels, ce qui permet au navigateur de prédire l'état sans interroger le serveur.
- Rien ne tourne en tâche de fond : l'état est rattrapé quand quelqu'un le consulte (le propriétaire, un visiteur, une action).
- La simulation est déterministe et n'utilise pas de hasard. Le hasard (objets trouvés en promenade) est tiré côté serveur, hors du moteur.

## Stades

| Stade  | Durée        | Particularités                                       |
| ------ | ------------ | ---------------------------------------------------- |
| Œuf    | 6 min        | Pas de besoins                                       |
| Bébé   | 12 h         | Besoins ×1,5. Ni caprices, ni dressage, ni promenade |
| Enfant | 48 h         | Besoins ×1,2                                         |
| Ado    | 72 h         |                                                      |
| Adulte | 240 h (10 j) | Besoins ×0,9                                         |
| Ancien | illimité     | Besoins ×1,1. Peut prendre sa retraite               |

Un compagnon bien soigné vit donc environ 16 jours avant de devenir ancien.

## Besoins (0 à 100, plus c'est haut, mieux c'est)

| Besoin     | Éveillé (par heure)        | Endormi (par heure) |
| ---------- | -------------------------- | ------------------- |
| Satiété    | −6                         | −2                  |
| Bonheur    | −5                         | −1                  |
| Énergie    | −6                         | **+12**             |
| Propreté   | −3, et −4 par caca présent | −1, et −4 par caca  |
| Discipline | −0,5                       | −0,5                |

- Il fait un caca toutes les 4 h quand il est éveillé et à la maison (4 au maximum).
- Il s'endort seul quand son énergie tombe à 0 (−10 bonheur) et se réveille quand elle est remontée à 100.

## Santé, maladie, départ

- **Pression de maladie** : chaque facteur (3 cacas ou plus, propreté < 20, satiété < 10, surpoids > 40) ajoute 1 par heure (0,5 pour le surpoids). À 2, il tombe malade. Sans facteur, la pression redescend.
- **Malade** : −1 santé/h, guéri après 2 doses de médicament.
- **Affamé** (satiété à 0) : −1,5 santé/h.
- **Bien portant** (pas malade, satiété > 40, bonheur > 30) : +2 santé/h.
- **Santé à 0** : le compagnon part (statut `gone`), ou reste à 1 PV si `GAME_DEPARTURE=false`. Un bébé totalement délaissé tient environ deux jours (vérifié par les tests).

## Erreurs de soin et évolution

Une **erreur de soin** est comptée quand l'une de ces situations dure plus d'une heure : satiété à 0, bonheur à 0, 4 cacas, maladie. Chaque erreur coûte aussi −5 de lien.

À chaque changement de stade, la forme est choisie selon les erreurs commises **pendant le stade qui se termine** :

| Forme     | Condition                                                            |
| --------- | -------------------------------------------------------------------- |
| Rayonnant | ≤ 1 erreur, discipline ≥ 50 et lien ≥ 30 (bébé : lien ≥ 5 seulement) |
| Chenapan  | ≥ 4 erreurs, ou discipline < 25 (sauf en sortant du stade bébé)      |
| Doux      | tous les autres cas                                                  |

## Caprices et discipline

À partir du stade enfant, il réclame de l'attention sans raison environ toutes les 10 h. On a 30 minutes pour réagir :

- **Gronder** pendant un caprice : discipline +25.
- **Gronder** sans caprice : bonheur −10, lien −3.
- **Féliciter** pendant un caprice : discipline −5.
- **Ignorer** le caprice : discipline −10.

## Actions

| Action                 | Effet                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Nourrir                | Satiété +35, poids +1. Refusé à partir de 95 de satiété                                                             |
| Friandise              | Selon l'objet (voir la boutique), lien +1                                                                           |
| Jouer (score de 0 à 3) | Bonheur +10 + 5 × score, énergie −10, satiété −3, poids −1, lien +2. Il faut au moins 10 d'énergie                  |
| Nettoyer               | Retire les cacas, propreté +40                                                                                      |
| Médicament             | Une dose (bonheur −5)                                                                                               |
| Coucher / Réveiller    | Coucher seulement si énergie < 90. Réveiller coûte −10 bonheur                                                      |
| Caresser               | Bonheur +3, lien +1, au plus une fois toutes les 15 s                                                               |
| Dresser                | Énergie −8, satiété −3, progrès de 8 × (1 + discipline/100), divisé par deux si bonheur < 50                        |
| Promenade (30 min)     | Au retour : bonheur +15, énergie −15, satiété −10, lien +3, 5 à 15 pièces, 25 % de chances de trouver une friandise |

## Économie

| Source                                                                | Pièces                       |
| --------------------------------------------------------------------- | ---------------------------- |
| Inscription                                                           | 50                           |
| Bonus quotidien                                                       | 20                           |
| Jouer / dresser                                                       | +2 / +1, au plus 30 par jour |
| Promenade                                                             | 5 à 15                       |
| Caresser le compagnon d'un autre (une fois par jour et par compagnon) | 3                            |

Prix : biscuit 8, fraise 12, lait chaud 15, gâteau 30, nœud 50, chapeau 80, lunettes 120, couronne 300.

## Interactions entre joueurs

- **Caresse d'un visiteur** : bonheur +8 pour le compagnon visité, une fois par jour et par visiteur.
- **Cadeau** : la friandise est donnée au compagnon visité (ses effets, sans le bonus de lien), et l'objet sort du sac du visiteur.
- **Rencontre** : deux promenades qui se chevauchent dans le temps créent une rencontre, 3 au maximum par promenade. Elle est visible au retour et dans le journal des deux joueurs.
