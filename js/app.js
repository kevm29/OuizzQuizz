/* Coquille de l'application : accueil + navigation entre sous-jeux (#blindtest, #flash…).
 * #rejoindre-ABCD ouvre directement le blind test avec le code de partie rempli. */
(function (MQ) {
  const h = MQ.h;
  const root = document.getElementById('app');
  let unmount = null;

  function showHome() {
    root.replaceChildren(h('section.home',
      h('div.hero',
        h('p.eyebrow', 'Jeux musicaux'),
        h('h1.display', 'Tu reconnais', h('br'), 'cette chanson ?'),
        h('p.lede', 'Plusieurs petits jeux autour des tubes que tout le monde connaît. Mets le son, choisis un jeu.')
      ),
      h('div.games', MQ.listGames().map((g, i) => {
        const num = String(i + 1).padStart(2, '0');
        return g.available === false
          ? h('div.game-card.soon', h('span.game-num', num), h('h2', g.title), h('p', g.tagline), h('span.pill', 'Bientôt'))
          : h('a.game-card', { href: '#' + g.id }, h('span.game-num', num), h('h2', g.title), h('p', g.tagline), h('span.pill.play', 'Jouer'));
      }))
    ));
  }

  function route() {
    if (unmount) { unmount(); unmount = null; }
    let id = location.hash.slice(1);
    const ctx = { exit: () => { location.hash = ''; } };
    const join = id.match(/^rejoindre-([A-Za-z0-9]{4})$/);
    if (join) { id = 'blindtest'; ctx.joinCode = join[1].toUpperCase(); }
    const game = id && MQ.getGame(id);
    document.body.classList.toggle('in-game', !!(game && game.available !== false));
    if (game && game.available !== false) {
      root.replaceChildren();
      const cleanup = game.mount(root, ctx);
      unmount = typeof cleanup === 'function' ? cleanup : null;
    } else {
      showHome();
    }
    window.scrollTo(0, 0);
  }

  document.getElementById('home-link').addEventListener('click', () => {
    if (location.hash) location.hash = ''; else route();
  });
  window.addEventListener('hashchange', route);

  // Volume personnel (propre à chaque joueur, gardé dans son navigateur).
  const vol = document.getElementById('volume');
  const muteBtn = document.getElementById('mute-btn');
  let beforeMute = MQ.player.volume || 0.8;
  function showVolume() {
    const v = MQ.player.volume;
    vol.value = Math.round(v * 100);
    vol.style.setProperty('--pct', (v * 100) + '%');
    muteBtn.classList.toggle('muted', v === 0);
    muteBtn.setAttribute('aria-label', v === 0 ? 'Remettre le son' : 'Couper le son');
  }
  vol.addEventListener('input', () => { MQ.player.setVolume(vol.value / 100); showVolume(); });
  muteBtn.addEventListener('click', () => {
    if (MQ.player.volume > 0) { beforeMute = MQ.player.volume; MQ.player.setVolume(0); }
    else MQ.player.setVolume(beforeMute || 0.8);
    showVolume();
  });
  showVolume();
  route();
})(window.MQ);
