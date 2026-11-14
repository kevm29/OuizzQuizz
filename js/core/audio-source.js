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

  function artistMatches(found, wanted) {
    const a = norm(found), b = norm(wanted);
    return a && b && (a.includes(b) || b.includes(a));
  }

  function titleMatches(found, wanted) {
    const a = norm(found), b = norm(wanted);
    return a && b && (a.includes(b) || b.includes(a));
  }

  function pick(results, song, map) {
    const items = results.map(map).filter(r => r.previewUrl);
    return items.find(r => artistMatches(r.artist, song.artist) && titleMatches(r.title, song.title))
        || items.find(r => artistMatches(r.artist, song.artist))
        || null;
  }

  async function fromItunes(song) {
    const term = encodeURIComponent(song.artist + ' ' + song.title);
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
    const q = encodeURIComponent('artist:"' + song.artist + '" track:"' + song.title + '"');
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
  MQ.player = (function () {
    const audio = new Audio();
    audio.preload = 'auto';
    return {
      audio,
      unlock() {
        // Lecture silencieuse immédiate pendant le geste utilisateur.
        audio.muted = true;
        const p = audio.play();
        if (p && p.catch) p.catch(() => {});
        audio.pause();
        audio.muted = false;
      },
      play(url) {
        clearTimeout(this._stopTimer);
        this._cancelFade();
        audio.pause();
        audio.src = url;
        audio.currentTime = 0;
        audio.volume = 1;
        return audio.play();
      },
      /** Joue `ms` millisecondes à partir de `offset` secondes (mode Flash). */
      playSegment(url, offset, ms) {
        clearTimeout(this._stopTimer);
        this._cancelFade();
        audio.pause();
        audio.volume = 1;
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
      stop() { clearTimeout(this._stopTimer); this._cancelFade(); audio.pause(); audio.volume = 1; },
      fadeOut(ms) {
        this._cancelFade();
        const start = audio.volume, steps = 10;
        let i = 0;
        this._fade = setInterval(() => {
          i++;
          audio.volume = Math.max(0, start * (1 - i / steps));
          if (i >= steps) { this._cancelFade(); audio.pause(); audio.volume = 1; }
        }, (ms || 600) / steps);
      },
      // Un fondu en cours ne doit jamais couper la musique suivante.
      _cancelFade() { clearInterval(this._fade); this._fade = null; }
    };
  })();
})(window.MQ);
