# OuizzQuizz

Jeu musical en ligne composé de plusieurs sous-jeux, jouable seul ou à plusieurs avec un code de partie.

## Sous-jeux

- **Blind test** : un extrait de 30 s. On écrit l'artiste et/ou le titre (ou on choisit parmi 4 propositions).
- **Flash** : 1, 2 ou 3 secondes de musique au choix (réécoutables 2 fois), sur les 10 % de titres les plus connus du catalogue (~860).
- **Refrain** (test, 100 titres très connus, moitié en français) : pas de son, une ligne du refrain s'affiche, puis une autre toutes les 10 s (4 au plus), le titre caché en astérisques (une par lettre). Artiste et titre comme au blind test, bonus +20 / +10 / +5 si on trouve dès la 1re, 2e ou 3e ligne. Paroles lues à la volée sur [LRCLIB](https://lrclib.net) (rien n'est stocké dans le jeu) ; refrain = strophe marquée [Refrain] ou, à défaut, strophe qui revient le plus. Titres dans `js/data/refrain-songs.js`, détection dans `js/core/lyrics.js`, page de contrôle `refrain-test.html`.
- **Quelle année ?** : un extrait de 30 s, on donne l'année de sortie (case, curseur ou boutons ±1 / ±10 ; « 87 » = 1987). Une seule réponse par manche. Année exacte : **50 pts** ; à 2 ans près : **30 pts** ; sinon dans la bonne décennie : **25 pts** ; sinon 0. Pas de bonus de série ni de rapidité (barème fixe), mais à égalité le plus rapide passe devant. Mêmes filtres que le blind test (niveau, période, style), sans la musique classique.
- **Lecture découverte** : sans score. Des extraits de 30 s tirés au hasard s'enchaînent tout seuls (niveau, période et style au choix), avec titre, artiste, année et style. Boutons précédent / pause / suivant, liste des titres déjà écoutés (réécoutables), option « titre caché jusqu'à la fin » pour s'entraîner. Code dans `js/games/discover.js`.

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
- **Égalité en fin de partie** : le plus rapide passe devant (temps moyen pour trouver l'artiste ou le titre, compté depuis que le joueur entend la musique). Le classement final affiche ce temps (⏱).
- Mode propositions (4, 6 ou 8 choix) : 40 pts pour la bonne réponse, mêmes bonus de série et de classement.

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

Techniquement, **aucun compte ni serveur à gérer**. Deux chemins sont essayés en même temps, et le premier qui trouve la partie est gardé :
- **Direct** avec [PeerJS](https://peerjs.com) (WebRTC) : les navigateurs se parlent directement. Certains réseaux le bloquent (4G, box, Wi-Fi d'entreprise).
- **Relais** par MQTT sur WebSocket, via des serveurs publics gratuits (EMQX, HiveMQ, Mosquitto, en secours les uns des autres) : marche sur tout réseau qui ouvre un site web.

Si l'hôte ferme sa page, la partie s'arrête. La console du navigateur affiche le chemin utilisé (`[OuizzQuizz réseau]`).

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
js/vendor/mqtt.min.js          MQTT.js 5.10.4 (licence MIT, voir mqtt.LICENSE)
js/core/registry.js            registre des sous-jeux (MQ.registerGame)
js/core/audio-source.js        recherche d'extraits (iTunes puis Deezer) + lecteur audio
js/core/match.js               correction des réponses écrites (Levenshtein)
js/core/net.js                 multijoueur : créer / rejoindre une partie par code
js/core/ui.js                  utilitaires d'interface
js/data/fr-extra.js            titres français ajoutés (Top 50 / Top 100)
js/data/catalog.js             catalogue des musiques + catégories + styles
js/games/blindtest/engine.js   moteur de partie (tourne chez l'hôte ou en solo)
js/games/blindtest/view.js     écrans : menu, salon, manche, révélation, fin
js/games/discover.js           lecture découverte (radio aléatoire, sans score)
js/app.js                      accueil et navigation (#blindtest, #flash, #refrain, #year, #decouverte, #rejoindre-CODE)
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

Environ 8 600 titres :
- `js/data/big-catalog.js` (généré) : hit-parade français + Billboard Hot 100 de 1970 à 2026, plus des classiques choisis à la main (rock, métal, rap, électro, chanson, génériques, classique…).
- `js/data/fr-extra.js` : 521 titres français de plus (hits du Top 50 / Top 100 de 1960 à 2025) qui n'étaient pas dans le grand catalogue.
- `js/data/catalog.js` : une poignée de classiques ajoutés à la main.

- **Niveau** (blind test et Quelle année ?) : « Les grands tubes » = célébrité 4 ou 5 sur 5 (~3 600 titres), ou « Tout le catalogue ».
- **Période** : par décennie, ou chanson française (~2 100 titres : chansons en français, ou instrumentaux d'artistes français ; les titres anglais, italiens, espagnols… n'en font pas partie).
- **Style** : pop, rock, métal, rap / hip-hop, R&B / soul, électro / dance, disco / funk, chanson / variété, reggae, country / folk, latino / monde, jazz / crooners, films-séries-fête, classique. Se combine avec la période (ex. rap + chanson française). Chaque titre a un genre (dernière colonne du catalogue) ; les styles regroupent ces genres dans `MQ.styles` (`js/data/catalog.js`).
- **Flash** : les 10 % les plus connus selon un classement fin pensé pour un public français : meilleur score entre le rang au hit-parade français et le succès au Billboard (pic + semaines, pondéré 0,85), bonus si le titre a marché des deux côtés. Formule dans `MQ.fineFame` (`js/data/catalog.js`).

Un titre sans extrait sur iTunes ni Deezer est sauté automatiquement.

## Ajouter des musiques

Une ligne dans la liste des classiques de `js/data/catalog.js` : `{ title: '…', artist: '…', year: 1999, genre: 'rock' }`. Ajouter `fr: true` pour la chanson française. Pour un titre français, on peut aussi ajouter une ligne à `js/data/fr-extra.js` (même format que le grand catalogue).
