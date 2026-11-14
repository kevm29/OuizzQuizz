# OuizzQuizz

Jeu musical en ligne composé de plusieurs sous-jeux, jouable seul ou à plusieurs avec un code de partie.

## Sous-jeux

- **Blind test** : un extrait de 30 s. On écrit l'artiste et/ou le titre (ou on choisit parmi 4 propositions).
- **Flash 1 seconde** : une seule seconde de musique (réécoutable 2 fois), sur les ~40 titres les plus célèbres.
- *Quelle année ?* : à venir.

## Règles de la réponse écrite

- Une seule barre de saisie : on peut taper l'artiste, le titre, ou les deux d'un coup (« queen bohemian rhapsody »). Essais illimités pendant les 30 s de la manche.
- Artiste trouvé : 10 pts. Titre trouvé : 10 pts. La moitié des mots importants du titre (hors petits mots comme « le », « the », « de »…) : 5 pts, qui passent à 10 si on trouve ensuite le titre complet.
- Chaque essai s'affiche en **vert** (bon), **jaune** (titre à moitié) ou **rouge** (faux). Quand l'artiste et le titre sont trouvés, la saisie se bloque.
- Bonus de série, pour chaque manche d'affilée où on a trouvé au moins l'artiste ou le titre complet : +10 à la 2e, +10 à la 3e, +10 à la 4e, puis +15 à chaque manche suivante.
- Entre deux musiques, un écran intertitre de 5 s montre la réponse et les points, puis la musique suivante démarre toute seule.
- Casse, accents, ponctuation, espaces et « The / Le / La / Les » au début sont ignorés.
- Fautes tolérées (lettres en trop, en moins ou différentes) : **3** pour les noms de 8 caractères et plus, 2 entre 5 et 7, 1 en dessous de 5. Réglable dans `js/core/match.js`.
- Ce qui est entre parenthèses ou après « feat. » est facultatif. D'autres réponses acceptées peuvent être ajoutées avec `artistAlt` / `titleAlt` dans le catalogue.
- Mode 4 propositions : 20 pts pour la bonne réponse, même bonus de série.

Le barème se règle en haut de `js/games/blindtest/engine.js`.

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
js/app.js                      accueil et navigation (#blindtest, #flash, #rejoindre-CODE)
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

## Ajouter des musiques

Une ligne dans `js/data/catalog.js` : `{ title: '…', artist: '…', year: 1999 }`. Ajouter `fr: true` pour la chanson française, `top: true` pour l'inclure dans le mode Flash.
