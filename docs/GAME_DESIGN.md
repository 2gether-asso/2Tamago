# 2Tamago : règles du jeu

Toutes les valeurs sont dans [`shared/core/src/engine/rules.ts`](../shared/core/src/engine/rules.ts) (`DEFAULT_RULES`). Ce document en explique le sens. Les durées sont en **heures de jeu**. Avec `GAME_TIME_SCALE=1`, une heure de jeu dure une heure réelle ; avec `60`, une journée de jeu dure 24 minutes.

## Simulation

- Le compagnon est simulé **par pas de 5 minutes de jeu**, alignés sur une grille absolue. Le résultat est donc le même qu'on simule en une fois ou en plusieurs appels, ce qui permet au navigateur de prédire l'état sans interroger le serveur.
- Rien ne tourne en tâche de fond : l'état est rattrapé quand quelqu'un le consulte (le propriétaire, un visiteur, une action).
- La simulation est déterministe et n'utilise pas de hasard. Le hasard (objets trouvés en promenade, graine des traits du compagnon) est tiré côté serveur, hors du moteur.

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

## Garderie

Pour s'absenter sans pause, on peut **confier son compagnon à un autre membre** (bouton « Lui confier mon compagnon » sur son profil). Le temps continue de passer : le gardien s'occupe du compagnon à la place du propriétaire.

- **Invitation** : le gardien la reçoit dans son journal et sur la page du village, et l'accepte ou la refuse. Sans réponse, elle expire au bout de 48 h. Un compagnon n'a qu'une garderie ou invitation à la fois (`daycare_exists`), et un membre ne garde que 2 compagnons à la fois (`daycare_full`).
- **Ce que le gardien peut faire** : nourrir, nettoyer, soigner, coucher, réveiller, régler la lumière, féliciter, gronder, caresser (`CARETAKER_ACTION_TYPES`). Pas dresser, jouer, offrir des objets, équiper, promener, partir en vacances ni prendre la retraite : ce sont les choix du propriétaire. Les règles du moteur s'appliquent comme pour le propriétaire (`not_hungry`, `asleep`…), qui peut lui aussi continuer de s'occuper de son compagnon.
- **Récompense** : 2 pièces par soin qui compte (nourrir, nettoyer, soigner), dans la limite de 30 pièces par jour partagée avec le jeu et le dressage. Les caresses ne rapportent rien et n'encombrent pas le journal du propriétaire ; les autres soins y apparaissent.
- **Fin** : le propriétaire reprend son compagnon (ou annule l'invitation), le gardien le rend, ou le séjour se termine de lui-même après 14 jours. Il se termine aussi si le compagnon part ou prend sa retraite. L'autre personne est prévenue dans son journal.
- **Pas de nouvelle règle du jeu** : le séjour est de la gestion d'accès (qui peut agir), pas de la simulation. Le moteur ne connaît que la liste des actions permises ; les durées (48 h, 14 jours, 2 compagnons) sont des constantes en temps réel de `api/src/social/daycare.ts`.

## Échanges

Deux membres peuvent s'échanger des objets (friandises, accessoires, et les objets qu'on ne trouve qu'en promenade) : bouton « Proposer un échange » sur le profil de l'autre. On ne s'échange pas de pièces.

- **L'offre** : ce qu'on donne, et ce qu'on demande en échange (rien : c'est un cadeau). Jusqu'à 4 objets différents de chaque côté, 10 exemplaires au plus de chacun, un seul pour un accessoire (`TRADE_LIMITS`, `tradeProblem()` dans `shared/core/src/engine/trade.ts`). Il faut donner quelque chose, et pas le même objet des deux côtés.
- **Mise de côté** : faire une offre retire tout de suite les objets donnés du sac, pour qu'ils ne puissent pas être dépensés ou offerts ailleurs pendant l'attente. Un manque refuse l'offre sans rien retirer (`missing_item`). On ne peut avoir que 3 offres en attente (`trade_full`).
- **La réponse** : l'autre membre accepte ou refuse depuis la page du village ; le proposeur peut retirer son offre. Accepter échange les deux côtés **en une seule transaction** : si l'accepteur n'a pas ce qu'on lui demande (`missing_item`), rien ne bouge et l'offre reste ouverte. Deux réponses simultanées ne concluent qu'un échange (chaque changement d'état est pris par un `UPDATE … WHERE status = 'pending'`).
- **Rendu** : un refus, un retrait, ou 72 h sans réponse rendent les objets au proposeur, qui en est informé dans son journal.
- **Un accessoire ne se porte qu'une fois** : on ne donne pas un accessoire à quelqu'un qui l'a déjà, ni on n'en demande un qu'on a déjà (`trade_invalid`).
- **Qui** : n'importe quel membre, pas seulement les favoris : les favoris sont privés et à sens unique (voir [FEATURES.md](FEATURES.md)), un échange demande l'accord de l'autre de toute façon, et les offres en attente sont plafonnées.
- **Prévenir** : l'offre arrive dans le journal du destinataire et, s'il a activé les notifications, par un push (un clic ouvre le village).

## Promenades

Avant de partir, le joueur choisit une **zone** (`WALK_ZONES`, dans `shared/core/src/engine/zones.ts`). Sans choix, c'est la prairie, comme avant l'arrivée des zones.

| Zone    | Dès le stade | Durée (× `outingHours`) | Énergie | Satiété | Lien | Pièces  | Objet trouvé | Ce qu'on y trouve                                                     |
| ------- | ------------ | ----------------------- | ------- | ------- | ---- | ------- | ------------ | --------------------------------------------------------------------- |
| Prairie | enfant       | 30 min (×1)             | −15     | −10     | +3   | 5 à 15  | 25 %         | biscuit, fraise, lait chaud, gâteau, rarement une couronne de fleurs  |
| Forêt   | ado          | 1 h (×2)                | −25     | −15     | +4   | 10 à 22 | 45 %         | mûre, champignon, fraise, lait chaud, rarement une couronne de fleurs |
| Plage   | adulte       | 2 h (×4)                | −35     | −20     | +5   | 20 à 40 | 30 %         | noix de coco, glace, gâteau, étoile de mer                            |

- **Énergie** : il faut le coût de la zone plus 5 pour partir (`too_tired` sinon). Un compagnon trop jeune se voit refuser la zone (`zone_locked`) ; un bébé ne part pas du tout (`too_young`).
- **Le hasard est tiré hors du moteur** : `rollFinds(zone, random)` est pure, elle reçoit la fonction de tirage (l'API passe `Math.random`, les tests des valeurs fixes). Les pièces sont tirées dans l'intervalle de la zone, puis une chance de trouver un objet, choisi selon les poids de la zone.
- **Les accessoires ne se trouvent qu'une fois** : trouver un accessoire qu'on possède déjà ne rapporte rien (les friandises, elles, s'empilent).
- **Les rencontres** ne dépendent pas de la zone : deux promenades qui se chevauchent dans le temps se croisent, où qu'elles aillent.
- **Données** : la zone est dans `outing.zone` (absente sur une promenade commencée avant les zones : c'est la prairie) et dans la colonne `walks.zone`. Toutes les valeurs du tableau sont dans `zones.ts` ; seule la durée de base (`outingHours`) se règle depuis l'écran Admin.

## Vacances

Le propriétaire peut mettre son compagnon en pause (« Partir en vacances » sur l'écran d'accueil), pour ne pas le voir partir pendant un voyage.

- **La simulation s'arrête** : besoins, cacas, maladie, caprices, sommeil et croissance ne bougent plus (`simulate()` rend l'état tel quel). Aucune alerte, aucune notification, et l'humeur est « En vacances ».
- **Le temps d'absence ne compte pas** : au retour, toutes les dates que le compagnon attendait (naissance, début du stade, prochain caca, prochain caprice, début de la maladie, besoins en cours) sont repoussées d'autant. Il ne vieillit donc pas, et rien n'est dû à l'instant du retour. Un test vérifie qu'une vie avec une pause au milieu donne le même compagnon qu'une vie sans.
- **Rien d'autre n'est possible** : toute action est refusée (`on_vacation`), sauf « Revenir de vacances ». Les visiteurs ne peuvent ni caresser ni offrir de friandise ; ils voient le compagnon, avec son humeur.
- **Où et quand** : pas pour un œuf, pas pendant une promenade.
- **Des limites contre les abus** : les vacances se terminent d'elles-mêmes au bout de `vacationMaxHours` (14 jours), et on ne repart qu'après `vacationCooldownHours` (7 jours) depuis le retour (`vacation_cooldown`). Les deux sont des règles modifiables depuis l'écran Admin, en heures de jeu comme les autres durées. Le retour automatique est calculé par `simulate()` à l'instant exact de la limite, donc il ne dépend pas du moment où quelqu'un ouvre l'application ; il apparaît dans le journal.
- **La garderie est l'autre façon de s'absenter** : voir « Garderie » ci-dessous. Les deux ne se cumulent pas (on ne confie pas un compagnon en vacances, qui n'a besoin de personne).

## Erreurs de soin et évolution

Une **erreur de soin** est comptée quand l'une de ces situations dure plus d'une heure : satiété à 0, bonheur à 0, 4 cacas, maladie. Chaque erreur coûte aussi −5 de lien.

À chaque changement de stade, la forme est choisie selon les erreurs commises **pendant le stade qui se termine** :

| Forme     | Condition                                                            |
| --------- | -------------------------------------------------------------------- |
| Rayonnant | ≤ 1 erreur, discipline ≥ 50 et lien ≥ 30 (bébé : lien ≥ 5 seulement) |
| Chenapan  | ≥ 4 erreurs, ou discipline < 25 (sauf en sortant du stade bébé)      |
| Doux      | tous les autres cas                                                  |

## Jour et nuit

Le jeu a un cycle jour/nuit calé sur l'horloge du **fuseau configuré** (`GAME_TIMEZONE`, heure d'été comprise : le décalage est recalculé toutes les 30 s). Avec une vitesse du temps accélérée, la journée du jeu est accélérée aussi.

**Heure du coucher par stade.** Chaque stade a sa propre nuit : les petits se couchent plus tôt et se lèvent plus tard.

| Stade  | Coucher | Lever |
| ------ | ------- | ----- |
| Bébé   | 19 h    | 8 h   |
| Enfant | 20 h    | 7 h   |
| Ado    | 21 h    | 7 h   |
| Adulte | 22 h    | 7 h   |
| Ancien | 21 h    | 8 h   |

L'œuf n'a pas de nuit. Les heures générales de la règle `night` (`startHour` 21, `endHour` 7) servent aux stades qui n'ont pas la leur. L'écran d'accueil affiche l'heure de coucher du compagnon. Quand il change de stade, il adopte la nuit du nouveau stade.

- **Lumière allumée à l'heure du coucher** : un compagnon éveillé est agité, son bonheur baisse **×1,5** plus vite (`awakeHappinessFactor`). Un rappel s'affiche. Ça ne s'applique pas pendant une promenade.
- **Lumière éteinte** (action réservée à l'heure du coucher du stade) : il s'endort tout seul, sans le malus de l'épuisement, et **dort jusqu'au lever** même avec l'énergie pleine.
- **Au lever**, la lumière se rallume toute seule et il se réveille (s'il a récupéré toute son énergie).
- **Réveiller** un compagnon rallume la lumière (sinon il se rendormirait aussitôt). Coucher, réveiller et l'épuisement fonctionnent comme avant.
- Tout est réglable depuis l'écran Admin (`night`) : heures générales, heures de chaque stade (`stages`), décalage horaire, facteur. Si le début et la fin sont égaux, il n'y a pas de nuit. Les surcharges sont **fusionnées clé par clé, à tous les niveaux** : `{ "night": { "stages": { "baby": { "startHour": 18 } } } }` ne change que le coucher des bébés.

## Caprices et discipline

À partir du stade enfant, il réclame de l'attention sans raison environ toutes les 10 h. On a 30 minutes pour réagir :

- **Gronder** pendant un caprice : discipline +25.
- **Gronder** sans caprice : bonheur −10, lien −3.
- **Féliciter** pendant un caprice : discipline −5.
- **Ignorer** le caprice : discipline −10.

## Espèces, apparence et tempérament

Six espèces, toutes des créatures abstraites qui évoquent un animal : **Mochi** (blob), **Pyon** (lapin), **Kumo** (nuage), **Koro** (chien), **Nyao** (chat) et **Toge** (hérisson). **Les espèces sont purement visuelles** : aucune n'a de règle propre, aucune n'est meilleure qu'une autre.

À l'adoption, le joueur choisit l'espèce, la teinte et le nom. Le serveur tire en plus une **graine aléatoire** dont le moteur déduit (`rollTraits`, `shared/core/src/engine/traits.ts`) :

- un **motif** de pelage : uni, taches, rayures ou dégradé (cosmétique) ;
- un style d'**yeux** : ronds, endormis, brillants ou rusés (cosmétique) ;
- un **tempérament**, qui modifie légèrement les règles.

Les traits sont stockés dans l'état du compagnon et révélés à l'éclosion (le journal et la page d'accueil l'annoncent). Tant que c'est un œuf, **l'API ne les envoie pas** (ni au propriétaire ni dans le village) : le navigateur ne peut donc pas les lire à l'avance, et il recharge l'état du serveur dès que sa prédiction locale voit l'éclosion. Un compagnon créé avant l'ajout des traits en reçoit de façon déterministe à partir de son nom et de sa date de naissance.

Le tempérament est tiré **indépendamment de l'espèce**. Chacun a **un avantage et un inconvénient**, avec des multiplicateurs bornés entre ×0,7 et ×1,5 (un test le vérifie pour tout tempérament ajouté) :

| Tempérament | Avantage                           | Inconvénient                 |
| ----------- | ---------------------------------- | ---------------------------- |
| Gourmand    | bonheur baisse ×0,85               | satiété baisse ×1,3          |
| Dormeur     | récupère l'énergie ×1,3 en dormant | énergie baisse ×1,3          |
| Câlin       | lien gagné par caresse ×1,5        | bonheur baisse ×1,2          |
| Farceur     | satiété baisse ×0,85               | caprices ×1,4 plus fréquents |
| Propre      | propreté baisse ×0,7               | énergie baisse ×1,15         |
| Costaud     | perte de santé malade ×0,7         | satiété baisse ×1,15         |

Les valeurs sont la règle `temperaments` de `GameRules` : un admin peut les modifier depuis l'écran Admin (JSON), par exemple `{ "temperaments": { "greedy": { "satietyDecay": 1.2 } } }`. Une surcharge ne change que les multiplicateurs donnés (on ne peut pas en retirer un, seulement le mettre à 1) ; chaque valeur doit rester entre ×0,5 et ×2. L'admin peut casser la règle « un avantage, un inconvénient » ; seules les valeurs par défaut sont contrôlées par un test.

## Actions

| Action                 | Effet                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Nourrir                | Satiété +35, poids +1. Refusé à partir de 95 de satiété                                                                        |
| Friandise              | Selon l'objet (voir la boutique), lien +1                                                                                      |
| Jouer (score de 0 à 3) | Bonheur +10 + 5 × score, énergie −10, satiété −3, poids −1, lien +2. Il faut au moins 10 d'énergie                             |
| Nettoyer               | Retire les cacas, propreté +40                                                                                                 |
| Médicament             | Une dose (bonheur −5)                                                                                                          |
| Coucher / Réveiller    | Coucher seulement si énergie < 90. Réveiller coûte −10 bonheur                                                                 |
| Lumière                | Éteindre : seulement la nuit. Rallumer : à tout moment (voir « Jour et nuit »)                                                 |
| Caresser               | Bonheur +3, lien +1, au plus une fois toutes les 15 s                                                                          |
| Dresser                | Énergie −8, satiété −3, progrès de 8 × (1 + discipline/100), divisé par deux si bonheur < 50                                   |
| Vacances / Retour      | Pause complète du compagnon, voir « Vacances ». Refusé pour un œuf ou pendant une promenade                                    |
| Promenade              | Selon la zone (voir « Promenades »). Au retour : bonheur +15, énergie, satiété et lien selon la zone, pièces et objets trouvés |

## Économie

| Source                                                                | Pièces                             |
| --------------------------------------------------------------------- | ---------------------------------- |
| Inscription                                                           | 50                                 |
| Bonus quotidien                                                       | 20                                 |
| Jouer / dresser                                                       | +2 / +1, au plus 30 par jour       |
| Promenade                                                             | 5 à 15 (prairie) à 20 à 40 (plage) |
| Petit boulot du joueur (toutes les heures)                            | 0 à 10                             |
| Travail du compagnon (toutes les 2 heures)                            | 1 à 12, selon ses talents          |
| Caresser le compagnon d'un autre (une fois par jour et par compagnon) | 3                                  |

Prix : biscuit 8, fraise 12, lait chaud 15, gâteau 30, nœud 50, chapeau 80, lunettes 120, couronne 300. Les objets qu'on ne trouve qu'en promenade (mûre, champignon, noix de coco, glace, couronne de fleurs, étoile de mer) ne sont pas vendus : la boutique les refuse (`not_for_sale`).

## Travail

Idée du ticket 56 (revenu de base + gagner sa vie). Le **revenu de base** existe déjà : le bonus quotidien de 20 pièces (`DAILY_BONUS`, une fois par jour calendaire). Le travail s'y ajoute pour financer soins et nourriture. Tout le calcul est dans `shared/core/src/engine/work.ts` (constantes `WORK`), page « Travail » dans l'application.

- **Petit boulot du joueur** : un jeu d'adresse (5 additions à choix parmi 3 réponses, côté client). Le score (0 à 5) est envoyé à `POST /work/player` et payé 2 pièces par point (`playerWage`). Limite : une fois par heure (`work_cooldown` sinon, avec `availableAt`). Choix assumé : le score vient du client comme pour le mini-jeu de jeu ; le plafond (10 pièces par heure) borne la triche.
- **Travail du compagnon** : `POST /work/pet`, une fois toutes les 2 heures, à partir du stade enfant (`too_young`, `too_tired` sous 30 d'énergie, `too_hungry` sous 30 de satiété). L'action moteur `work` coûte énergie −25, satiété −10, bonheur −5, hygiène −5. Le salaire (`petWage`) va de 2 à 8 pièces selon l'**aptitude** (`petAbility`, 0 à 1 : 40 % tours appris, 25 % discipline, 20 % lien, 15 % humeur ; un enfant est moins constant qu'un adulte), multiplié par une **chance** de ×0,5 à ×1,5.
- **Hasard** : le moteur reste pur et déterministe. Le serveur tire une graine (`randomInt`) et la passe à `petWage(state, seed)` ; la chance en est dérivée par `workLuck` (hachage FNV de la graine). Même compagnon et même graine, même salaire. Le salaire est calculé sur l'état du compagnon avant que le travail ne le fatigue.
- **Limites** : deux colonnes `last_work_at` et `last_pet_work_at` sur `players`, prises par une seule instruction conditionnelle (deux demandes simultanées ne passent pas toutes les deux). Un refus du moteur annule la transaction : le temps d'attente n'est pas consommé. Les gains du travail ne comptent pas dans le plafond de 30 pièces par jour du jeu et du dressage.
- Les statistiques de compagnon d'autres chantiers (RPG, etc.) pourront entrer dans `petAbility` ; seules les statistiques existantes sont utilisées ici.

## Concours

Chaque semaine (du lundi au dimanche, fuseau `GAME_TIMEZONE`, comme l'objectif communautaire), deux concours, à l'écran « Concours » :

- **Tours** : le score est la somme des progrès du compagnon dans les 4 tours (de 0 à 400), **figée à l'inscription** (`trickScore`). On peut se réinscrire quand on veut jusqu'à dimanche : le score est mis à jour, la place d'inscription (qui départage les égalités) reste la première. Pas pour un bébé, qui ne peut pas être dressé.
- **Beauté** : la communauté vote. Un vote par semaine et par membre, pour le compagnon de quelqu'un d'autre (pas le sien), parmi les inscrits ; on peut changer d'avis et le vote se déplace. Le score est le nombre de votes ; on peut voter sans être inscrit. Les accessoires, qu'on voit sur le compagnon, y aident.
- **Conditions** : un compagnon vivant, éclos et pas en vacances (`still_an_egg`, `too_young`, `on_vacation`, `pet_gone`).
- **Classement** : par score, puis par ordre d'inscription (deux inscrits n'ont jamais la même place, `rankEntries`). Chaque classement montre les 20 premiers et, toujours, la place du joueur. Les compagnons sont affichés à leur état du moment, pas à celui de l'inscription.
- **Récompenses** : les trois premiers de chaque concours de la semaine **précédente** gagnent 50, 30 et 15 pièces (`CONTEST_PRIZES`), à récupérer une fois (`already_claimed` ensuite, `no_prize` hors podium). La prise est décidée par une seule instruction : deux demandes simultanées ne paient qu'une fois.
- **Limites assumées** : la communauté est fermée (des membres d'un serveur Discord) et le vote est public pour l'application, mais rien n'empêche des comptes multiples de voter ; ce n'est pas protégé. Les résultats ne sont pas annoncés dans le salon Discord.

## Codes cadeaux et événements

Deux outils d'animation, réservés aux admins (écran Admin) :

- **Codes cadeaux** : un code (lettres, chiffres et tirets, 4 à 24 caractères, stocké en majuscules : la casse n'a pas d'importance) donne des pièces (jusqu'à 1 000) et des objets (4 sortes au plus, 20 exemplaires de chacune). Chaque membre ne peut l'utiliser qu'une fois, jusqu'à un nombre d'utilisations total et une date limite facultative ; un admin peut le désactiver. Les membres l'entrent dans la boutique. Un code désactivé est traité comme un code inconnu. Le dernier usage est pris en une seule instruction : de deux membres simultanés, un seul l'obtient (`code_used_up` pour l'autre), et une tentative refusée ne compte pas comme un usage. La saisie est limitée (10 essais par minute) pour qu'un code ne se devine pas.
- **Événements** : un bonus pour tout le monde pendant quelques jours (14 au plus), annoncé sur un bandeau de l'application et dans le salon Discord (avec l'heure affichée dans le fuseau de chacun). Quatre effets : pièces trouvées en promenade (+ %), bonus du jour (+ %), pièces des caresses de visite (+ %) et réduction de la boutique (− %, 90 % au plus : jamais gratuit). Plusieurs événements du même effet en même temps ne s'additionnent pas : le meilleur compte. Les calculs sont dans `shared/core/src/engine/events.ts` (`boosted`, `discounted`, `bestPercent`) ; le serveur les applique quand il verse des pièces ou fixe un prix, et la boutique affiche le prix réduit.

## Modération des noms

- **Mots interdits** : une liste tenue par les admins. Elle est vérifiée à l'adoption (`name_not_allowed`), sans tenir compte des majuscules, des accents, des espaces ni des chiffres qui ressemblent à des lettres (« h4te » est « hate »), et à l'intérieur des mots (`blockedTerm`, dans `shared/core/src/engine/names.ts`) : un mot court comme « ass » se trouve aussi dans « classe », il faut les choisir avec soin.
- **Renommer** : un admin cherche un membre (par son nom ou celui de son compagnon) et renomme le membre ou son compagnon. Le membre est prévenu dans son journal. Le nom d'un membre renommé est **imposé** : se reconnecter avec Discord ne le remplace plus, jusqu'à ce qu'un admin « rende le nom Discord » (il revient à la connexion suivante).
- **Journal de modération** : chaque renommage, restitution de nom et changement de la liste est enregistré (qui, quand, avant, après).

## Interactions entre joueurs

- **Caresse d'un visiteur** : bonheur +8 pour le compagnon visité, une fois par jour et par visiteur.
- **Cadeau** : la friandise est donnée au compagnon visité (ses effets, sans le bonus de lien), et l'objet sort du sac du visiteur.
- **Rencontre** : deux promenades qui se chevauchent dans le temps créent une rencontre, 3 au maximum par promenade. Elle est visible au retour et dans le journal des deux joueurs.
