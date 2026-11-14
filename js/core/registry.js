/*
 * Registre des sous-jeux.
 * Chaque sous-jeu appelle MQ.registerGame({...}) dans son propre fichier.
 * L'accueil liste automatiquement tous les jeux enregistrés.
 *
 * Contrat d'un sous-jeu :
 *   id          identifiant unique (string)
 *   title       nom affiché
 *   tagline     phrase courte pour la carte d'accueil
 *   available   false pour afficher la carte "bientôt"
 *   mount(root, ctx)  dessine le jeu dans root ; ctx.exit() revient à l'accueil.
 *                     Peut renvoyer une fonction de nettoyage (arrêt audio, timers…).
 */
window.MQ = window.MQ || {};

(function (MQ) {
  const games = [];

  MQ.registerGame = function (game) {
    if (!game || !game.id || typeof game.mount !== 'function' && game.available !== false) {
      throw new Error('Sous-jeu invalide : id et mount() sont requis');
    }
    if (games.some(g => g.id === game.id)) throw new Error('Sous-jeu déjà enregistré : ' + game.id);
    games.push(game);
  };

  MQ.listGames = () => games.slice();
  MQ.getGame = id => games.find(g => g.id === id);
})(window.MQ);
