/*
 * Lecture découverte : pas de score, une radio qui enchaîne au hasard des extraits de 30 s
 * du catalogue (filtrables par niveau, période et style). Titre, artiste, année et style
 * s'affichent pendant l'écoute (ou à la fin de l'extrait, si on choisit « titre caché »).
 */
(function (MQ) {
  const h = MQ.h;
  const HISTORY_MAX = 30;

  function styleOf(song) {
    const st = MQ.styles.find(s => s.genres && s.genres.includes(song.genre));
    return st ? st.label : null;
  }

  function mount(root, ctx) {
    let cleanups = [];
    const saved = MQ.store.get('discover.settings', {});
    const settings = Object.assign({ level: 'hits', category: 'all', style: 'all', hidden: false }, saved);
    if (!MQ.categories.some(c => c.id === settings.category)) settings.category = 'all';
    if (!MQ.styles.some(c => c.id === settings.style)) settings.style = 'all';
    const save = () => MQ.store.set('discover.settings', settings);

    function clear() { cleanups.forEach(f => f()); cleanups = []; root.replaceChildren(); }
    const pool = () => MQ.poolFor({ listen: 'normal', level: settings.level, category: settings.category, style: settings.style });

    function chipGroup(label, items, current, onPick) {
      return h('div.field',
        h('span.label', label),
        h('div.chips', { role: 'radiogroup', 'aria-label': label },
          items.map(it => h('button.chip', {
            type: 'button', role: 'radio', 'aria-checked': String(current === it.id), onclick: () => onPick(it.id)
          }, it.label))));
    }

    /* ---------- réglages ---------- */
    function showMenu() {
      clear();
      MQ.player.stop();
      const host = h('div');
      const render = () => {
        const set = (k, v) => { settings[k] = v; save(); render(); };
        const n = pool().length;
        host.replaceChildren(h('div.settings',
          chipGroup('Niveau', MQ.levels.map(l => ({ id: l.id, label: l.label })), settings.level, v => set('level', v)),
          chipGroup('Période', MQ.categories.map(c => ({ id: c.id, label: c.label })), settings.category, v => set('category', v)),
          chipGroup('Style', MQ.styles.map(c => ({ id: c.id, label: c.label })), settings.style, v => set('style', v)),
          chipGroup('Affichage', [{ id: false, label: 'Titre visible' }, { id: true, label: 'Titre caché jusqu’à la fin' }], settings.hidden, v => set('hidden', v)),
          h('p.meta', n.toLocaleString('fr-FR') + ' titres possibles, joués dans un ordre au hasard.' + (n ? '' : ' Élargis la période, le niveau ou le style.'))));
        startBtn.disabled = !n;
      };
      const startBtn = h('button.btn.primary#discover-start', { type: 'button', onclick: () => { MQ.player.unlock(); startRadio(); } }, 'Lancer la lecture');
      root.append(h('section.panel.setup',
        h('p.eyebrow', 'Sans score'),
        h('h1.display', 'Lecture découverte'),
        h('p.lede', 'Des extraits de 30 secondes, au hasard, les uns après les autres. Pour redécouvrir des tubes, réviser avant un blind test, ou juste écouter.'),
        host,
        h('div.actions', startBtn, h('button.btn.ghost', { type: 'button', onclick: ctx.exit }, 'Autres jeux'))));
      render();
    }

    /* ---------- lecture ---------- */
    function startRadio() {
      clear();
      let queue = MQ.shuffle(pool());
      const history = [];   // {song, preview}
      let idx = -1, paused = false, seq = 0, revealed = !settings.hidden, prefetch = null;

      async function fetchNext() {
        while (queue.length) {
          const song = queue.shift();
          const preview = await MQ.findPreview(song).catch(() => null);
          if (preview && preview.previewUrl) return { song, preview };
        }
        return null;
      }

      const cover = h('img.cover.disc-cover', { alt: '', width: 220, height: 220 });
      const title = h('p.reveal-title.disc-title');
      const artist = h('p.reveal-artist.disc-artist');
      const tags = h('div.disc-tags');
      const link = h('a.source', { target: '_blank', rel: 'noopener', hidden: true });
      const status = h('p.meta.disc-status', 'Chargement…');
      const fill = h('div.break-fill');
      const timeText = h('span.break-text', '0:00 / 0:30');
      const eq = MQ.equalizer(9);
      const prevBtn = h('button.btn.ghost#disc-prev', { type: 'button', onclick: () => go(idx - 1) }, '⏮ Précédent');
      const playBtn = h('button.btn.primary#disc-play', { type: 'button', onclick: togglePause }, 'Pause');
      const nextBtn = h('button.btn.ghost#disc-next', { type: 'button', onclick: () => go(idx + 1) }, 'Suivant ⏭');
      const revealBtn = h('button.btn.ghost#disc-reveal', { type: 'button', hidden: true, onclick: () => { revealed = true; showInfo(); } }, 'Voir le titre');
      const list = h('ol.recap.disc-history');
      const counter = h('span.pill');

      root.append(h('section.panel.discover',
        h('div.round-head', h('span.pill.streak', 'Lecture découverte'), counter,
          h('button.btn.ghost', { type: 'button', onclick: showMenu }, 'Réglages')),
        h('div.reveal.disc-now', cover,
          h('div.reveal-text', h('p.verdict', 'En ce moment'), title, artist, tags, link)),
        h('div.stage.disc-stage', eq, status),
        h('div.break', { role: 'progressbar', 'aria-label': 'Avancement de l’extrait' }, fill, timeText),
        h('div.actions.disc-actions', prevBtn, playBtn, nextBtn, revealBtn),
        h('div.field', h('span.label', 'Déjà écoutés'), list)));

      const a = MQ.player.audio;
      const fmt = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
      const onTime = () => {
        const d = isFinite(a.duration) && a.duration > 0 ? a.duration : 30;
        fill.style.transform = 'scaleX(' + Math.min(1, a.currentTime / d) + ')';
        timeText.textContent = fmt(a.currentTime) + ' / ' + fmt(d);
      };
      const onEnded = () => { if (!settings.hidden || revealed) go(idx + 1); else { revealed = true; showInfo(); later(() => go(idx + 1), 3000); } };
      a.addEventListener('timeupdate', onTime);
      a.addEventListener('ended', onEnded);
      let timer = null;
      const later = (fn, ms) => { clearTimeout(timer); timer = setTimeout(fn, ms); };
      cleanups.push(() => { a.removeEventListener('timeupdate', onTime); a.removeEventListener('ended', onEnded); clearTimeout(timer); MQ.player.stop(); seq++; });

      function showInfo() {
        const cur = history[idx];
        if (!cur) return;
        const { song, preview } = cur;
        const show = revealed;
        title.textContent = show ? song.title : '? ? ?';
        artist.textContent = show ? song.artist : 'Titre caché : à toi de deviner';
        const st = styleOf(song);
        tags.replaceChildren(...(show ? [h('span.pill', String(song.year)), st ? h('span.pill', st) : null, song.fr ? h('span.pill', 'Chanson française') : null] : []).filter(Boolean));
        if (show && preview.artwork) { cover.src = preview.artwork; cover.hidden = false; } else { cover.removeAttribute('src'); cover.hidden = !show; }
        link.hidden = !(show && preview.link);
        if (show && preview.link) { link.href = preview.link; link.textContent = 'Écouter en entier sur ' + preview.source; }
        revealBtn.hidden = show;
        renderHistory();
      }

      function renderHistory() {
        list.replaceChildren(...history.slice(0, idx).map((x, i) => h('li', h('span.mark', '♪'),
          h('span.recap-text', h('strong', x.song.title), ' – ' + x.song.artist + ' · ' + x.song.year),
          h('button.btn.ghost.disc-again', { type: 'button', onclick: () => go(i) }, 'Réécouter'))).reverse());
      }

      async function go(target) {
        if (target < 0) return;
        const my = ++seq;
        clearTimeout(timer);
        status.textContent = 'Chargement…';
        eq.classList.remove('on');
        prevBtn.disabled = nextBtn.disabled = true;
        if (target >= history.length) {
          const track = await (prefetch || fetchNext());
          prefetch = null;
          if (my !== seq) return;
          if (!track) {
            if (!history.length) { status.textContent = 'Impossible de charger les extraits (iTunes et Deezer ne répondent pas).'; nextBtn.disabled = false; return; }
            queue = MQ.shuffle(pool()); // tout le pool a été écouté : on recommence dans un nouvel ordre
            return go(target);
          }
          history.push(track);
          if (history.length > HISTORY_MAX) history.shift();
          target = history.length - 1;
        }
        idx = target;
        revealed = !settings.hidden;
        paused = false;
        playBtn.textContent = 'Pause';
        counter.textContent = 'Titre ' + (idx + 1);
        showInfo();
        try {
          await MQ.player.play(history[idx].preview.previewUrl);
          if (my !== seq) return;
          status.textContent = settings.hidden && !revealed ? 'C’est quoi, ce titre ?' : 'Écoute en cours';
          eq.classList.add('on');
        } catch (e) {
          if (my !== seq) return;
          status.textContent = 'Le navigateur a bloqué le son : appuie sur Lecture.';
          paused = true; playBtn.textContent = 'Lecture';
        }
        prevBtn.disabled = idx <= 0;
        nextBtn.disabled = false;
        if (!prefetch && idx === history.length - 1) prefetch = fetchNext();
      }

      function togglePause() {
        if (idx < 0) return;
        if (paused) {
          a.play().then(() => { paused = false; playBtn.textContent = 'Pause'; eq.classList.add('on'); status.textContent = 'Écoute en cours'; }).catch(() => {});
        } else {
          a.pause(); paused = true; playBtn.textContent = 'Lecture'; eq.classList.remove('on'); status.textContent = 'En pause';
        }
      }

      go(0);
    }

    showMenu();
    return () => { cleanups.forEach(f => f()); cleanups = []; MQ.player.stop(); };
  }

  MQ.registerGame({
    id: 'decouverte',
    title: 'Lecture découverte',
    tagline: 'Sans score : des extraits au hasard qui s’enchaînent, par période et par style. Pour écouter ou réviser.',
    mount
  });
})(window.MQ);
