# OuizzQuizz

Jeu musical en ligne composé de plusieurs sous-jeux, jouable seul ou à plusieurs avec un code de partie.

## Sous-jeux

- **Blind test** : un extrait de 30 s. On écrit l'artiste et/ou le titre (ou on choisit parmi 4 propositions).
- **Flash 1 seconde** : une seule seconde de musique (réécoutable 2 fois), sur les 10 % de titres les plus connus du catalogue (~570).
- **Refrain** (test, 100 titres très connus, moitié en français) : pas de son, une ligne du refrain s'affiche, puis une autre toutes les 10 s (4 au plus), le titre caché en astérisques (une par lettre). Artiste et titre comme au blind test, bonus +20 / +10 / +5 si on trouve dès la 1re, 2e ou 3e ligne. Paroles lues à la volée sur [LRCLIB](https://lrclib.net) (rien n'est stocké dans le jeu) ; refrain = strophe marquée [Refrain] ou, à défaut, strophe qui revient le plus. Titres dans `js/data/refrain-songs.js`, détection dans `js/core/lyrics.js`, page de contrôle `refrain-test.html`.
- *Quelle année ?* : à venir.

## Règles de la réponse écrite

- Une seule barre de saisie : on peut taper l'artiste, le titre, ou les deux d'un coup (« queen bohemian rhapsody »). Essais illimités pendant les 30 s de la manche.
- Artiste trouvé : 20 pts. Titre trouvé : 20 pts. La moitié des mots importants de l'artiste ou du titre (hors petits mots comme « le », « the », « de »…) : 10 pts, qui passent à 20 si on trouve ensuite le nom complet.
- Bonus de classement (à partir de 2 joueurs) : pour l'artiste et pour le titre, le 1er à trouver gagne +30 % de ces points, le 2e +20 %, le 3e +10 %, les suivants rien. Le temps de chacun est compté depuis le moment où **il** entend la musique sur son appareil, pauses déduites : un léger décalage de chargement ne pénalise personne. Pour « A Featuring B », chaque artiste crédité compte à part.
- La manche s'arrête quand l'extrait se termine (30 s au plus). Chaque joueur a son propre chrono ; en multijoueur, après le premier « temps écoulé », on attend les autres au plus 4 s.
- Chaque essai s'affiche en **vert** (bon), **jaune** (à moitié) ou **rouge** (faux). Quand l'artiste et le titre sont trouvés, la saisie se bloque.
- Bonus de série, pour chaque manche d'affilée où on a trouvé au moins l'artiste ou le titre complet : +20 à la 2e, +20 à la 3e, +20 à la 4e, puis +30 à chaque manche suivante.
- Entre deux musiques, un écran intertitre silencieux de 5 s montre la réponse et les points, puis la musique suivante démarre toute seule.
- Casse, accents, ponctuation, espaces et « The / Le / La / Les » au début sont ignorés.
- Fautes tolérées (lettres en trop, en moins ou différentes) : **3** pour les noms de 8 caractères et plus, 2 entre 5 et 7, 1 en dessous de 5. Réglable dans `js/core/match.js`.
- Ce qui est entre parenthèses ou après « feat. » est facultatif. D'autres réponses acceptées peuvent être ajoutées avec `artistAlt` / `titleAlt` dans le catalogue.
- Mode 4 propositions : 40 pts pour la bonne réponse, mêmes bonus de série et de classement.

Le barème se règle en haut de `js/games/blindtest/engine.js`.

## Pendant la partie

- **Tableau des scores** toujours visible : total de chaque joueur (mis à jour en direct), pastille d'initiales, et ce qu'il a trouvé sur la manche en cours (deux points : artiste, titre).
- **Étoiles de série** : ★ au bonus de 2 manches réussies d'affilée, ★★ à 3, etc. (au-delà de 5 : ★×n).
- **Musique précédente** : pochette, titre, artiste, et les initiales de ceux qui l'ont trouvée (vert : tout trouvé, jaune : en partie).
- **Volume** : curseur en haut à droite, propre à chaque joueur et gardé dans son navigateur.
- **Pause** : l'hôte (ou le joueur en solo) peut mettre en pause pendant une manche ou un intertitre ; la musique et le chrono s'arrêtent chez tout le monde.

## Multijoueur

1. Un joueur clique sur **Créer une partie en ligne** : un code à 4 caractères s'affiche.
2. Les autres entrent ce code dans **Rejoindre une partie** (ou ouvrent le lien `…#rejoindre-CODE`).
3. L'hôte choisit les réglages et lance la partie. Chacun entend l'extrait sur son appareil et répond de son côté ; on voit en direct qui a trouvé l'artiste ou le titre, et le classement s'affiche à chaque intertitre.

Techniquement : les navigateurs sont reliés en pair-à-pair avec [PeerJS](https://peerjs.com) (WebRTC). Le serveur public gratuit de PeerJS sert seulement à se retrouver avec le code : **aucun compte ni serveur à gérer**. Si l'hôte ferme sa page, la partie s'arrête.

## Mise en ligne sur GitHub Pages

Le site est 100 % statique (pas de build). Dans le dépôt GitHub : **Settings → Pages → Build and deployment → Source : Deploy from a branch → Branch : `main` / `/ (root)`** puis Save. Le jeu est ensuite disponible sur `https://kevm29.github.io/OuizzQuizz/`.

GitHub Pages sur un dépôt **privé** demande un compte GitHub payant (Pro). Avec un compte gratuit, il faut passer le dépôt en public.

Pour jouer en local : ouvrir `index.html`, ou lancer `npx http-server .` dans le dossier.

## D'où viennent les extraits ?

Des extraits officiels de 30 s de l'**API iTunes Search** (Apple), avec **Deezer** en secours. Le jeu ne stocke que le titre, l'artiste et l'année : aucun fichier audio n'est hébergé.

## Architecture

```
index.html                     page unique, charge les scripts
css/style.css                  thème visuel
js/vendor/peerjs.min.js        PeerJS 1.5.4 (licence MIT, voir peerjs.LICENSE)
js/core/registry.js            registre des sous-jeux (MQ.registerGame)
js/core/audio-source.js        recherche d'extraits (iTunes puis Deezer) + lecteur audio
js/core/match.js               correction des réponses écrites (Levenshtein)
js/core/net.js                 multijoueur : créer / rejoindre une partie par code
js/core/ui.js                  utilitaires d'interface
js/data/catalog.js             catalogue des musiques + catégories
js/games/blindtest/engine.js   moteur de partie (tourne chez l'hôte ou en solo)
js/games/blindtest/view.js     écrans : menu, salon, manche, révélation, fin
js/app.js                      accueil et navigation (#blindtest, #flash, #refrain, #rejoindre-CODE)
```

Le moteur et les écrans ne se parlent que par messages (`round`, `answer`, `reveal`…). En solo le moteur tourne dans la page ; en ligne il tourne chez l'hôte et les messages passent par PeerJS. Un nouveau sous-jeu peut reprendre le même découpage.

## Ajouter un sous-jeu

```js
MQ.registerGame({
  id: 'mon-jeu',
  title: 'Mon jeu',
  tagline: 'Une phrase pour la carte d’accueil.',
  mount(root, ctx) {
    // dessiner le jeu dans root ; ctx.exit() pour revenir à l'accueil
    return () => { /* nettoyage : couper le son, les timers… */ };
  }
});
```

Puis ajouter le `<script>` dans `index.html`, avant `js/app.js`.

## Catalogue

Environ 5 700 titres : 100 par an de 1970 à 2026 (hit-parade français + Billboard Hot 100, fichier `js/data/big-catalog.js`, généré), plus une quinzaine de classiques ajoutés à la main dans `js/data/catalog.js` (années 60, chanson française).

- **Niveau** (blind test normal) : « Les grands tubes » = célébrité 4 ou 5 sur 5 (~2 300 titres), ou « Tout le catalogue ».
- **Période** : par décennie, ou chanson française.
- **Flash 1 seconde** : les 10 % les plus connus selon un classement fin pensé pour un public français : meilleur score entre le rang au hit-parade français et le succès au Billboard (pic + semaines, pondéré 0,85), bonus si le titre a marché des deux côtés. Formule dans `MQ.fineFame` (`js/data/catalog.js`).

Un titre sans extrait sur iTunes ni Deezer est sauté automatiquement.

## Ajouter des musiques

Une ligne dans la liste des classiques de `js/data/catalog.js` : `{ title: '…', artist: '…', year: 1999 }`. Ajouter `fr: true` pour la chanson française.
