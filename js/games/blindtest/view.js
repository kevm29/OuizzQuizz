/*
 * Écrans du blind test (solo, hôte et invité).
 * L'écran ne fait qu'afficher les messages du moteur et lui renvoyer les réponses :
 * en solo le moteur tourne dans la même page, en ligne il tourne chez l'hôte.
 */
(function (MQ) {
  const h = MQ.h;

  const LISTEN = [
    { id: 'normal', label: 'Extrait 30 s', help: 'L’extrait tourne pendant que tu cherches.' },
    { id: 'flash', label: 'Flash 1 seconde', help: 'Une seule seconde de musique (réécoutable 2 fois), sur les titres les plus célèbres.' }
  ];
  const ANSWER = [
    { id: 'text', label: 'Écrire artiste + titre', help: 'Jusqu’à 3 fautes tolérées. Titre 100 pts, artiste 50 pts, plus un bonus de rapidité.' },
    { id: 'choice', label: '4 propositions', help: 'Choisis le bon titre. 100 pts plus un bonus de rapidité.' }
  ];

  function mount(root, ctx, preset) {
    let screenCleanups = [];
    const S = {
      role: null, engine: null, net: null, myId: null,
      code: null, hostId: null, players: [], answered: [],
      screen: null, round: null, history: [], score: 0
    };
    const saved = MQ.store.get('blindtest.settings', {});
    let settings = Object.assign({ rounds: 10, category: 'all', listen: 'normal', answer: 'text' }, saved, preset || {});
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
      const listen = LISTEN.find(l => l.id === settings.listen);
      const answer = ANSWER.find(a => a.id === settings.answer);
      return h('div.settings',
        chipGroup('Écoute', LISTEN, settings.listen, v => set('listen', v), readOnly),
        chipGroup('Réponse', ANSWER, settings.answer, v => set('answer', v), readOnly),
        chipGroup('Manches', [5, 10, 15].map(n => ({ id: n, label: n + ' manches' })), settings.rounds, v => set('rounds', v), readOnly),
        settings.listen === 'flash'
          ? null
          : chipGroup('Catégorie', MQ.categories.map(c => ({ id: c.id, label: c.label })), settings.category, v => set('category', v), readOnly),
        h('p.meta', listen.help + ' ' + answer.help + ' ' + pool.length + ' titres possibles.')
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
        title.textContent = settings.listen === 'flash' ? 'Flash 1 seconde' : 'Blind test';
        settingsHost.replaceChildren(settingsBlock(renderSettings));
      };
      renderSettings();

      root.append(h('section.panel.setup',
        h('p.eyebrow', 'Blind test'),
        title,
        h('p.lede', 'Un extrait démarre : trouve l’artiste et le titre avant la fin du chrono de 20 secondes. Seul ou à plusieurs en ligne avec un code de partie.'),
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
          else updateCounts();
          break;
        case 'loading': if (S.screen !== 'round') showWaiting('Chargement de l’extrait…'); break;
        case 'round': showRound(msg); break;
        case 'progress': S.answered = msg.answered; updateCounts(); break;
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
          h('p.meta', 'Tes amis ouvrent le jeu, cliquent sur Blind test et entrent ce code. Ou envoie-leur le lien.'),
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
    let countsEl = null;
    function updateCounts() {
      if (!countsEl || !isMulti()) return;
      countsEl.textContent = S.answered.length + ' / ' + S.players.length + ' ont répondu';
    }

    function showRound(msg) {
      clear('round');
      if (msg.n === 1) { S.history = []; S.score = 0; }
      S.round = msg;
      S.answered = [];
      let answered = false, startedAt = null, raf = null, replays = 2;
      const seconds = msg.seconds;

      const timerFill = h('div.timer-fill');
      const timerText = h('span.timer-text', seconds + ' s');
      const status = h('p.status', 'Écoute…');
      const eq = MQ.equalizer(9);
      const launchBtn = h('button.btn.ghost', { type: 'button', hidden: true, onclick: begin }, 'Lancer l’extrait');
      const replayBtn = h('button.btn.ghost#replay-btn', { type: 'button', hidden: true, onclick: replay }, 'Réécouter (2)');
      countsEl = isMulti() ? h('span.pill', '') : null;

      let answerArea, artistInput, titleInput, submitBtn, buttons;
      if (msg.answer === 'choice') {
        buttons = msg.options.map((o, i) => h('button.option', {
          type: 'button', onclick: () => submit({ choice: i }, buttons[i])
        }, h('span.key', String(i + 1)), h('span.opt-text', h('strong', o.title), h('span', o.artist))));
        answerArea = h('div.options', buttons);
        onKey(e => {
          const n = parseInt(e.key, 10);
          if (!answered && n >= 1 && n <= buttons.length && !(e.target instanceof HTMLInputElement)) buttons[n - 1].click();
        });
      } else {
        artistInput = h('input.text-input#ans-artist', {
          type: 'text', placeholder: 'Artiste', autocomplete: 'off', autocapitalize: 'words', spellcheck: false,
          onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); titleInput.focus(); } }
        });
        titleInput = h('input.text-input#ans-title', {
          type: 'text', placeholder: 'Titre', autocomplete: 'off', spellcheck: false,
          onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); submitText(); } }
        });
        submitBtn = h('button.btn.primary#submit-btn', { type: 'submit' }, 'Valider');
        answerArea = h('form.answer-form', { onsubmit: e => { e.preventDefault(); submitText(); } },
          h('label.field', h('span.label', 'Artiste'), artistInput),
          h('label.field', h('span.label', 'Titre'), titleInput),
          submitBtn);
      }

      root.append(h('section.panel.round',
        h('div.round-head',
          h('span.pill', 'Manche ' + msg.n + ' / ' + msg.total),
          h('span.pill.score', S.score + ' pts'),
          msg.listen === 'flash' ? h('span.pill.streak', 'Flash 1 s') : null,
          countsEl),
        h('div.stage', eq, status, h('div.stage-actions', launchBtn, replayBtn)),
        h('div.timer', { role: 'progressbar', 'aria-label': 'Temps restant' }, timerFill, timerText),
        answerArea
      ));
      updateCounts();
      if (artistInput) artistInput.focus({ preventScroll: true });

      function startTimer() {
        if (startedAt != null) return;
        startedAt = performance.now();
        tick();
      }
      function tick() {
        if (answered) return;
        const left = Math.max(0, seconds - (performance.now() - startedAt) / 1000);
        timerFill.style.transform = 'scaleX(' + (left / seconds) + ')';
        timerText.textContent = Math.ceil(left) + ' s';
        timerFill.classList.toggle('hurry', left < 5);
        if (left <= 0) return timeUp();
        raf = requestAnimationFrame(tick);
      }
      screenCleanups.push(() => cancelAnimationFrame(raf));

      function playOnce() {
        return msg.listen === 'flash'
          ? MQ.player.playSegment(msg.previewUrl, msg.offset, msg.flashMs)
          : MQ.player.play(msg.previewUrl);
      }
      function begin() {
        launchBtn.hidden = true;
        playOnce().then(() => {
          if (answered) return;
          status.textContent = msg.listen === 'flash' ? 'Une seconde… c’est quoi ?' : 'Quel est ce titre ?';
          eq.classList.add('on');
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
        if (replays <= 0 || answered) return;
        replays--;
        replayBtn.textContent = 'Réécouter (' + replays + ')';
        replayBtn.hidden = replays <= 0;
        eq.classList.add('on');
        later(() => eq.classList.remove('on'), msg.flashMs);
        MQ.player.playSegment(msg.previewUrl, msg.offset, msg.flashMs).catch(() => {});
      }

      function submit(payload, btn) {
        if (answered) return;
        answered = true;
        cancelAnimationFrame(raf);
        const elapsed = startedAt == null ? seconds * 1000 : performance.now() - startedAt;
        toHost(Object.assign({ t: 'answer', id: msg.id, elapsed: Math.round(Math.max(1, elapsed)) }, payload));
        replayBtn.hidden = true;
        if (buttons) buttons.forEach(b => { b.disabled = true; });
        if (btn) btn.classList.add('picked');
        if (artistInput) { artistInput.disabled = titleInput.disabled = submitBtn.disabled = true; }
        status.textContent = isMulti() ? 'Réponse envoyée. On attend les autres…' : 'Réponse envoyée.';
      }
      function submitText() {
        if (!artistInput.value.trim() && !titleInput.value.trim()) { artistInput.focus(); return; }
        submit({ artist: artistInput.value, title: titleInput.value });
      }
      function timeUp() {
        if (artistInput) submit({ artist: artistInput.value, title: titleInput.value });
        else submit({ choice: -1 });
        status.textContent = 'Temps écoulé !';
      }

      later(begin, 50);
    }

    /* ---------- révélation ---------- */
    function showReveal(msg) {
      clear('reveal');
      countsEl = null;
      const mine = msg.results.find(r => r.id === S.myId);
      const me = msg.standings.find(p => p.id === S.myId);
      if (me) S.score = me.score;
      if (mine) S.history.push({ song: msg.song, res: mine });

      // En Flash, on fait écouter le titre en entier pendant la révélation.
      if (S.round && S.round.listen === 'flash') MQ.player.play(S.round.previewUrl).catch(() => {});

      const verdict = !mine ? 'Tu as rejoint en cours de manche'
        : mine.full ? 'Bravo ! +' + mine.pts + ' pts'
        : mine.pts ? 'À moitié ! +' + mine.pts + ' pts'
        : !mine.answered ? 'Temps écoulé' : 'Raté';
      const tone = mine && mine.full ? '.good' : mine && mine.pts ? '.half' : '.bad';

      const detail = mine && S.round && S.round.answer === 'text' && mine.answered
        ? h('ul.my-answer',
            h('li', h('span.mark' + (mine.artistOk ? '.ok' : '.ko'), mine.artistOk ? '✓' : '✗'), 'Artiste : ', h('em', mine.artist || '—')),
            h('li', h('span.mark' + (mine.titleOk ? '.ok' : '.ko'), mine.titleOk ? '✓' : '✗'), 'Titre : ', h('em', mine.title || '—')))
        : null;

      const leader = isLeader();
      const nextBtn = leader
        ? h('button.btn.primary.next-btn', { type: 'button', onclick: () => { MQ.player.fadeOut(400); S.engine.next(); } },
            msg.last ? (isMulti() ? 'Voir le classement' : 'Voir le score') : 'Manche suivante')
        : h('p.meta.waiting', MQ.equalizer(4), 'L’hôte lance la suite…');

      const roundTable = isMulti()
        ? h('div.field',
            h('span.label', 'Cette manche'),
            h('ol.board', msg.results.slice().sort((a, b) => b.pts - a.pts).map(r => h('li' + (r.id === S.myId ? '.me' : ''),
              h('span.board-name', r.name),
              h('span.board-answer', !r.answered ? 'pas de réponse'
                : S.round && S.round.answer === 'text' ? (r.artist || '—') + ' / ' + (r.title || '—')
                : r.correct ? 'bonne réponse' : 'mauvaise réponse'),
              h('span.board-pts', '+' + r.pts)))))
        : null;

      root.append(h('section.panel.round',
        h('div.round-head',
          h('span.pill', 'Manche ' + msg.n + ' / ' + msg.total),
          h('span.pill.score', S.score + ' pts'),
          mine && mine.streak >= 2 ? h('span.pill.streak', 'Série ×' + mine.streak) : null),
        h('div.reveal' + tone,
          msg.artwork ? h('img.cover', { src: msg.artwork, alt: 'Pochette de ' + msg.song.title, width: 120, height: 120 }) : null,
          h('div.reveal-text',
            h('p.verdict', verdict + (mine && mine.streakBonus ? ' (dont +50 de série)' : '')),
            h('p.reveal-title', msg.song.title),
            h('p.reveal-artist', msg.song.artist + ' · ' + msg.song.year),
            detail,
            msg.link ? h('a.source', { href: msg.link, target: '_blank', rel: 'noopener' }, 'Écouter en entier sur ' + msg.source) : null),
          nextBtn),
        roundTable,
        isMulti() ? standingsBlock(msg.standings, 'Classement') : null
      ));
      if (leader) {
        nextBtn.focus({ preventScroll: true });
        onKey(e => { if (e.key === 'Enter' && document.activeElement === document.body) nextBtn.click(); });
      }
    }

    function standingsBlock(standings, title) {
      return h('div.field',
        h('span.label', title),
        h('ol.board.standings', standings.map((p, i) => h('li' + (p.id === S.myId ? '.me' : ''),
          h('span.rank', String(i + 1)),
          h('span.board-name', p.name),
          h('span.board-pts', p.score + ' pts')))));
    }

    /* ---------- fin ---------- */
    function showEnd(msg) {
      clear('end');
      MQ.player.fadeOut(600);
      const leader = isLeader();
      const me = msg.standings.find(p => p.id === S.myId) || { score: S.score };
      const rank = msg.standings.findIndex(p => p.id === S.myId) + 1;
      const good = S.history.filter(x => x.res.full).length;

      let recordLine = '';
      if (S.role === 'solo') {
        const s = msg.settings;
        const key = [s.listen, s.answer, s.listen === 'flash' ? 'top' : s.category, s.rounds].join(':');
        const best = MQ.store.get('blindtest.best2', {});
        if (!best[key] || me.score > best[key]) { best[key] = me.score; MQ.store.set('blindtest.best2', best); recordLine = ' · nouveau record !'; }
        else recordLine = ' · record : ' + best[key] + ' pts';
      }

      root.append(h('section.panel.end',
        h('p.eyebrow', 'Fin de partie'),
        isMulti()
          ? h('p.big-score', rank === 1 ? 'Victoire !' : rank + 'e place')
          : h('p.big-score', me.score, h('small', ' pts')),
        h('p.lede', (isMulti() ? me.score + ' pts · ' : '') + good + ' sans faute sur ' + S.history.length + recordLine),
        isMulti() ? standingsBlock(msg.standings, 'Classement final') : null,
        h('div.field',
          h('span.label', 'Tes réponses'),
          h('ol.recap', S.history.map(x => h('li' + (x.res.full ? '.ok' : x.res.pts ? '.half' : '.ko'),
            h('span.mark', x.res.full ? '✓' : x.res.pts ? '½' : '✗'),
            h('span.recap-text', h('strong', x.song.title), ' – ' + x.song.artist),
            h('span.recap-pts', x.res.pts ? '+' + x.res.pts + (x.res.elapsed != null ? ' · ' + x.res.elapsed.toFixed(1) + ' s' : '') : '0'))))),
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
    title: 'Flash 1 seconde',
    tagline: 'Une seule seconde des plus grands tubes. Tu la reconnais ?',
    mount: (root, ctx) => mount(root, ctx, { listen: 'flash' })
  });
  MQ.registerGame({ id: 'year', title: 'Quelle année ?', tagline: 'Situe la chanson dans le temps, à 2 ans près.', available: false });

  MQ.mountBlindtest = mount;
})(window.MQ);
