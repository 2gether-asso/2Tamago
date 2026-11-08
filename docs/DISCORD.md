# 2Tamago : intégration Discord

Discord sert à deux choses : **se connecter** (seuls les membres du serveur de 2GETHER peuvent jouer) et **annoncer** quelques événements du jeu dans un salon.

## Configurer la connexion

1. Créer une application sur le [portail développeur Discord](https://discord.com/developers/applications). Dans **OAuth2**, noter l'identifiant client et générer le secret.
2. Ajouter l'adresse de retour exacte dans **OAuth2 → Redirects** : `https://<SITE_ADDRESS>/api/auth/discord/callback` (en local : `http://localhost:4321/api/auth/discord/callback`). Une différence d'un caractère donne l'erreur « redirect_uri invalide » chez Discord.
3. Récupérer l'identifiant du serveur : activer le mode développeur de Discord (Paramètres, Avancés), puis clic droit sur le serveur, « Copier l'identifiant ».
4. Renseigner les variables :

| Variable                                     | Rôle                                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | L'application Discord                                                                                   |
| `DISCORD_GUILD_ID`                           | Le serveur dont il faut être membre. **Sans ces trois variables, la connexion Discord est désactivée.** |
| `DISCORD_REDIRECT_URI`                       | Adresse de retour (par défaut `WEB_ORIGIN` + `/api/auth/discord/callback`)                              |
| `WEB_ORIGIN`                                 | Adresse publique du site, où l'on est renvoyé après la connexion                                        |
| `DISCORD_INVITE_URL`                         | Lien d'invitation au serveur, affiché sur l'écran de connexion (facultatif)                             |
| `ADMIN_DISCORD_IDS`                          | Identifiants Discord des administrateurs, séparés par des virgules                                      |

## Comment se passe la connexion

1. Le bouton « Se connecter avec Discord » ouvre `/api/auth/discord`, qui pose un cookie `state` à usage unique et renvoie vers Discord (scopes `identify` et `guilds.members.read`).
2. Discord renvoie sur `/api/auth/discord/callback` avec un `code`. L'API vérifie le `state`, échange le code, lit le profil et **l'appartenance au serveur**.
3. Si la personne est membre, l'API crée ou met à jour le joueur, ouvre une session de 30 jours (cookie `HttpOnly`) et renvoie vers le jeu.

Le pseudo affiché est le **surnom sur le serveur**, à défaut le nom global Discord, à défaut le nom d'utilisateur. Le pseudo et l'avatar sont **resynchronisés à chaque connexion**.

Limite connue : l'appartenance au serveur n'est vérifiée qu'à la connexion. Quelqu'un qui quitte le serveur garde sa session en cours jusqu'à 30 jours, mais ne peut plus se reconnecter.

## Erreurs de connexion

L'écran de connexion affiche un message pour chaque cas :

| Code dans l'adresse | Cause                                                                       | Message                                                                      |
| ------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `not_member`        | Le compte n'est pas dans le serveur (Discord répond 404 pour le membre)     | Il faut être membre du Discord, avec le lien d'invitation s'il est configuré |
| `state`             | Cookie `state` absent, expiré (10 min), déjà utilisé ou différent           | La connexion a expiré, réessaie                                              |
| `denied`            | La personne a refusé ou annulé sur l'écran de Discord                       | Connexion annulée                                                            |
| `discord`           | Discord ne répond pas, ou refuse (échange du code, profil, limite de débit) | Discord ne répond pas, réessaie                                              |

Une panne ou une limite de débit de Discord n'est jamais prise pour « pas membre » : le joueur voit `discord`, l'API écrit un avertissement dans ses journaux et signale l'erreur à GlitchTip si `SENTRY_DSN` est défini.

## Les annonces dans un salon

Avec `DISCORD_WEBHOOK_URL`, l'API publie dans un salon, sans bot :

| Événement                                              | Message (en français)                                                                         |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Premier passage d'un joueur                            | 👋 **Ada** vient de rejoindre 2Tamago ! Bienvenue !                                           |
| Éclosion                                               | 🥚 **Pompon**, le compagnon de **Ada**, vient d'éclore ! (Mochi)                              |
| Changement de stade                                    | ✨ **Pompon**, le compagnon de **Ada**, a grandi : adulte, rayonnant.                         |
| **Première** rencontre en promenade entre deux joueurs | 🤝 **Pompon** (Ada) et **Caillou** (Bob) se sont croisés en promenade pour la première fois ! |

Ce qui n'est **pas** annoncé, pour que le salon reste lisible : les départs et retraites, les rencontres suivantes entre les mêmes joueurs, et tout le reste de la vie des compagnons.

- **Créer le webhook** : paramètres du salon, Intégrations, Webhooks, Nouveau webhook, copier l'adresse dans `DISCORD_WEBHOOK_URL`. Sans la variable, rien n'est envoyé.
- **Aucune notification parasite** : les messages interdisent toute mention, et les pseudos sont échappés (pas de mise en forme, pas de `@everyone`).
- **Plafond** : au plus 20 messages par fenêtre de 10 minutes. Au-delà, les messages sont abandonnés (avec un avertissement dans les journaux) pour ne jamais inonder le salon.
- **Le jeu ne dépend pas du salon** : un webhook en panne est ignoré (avertissement dans les journaux). Les messages sont envoyés une fois le changement enregistré, jamais avant.
- **Langue** : le salon est celui de l'association, les messages sont en français quelle que soit la langue choisie par chaque joueur dans l'application (voir [I18N.md](I18N.md)).
- Ajouter un type d'annonce : une fonction de texte dans `api/src/announcements/announcement-texts.ts`, une méthode dans `AnnouncementService` et son appel après l'enregistrement. Penser à une raison de ne pas l'annoncer d'abord : c'est le spam qu'on cherche à éviter.

## Dépannage

- **« Invalid OAuth2 redirect_uri »** chez Discord : l'adresse du portail et `DISCORD_REDIRECT_URI` (ou `WEB_ORIGIN`) ne sont pas identiques.
- **Un membre voit « Il faut être membre »** : `DISCORD_GUILD_ID` ne désigne pas le bon serveur, ou le scope `guilds.members.read` a été retiré de l'autorisation.
- **Le bouton Discord n'apparaît pas** : une des trois variables `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_GUILD_ID` manque.
- **Rien dans le salon** : `DISCORD_WEBHOOK_URL` est vide ou erronée. Les journaux de l'API contiennent « Discord webhook answered 404 » pour un webhook supprimé.
- Essayer en local sans Discord : `AUTH_DEV_LOGIN=true` ouvre la connexion par pseudo (jamais en production).
