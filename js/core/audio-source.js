/*
 * Source des extraits audio : previews officielles de 30 s.
 * 1) API iTunes Search (Apple)  2) API Deezer en secours.
 * Les deux sont appelées en JSONP : pas de clé, pas de serveur, et ça marche
 * même quand la page est ouverte en file:// ou sur GitHub Pages.
 */
window.MQ = window.MQ || {};

(function (MQ) {
  const cache = new Map();
  let counter = 0;

  function jsonp(url, timeoutMs) {
    return new Promise((resolve, reject) => {
      const name = '__mq_jsonp_' + (++counter) + '_' + Date.now();
      const script = document.createElement('script');
      let done = false;
      const finish = () => {
        done = true;
        clearTimeout(timer);
        window[name] = function () {}; // une réponse tardive ne doit pas planter
        script.remove();
      };
      const timer = setTimeout(() => { if (!done) { finish(); reject(new Error('timeout')); } }, timeoutMs || 8000);
      window[name] = data => { if (!done) { finish(); resolve(data); } };
      script.onerror = () => { if (!done) { finish(); reject(new Error('network')); } };
      script.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + name;
      document.head.appendChild(script);
    });
  }

  const norm = s => (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  // Comparaison par mots entiers (« li » ne correspond plus à « lia »), en ignorant les mentions
  // entre parenthèses ou après un tiret (« Remastered », « Live », « Radio Edit »…).
  const STOP = new Set(['the', 'a', 'and', 'le', 'la', 'les', 'l']);
  const words = s => norm(String(s || '').replace(/\s*[(\[].*?[)\]]\s*/g, ' ').replace(/\s+-\s+.*$/, ''))
    .split(' ').filter(w => w && !STOP.has(w));
  const within = (x, y) => x.every(w => y.includes(w));
  const size = ws => ws.join('').length;

  function artistMatches(found, wanted) {
    const f = words(found), w = words(wanted);
    if (!f.length || !w.length) return false;
    // « Gims » ↔ « Maître Gims », « Al Bano » ↔ « Al Bano & Romina Power » ; jamais sur un bout de mot.
    return (within(w, f) && size(w) >= 3) || (within(f, w) && size(f) >= 3);
  }

  function titleMatches(found, wanted) {
    const f = words(found), w = words(wanted);
    if (!f.length || !w.length) return false;
    if (within(w, f)) return f.length <= w.length + 3;             // titre complet, quelques mots en plus au plus
    if (within(f, w)) return f.length >= Math.ceil(w.length * 0.6); // titre raccourci, pas un autre titre plus court
    const common = w.filter(x => f.includes(x)).length;            // petites variantes d'écriture
    return w.length >= 4 && common / w.length >= 0.75 && common / f.length >= 0.75;
  }

  const mainArtist = a => a.split(/\s+(?:featuring|feat\.?|ft\.?|with|duet with|x)\s+/i)[0];
  // Génériques dont l'interprète est inconnu : on cherche sur le titre seul.
  const noArtist = song => song.artist === 'Générique TV';

  function pick(results, song, map) {
    const items = results.map(map).filter(r => r.previewUrl);
    const artist = mainArtist(song.artist);
    const title = song.title.replace(/\s*\(.*?\)\s*/g, ' ').trim() || song.title;
    if (noArtist(song)) return items.find(r => titleMatches(r.title, title)) || null;
    // L'artiste ET le titre doivent correspondre : sinon on tombe sur un homonyme
    // (ex. « Gemini », Portugal 1978, remplacé par un groupe chinois du même nom).
    return items.find(r => artistMatches(r.artist, artist) && titleMatches(r.title, title)) || null;
  }

  async function fromItunes(song) {
    const term = encodeURIComponent((noArtist(song) ? '' : mainArtist(song.artist) + ' ') + song.title.replace(/\s*\(.*?\)\s*/g, ' '));
    const data = await jsonp('https://itunes.apple.com/search?media=music&entity=song&limit=10&country=FR&term=' + term);
    return pick(data.results || [], song, r => ({
      previewUrl: r.previewUrl,
      artist: r.artistName,
      title: r.trackName,
      artwork: (r.artworkUrl100 || '').replace('100x100bb', '400x400bb'),
      link: r.trackViewUrl,
      source: 'iTunes'
    }));
  }

  async function fromDeezer(song) {
    const track = 'track:"' + song.title.replace(/\s*\(.*?\)\s*/g, ' ').trim() + '"';
    const q = encodeURIComponent(noArtist(song) ? track : 'artist:"' + mainArtist(song.artist) + '" ' + track);
    const data = await jsonp('https://api.deezer.com/search?output=jsonp&limit=10&q=' + q);
    return pick(data.data || [], song, r => ({
      previewUrl: r.preview,
      artist: r.artist && r.artist.name,
      title: r.title,
      artwork: r.album && (r.album.cover_big || r.album.cover_medium),
      link: r.link,
      source: 'Deezer'
    }));
  }

  /** Renvoie {previewUrl, artwork, link, source} ou null si aucun extrait trouvé. */
  MQ.findPreview = async function (song) {
    const key = song.artist + '|' + song.title;
    if (cache.has(key)) return cache.get(key);
    const promise = (async () => {
      for (const provider of [fromItunes, fromDeezer]) {
        try {
          const hit = await provider(song);
          if (hit) return hit;
        } catch (e) { /* on tente la source suivante */ }
      }
      return null;
    })();
    cache.set(key, promise);
    const result = await promise;
    if (!result) cache.delete(key);
    return result;
  };

  // Un seul élément <audio> partagé : débloqué au premier clic, réutilisé ensuite (iOS/Safari).
  // Le volume choisi par le joueur (0 à 1) est gardé dans le navigateur.
  MQ.player = (function () {
    const audio = new Audio();
    audio.preload = 'auto';
    let level = 0.8;
    try { const v = parseFloat(localStorage.getItem('mq.volume')); if (v >= 0 && v <= 1) level = v; } catch (e) {}
    audio.volume = level;

    return {
      audio,
      get volume() { return level; },
      setVolume(v) {
        level = Math.max(0, Math.min(1, v));
        if (!this._fade) audio.volume = level;
        try { localStorage.setItem('mq.volume', String(level)); } catch (e) {}
      },
      unlock() {
        // Lecture silencieuse immédiate pendant le geste utilisateur.
        audio.muted = true;
        const p = audio.play();
        if (p && p.catch) p.catch(() => {});
        audio.pause();
        audio.muted = false;
      },
      play(url) {
        this._reset();
        audio.src = url;
        audio.currentTime = 0;
        return audio.play();
      },
      /** Joue `ms` millisecondes à partir de `offset` secondes (mode Flash). */
      playSegment(url, offset, ms) {
        this._reset();
        return new Promise((resolve, reject) => {
          const go = () => {
            try { audio.currentTime = offset; } catch (e) {}
            audio.play().then(() => {
              this._stopTimer = setTimeout(() => audio.pause(), ms);
              resolve();
            }, reject);
          };
          if (audio.src !== url) {
            const onErr = () => reject(new Error('audio'));
            audio.addEventListener('error', onErr, { once: true });
            audio.addEventListener('loadedmetadata', () => { audio.removeEventListener('error', onErr); go(); }, { once: true });
            audio.src = url;
            audio.load();
          } else go();
        });
      },
      /** Pause de partie : on retient si la musique tournait pour la relancer ensuite. */
      pause() {
        this._resumeOnPlay = !audio.paused && !this._stopTimer;
        clearTimeout(this._stopTimer); this._stopTimer = null;
        audio.pause();
      },
      resume() {
        if (this._resumeOnPlay) audio.play().catch(() => {});
        this._resumeOnPlay = false;
      },
      stop() { this._reset(); },
      fadeOut(ms) {
        this._cancelFade();
        const start = audio.volume, steps = 10;
        let i = 0;
        this._fade = setInterval(() => {
          i++;
          audio.volume = Math.max(0, start * (1 - i / steps));
          if (i >= steps) { this._cancelFade(); audio.pause(); }
        }, (ms || 600) / steps);
      },
      _reset() {
        clearTimeout(this._stopTimer); this._stopTimer = null;
        this._cancelFade();
        this._resumeOnPlay = false;
        audio.pause();
      },
      // Un fondu en cours ne doit jamais couper la musique suivante.
      _cancelFade() { clearInterval(this._fade); this._fade = null; audio.volume = level; }
    };
  })();
})(window.MQ);
