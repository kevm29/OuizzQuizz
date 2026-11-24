/*
 * Écrans du blind test (solo, hôte et invité).
 * L'écran ne fait qu'afficher les messages du moteur et lui renvoyer les réponses :
 * en solo le moteur tourne dans la même page, en ligne il tourne chez l'hôte.
 */
(function (MQ) {
  const h = MQ.h;

  const secLabel = n => n + (n > 1 ? ' secondes' : ' seconde');
  const LISTEN = [
    { id: 'normal', label: 'Extrait 30 s', help: () => 'L’extrait tourne pendant que tu cherches.' },
    { id: 'flash', label: 'Flash', help: s => 'Seulement ' + secLabel(MQ.flashSeconds(s)) + ' de musique (réécoutable 2 fois), sur les 10 % de titres les plus connus.' }
  ];
  const REFRAIN_HELP = { help: () => 'Une ligne du refrain s’affiche, puis une autre toutes les 10 s (4 au plus), le titre caché en astérisques. Bonus si tu trouves dès la 1re ligne (+20), la 2e (+10) ou la 3e (+5).' };
  const YEAR_HELP = { help: () => 'Un extrait de 30 s : donne l’année de sortie. Année exacte 50 pts, à 2 ans près 30 pts, sinon bonne décennie 25 pts. Une seule réponse par manche.' };
  const ANSWER = [
    { id: 'text', label: 'Écrire la réponse', help: () => 'Une seule barre, essais illimités, jusqu’à 3 fautes tolérées. Artiste 20 pts, titre 20 pts, moitié de l’un ou l’autre 10 pts. À plusieurs : +30 %, +20 %, +10 % pour les 3 premiers à trouver.' },
    { id: 'choice', label: 'Propositions', help: s => 'Choisis le bon titre parmi ' + MQ.choiceCount(s) + ' : 40 pts.' }
  ];
  const gameTitle = s => s.listen === 'flash' ? 'Flash ' + MQ.flashSeconds(s) + ' s'
    : s.listen === 'refrain' ? 'Refrain' : s.listen === 'year' ? 'Quelle année ?' : 'Blind test';
  const gameCard = s => s.listen === 'flash' ? 'Flash' : s.listen === 'refrain' ? 'Refrain' : s.listen === 'year' ? 'Quelle année ?' : 'Blind test';

  function mount(root, ctx, preset) {
    let screenCleanups = [];
    const S = {
      role: null, engine: null, net: null, myId: null,
      code: null, hostId: null, players: [], answered: [],
      screen: null, round: null, history: [], score: 0
    };
    const saved = MQ.store.get('blindtest.settings', {});
    let settings = Object.assign({ rounds: 10, category: 'all', level: 'hits', style: 'all', listen: 'normal', answer: 'text', flashSec: 1, choices: 4 }, saved, preset || {});
    if (!MQ.categories.some(c => c.id === settings.category)) settings.category = 'all';
    if (!MQ.styles.some(c => c.id === settings.style)) settings.style = 'all';
    if (settings.answer !== 'choice') settings.answer = 'text';
    let playerName = MQ.store.get('player.name', '');

    /* ---------- outils ---------- */
    function clear(screen) {
      screenCleanups.forEach(f => f());
      screenCleanups = [];
      root.replaceChildren();
      S.screen = screen;
    }
    const later = (fn, ms) => { const t = setTimeout(fn, ms); screenCleanups.push(() => clearTimeout(t)); };
    function onKey(handler) {
      document.addEventListener('keydown', handler);
      screenCleanups.push(() => document.removeEventListener('keydown', handler));
    }
    const isMulti = () => S.role === 'host' || S.role === 'guest';
    const isLeader = () => S.role === 'host' || S.role === 'solo';
    const nameOf = id => (S.players.find(p => p.id === id) || {}).name || '?';

    function initials(name) {
      const parts = String(name || '?').trim().split(/[\s\-_.]+/).filter(Boolean);
      const txt = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] || '?').slice(0, 2);
      return txt.toUpperCase();
    }
    // 1 étoile au bonus de 2 manches d'affilée, 2 étoiles à 3, etc.
    function stars(streak) {
      const n = streak >= 2 ? streak - 1 : 0;
      if (!n) return null;
      return h('span.stars', { title: 'Série de ' + streak + ' manches', 'aria-label': n + ' étoile' + (n > 1 ? 's' : '') },
        n <= 5 ? '★'.repeat(n) : '★×' + n);
    }
    function pauseButton() {
      if (!isLeader()) return null;
      const btn = h('button.btn.ghost.pause-btn#pause-btn', { type: 'button', onclick: () => {
        if (S.paused) S.engine.resume(); else S.engine.pause();
      } }, S.paused ? 'Reprendre' : 'Pause');
      return btn;
    }
    function pausedBanner() {
      return h('div.paused-banner', { hidden: !S.paused },
        h('p', 'Pause'),
        h('span.meta', isLeader() ? 'La partie est en pause.' : 'L’hôte a mis la partie en pause.'),
        isLeader() ? h('button.btn.primary', { type: 'button', onclick: () => S.engine.resume() }, 'Reprendre') : null);
    }
    // Carte « musique précédente » : pochette, titre, artiste et initiales de ceux qui ont trouvé.
    function prevSongCard() {
      const p = S.prev;
      if (!p) return null;
      const R = MQ.BLINDTEST_RULES;
      const finders = p.results.filter(r => r.base > 0);
      return h('div.field',
        h('span.label', 'Musique précédente'),
        h('div.prev-song',
          p.artwork ? h('img.prev-cover', { src: p.artwork, alt: '', width: 56, height: 56 }) : h('div.prev-cover'),
          h('div.prev-text',
            h('strong', p.song.title),
            h('span.meta-line', p.song.artist + ' · ' + p.song.year),
            h('div.prev-finders', finders.length
              ? finders.map(r => {
                  const full = p.answer === 'choice' ? true : p.answer === 'year' ? r.yearPts === R.PTS_YEAR_EXACT : r.artist === R.PTS_ARTIST && r.title === R.PTS_TITLE;
                  return h('span.initials' + (full ? '.full' : '.part'), {
                    title: r.name + (p.answer === 'year' ? ' : ' + r.year + (full ? ' (pile)' : '') : full ? ' : tout trouvé' : ' : trouvé en partie')
                  }, initials(r.name));
                })
              : h('span.none', 'Personne n’a trouvé')))));
    }

    function saveSettings() { MQ.store.set('blindtest.settings', settings); }

    function endSession() {
      if (S.engine) S.engine.destroy();
      if (S.net) S.net.close();
      S.engine = S.net = S.role = S.myId = S.code = null;
      S.players = [];
      MQ.player.stop();
    }

    function toHost(msg) {
      if (S.role === 'guest') S.net.send(msg);
      else if (S.engine) S.engine.receive(S.myId, msg);
    }

    // Le moteur parle à tout le monde (to = null) ou à un joueur précis.
    function engineSend(to, msg) {
      if (to === null || to === S.myId) setTimeout(() => onMsg(msg), 0);
      if (S.net && to === null) S.net.broadcast(msg);
      else if (S.net && to !== S.myId) S.net.send(to, msg);
    }

    /* ---------- réglages (menu et salon) ---------- */
    function chipGroup(label, items, current, onPick, disabled) {
      return h('div.field',
        h('span.label', label),
        h('div.chips', { role: 'radiogroup', 'aria-label': label },
          items.map(it => h('button.chip', {
            type: 'button', role: 'radio', disabled: !!disabled,
            'aria-checked': String(current === it.id),
            onclick: () => onPick(it.id)
          }, it.label))));
    }

    function settingsBlock(onChange, readOnly) {
      const set = (k, v) => { settings[k] = v; saveSettings(); onChange(); };
      const pool = MQ.poolFor(settings);
      const refrain = settings.listen === 'refrain';
      const year = settings.listen === 'year';
      const listen = refrain ? REFRAIN_HELP : year ? YEAR_HELP : LISTEN.find(l => l.id === settings.listen);
      const answer = ANSWER.find(a => a.id === settings.answer);
      const R = MQ.BLINDTEST_RULES;
      const browse = settings.listen === 'normal' || year; // réglages du catalogue complet
      // Quelle année ? : pas de période « Avant 1960 » ni de classique (dates de composition).
      const cats = year ? MQ.categories.filter(c => c.id !== 'old') : MQ.categories;
      const styles = year ? MQ.styles.filter(c => c.id !== 'classique') : MQ.styles;
      return h('div.settings',
        refrain || year ? null : chipGroup('Écoute', LISTEN, settings.listen, v => set('listen', v), readOnly),
        settings.listen === 'flash'
          ? chipGroup('Durée du flash', R.FLASH_SECONDS.map(n => ({ id: n, label: secLabel(n) })), MQ.flashSeconds(settings), v => set('flashSec', v), readOnly)
          : null,
        year ? null : chipGroup('Réponse', ANSWER, settings.answer, v => set('answer', v), readOnly),
        !year && settings.answer === 'choice'
          ? chipGroup('Propositions', R.CHOICE_COUNTS.map(n => ({ id: n, label: n + ' choix' })), MQ.choiceCount(settings), v => set('choices', v), readOnly)
          : null,
        chipGroup('Manches', [5, 10, 15].map(n => ({ id: n, label: n + ' manches' })), settings.rounds, v => set('rounds', v), readOnly),
        browse
          ? chipGroup('Niveau', MQ.levels.map(l => ({ id: l.id, label: l.label })), settings.level, v => set('level', v), readOnly)
          : null,
        browse
          ? chipGroup('Période', cats.map(c => ({ id: c.id, label: c.label })), settings.category, v => set('category', v), readOnly)
          : null,
        browse
          ? chipGroup('Style', styles.map(c => ({ id: c.id, label: c.label })), settings.style, v => set('style', v), readOnly)
          : null,
        h('p.meta', listen.help(settings) + (year ? '' : ' ' + answer.help(settings)) + ' ' + pool.length.toLocaleString('fr-FR') + ' titres possibles.'
          + (pool.length < settings.rounds ? ' Pas assez de titres pour ce mélange : élargis la période, le niveau ou le style.' : ''))
      );
    }

    /* ---------- menu ---------- */
    function showMenu(error) {
      endSession();
      clear('menu');
      const nameInput = h('input.text-input#player-name', {
        type: 'text', maxLength: 20, placeholder: 'Ton pseudo', value: playerName, autocomplete: 'nickname',
        oninput: e => { playerName = e.target.value; MQ.store.set('player.name', playerName); }
      });
      const codeInput = h('input.text-input.code-input#join-code', {
        type: 'text', maxLength: 4, placeholder: 'CODE', autocomplete: 'off', autocapitalize: 'characters',
        value: ctx.joinCode || '', 'aria-label': 'Code de la partie',
        onkeydown: e => { if (e.key === 'Enter') doJoin(); }
      });
      const errBox = h('p.error', { hidden: !error, role: 'alert' }, error || '');
      const needName = () => {
        if (playerName.trim()) return true;
        errBox.textContent = 'Choisis d’abord un pseudo.'; errBox.hidden = false; nameInput.focus();
        return false;
      };
      function doJoin() {
        if (!needName()) return;
        const code = MQ.net.cleanCode(codeInput.value);
        if (code.length !== 4) { errBox.textContent = 'Le code fait 4 caractères.'; errBox.hidden = false; codeInput.focus(); return; }
        joinOnline(code);
      }

      const title = h('h1.display');
      const settingsHost = h('div');
      const renderSettings = () => {
        title.textContent = gameTitle(settings);
        settingsHost.replaceChildren(settingsBlock(renderSettings));
      };
      renderSettings();

      root.append(h('section.panel.setup',
        h('p.eyebrow', settings.listen === 'refrain' ? 'Paroles' : settings.listen === 'year' ? 'Machine à remonter le temps' : 'Blind test'),
        title,
        settings.listen === 'refrain'
          ? h('p.lede', 'Pas de musique : une phrase du refrain apparaît, puis une deuxième, une troisième, une quatrième. Trouve l’artiste et le titre le plus tôt possible. Seul ou à plusieurs en ligne avec un code de partie.')
          : settings.listen === 'year'
            ? h('p.lede', 'Un extrait démarre : de quelle année est cette chanson ? Pile : 50 pts. À 2 ans près : 30 pts. Dans la bonne décennie : 25 pts. Seul ou à plusieurs en ligne avec un code de partie.')
            : h('p.lede', 'Un extrait démarre : trouve l’artiste et le titre avant la fin du chrono de 30 secondes. Bonus de série dès 2 manches réussies d’affilée. Seul ou à plusieurs en ligne avec un code de partie.'),
        h('div.field', h('label.label', { htmlFor: 'player-name' }, 'Ton pseudo'), nameInput),
        settingsHost,
        errBox,
        h('div.actions',
          h('button.btn.primary#solo-btn', { type: 'button', onclick: () => { if (needName()) startSolo(); } }, 'Jouer en solo'),
          h('button.btn.ghost#host-btn', { type: 'button', onclick: () => { if (needName()) createOnline(); } }, 'Créer une partie en ligne')
        ),
        h('div.join-box',
          h('h2', 'Rejoindre une partie'),
          h('p.meta', 'Entre le code à 4 caractères donné par l’hôte.'),
          h('div.join-row', codeInput, h('button.btn.primary#join-btn', { type: 'button', onclick: doJoin }, 'Rejoindre'))
        )
      ));
      if (ctx.joinCode) { ctx.joinCode = null; (playerName ? codeInput : nameInput).focus(); }
    }

    function showWaiting(text) {
      clear('waiting');
      root.append(h('section.panel.loading', MQ.equalizer(7), h('p', text)));
    }

    function showError(text) {
      endSession();
      clear('error');
      root.append(h('section.panel',
        h('h2', 'Oups'),
        h('p.lede', text),
        h('button.btn.primary', { type: 'button', onclick: () => showMenu() }, 'Retour')
      ));
    }

    /* ---------- démarrage ---------- */
    function startSolo() {
      MQ.player.unlock();
      S.role = 'solo';
      S.myId = 'me';
      S.engine = new MQ.BlindtestEngine(engineSend, 'me');
      S.engine.settings = Object.assign({}, settings);
      S.engine.addPlayer('me', playerName);
      S.engine.start();
    }

    function createOnline() {
      if (!MQ.net.available()) return showMenu('Le module multijoueur n’a pas pu se charger.');
      MQ.player.unlock();
      showWaiting('Création de la partie…');
      S.role = 'host';
      S.myId = 'host';
      S.engine = new MQ.BlindtestEngine(engineSend, 'host');
      S.engine.settings = Object.assign({}, settings);
      S.net = MQ.net.host({
        onReady(code) { S.engine.code = code; S.engine.addPlayer('host', playerName); },
        onMessage(id, msg) {
          if (!S.engine || !msg) return;
          if (msg.t === 'hello') { S.net.send(id, { t: 'welcome', id }); S.engine.addPlayer(id, msg.name); }
          else S.engine.receive(id, msg);
        },
        onLeave(id) { if (S.engine) S.engine.removePlayer(id); },
        onError: showError
      });
    }

    function joinOnline(code) {
      if (!MQ.net.available()) return showMenu('Le module multijoueur n’a pas pu se charger.');
      MQ.player.unlock();
      showWaiting('Connexion à la partie ' + code + '…');
      S.role = 'guest';
      S.net = MQ.net.join(code, {
        onOpen() { S.net.send({ t: 'hello', name: playerName }); },
        onMessage: onMsg,
        onClose() { showError('L’hôte a quitté la partie.'); },
        onError: showError
      });
    }

    /* ---------- messages du moteur ---------- */
    function onMsg(msg) {
      if (!msg || !S.role) return;
      switch (msg.t) {
        case 'welcome': S.myId = msg.id; break;
        case 'lobby':
          S.players = msg.players; S.code = msg.code; S.hostId = msg.hostId;
          if (S.role === 'guest') settings = Object.assign({}, settings, msg.settings);
          if (S.role !== 'solo' && msg.state === 'lobby') showLobby();
          break;
        case 'loading': if (S.screen !== 'round') showWaiting(settings.listen === 'refrain' ? 'Recherche du refrain…' : 'Chargement de l’extrait…'); break;
        case 'round': showRound(msg); break;
        case 'progress': if (S.onProgress) S.onProgress(msg.players); break;
        case 'feedback': if (S.onFeedback) S.onFeedback(msg); break;
        case 'pause':
          S.paused = msg.paused;
          if (S.onPause) S.onPause(msg.paused);
          break;
        case 'reveal': showReveal(msg); break;
        case 'end': showEnd(msg); break;
        case 'fail': showError(msg.reason); break;
      }
    }

    /* ---------- salon ---------- */
    function showLobby() {
      clear('lobby');
      const link = location.origin + location.pathname + '#rejoindre-' + S.code;
      const copyBtn = h('button.btn.ghost', {
        type: 'button',
        onclick: () => {
          const done = () => { copyBtn.textContent = 'Lien copié'; later(() => { copyBtn.textContent = 'Copier le lien'; }, 2000); };
          if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, () => {});
        }
      }, 'Copier le lien');

      const leader = S.role === 'host';
      const settingsHost = h('div');
      const renderSettings = () => settingsHost.replaceChildren(
        settingsBlock(() => { renderSettings(); if (S.engine) S.engine.setSettings(Object.assign({}, settings)); }, !leader));
      renderSettings();

      root.append(h('section.panel.lobby',
        h('p.eyebrow', 'Salon de la partie'),
        h('div.code-card',
          h('span.label', 'Code'),
          h('p.code', S.code),
          h('p.meta', 'Tes amis ouvrent le jeu, cliquent sur ' + gameCard(settings) + ' et entrent ce code. Ou envoie-leur le lien.'),
          copyBtn
        ),
        h('div.field',
          h('span.label', 'Joueurs (' + S.players.length + ')'),
          h('ul.players', S.players.map(p => h('li',
            h('span', p.name),
            p.id === S.hostId ? h('span.tag', 'hôte') : null,
            p.id === S.myId ? h('span.tag.me', 'toi') : null)))
        ),
        settingsHost,
        leader
          ? h('div.actions',
              h('button.btn.primary#launch-btn', { type: 'button', onclick: () => { MQ.player.unlock(); S.engine.start(); } }, 'Lancer la partie'),
              h('button.btn.ghost', { type: 'button', onclick: () => showMenu() }, 'Fermer la partie'))
          : h('div.actions',
              h('p.meta.waiting', MQ.equalizer(4), 'En attente du lancement par l’hôte…'),
              h('button.btn.ghost', { type: 'button', onclick: () => showMenu() }, 'Quitter'))
      ));
    }

    /* ---------- manche ---------- */
    function showRound(msg) {
      clear('round');
      if (msg.n === 1) { S.history = []; S.score = 0; S.streak = 0; S.prev = null; S.standings = null; }
      S.round = msg;
      S.paused = false;
      let stopped = false, startedAt = null, raf = null, replays = 2, roundPts = 0, pausedAt = null, pausedMs = 0;
      const seconds = msg.seconds;
      const R = MQ.BLINDTEST_RULES;

      const timerFill = h('div.timer-fill');
      const timerText = h('span.timer-text', seconds + ' s');
      const refrain = msg.listen === 'refrain';
      const status = h('p.status', refrain ? 'Ligne 1 / ' + msg.lines.length : 'Écoute…');
      const lyricLines = refrain ? msg.lines.map((l, i) => h('li.lyric' + (i ? '' : '.on'), { hidden: i > 0 }, l)) : [];
      const eq = MQ.equalizer(9);
      const launchBtn = h('button.btn.ghost', { type: 'button', hidden: true, onclick: begin }, 'Lancer l’extrait');
      const replayBtn = h('button.btn.ghost#replay-btn', { type: 'button', hidden: true, onclick: replay }, 'Réécouter (2)');
      const scorePill = h('span.pill.score', S.score + ' pts');
      const board = h('ul.scoreboard', { 'aria-label': 'Scores' });
      const banner = pausedBanner();
      const pauseBtn = pauseButton();

      let answerArea, input, sendBtn, buttons, artistBadge, titleBadge, guessList, yearInput, yearSlider, yearBtn;
      const yearMode = msg.answer === 'year';
      if (yearMode) {
        // Quelle année ? : un curseur et une case, une seule réponse.
        const now = new Date().getFullYear();
        const start = 1990;
        yearInput = h('input.text-input.year-input#year-guess', {
          type: 'text', inputMode: 'numeric', maxLength: 4, placeholder: 'Année', autocomplete: 'off', value: String(start),
          'aria-label': 'Année de sortie',
          oninput: () => { const y = parseYear(yearInput.value); if (y) yearSlider.value = y; }
        });
        yearSlider = h('input.year-slider#year-slider', {
          type: 'range', min: R.YEAR_MIN, max: now, step: 1, value: start, 'aria-label': 'Année de sortie',
          oninput: () => { yearInput.value = yearSlider.value; }
        });
        yearBtn = h('button.btn.primary#year-send', { type: 'submit' }, 'Valider');
        const nudge = d => h('button.btn.ghost.year-nudge', { type: 'button', 'aria-label': (d > 0 ? '+' : '') + d + ' an', onclick: () => {
          const y = Math.min(now, Math.max(R.YEAR_MIN, (parseYear(yearInput.value) || start) + d));
          yearInput.value = yearSlider.value = y;
        } }, (d > 0 ? '+' : '−') + Math.abs(d));
        answerArea = h('div.answer-zone.year-zone',
          h('form.year-form', { onsubmit: e => { e.preventDefault(); sendYear(); } },
            h('div.year-row', nudge(-10), nudge(-1), yearInput, nudge(1), nudge(10)),
            yearSlider,
            h('div.year-scale', h('span', String(R.YEAR_MIN)), h('span', String(now))),
            yearBtn),
          h('p.meta', 'Pile : ' + R.PTS_YEAR_EXACT + ' pts · à ' + R.YEAR_NEAR + ' ans près : ' + R.PTS_YEAR_NEAR + ' pts · bonne décennie : ' + R.PTS_YEAR_DECADE + ' pts. Une seule réponse : prends ton temps, ou pas.'));
      } else if (msg.answer === 'choice') {
        buttons = msg.options.map((o, i) => h('button.option', {
          type: 'button', onclick: () => { if (stopped) return; toHost({ t: 'guess', id: msg.id, choice: i, elapsed: myElapsed() }); lock(); buttons[i].classList.add('picked'); status.textContent = isMulti() ? 'Réponse envoyée. On attend les autres…' : 'Réponse envoyée.'; }
        }, h('span.key', String(i + 1)), h('span.opt-text', h('strong', o.title), h('span', o.artist))));
        answerArea = h('div.options', buttons);
        onKey(e => {
          const n = parseInt(e.key, 10);
          if (!stopped && n >= 1 && n <= buttons.length) buttons[n - 1].click();
        });
      } else {
        artistBadge = h('div.badge#artist-badge', h('span.label', 'Artiste'), h('span.badge-value', '?'));
        titleBadge = h('div.badge#title-badge', h('span.label', 'Titre'), h('span.badge-value', '?'));
        input = h('input.text-input.guess-input#guess', {
          type: 'text', placeholder: 'Artiste, titre, ou les deux…', autocomplete: 'off', spellcheck: false,
          enterKeyHint: 'send', 'aria-label': 'Ta réponse'
        });
        sendBtn = h('button.btn.primary#send-btn', { type: 'submit' }, 'Valider');
        guessList = h('ul.guesses', { 'aria-live': 'polite' });
        answerArea = h('div.answer-zone',
          h('div.badges', artistBadge, titleBadge),
          h('form.guess-form', { onsubmit: e => { e.preventDefault(); sendGuess(); } }, input, sendBtn),
          h('p.meta', 'Artiste ' + R.PTS_ARTIST + ' pts · titre ' + R.PTS_TITLE + ' pts · la moitié des mots de l’artiste ou du titre : ' + R.PTS_HALF_TITLE + ' pts. Tu peux essayer autant de fois que tu veux.' + (isMulti() ? ' Les 3 premiers à trouver gagnent +30 %, +20 %, +10 %.' : '')),
          guessList);
      }

      const panel = h('section.panel.round',
        h('div.round-head',
          h('span.pill', 'Manche ' + msg.n + ' / ' + msg.total),
          scorePill,
          stars(S.streak),
          msg.listen === 'flash' ? h('span.pill.streak', 'Flash ' + Math.round(msg.flashMs / 1000) + ' s') : null,
          yearMode ? h('span.pill.streak', 'Quelle année ?') : null,
          pauseBtn),
        banner,
        refrain
          ? h('div.stage.lyrics-stage', h('ol.lyrics', { 'aria-live': 'polite' }, lyricLines), status)
          : h('div.stage', eq, status, h('div.stage-actions', launchBtn, replayBtn)),
        h('div.timer', { role: 'progressbar', 'aria-label': 'Temps restant' }, timerFill, timerText),
        answerArea,
        h('div.side',
          h('div.field', h('span.label', 'Scores'), board),
          prevSongCard())
      );
      root.append(panel);
      // On ne peut répondre qu'une fois la musique lancée chez soi (le chrono part de là).
      if (input) input.disabled = sendBtn.disabled = true;
      if (buttons) buttons.forEach(b => { b.disabled = true; });
      if (yearMode) setYearDisabled(true);

      function parseYear(v) {
        const t = String(v || '').replace(/\D/g, '');
        let y = Number(t);
        if (t.length === 2) y += y > (new Date().getFullYear() % 100) ? 1900 : 2000; // « 87 » = 1987
        return t.length === 2 || t.length === 4 ? y : null;
      }
      function setYearDisabled(off) {
        [yearInput, yearSlider, yearBtn].concat(Array.from(answerArea.querySelectorAll('.year-nudge'))).forEach(el => { el.disabled = off; });
      }
      function sendYear() {
        if (stopped || S.paused) return;
        const y = parseYear(yearInput.value);
        if (!y || y < 1900 || y > new Date().getFullYear()) { status.textContent = 'Une année entre 1900 et ' + new Date().getFullYear() + ', stp.'; return; }
        toHost({ t: 'guess', id: msg.id, year: y, elapsed: myElapsed() });
        lock();
        answerArea.classList.add('sent');
        status.textContent = (isMulti() ? 'Réponse envoyée : ' + y + '. On attend les autres…' : 'Réponse envoyée : ' + y + '.');
      }

      function sendGuess() {
        const text = input.value.trim();
        if (!text || stopped || S.paused) return;
        toHost({ t: 'guess', id: msg.id, text, elapsed: myElapsed() });
        input.value = '';
        input.focus({ preventScroll: true });
      }

      const RESULT_CLASS = { good: '.good', half: '.half', bad: '.bad' };
      S.onFeedback = fb => {
        if (fb.id !== msg.id) return;
        if (guessList) {
          guessList.prepend(h('li' + (RESULT_CLASS[fb.result] || ''), fb.text));
          input.classList.remove('good', 'half', 'bad');
          void input.offsetWidth;
          input.classList.add(fb.result);
          setBadge(artistBadge, fb.artist === 'half' ? 'half' : fb.artist ? 'ok' : null, fb.artist === 'half' ? 'à moitié' : fb.artist);
          setBadge(titleBadge, fb.title === 'half' ? 'half' : fb.title ? 'ok' : null, fb.title === 'half' ? 'à moitié' : fb.title);
        }
        roundPts = fb.pts;
        scorePill.textContent = (S.score + roundPts) + ' pts';
        renderBoard();
        if (fb.done) {
          lock();
          status.textContent = msg.answer === 'choice' ? status.textContent : 'Tout trouvé ! Bravo.';
        }
      };
      // Tableau des scores : total (scores précédents + points de la manche en cours), étoiles de série.
      let live = S.players.map(p => ({ id: p.id, name: p.name }));
      function renderBoard() {
        const before = new Map((S.standings || []).map(p => [p.id, p]));
        const rows = live.map(p => {
          const prev = before.get(p.id) || { score: 0, streak: 0 };
          let now = 0;
          if (msg.answer === 'text') now = (p.artist || 0) + (p.title || 0);  // année et propositions : dévoilés à l'intertitre
          if (p.id === S.myId) now = roundPts;
          return { p, total: prev.score + now, streak: prev.streak };
        }).sort((a, b) => b.total - a.total);
        board.replaceChildren(...rows.map(({ p, total, streak }) => h('li' + (p.id === S.myId ? '.me' : ''),
          h('span.initials', { title: p.name }, initials(p.name)),
          h('span.sb-name', p.name),
          stars(streak) || h('span'),
          h('span.sb-dots', msg.answer !== 'text'
            ? h('span.dot' + (p.answered || p.done ? '.on' : ''), { title: 'a répondu' })
            : [h('span.dot' + (p.artist === R.PTS_ARTIST ? '.on' : p.artist ? '.mid' : ''), { title: 'artiste' }),
               h('span.dot' + (p.title === R.PTS_TITLE ? '.on' : p.title ? '.mid' : ''), { title: 'titre' })]),
          h('span.sb-score', total + ' pts'))));
      }
      S.onProgress = list => { live = list; renderBoard(); };
      S.onPause = paused => {
        banner.hidden = !paused;
        if (pauseBtn) pauseBtn.textContent = paused ? 'Reprendre' : 'Pause';
        panel.classList.toggle('is-paused', paused);
        if (paused) {
          pausedAt = performance.now();
          clearTimeout(raf);
          MQ.player.pause();
          eq.classList.remove('on');
          if (input) input.disabled = sendBtn.disabled = true;
          if (buttons) buttons.forEach(b => { b.disabled = true; });
          if (yearMode) setYearDisabled(true);
          replayBtn.disabled = true;
        } else {
          if (pausedAt != null) pausedMs += performance.now() - pausedAt;
          pausedAt = null;
          MQ.player.resume();
          replayBtn.disabled = false;
          if (!stopped) {
            if (!refrain && msg.listen !== 'flash' && startedAt != null) eq.classList.add('on');
            if (startedAt != null) {
              if (input) { input.disabled = sendBtn.disabled = false; input.focus({ preventScroll: true }); }
              if (buttons) buttons.forEach(b => { b.disabled = false; });
              if (yearMode) setYearDisabled(false);
              tick();
            }
          }
        }
      };
      screenCleanups.push(() => { S.onFeedback = S.onProgress = S.onPause = null; });
      renderBoard();

      function setBadge(badge, state, text) {
        badge.classList.remove('ok', 'half');
        if (state) badge.classList.add(state);
        badge.querySelector('.badge-value').textContent = text || '?';
      }
      function lock() {
        stopped = true;
        clearTimeout(raf);
        replayBtn.hidden = true;
        if (buttons) buttons.forEach(b => { b.disabled = true; });
        if (input) { input.disabled = sendBtn.disabled = true; }
        if (yearMode) setYearDisabled(true);
      }

      // Temps écoulé pour CE joueur, depuis qu'il entend la musique (pauses déduites).
      function myElapsed() {
        if (startedAt == null) return seconds * 1000;
        const pauseNow = pausedAt != null ? performance.now() - pausedAt : 0;
        return Math.round(performance.now() - startedAt - pausedMs - pauseNow);
      }
      // Le chrono ne dépasse jamais la fin de l'extrait : quand la musique s'arrête, la manche s'arrête.
      let limit = seconds;
      function startTimer() {
        if (startedAt != null) return;
        startedAt = performance.now();
        const a = MQ.player.audio;
        if (!refrain && msg.listen !== 'flash' && isFinite(a.duration) && a.duration > 5) limit = Math.min(seconds, a.duration - a.currentTime);
        tick();
      }
      function tick() {
        clearTimeout(raf);
        if (stopped || S.paused) return;
        const left = Math.max(0, limit - (performance.now() - startedAt - pausedMs) / 1000);
        timerFill.style.transform = 'scaleX(' + (left / limit) + ')';
        timerText.textContent = Math.ceil(left) + ' s';
        timerFill.classList.toggle('hurry', left < 5);
        if (refrain) showLines((performance.now() - startedAt - pausedMs) / 1000);
        if (left <= 0) return timeUp();
        raf = setTimeout(tick, 100); // setTimeout plutôt que l'animation : continue aussi dans un onglet en arrière-plan
      }
      function timeUp() {
        if (stopped) return;
        lock();
        eq.classList.remove('on');
        timerFill.style.transform = 'scaleX(0)';
        timerText.textContent = '0 s';
        status.textContent = 'Temps écoulé !';
        toHost({ t: 'timeup', id: msg.id });
      }
      let shown = 1;
      function showLines(t) {
        const n = Math.min(msg.lines.length, Math.floor(t / msg.lineSeconds) + 1);
        if (n === shown) return;
        shown = n;
        lyricLines.forEach((li, i) => { li.hidden = i >= n; li.classList.toggle('on', i === n - 1); });
        status.textContent = 'Ligne ' + n + ' / ' + msg.lines.length;
      }
      const onEnded = () => { if (!refrain && msg.listen !== 'flash' && startedAt != null && !S.paused) timeUp(); };
      MQ.player.audio.addEventListener('ended', onEnded);
      screenCleanups.push(() => { clearTimeout(raf); MQ.player.audio.removeEventListener('ended', onEnded); });

      function playOnce() {
        return msg.listen === 'flash'
          ? MQ.player.playSegment(msg.previewUrl, msg.offset, msg.flashMs)
          : MQ.player.play(msg.previewUrl);
      }
      function begin() {
        launchBtn.hidden = true;
        if (refrain) {
          if (!S.paused && input) { input.disabled = sendBtn.disabled = false; input.focus({ preventScroll: true }); }
          if (!S.paused && buttons) buttons.forEach(b => { b.disabled = false; });
          startTimer();
          return;
        }
        playOnce().then(() => {
          if (stopped) return;
          if (S.paused) { MQ.player.pause(); MQ.player._resumeOnPlay = msg.listen !== 'flash'; }
          status.textContent = msg.listen === 'flash' ? (msg.flashMs > 1000 ? Math.round(msg.flashMs / 1000) + ' secondes… c’est quoi ?' : 'Une seconde… c’est quoi ?')
            : yearMode ? 'C’est sorti en quelle année ?' : 'Quel est ce titre ?';
          eq.classList.add('on');
          if (!S.paused) {
            if (input) { input.disabled = sendBtn.disabled = false; input.focus({ preventScroll: true }); }
            if (buttons) buttons.forEach(b => { b.disabled = false; });
            if (yearMode) { setYearDisabled(false); yearInput.focus({ preventScroll: true }); yearInput.select(); }
          }
          if (msg.listen === 'flash') {
            later(() => eq.classList.remove('on'), msg.flashMs);
            replayBtn.hidden = replays <= 0;
          }
          startTimer();
        }).catch(() => {
          status.textContent = 'Le navigateur a bloqué le son.';
          launchBtn.hidden = false;
        });
      }
      function replay() {
        if (replays <= 0 || stopped || S.paused) return;
        replays--;
        replayBtn.textContent = 'Réécouter (' + replays + ')';
        replayBtn.hidden = replays <= 0;
        eq.classList.add('on');
        later(() => eq.classList.remove('on'), msg.flashMs);
        MQ.player.playSegment(msg.previewUrl, msg.offset, msg.flashMs).catch(() => {});
      }

      later(begin, 50);
    }

    /* ---------- intertitre (réponse + scores, 5 s) ---------- */
    function showReveal(msg) {
      clear('reveal');
      const R = MQ.BLINDTEST_RULES;
      const mine = msg.results.find(r => r.id === S.myId);
      const me = msg.standings.find(p => p.id === S.myId);
      if (me) { S.score = me.score; S.streak = me.streak; }
      if (mine) S.history.push({ song: msg.song, res: mine });
      S.standings = msg.standings;
      S.prev = { song: msg.song, artwork: msg.artwork, results: msg.results, answer: S.round && S.round.answer };

      // Intertitre silencieux.
      MQ.player.fadeOut(300);

      const text = S.round && S.round.answer === 'text';
      const yearMode = S.round && S.round.answer === 'year';
      const gap = r => r.year ? Math.abs(r.year - msg.song.year) : null;
      const yearLabel = r => !r.year ? 'pas de réponse' : r.yearPts === R.PTS_YEAR_EXACT ? r.year + ' : pile !'
        : r.year + ' (' + gap(r) + ' an' + (gap(r) > 1 ? 's' : '') + ' d’écart)';
      const tone = !mine ? '.bad' : yearMode ? (mine.yearPts === R.PTS_YEAR_EXACT ? '.good' : mine.yearPts ? '.half' : '.bad')
        : (mine.artist === R.PTS_ARTIST && mine.title === R.PTS_TITLE) ? '.good' : mine.pts ? '.half' : '.bad';
      const parts = [];
      if (mine) {
        if (yearMode) {
          const why = mine.yearPts === R.PTS_YEAR_EXACT ? 'pile' : mine.yearPts === R.PTS_YEAR_NEAR ? 'à ' + R.YEAR_NEAR + ' ans près' : mine.yearPts ? 'bonne décennie' : '';
          parts.push(h('span.part' + (mine.yearPts === R.PTS_YEAR_EXACT ? '.ok' : mine.yearPts ? '.mid' : '.ko'),
            'Ta réponse : ' + yearLabel(mine) + (mine.yearPts ? ' · ' + why + ' +' + mine.yearPts : '')));
        } else if (text) {
          parts.push(h('span.part' + (mine.artist === R.PTS_ARTIST ? '.ok' : mine.artist ? '.mid' : '.ko'), 'Artiste ' + (mine.artist ? '+' + mine.artist : '0')));
          parts.push(h('span.part' + (mine.title === R.PTS_TITLE ? '.ok' : mine.title ? '.mid' : '.ko'), 'Titre ' + (mine.title ? '+' + mine.title : '0')));
        } else {
          parts.push(h('span.part' + (mine.base ? '.ok' : '.ko'), mine.base ? 'Bonne réponse +' + mine.base : 'Mauvaise réponse'));
        }
        const ord = n => n === 1 ? '1er' : n + 'e';
        if (mine.rankBonus) {
          const ranks = [];
          if (mine.artistRank) ranks.push((text ? 'artiste ' : '') + ord(mine.artistRank));
          if (mine.titleRank) ranks.push((text ? 'titre ' : '') + ord(mine.titleRank));
          parts.push(h('span.part.bonus', 'Rapidité (' + ranks.join(', ') + ') +' + mine.rankBonus));
        }
        if (mine.lineBonus) parts.push(h('span.part.bonus', 'Dès la ligne ' + mine.line + ' +' + mine.lineBonus));
        if (mine.bonus) parts.push(h('span.part.bonus', 'Série ×' + mine.streak + ' +' + mine.bonus));
      }

      // Barre de 5 s, qui s'arrête pendant une pause.
      const barFill = h('div.break-fill');
      const label = msg.last ? 'Résultats' : S.round && S.round.listen === 'refrain' ? 'Refrain suivant' : 'Musique suivante';
      const countdown = h('span.break-text', label + ' dans ' + Math.round(msg.breakMs / 1000) + ' s');
      let elapsed = 0, last = performance.now(), raf;
      S.paused = false;
      (function frame(now) {
        now = now || performance.now();
        if (!S.paused) elapsed += now - last;
        last = now;
        const ratio = Math.min(1, elapsed / msg.breakMs);
        barFill.style.transform = 'scaleX(' + ratio + ')';
        countdown.textContent = S.paused ? 'En pause' : label + ' dans ' + Math.max(0, Math.ceil((msg.breakMs - elapsed) / 1000)) + ' s';
        raf = requestAnimationFrame(frame);
      })();
      screenCleanups.push(() => cancelAnimationFrame(raf));
      const banner = pausedBanner();
      const pauseBtn = pauseButton();
      S.onPause = paused => {
        banner.hidden = !paused;
        if (pauseBtn) pauseBtn.textContent = paused ? 'Reprendre' : 'Pause';
      };
      screenCleanups.push(() => { S.onPause = null; });

      const roundTable = isMulti()
        ? h('div.field',
            h('span.label', 'Cette manche'),
            h('ol.board', msg.results.slice().sort((a, b) => b.pts - a.pts).map(r => h('li' + (r.id === S.myId ? '.me' : ''),
              h('span.board-name', h('span.initials' + (r.base ? ((text && !(r.artist === R.PTS_ARTIST && r.title === R.PTS_TITLE)) || (yearMode && r.yearPts !== R.PTS_YEAR_EXACT) ? '.part' : '.full') : ''), initials(r.name)), ' ', r.name),
              h('span.board-answer', yearMode ? yearLabel(r) : text
                ? [h('span.dot' + (r.artist === R.PTS_ARTIST ? '.on' : r.artist ? '.mid' : '')), ' artiste ', h('span.dot' + (r.title === R.PTS_TITLE ? '.on' : r.title ? '.mid' : '')), ' titre']
                : r.base ? 'bonne réponse' : 'raté'),
              h('span.board-pts', '+' + r.pts)))))
        : null;

      root.append(h('section.panel.round.intertitle',
        h('div.round-head',
          h('span.pill', 'Manche ' + msg.n + ' / ' + msg.total),
          h('span.pill.score', S.score + ' pts'),
          stars(S.streak),
          pauseBtn),
        banner,
        h('div.reveal' + tone,
          msg.artwork ? h('img.cover', { src: msg.artwork, alt: 'Pochette de ' + msg.song.title, width: 120, height: 120 }) : null,
          h('div.reveal-text',
            h('p.verdict', 'C’était'),
            yearMode ? h('p.reveal-year', String(msg.song.year)) : null,
            h('p.reveal-title', msg.song.title),
            h('p.reveal-artist', msg.song.artist + (yearMode ? '' : ' · ' + msg.song.year)),
            parts.length ? h('div.parts', parts, h('strong.part-total', '= ' + mine.pts + ' pts')) : null,
            msg.link ? h('a.source', { href: msg.link, target: '_blank', rel: 'noopener' }, 'Écouter en entier sur ' + msg.source) : null)),
        h('div.break', { role: 'progressbar', 'aria-label': 'Temps avant la suite' }, barFill, countdown),
        isMulti() ? h('div.side', roundTable, standingsBlock(msg.standings, 'Classement')) : null
      ));
    }

    function standingsBlock(standings, title, final) {
      const secs = ms => (ms / 1000).toFixed(1).replace('.', ',') + ' s';
      const tied = (p, i) => standings.some((q, j) => j !== i && q.score === p.score);
      const anyTie = standings.some(tied);
      return h('div.field',
        h('span.label', title),
        h('ol.board.standings' + (final ? '.final' : ''), standings.map((p, i) => h('li' + (p.id === S.myId ? '.me' : ''),
          h('span.rank', String(i + 1)),
          h('span.board-name', p.name, ' ', stars(p.streak),
            final && tied(p, i) ? h('span.tie-tag', 'égalité') : null),
          final ? h('span.board-speed', { title: 'Temps moyen pour trouver une réponse' }, p.avgMs != null ? '⏱ ' + secs(p.avgMs) : '—') : null,
          h('span.board-pts', p.score + ' pts')))),
        final && anyTie ? h('p.meta', 'À égalité de points, le plus rapide passe devant (temps moyen pour trouver l’artiste ou le titre, compté depuis le début de la musique).') : null);
    }

    /* ---------- fin ---------- */
    function showEnd(msg) {
      clear('end');
      MQ.player.fadeOut(600);
      const R = MQ.BLINDTEST_RULES;
      const leader = isLeader();
      const me = msg.standings.find(p => p.id === S.myId) || { score: S.score };
      const rank = msg.standings.findIndex(p => p.id === S.myId) + 1;
      const yearGame = msg.settings && msg.settings.listen === 'year';
      const isFull = res => yearGame ? res.yearPts === R.PTS_YEAR_EXACT : res.artist === R.PTS_ARTIST && res.title === R.PTS_TITLE;
      const perfect = S.history.filter(x => isFull(x.res)).length;

      let recordLine = '';
      if (S.role === 'solo') {
        const s = msg.settings;
        const key = [s.listen, s.answer, s.listen === 'flash' ? 'top' + MQ.flashSeconds(s) : s.category + (s.style && s.style !== 'all' ? '+' + s.style : ''), s.rounds]
          .concat(s.answer === 'choice' && s.listen !== 'year' ? [MQ.choiceCount(s)] : []).join(':');
        const best = MQ.store.get('blindtest.best3', {});
        if (!best[key] || me.score > best[key]) { best[key] = me.score; MQ.store.set('blindtest.best3', best); recordLine = ' · nouveau record !'; }
        else recordLine = ' · record : ' + best[key] + ' pts';
      }

      root.append(h('section.panel.end',
        h('p.eyebrow', 'Fin de partie'),
        isMulti()
          ? h('p.big-score', rank === 1 ? 'Victoire !' : rank + 'e place')
          : h('p.big-score', me.score, h('small', ' pts')),
        h('p.lede', (isMulti() ? me.score + ' pts · ' : '') + perfect + (yearGame ? ' année' + (perfect > 1 ? 's' : '') + ' pile' : ' sans faute') + ' sur ' + S.history.length + recordLine),
        isMulti() ? standingsBlock(msg.standings, 'Classement final', true) : null,
        h('div.field',
          h('span.label', 'Tes réponses'),
          h('ol.recap', S.history.map(x => {
            const full = isFull(x.res);
            return h('li' + (full ? '.ok' : x.res.pts ? '.half' : '.ko'),
              h('span.mark', full ? '✓' : x.res.pts ? '½' : '✗'),
              h('span.recap-text', h('strong', x.song.title), ' – ' + x.song.artist,
                yearGame ? ' · ' + x.song.year + (x.res.year ? ' (toi : ' + x.res.year + ')' : ' (pas de réponse)') : ''),
              h('span.recap-pts', '+' + x.res.pts + (x.res.bonus ? ' (série +' + x.res.bonus + ')' : '')));
          }))),
        h('div.actions',
          leader ? h('button.btn.primary', { type: 'button', onclick: () => { MQ.player.unlock(); S.engine.start(); } }, isMulti() ? 'Rejouer avec les mêmes joueurs' : 'Rejouer') : h('p.meta.waiting', 'L’hôte peut relancer une partie.'),
          S.role === 'host' ? h('button.btn.ghost', { type: 'button', onclick: () => S.engine.backToLobby() }, 'Changer les réglages') : null,
          h('button.btn.ghost', { type: 'button', onclick: () => showMenu() }, S.role === 'solo' ? 'Changer les réglages' : 'Quitter la partie'),
          h('button.btn.ghost', { type: 'button', onclick: ctx.exit }, 'Autres jeux'))
      ));
    }

    showMenu();
    return () => { screenCleanups.forEach(f => f()); endSession(); };
  }

  MQ.registerGame({
    id: 'blindtest',
    title: 'Blind test',
    tagline: 'Un extrait de 30 s : écris l’artiste et le titre, seul ou en ligne avec tes amis.',
    mount: (root, ctx) => mount(root, ctx, { listen: 'normal' })
  });
  MQ.registerGame({
    id: 'flash',
    title: 'Flash',
    tagline: '1, 2 ou 3 secondes des plus grands tubes. Tu la reconnais ?',
    mount: (root, ctx) => mount(root, ctx, { listen: 'flash' })
  });
  MQ.registerGame({
    id: 'refrain',
    title: 'Refrain',
    tagline: 'Pas de son : le refrain s’affiche ligne par ligne, titre caché. Trouve la chanson au plus vite.',
    mount: (root, ctx) => mount(root, ctx, { listen: 'refrain' })
  });
  MQ.registerGame({
    id: 'year',
    title: 'Quelle année ?',
    tagline: 'Un extrait : donne son année. Pile 50 pts, à 2 ans près 30 pts, bonne décennie 25 pts.',
    mount: (root, ctx) => mount(root, ctx, { listen: 'year' })
  });

  MQ.mountBlindtest = mount;
})(window.MQ);
