/*
 * Écrans du blind test (solo, hôte et invité).
 * L'écran ne fait qu'afficher les messages du moteur et lui renvoyer les réponses :
 * en solo le moteur tourne dans la même page, en ligne il tourne chez l'hôte.
 */
(function (MQ) {
  const h = MQ.h;

  const LISTEN = [
    { id: 'normal', label: 'Extrait 30 s', help: 'L’extrait tourne pendant que tu cherches.' },
    { id: 'flash', label: 'Flash 1 seconde', help: 'Une seule seconde de musique (réécoutable 2 fois), sur les 10 % de titres les plus connus.' }
  ];
  const ANSWER = [
    { id: 'text', label: 'Écrire la réponse', help: 'Une seule barre, essais illimités, jusqu’à 3 fautes tolérées. Artiste 10 pts, titre 10 pts, moitié du titre 5 pts.' },
    { id: 'choice', label: '4 propositions', help: 'Choisis le bon titre : 20 pts.' }
  ];

  function mount(root, ctx, preset) {
    let screenCleanups = [];
    const S = {
      role: null, engine: null, net: null, myId: null,
      code: null, hostId: null, players: [], answered: [],
      screen: null, round: null, history: [], score: 0
    };
    const saved = MQ.store.get('blindtest.settings', {});
    let settings = Object.assign({ rounds: 10, category: 'all', level: 'hits', listen: 'normal', answer: 'text' }, saved, preset || {});
    if (!MQ.categories.some(c => c.id === settings.category)) settings.category = 'all';
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
          : chipGroup('Niveau', MQ.levels.map(l => ({ id: l.id, label: l.label })), settings.level, v => set('level', v), readOnly),
        settings.listen === 'flash'
          ? null
          : chipGroup('Période', MQ.categories.map(c => ({ id: c.id, label: c.label })), settings.category, v => set('category', v), readOnly),
        h('p.meta', listen.help + ' ' + answer.help + ' ' + pool.length.toLocaleString('fr-FR') + ' titres possibles.')
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
        h('p.lede', 'Un extrait démarre : trouve l’artiste et le titre avant la fin du chrono de 30 secondes. Bonus de série dès 2 manches réussies d’affilée. Seul ou à plusieurs en ligne avec un code de partie.'),
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
        case 'loading': if (S.screen !== 'round') showWaiting('Chargement de l’extrait…'); break;
        case 'round': showRound(msg); break;
        case 'progress': if (S.onProgress) S.onProgress(msg.players); break;
        case 'feedback': if (S.onFeedback) S.onFeedback(msg); break;
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
    function showRound(msg) {
      clear('round');
      if (msg.n === 1) { S.history = []; S.score = 0; S.streak = 0; }
      S.round = msg;
      let stopped = false, startedAt = null, raf = null, replays = 2, roundPts = 0;
      const seconds = msg.seconds;
      const R = MQ.BLINDTEST_RULES;

      const timerFill = h('div.timer-fill');
      const timerText = h('span.timer-text', seconds + ' s');
      const status = h('p.status', 'Écoute…');
      const eq = MQ.equalizer(9);
      const launchBtn = h('button.btn.ghost', { type: 'button', hidden: true, onclick: begin }, 'Lancer l’extrait');
      const replayBtn = h('button.btn.ghost#replay-btn', { type: 'button', hidden: true, onclick: replay }, 'Réécouter (2)');
      const scorePill = h('span.pill.score', S.score + ' pts');
      const progressBox = isMulti() ? h('ul.live') : null;

      let answerArea, input, sendBtn, buttons, artistBadge, titleBadge, guessList;
      if (msg.answer === 'choice') {
        buttons = msg.options.map((o, i) => h('button.option', {
          type: 'button', onclick: () => { if (stopped) return; toHost({ t: 'guess', id: msg.id, choice: i }); lock(); buttons[i].classList.add('picked'); status.textContent = isMulti() ? 'Réponse envoyée. On attend les autres…' : 'Réponse envoyée.'; }
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
          h('p.meta', 'Artiste ' + R.PTS_ARTIST + ' pts · titre ' + R.PTS_TITLE + ' pts · la moitié des mots du titre ' + R.PTS_HALF_TITLE + ' pts. Tu peux essayer autant de fois que tu veux.'),
          guessList);
      }

      root.append(h('section.panel.round',
        h('div.round-head',
          h('span.pill', 'Manche ' + msg.n + ' / ' + msg.total),
          scorePill,
          S.streak >= 1 ? h('span.pill.streak', 'Série ×' + S.streak) : null,
          msg.listen === 'flash' ? h('span.pill.streak', 'Flash 1 s') : null),
        h('div.stage', eq, status, h('div.stage-actions', launchBtn, replayBtn)),
        h('div.timer', { role: 'progressbar', 'aria-label': 'Temps restant' }, timerFill, timerText),
        answerArea,
        progressBox
      ));
      if (input) input.focus({ preventScroll: true });

      function sendGuess() {
        const text = input.value.trim();
        if (!text || stopped) return;
        toHost({ t: 'guess', id: msg.id, text });
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
          setBadge(artistBadge, fb.artist ? 'ok' : null, fb.artist);
          setBadge(titleBadge, fb.title === 'half' ? 'half' : fb.title ? 'ok' : null, fb.title === 'half' ? 'à moitié' : fb.title);
        }
        roundPts = fb.pts;
        scorePill.textContent = (S.score + roundPts) + ' pts';
        if (fb.done) {
          lock();
          status.textContent = msg.answer === 'choice' ? status.textContent : 'Tout trouvé ! Bravo.';
        }
      };
      S.onProgress = list => {
        if (!progressBox) return;
        progressBox.replaceChildren(...list.map(p => h('li' + (p.id === S.myId ? '.me' : ''),
          h('span', p.name),
          msg.answer === 'choice'
            ? h('span.dot' + (p.done ? '.on' : ''), { title: 'a répondu' })
            : [h('span.dot' + (p.artist ? '.on' : ''), { title: 'artiste' }),
               h('span.dot' + (p.title === R.PTS_TITLE ? '.on' : p.title ? '.mid' : ''), { title: 'titre' })])));
      };
      screenCleanups.push(() => { S.onFeedback = S.onProgress = null; });
      S.onProgress(S.players.map(p => ({ id: p.id, name: p.name })));

      function setBadge(badge, state, text) {
        badge.classList.remove('ok', 'half');
        if (state) badge.classList.add(state);
        badge.querySelector('.badge-value').textContent = text || '?';
      }
      function lock() {
        stopped = true;
        cancelAnimationFrame(raf);
        replayBtn.hidden = true;
        if (buttons) buttons.forEach(b => { b.disabled = true; });
        if (input) { input.disabled = sendBtn.disabled = true; }
      }

      function startTimer() {
        if (startedAt != null) return;
        startedAt = performance.now();
        tick();
      }
      function tick() {
        if (stopped) return;
        const left = Math.max(0, seconds - (performance.now() - startedAt) / 1000);
        timerFill.style.transform = 'scaleX(' + (left / seconds) + ')';
        timerText.textContent = Math.ceil(left) + ' s';
        timerFill.classList.toggle('hurry', left < 5);
        if (left <= 0) {
          lock();
          status.textContent = 'Temps écoulé !';
          toHost({ t: 'timeup', id: msg.id });
          return;
        }
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
          if (stopped) return;
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
        if (replays <= 0 || stopped) return;
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

      // En Flash, on fait écouter le titre en entier pendant l'intertitre.
      if (S.round && S.round.listen === 'flash') MQ.player.play(S.round.previewUrl).catch(() => {});

      const text = S.round && S.round.answer === 'text';
      const tone = !mine ? '.bad' : (mine.artist && mine.title === R.PTS_TITLE) ? '.good' : mine.pts ? '.half' : '.bad';
      const parts = [];
      if (mine) {
        if (text) {
          parts.push(h('span.part' + (mine.artist ? '.ok' : '.ko'), 'Artiste ' + (mine.artist ? '+' + R.PTS_ARTIST : '0')));
          parts.push(h('span.part' + (mine.title === R.PTS_TITLE ? '.ok' : mine.title ? '.mid' : '.ko'), 'Titre ' + (mine.title ? '+' + mine.title : '0')));
        } else {
          parts.push(h('span.part' + (mine.base ? '.ok' : '.ko'), mine.base ? 'Bonne réponse +' + mine.base : 'Mauvaise réponse'));
        }
        if (mine.bonus) parts.push(h('span.part.bonus', 'Série ×' + mine.streak + ' +' + mine.bonus));
      }

      const barFill = h('div.break-fill', { style: { transitionDuration: msg.breakMs + 'ms' } });
      const countdown = h('span.break-text', (msg.last ? 'Résultats' : 'Musique suivante') + ' dans ' + Math.round(msg.breakMs / 1000) + ' s');
      const t0 = performance.now();
      const iv = setInterval(() => {
        const left = Math.max(0, Math.ceil((msg.breakMs - (performance.now() - t0)) / 1000));
        countdown.textContent = (msg.last ? 'Résultats' : 'Musique suivante') + ' dans ' + left + ' s';
      }, 250);
      screenCleanups.push(() => clearInterval(iv));

      const roundTable = isMulti()
        ? h('div.field',
            h('span.label', 'Cette manche'),
            h('ol.board', msg.results.slice().sort((a, b) => b.pts - a.pts).map(r => h('li' + (r.id === S.myId ? '.me' : ''),
              h('span.board-name', r.name),
              h('span.board-answer', text
                ? [h('span.dot' + (r.artist ? '.on' : '')), ' artiste ', h('span.dot' + (r.title === R.PTS_TITLE ? '.on' : r.title ? '.mid' : '')), ' titre']
                : r.base ? 'bonne réponse' : 'raté'),
              h('span.board-pts', '+' + r.pts)))))
        : null;

      root.append(h('section.panel.round.intertitle',
        h('div.round-head',
          h('span.pill', 'Manche ' + msg.n + ' / ' + msg.total),
          h('span.pill.score', S.score + ' pts'),
          S.streak >= 2 ? h('span.pill.streak', 'Série ×' + S.streak) : null),
        h('div.reveal' + tone,
          msg.artwork ? h('img.cover', { src: msg.artwork, alt: 'Pochette de ' + msg.song.title, width: 120, height: 120 }) : null,
          h('div.reveal-text',
            h('p.verdict', 'C’était'),
            h('p.reveal-title', msg.song.title),
            h('p.reveal-artist', msg.song.artist + ' · ' + msg.song.year),
            parts.length ? h('div.parts', parts, h('strong.part-total', '= ' + mine.pts + ' pts')) : null,
            msg.link ? h('a.source', { href: msg.link, target: '_blank', rel: 'noopener' }, 'Écouter en entier sur ' + msg.source) : null)),
        h('div.break', { role: 'progressbar', 'aria-label': 'Temps avant la suite' }, barFill, countdown),
        roundTable,
        isMulti() ? standingsBlock(msg.standings, 'Classement') : null
      ));
      requestAnimationFrame(() => requestAnimationFrame(() => { barFill.style.transform = 'scaleX(1)'; }));
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
      const R = MQ.BLINDTEST_RULES;
      const leader = isLeader();
      const me = msg.standings.find(p => p.id === S.myId) || { score: S.score };
      const rank = msg.standings.findIndex(p => p.id === S.myId) + 1;
      const perfect = S.history.filter(x => x.res.artist && x.res.title === R.PTS_TITLE).length;

      let recordLine = '';
      if (S.role === 'solo') {
        const s = msg.settings;
        const key = [s.listen, s.answer, s.listen === 'flash' ? 'top' : s.category, s.rounds].join(':');
        const best = MQ.store.get('blindtest.best3', {});
        if (!best[key] || me.score > best[key]) { best[key] = me.score; MQ.store.set('blindtest.best3', best); recordLine = ' · nouveau record !'; }
        else recordLine = ' · record : ' + best[key] + ' pts';
      }

      root.append(h('section.panel.end',
        h('p.eyebrow', 'Fin de partie'),
        isMulti()
          ? h('p.big-score', rank === 1 ? 'Victoire !' : rank + 'e place')
          : h('p.big-score', me.score, h('small', ' pts')),
        h('p.lede', (isMulti() ? me.score + ' pts · ' : '') + perfect + ' sans faute sur ' + S.history.length + recordLine),
        isMulti() ? standingsBlock(msg.standings, 'Classement final') : null,
        h('div.field',
          h('span.label', 'Tes réponses'),
          h('ol.recap', S.history.map(x => {
            const full = x.res.artist && x.res.title === R.PTS_TITLE;
            return h('li' + (full ? '.ok' : x.res.pts ? '.half' : '.ko'),
              h('span.mark', full ? '✓' : x.res.pts ? '½' : '✗'),
              h('span.recap-text', h('strong', x.song.title), ' – ' + x.song.artist),
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
    title: 'Flash 1 seconde',
    tagline: 'Une seule seconde des plus grands tubes. Tu la reconnais ?',
    mount: (root, ctx) => mount(root, ctx, { listen: 'flash' })
  });
  MQ.registerGame({ id: 'year', title: 'Quelle année ?', tagline: 'Situe la chanson dans le temps, à 2 ans près.', available: false });

  MQ.mountBlindtest = mount;
})(window.MQ);
