/*
 * Strates (prototype, solo) : on entend le morceau couche par couche.
 *
 * Aucune piste séparée n'existe pour les extraits iTunes/Deezer : les couches sont
 * simulées en direct avec des filtres Web Audio sur l'extrait de 30 s.
 *   1. Basses     : passe-bas serré, on n'entend que la basse et la grosse caisse.
 *   2. Médiums    : le filtre s'ouvre, guitares et claviers arrivent (en sourdine).
 *   3. Sans voix  : effet karaoké, on retire le centre du mixage (où est la voix).
 *   4. Tout       : le morceau complet.
 * Une mauvaise réponse ou « Strate suivante » ajoute une couche. Moins il en faut, plus ça rapporte.
 */
window.MQ = window.MQ || {};

(function (MQ) {
  const h = MQ.h;

  // Dix titres avec une basse ou une rythmique reconnaissable, pour tester l'idée.
  const SONGS = [
    { title: 'Another One Bites the Dust', artist: 'Queen', year: 1980 },
    { title: 'Billie Jean', artist: 'Michael Jackson', year: 1983 },
    { title: 'Seven Nation Army', artist: 'The White Stripes', year: 2003, artistAlt: ['White Stripes'] },
    { title: 'Get Lucky', artist: 'Daft Punk', year: 2013, artistAlt: ['Pharrell Williams'] },
    { title: 'Stayin\' Alive', artist: 'Bee Gees', year: 1977 },
    { title: 'Smells Like Teen Spirit', artist: 'Nirvana', year: 1991 },
    { title: 'Rolling in the Deep', artist: 'Adele', year: 2010 },
    { title: 'Alors on danse', artist: 'Stromae', year: 2010 },
    { title: 'Uptown Funk', artist: 'Mark Ronson feat. Bruno Mars', year: 2014, artistAlt: ['Bruno Mars'] },
    { title: 'Les Démons de minuit', artist: 'Images', year: 1986, titleAlt: ['Démons de minuit'] }
  ];

  const LAYERS = [
    { name: 'Basses', hint: 'Basse et grosse caisse seulement' },
    { name: 'Médiums', hint: 'Le filtre s’ouvre : guitares, claviers' },
    { name: 'Sans voix', hint: 'Tout le morceau, voix principale retirée' },
    { name: 'Tout', hint: 'Le morceau complet' }
  ];
  const VALUES = [10, 7, 4, 2];        // points de l'artiste (et du titre) selon la strate
  const LAST_TRIES = 3;                // essais ratés permis à la dernière strate avant la réponse

  /* ---------- moteur audio : 4 chaînes en parallèle, on passe de l'une à l'autre en fondu ---------- */
  const audio = (function () {
    let ctx = null, el = null, master = null, gains = [], plain = null, filtered = true, layer = 0;

    function build() {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      el = new Audio();
      el.crossOrigin = 'anonymous';   // nécessaire pour que les filtres aient le droit de lire le son
      el.loop = true;
      el.preload = 'auto';
      const src = ctx.createMediaElementSource(el);
      master = ctx.createGain();
      master.connect(ctx.destination);

      const lowpass = (f, q) => { const n = ctx.createBiquadFilter(); n.type = 'lowpass'; n.frequency.value = f; n.Q.value = q || 0.7; return n; };
      const gain = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
      const out = makeup => { const g = gain(0); const m = gain(makeup); g.connect(m); m.connect(master); gains.push(g); return g; };

      // 1. Basses : deux passe-bas en série pour une pente bien raide.
      const g0 = out(1.8);
      const b1 = lowpass(170), b2 = lowpass(170);
      src.connect(b1); b1.connect(b2); b2.connect(g0);

      // 2. Médiums : on ouvre jusqu'à ~1 kHz.
      const g1 = out(1.25);
      const m1 = lowpass(1100), m2 = lowpass(1100);
      src.connect(m1); m1.connect(m2); m2.connect(g1);

      // 3. Sans voix : gauche moins droite (le centre s'annule), plus les basses remises dessous.
      const g2 = out(1.0);
      const split = ctx.createChannelSplitter(2);
      const left = gain(1.4), right = gain(-1.4);
      src.connect(split);
      split.connect(left, 0); split.connect(right, 1);
      left.connect(g2); right.connect(g2);
      const low = lowpass(150);
      src.connect(low); low.connect(g2);

      // 4. Tout.
      const g3 = out(1.0);
      src.connect(g3);

      plain = new Audio();            // secours si le serveur refuse l'accès aux filtres
      plain.loop = true;
    }

    function syncVolume() {
      const v = MQ.player.volume;
      if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
      if (plain) plain.volume = v;
    }

    function setLayer(i, instant) {
      layer = i;
      if (!ctx) return;
      const t = ctx.currentTime;
      gains.forEach((g, j) => {
        g.gain.cancelScheduledValues(t);
        if (instant) g.gain.setValueAtTime(j === i ? 1 : 0, t);
        else g.gain.setTargetAtTime(j === i ? 1 : 0, t, 0.25);
      });
    }

    function waitReady(media) {
      return new Promise((resolve, reject) => {
        const ok = () => { off(); resolve(); };
        const ko = () => { off(); reject(new Error('audio')); };
        const off = () => { media.removeEventListener('canplay', ok); media.removeEventListener('error', ko); };
        media.addEventListener('canplay', ok);
        media.addEventListener('error', ko);
      });
    }

    return {
      /** À appeler pendant un clic : crée le contexte audio et débloque la lecture (iOS). */
      unlock() {
        if (!ctx) build();
        if (ctx.state === 'suspended') ctx.resume();
        [el, plain].forEach(m => { m.muted = true; const p = m.play(); if (p && p.catch) p.catch(() => {}); m.pause(); m.muted = false; });
        syncVolume();
      },
      /** Charge un extrait. Renvoie true si les filtres marchent, false si on joue sans filtre. */
      async load(url) {
        this.stop();
        setLayer(0, true);
        filtered = true;
        el.src = url;
        el.load();
        try {
          await waitReady(el);
        } catch (e) {
          filtered = false;           // pas d'en-tête CORS : on garde au moins le son, sans couches
          plain.src = url;
          plain.load();
          await waitReady(plain);
        }
        return filtered;
      },
      play() {
        syncVolume();
        if (ctx.state === 'suspended') ctx.resume();
        return (filtered ? el : plain).play();
      },
      setLayer,
      get filtered() { return filtered; },
      get layer() { return layer; },
      syncVolume,
      stop() { if (el) el.pause(); if (plain) plain.pause(); }
    };
  })();

  /* ---------- écrans ---------- */
  function mount(root, ctx) {
    MQ.player.stop();
    let alive = true;
    const onVolume = () => audio.syncVolume();
    const volInput = document.getElementById('volume');
    const muteBtn = document.getElementById('mute-btn');
    volInput && volInput.addEventListener('input', onVolume);
    muteBtn && muteBtn.addEventListener('click', onVolume);

    const clear = () => root.replaceChildren();

    function showIntro() {
      clear();
      root.append(h('section.panel.setup.strates',
        h('p.eyebrow', 'Prototype'),
        h('h1.display', 'Strates'),
        h('p.lede', 'Le morceau arrive couche par couche : d’abord les basses, puis les médiums, puis tout sauf la voix, et enfin le morceau entier. Trouve-le le plus tôt possible.'),
        h('ol.strata-legend', LAYERS.map((l, i) => h('li',
          h('span.strata-num', String(i + 1)),
          h('span', h('strong', l.name), ' · ' + l.hint),
          h('span.strata-pts', VALUES[i] + ' pts')))),
        h('p.meta', 'L’artiste et le titre rapportent chacun la valeur de la strate où tu les trouves (la moitié des mots du titre : moitié des points). Une mauvaise réponse ajoute une couche. ' + SONGS.length + ' titres, en solo.'),
        h('div.actions',
          h('button.btn.primary#strates-start', { type: 'button', onclick: start }, 'Commencer'),
          h('button.btn.ghost', { type: 'button', onclick: () => ctx.exit() }, 'Retour'))
      ));
    }

    let order = [], idx = 0, score = 0, history = [];

    function start() {
      audio.unlock();
      order = MQ.shuffle(SONGS);
      order.forEach(s => MQ.findPreview(s));  // on lance toutes les recherches d'extraits d'un coup
      idx = 0; score = 0; history = [];
      nextSong();
    }

    async function nextSong() {
      if (!alive) return;
      if (idx >= order.length) return showEnd();
      const song = order[idx];
      clear();
      root.append(h('section.panel.loading', MQ.equalizer(7), h('p', 'Chargement du titre ' + (idx + 1) + ' / ' + order.length + '…')));
      let preview = null, filtered = false;
      try {
        preview = await MQ.findPreview(song);
        if (preview) filtered = await audio.load(preview.previewUrl);
      } catch (e) { preview = null; }
      if (!alive) return;
      if (!preview) {           // pas d'extrait trouvé : on passe au suivant
        history.push({ song, skipped: true, pts: 0 });
        idx++;
        return nextSong();
      }
      playSong(song, preview, filtered);
    }

    function playSong(song, preview, filtered) {
      clear();
      let layer = 0, artistPts = 0, titlePts = 0, titleFull = false, lastMisses = 0, over = false;

      const bars = LAYERS.map((l, i) => h('li.strata-bar', h('span.strata-num', String(i + 1)), h('span.strata-name', l.name)));
      const hint = h('p.strata-hint');
      const worth = h('span.pill.streak');
      const scorePill = h('span.pill.score', score + ' pts');
      const artistBadge = h('div.badge', h('span.label', 'Artiste'), h('span.badge-value', '?'));
      const titleBadge = h('div.badge', h('span.label', 'Titre'), h('span.badge-value', '?'));
      const input = h('input.text-input.guess-input#strates-guess', {
        type: 'text', placeholder: 'Artiste, titre, ou les deux…', autocomplete: 'off', spellcheck: false,
        enterKeyHint: 'send', 'aria-label': 'Ta réponse'
      });
      const guessList = h('ul.guesses', { 'aria-live': 'polite' });
      const playBtn = h('button.btn.ghost', { type: 'button', hidden: true, onclick: () => { audio.play().then(() => { playBtn.hidden = true; }, () => {}); } }, 'Lancer l’extrait');
      const nextBtn = h('button.btn.ghost#strates-next', { type: 'button', onclick: () => advance(true) });
      const warn = filtered ? null : h('p.error', 'Ce serveur audio n’autorise pas les filtres : on entend le morceau complet directement.');

      root.append(h('section.panel.round.strates',
        h('div.round-head',
          h('span.pill', 'Titre ' + (idx + 1) + ' / ' + order.length),
          scorePill, worth),
        h('ol.strata-bars', { 'aria-label': 'Couches révélées' }, bars),
        hint,
        warn,
        h('div.stage-actions', playBtn, nextBtn),
        h('div.answer-zone',
          h('div.badges', artistBadge, titleBadge),
          h('form.guess-form', { onsubmit: e => { e.preventDefault(); guess(); } }, input, h('button.btn.primary', { type: 'submit' }, 'Valider')),
          guessList)
      ));
      input.focus({ preventScroll: true });

      if (!filtered) layer = LAYERS.length - 1;
      render(true);
      audio.play().catch(() => { playBtn.hidden = false; });

      function render(instant) {
        bars.forEach((b, i) => { b.classList.toggle('on', i <= layer); b.classList.toggle('now', i === layer); });
        hint.textContent = 'Strate ' + (layer + 1) + ' · ' + LAYERS[layer].hint;
        worth.textContent = 'Vaut ' + VALUES[layer] + ' pts';
        nextBtn.textContent = layer < LAYERS.length - 1 ? 'Strate suivante (' + VALUES[layer + 1] + ' pts)' : 'Voir la réponse';
        if (filtered) audio.setLayer(layer, instant);
      }

      function advance(manual) {
        if (over) return;
        if (layer < LAYERS.length - 1) { layer++; render(); }
        else if (manual) finish();
        input.focus({ preventScroll: true });
      }

      function guess() {
        const text = input.value.trim();
        if (!text || over) return;
        input.value = '';
        const res = MQ.match.judgeGuess(text, song);
        const v = VALUES[layer];
        let gained = false;
        if (res.artist && !artistPts) { artistPts = v; gained = true; setBadge(artistBadge, 'ok', song.artist); }
        if (res.title === 'full' && !titleFull) {
          titleFull = true; titlePts = Math.max(titlePts, v); gained = true; setBadge(titleBadge, 'ok', song.title);
        } else if (res.title === 'half' && !titlePts) {
          titlePts = Math.ceil(v / 2); gained = true; setBadge(titleBadge, 'half', 'à moitié (' + titlePts + ' pts)');
        }
        guessList.prepend(h('li' + (gained ? '.good' : '.bad'), text));
        if (artistPts && titleFull) return finish();
        if (!gained) {
          if (layer < LAYERS.length - 1) advance(false);
          else if (++lastMisses >= LAST_TRIES) finish();
        }
      }

      function setBadge(badge, cls, text) {
        badge.classList.remove('ok', 'half');
        badge.classList.add(cls);
        badge.querySelector('.badge-value').textContent = text;
      }

      function finish() {
        if (over) return;
        over = true;
        layer = LAYERS.length - 1;
        render();
        const pts = artistPts + titlePts;
        score += pts;
        history.push({ song, pts, artistPts, titlePts });
        showReveal(song, preview, pts, artistPts, titlePts);
      }
    }

    function showReveal(song, preview, pts, artistPts, titlePts) {
      clear();
      const tone = pts >= 15 ? '.good' : pts ? '.half' : '.bad';
      const last = idx >= order.length - 1;
      root.append(h('section.panel.reveal' + tone,
        preview.artwork ? h('img.cover', { src: preview.artwork, alt: '', width: 200, height: 200 }) : null,
        h('div.reveal-text',
          h('p.verdict', pts ? '+' + pts + ' pts' : 'Raté'),
          h('p.reveal-title', song.title),
          h('p.reveal-artist', song.artist + ' · ' + song.year),
          h('p.meta', 'Artiste ' + (artistPts ? '+' + artistPts : '0') + ' · titre ' + (titlePts ? '+' + titlePts : '0') + ' · total ' + score + ' pts'),
          h('p.meta', 'Tu entends maintenant le morceau complet.'),
          h('button.btn.primary.next-btn#strates-continue', { type: 'button', onclick: () => { idx++; nextSong(); } }, last ? 'Voir le résultat' : 'Titre suivant'))
      ));
      root.querySelector('#strates-continue').focus({ preventScroll: true });
    }

    function showEnd() {
      audio.stop();
      clear();
      const played = history.filter(x => !x.skipped);
      const max = played.length * VALUES[0] * 2;
      const best = MQ.store.get('strates.best', 0);
      const record = score > best;
      if (record) MQ.store.set('strates.best', score);
      root.append(h('section.panel',
        h('p.eyebrow', 'Strates · résultat'),
        h('p.big-score', score + ' pts', h('small', ' / ' + max)),
        h('p.meta', record ? 'Nouveau record !' : 'Record : ' + best + ' pts'),
        h('ol.recap', history.map(x => h('li' + (x.pts ? '.ok' : '.ko'),
          h('span.mark', x.pts ? '✓' : '✗'),
          h('span.recap-text', h('strong', x.song.title), ' · ' + x.song.artist + (x.skipped ? ' (extrait introuvable)' : '')),
          h('span.recap-pts', x.skipped ? '–' : '+' + x.pts)))),
        h('div.actions',
          h('button.btn.primary', { type: 'button', onclick: start }, 'Rejouer'),
          h('button.btn.ghost', { type: 'button', onclick: () => ctx.exit() }, 'Accueil'))
      ));
    }

    showIntro();
    return () => {
      alive = false;
      audio.stop();
      volInput && volInput.removeEventListener('input', onVolume);
      muteBtn && muteBtn.removeEventListener('click', onVolume);
    };
  }

  MQ.registerGame({
    id: 'strates',
    title: 'Strates',
    tagline: 'Le morceau arrive couche par couche : basses, médiums, sans voix, puis tout. Prototype, 10 titres.',
    mount
  });
})(window.MQ);
