# 2Tamago : fonctionnalités

Légende : ✅ fait dans cette première version · 🔜 prochaine étape · 💡 plus tard / à discuter.

Le jeu s'inspire de trois sources :

- **Tamagotchi** pour la boucle de soins : besoins qui baissent avec le temps réel, cacas, maladie, caprices à recadrer, erreurs de soin qui orientent l'évolution, départ du compagnon s'il est délaissé.
- **Nintendogs** pour le lien affectif : caresser son compagnon au pointeur, lui apprendre des tours, le promener, l'accessoiriser.
- **Le multijoueur** : les membres de 2GETHER ne jouent pas chacun dans leur coin. On se rend visite, on se fait des cadeaux, et nos compagnons se croisent en promenade.

## 1. Cœur du jeu (Tamagotchi)

|     | Fonctionnalité                                                                                                                                             | Notes                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| ✅  | Adoption d'un œuf : nom, espèce (Mochi, Pyon, Kumo, Koro, Nyao, Toge), couleur                                                                             | Un seul compagnon vivant à la fois par joueur                                                                   |
| ✅  | Traits tirés au hasard à l'adoption : motif, yeux et tempérament (gourmand, dormeur, câlin, farceur, propre, costaud)                                      | Révélés à l'éclosion ; chaque tempérament a un avantage et un inconvénient, les espèces sont purement visuelles |
| ✅  | Éclosion, puis stades bébé → enfant → ado → adulte → ancien                                                                                                | Durées réglables (`stageHours`)                                                                                 |
| ✅  | Besoins : satiété, bonheur, énergie, propreté, santé, discipline                                                                                           | Ils baissent en temps réel, même quand l'app est fermée                                                         |
| ✅  | Nourrir (repas gratuit, refus quand il n'a plus faim), friandises                                                                                          | Les friandises font prendre du poids                                                                            |
| ✅  | Cacas à nettoyer, saleté                                                                                                                                   |                                                                                                                 |
| ✅  | Sommeil : il s'endort seul quand il est épuisé, on peut le coucher ou le réveiller (il râle)                                                               |                                                                                                                 |
| ✅  | Maladie à partir de facteurs de risque (cacas, saleté, faim, surpoids), médicament en plusieurs doses                                                      |                                                                                                                 |
| ✅  | Caprices (fausses alertes) : gronder fait monter la discipline, féliciter un caprice la fait baisser                                                       |                                                                                                                 |
| ✅  | Erreurs de soin : un besoin à zéro trop longtemps compte comme une erreur                                                                                  |                                                                                                                 |
| ✅  | Évolution en 3 formes (Rayonnant, Doux, Chenapan) selon les erreurs, la discipline et le lien                                                              |                                                                                                                 |
| ✅  | Départ du compagnon quand sa santé tombe à zéro (désactivable : `GAME_DEPARTURE=false`)                                                                    | Il « part vivre sa vie », il ne meurt pas                                                                       |
| ✅  | Retraite volontaire des anciens, et album des anciens compagnons                                                                                           |                                                                                                                 |
| ✅  | Mini-jeu « gauche ou droite ? » pour jouer                                                                                                                 |                                                                                                                 |
| ✅  | Cycle jour/nuit réel, avec une heure de coucher par stade (bébé 19 h, adulte 22 h…) : à l'heure du coucher il faut éteindre la lumière, sinon il est agité | Fuseau `GAME_TIMEZONE`, tout est réglable (`night`)                                                             |
| 🔜  | Notifications Web Push : faim, maladie, caprice, retour de promenade                                                                                       | Service worker et `web-push`, comme 2Gatcha                                                                     |
| 🔜  | Mode vacances / garderie : on confie son compagnon à un autre membre, ou on met le jeu en pause                                                            | Évite les départs pendant les vacances                                                                          |
| 💡  | Dinos issus de fossiles, avec des bonus passifs (couche séparée des espèces actuelles)                                                                     |                                                                                                                 |
| 💡  | Plus d'espèces et de formes, avec des dessins faits par des membres                                                                                        | Comme les cartes de 2Gatcha                                                                                     |
| 💡  | Héritage : un compagnon retraité laisse un œuf avec un bonus                                                                                               |                                                                                                                 |
| 💡  | D'autres mini-jeux (rythme, attrape)                                                                                                                       |                                                                                                                 |

## 2. Lien et dressage (Nintendogs)

|     | Fonctionnalité                                                                       | Notes                                                         |
| --- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| ✅  | Caresser au pointeur ou au doigt (des cœurs apparaissent), avec un temps de recharge |                                                               |
| ✅  | Jauge de lien qui monte avec les caresses, le jeu, le dressage et les promenades     | Elle baisse à chaque erreur de soin                           |
| ✅  | Dressage de 4 tours (Assis, Tourne, Saute, Tape-m'en cinq), 3 niveaux chacun         | Progrès plus rapide si le compagnon est discipliné et heureux |
| ✅  | Promenades : il part un moment, revient avec des pièces et parfois une friandise     |                                                               |
| ✅  | Boutique : friandises et accessoires (nœud, chapeau, lunettes, couronne)             |                                                               |
| ✅  | Accessoires visibles sur le compagnon, aussi chez les autres joueurs                 |                                                               |
| 🔜  | Commandes de tours à la voix ou au geste (dessiner un motif)                         | Le principe des commandes vocales de Nintendogs               |
| 🔜  | Objets trouvés en promenade plus variés, avec des zones de promenade                 |                                                               |
| 💡  | Concours (tours, beauté) avec classement hebdomadaire                                |                                                               |
| 💡  | Décoration de la chambre                                                             |                                                               |

## 3. Multijoueur asynchrone

|     | Fonctionnalité                                                                                | Notes                                         |
| --- | --------------------------------------------------------------------------------------------- | --------------------------------------------- |
| ✅  | Village : les compagnons des autres membres, avec leur humeur                                 |                                               |
| ✅  | Visite d'un compagnon, une caresse par jour et par compagnon (+3 pièces pour le visiteur)     |                                               |
| ✅  | Offrir une friandise de son sac au compagnon d'un autre                                       |                                               |
| ✅  | Rencontres en promenade : deux compagnons sortis en même temps se croisent (façon StreetPass) | Les deux joueurs le voient dans leur journal  |
| ✅  | Journal : événements de son compagnon, visites, cadeaux, rencontres, bonus du jour            |                                               |
| ✅  | Bonus de connexion quotidien                                                                  |                                               |
| 🔜  | Amis / favoris, et un village trié par affinité (rencontres, visites)                         |                                               |
| 🔜  | Échanges d'objets entre joueurs                                                               |                                               |
| 🔜  | Objectifs communautaires : « le village a fait 500 promenades cette semaine »                 | Comme les objectifs communautaires de 2Gatcha |
| 💡  | Garde partagée : co-élever un compagnon à deux                                                |                                               |
| 💡  | Mariage et œuf commun quand deux adultes ont un lien fort                                     |                                               |
| 💡  | Intégration Discord : un bot qui annonce éclosions, évolutions et rencontres                  |                                               |

## 4. Multijoueur synchrone (plus tard)

|     | Fonctionnalité                                                                                      | Notes                                                 |
| --- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 💡  | Parc en direct (WebSocket) : on voit les compagnons des joueurs connectés se promener en même temps | `@nestjs/websockets`, même authentification par jeton |
| 💡  | Jeux à deux en direct : lancer de balle, cache-cache                                                |                                                       |
| 💡  | Réactions et émotes en direct                                                                       |                                                       |
| 💡  | Événements programmés (fête du village)                                                             |                                                       |

## 5. Administration et exploitation

|     | Fonctionnalité                                                                                        | Notes                                                    |
| --- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| ✅  | Interface en français et en anglais (langue du navigateur, bouton FR / EN)                            | Le web possède tous les textes ; voir [I18N.md](I18N.md) |
| ✅  | Thème jour / nuit de l'interface (automatique, jour ou nuit), aux couleurs de 2GETHER                 | Choix mémorisé dans le navigateur                        |
| ✅  | Réglages du jeu par variables d'environnement, dont l'accélération du temps (`GAME_TIME_SCALE`)       |                                                          |
| ✅  | Rôle admin à partir des identifiants Discord (`ADMIN_DISCORD_IDS`), une seule source de configuration | Routes `/api/admin/*` réservées                          |
| ✅  | `/api/health`, image Docker, stack compose (Caddy + API + PostgreSQL), CI                             |                                                          |
| ✅  | Réglages du jeu en base, éditables depuis l'écran Admin (JSON), sans redéploiement                    | Durée du temps et pas fixes                              |
| 🔜  | Interface d'admin : événements, codes cadeaux, modération des noms                                    |                                                          |
| 🔜  | Sauvegardes PostgreSQL automatisées (pg_dump vers Azure Blob, comme 2Gatcha)                          |                                                          |
| ✅  | Suivi des erreurs côté API (`SENTRY_DSN`, Sentry ou GlitchTip)                                        |                                                          |
| ✅  | Suivi des erreurs côté web (`SENTRY_WEB_DSN`, chargé seulement si configuré)                          |                                                          |
| ✅  | « Donner un avis » : bug, idée ou autre, transmis à GlitchTip avec une sévérité selon le type         | Nécessite `SENTRY_DSN`                                   |
| 💡  | Statistiques d'équilibrage : durée de vie moyenne, causes de départ                                   |                                                          |
