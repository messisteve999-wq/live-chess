# live-chess — V1 prototype

Prototype web installable pour commencer le projet live-chess.

## Fonctionnalités incluses
- Inscription/connexion par pseudonyme et mot de passe (mots de passe hachés côté serveur).
- Profil et 200 points virtuels initiaux.
- Échiquier 2D et règles légales vérifiées côté serveur avec chess.js.
- Partie en ligne par code de salon : un joueur crée un salon, le second le rejoint.
- Déplacements synchronisés en temps réel avec Socket.IO.
- Démonstration IA locale simple (choisit un coup légal aléatoire).
- Interface responsive mobile.

## Limites de cette V1
Cette archive est une base de départ testable, pas encore le jeu mondial complet. Les amis persistants, invitations par lien de téléchargement, IA avancée, tournois à 30 joueurs, Elo, vue 3D, anti-triche avancée et publication APK restent à développer. Les comptes et points de ce prototype sont enregistrés dans `data/db.json`; protégez ce fichier et ajoutez une vraie base PostgreSQL avant un lancement public.

## Démarrer dans Termux
1. Extraire le ZIP.
2. Entrer dans le dossier `live-chess`.
3. Installer Node.js si nécessaire : `pkg install nodejs`
4. Installer les dépendances : `npm install`
5. Démarrer : `npm start`
6. Ouvrir dans le navigateur du téléphone : `http://127.0.0.1:3000`

Pour jouer avec une personne dans un autre téléphone, le serveur doit être déployé sur Internet. `localhost` fonctionne uniquement sur l'appareil local.

## Importer sans écraser l'ancien projet
Si ton ancien dossier est `~/storage/downloads/echecs/echecs`, garde-le comme sauvegarde. Extrais cette version dans un nouveau dossier, par exemple `~/storage/downloads/live-chess`.


## Audio et interface ajoutés
- Logo illustré avec reine d'échecs au style 3D.
- Menu audio : volume musique, volume des sons, boutons couper/réactiver, styles musical classique/épique/détente/électronique/jazz.
- Musique d'ambiance et effets sonores de déplacement/capture générés par le navigateur (aucun fichier audio externe nécessaire).
- Lancement d'une partie sur l'écran de jeu avec le plateau et les noms des joueurs.
- Pour entendre l'audio sur mobile, autorise le son après une première interaction avec l'application.
