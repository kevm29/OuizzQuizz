/*
 * Moteur du blind test : tourne chez l'hôte (ou en local en solo).
 * Il choisit les titres, envoie les manches, corrige chaque essai, tient les scores
 * et enchaîne automatiquement les manches. Il ne touche jamais à l'écran.
 *
 * Messages envoyés :  lobby, loading, round, feedback, progress, pause, reveal, end, fail
 * Messages reçus :    guess, timeup
 */
window.MQ = window.MQ || {};

(function (MQ) {
  const ROUND_SECONDS = 30;     // durée d'une manche (l'extrait fait 30 s)
  const BREAK_MS = 5000;        // écran intertitre entre deux musiques
  const FLASH_MS = 1000;
  const GRACE_MS = 6000;        // marge pour le chargement de l'extrait chez chacun
  const LAST_CALL_MS = 1500;    // après le premier « temps écoulé », délai laissé aux autres

  // Barème (réponse écrite)
  const PTS_ARTIST = 10;
  const PTS_TITLE = 10;
  const PTS_HALF_TITLE = 5;
  const PTS_HALF_ARTIST = 5;
  const PTS_CHOICE = 20;        // mode 4 propositions : artiste + titre d'un coup
  // Bonus de série : manches d'affilée avec au moins l'artiste ou le titre trouvé.
  // 2e manche : +10, 3e : +10, 4e : +10, puis +15 à chaque manche.
  const streakBonus = n => n < 2 ? 0 : n < 5 ? 10 : 15;

  function pickDistractors(answer, pool, n) {
    const decade = s => Math.floor(s.year / 10);
    const shuffled = MQ.shuffle(pool.filter(s => s !== answer));
    const others = shuffled.filter(s => decade(s) === decade(answer)).concat(shuffled.filter(s => decade(s) !== decade(answer)));
    const chosen = [];
    for (const s of others) {
      if (chosen.length >= n) break;
      if (s.artist !== answer.artist && !chosen.some(c => c.artist === s.artist)) chosen.push(s);
    }
    for (const s of others) {
      if (chosen.length >= n) break;
      if (!chosen.includes(s)) chosen.push(s);
    }
    return chosen;
  }

  MQ.poolFor = function (settings) {
    if (settings.listen === 'flash') return MQ.catalog.filter(s => s.top);
    const cat = MQ.categories.find(c => c.id === settings.category) || MQ.categories[0];
    const level = MQ.levels.find(l => l.id === settings.level) || MQ.levels[0];
    return MQ.catalog.filter(s => cat.test(s) && level.test(s));
  };

  // artist et title : 0, 5 (à moitié) ou 10 (trouvé)
  const freshState = () => ({ artist: 0, title: 0, choice: null, done: false, timeup: false, guesses: 0 });

  class Engine {
    /** send(toId|null, msg) : null = tout le monde. */
    constructor(send, hostId) {
      this.send = send;
      this.hostId = hostId;
      this.players = new Map(); // id -> {id, name, score, streak}
      this.settings = { rounds: 10, category: 'all', level: 'hits', listen: 'normal', answer: 'text' };
      this.code = null;
      this.state = 'lobby';
      this.roundSeq = 0;
      this.paused = false;
    }

    /* Un seul minuteur (fin de manche ou fin d'intertitre), qu'on peut mettre en pause. */
    schedule(fn, ms) {
      clearTimeout(this.timer);
      this.timerFn = fn;
      if (this.paused) { this.timerLeft = ms; return; }
      this.timerAt = Date.now() + ms;
      this.timer = setTimeout(() => { this.timerFn = null; fn(); }, ms);
    }
    cancelSchedule() { clearTimeout(this.timer); this.timerFn = null; }

    pause() {
      if (this.paused || (this.state !== 'round' && this.state !== 'reveal')) return;
      this.paused = true;
      this.timerLeft = Math.max(0, this.timerAt - Date.now());
      clearTimeout(this.timer);
      this.send(null, { t: 'pause', paused: true });
    }
    resume() {
      if (!this.paused) return;
      this.paused = false;
      this.send(null, { t: 'pause', paused: false });
      if (this.timerFn) this.schedule(this.timerFn, this.timerLeft);
    }

    publicPlayers() {
      return Array.from(this.players.values()).map(p => ({ id: p.id, name: p.name, score: p.score, streak: p.streak }));
    }
    standings() { return this.publicPlayers().sort((a, b) => b.score - a.score); }

    lobby() {
      this.send(null, {
        t: 'lobby', code: this.code, hostId: this.hostId,
        players: this.publicPlayers(), settings: this.settings, state: this.state
      });
    }

    addPlayer(id, name) {
      let clean = String(name || '').trim().slice(0, 20) || 'Joueur';
      const taken = new Set(Array.from(this.players.values()).map(p => p.name.toLowerCase()));
      let n = 2; const base = clean;
      while (taken.has(clean.toLowerCase())) clean = base + ' ' + (n++);
      this.players.set(id, { id, name: clean, score: 0, streak: 0 });
      this.lobby();
      if (this.state === 'round' && this.round) { // rejoint en cours de manche
        this.round.ps.set(id, freshState());
        this.send(id, this.round.msg);
        if (this.paused) this.send(id, { t: 'pause', paused: true });
      }
    }

    removePlayer(id) {
      if (!this.players.delete(id)) return;
      this.lobby();
      if (this.state === 'round') { this.progress(); this.checkDone(); }
    }

    setSettings(s) { Object.assign(this.settings, s); this.lobby(); }

    start() {
      this.cancelSchedule();
      this.paused = false;
      this.players.forEach(p => { p.score = 0; p.streak = 0; });
      this.pool = MQ.poolFor(this.settings);
      this.queue = MQ.shuffle(this.pool);
      this.total = Math.min(this.settings.rounds, this.pool.length);
      this.index = 0;
      this.prefetch = this.findTrack();
      this.nextRound();
    }

    async findTrack() {
      while (this.queue.length) {
        const song = this.queue.shift();
        const preview = await MQ.findPreview(song);
        if (preview) return { song, preview };
      }
      return null;
    }

    async nextRound() {
      this.state = 'loading';
      this.send(null, { t: 'loading' });
      const seq = ++this.roundSeq;
      const track = await this.prefetch;
      if (seq !== this.roundSeq || this.state !== 'loading') return; // annulé entre-temps
      if (!track) {
        this.state = 'lobby';
        this.send(null, { t: 'fail', reason: 'Impossible de charger les extraits (iTunes et Deezer ne répondent pas).' });
        return;
      }
      this.index++;
      this.prefetch = this.index < this.total ? this.findTrack() : Promise.resolve(null);

      const s = this.settings;
      const msg = {
        t: 'round', id: seq, n: this.index, total: this.total,
        listen: s.listen, answer: s.answer, seconds: ROUND_SECONDS,
        previewUrl: track.preview.previewUrl,
        offset: s.listen === 'flash' ? Math.round(4 + Math.random() * 18) : 0,
        flashMs: FLASH_MS
      };
      let options = null;
      if (s.answer === 'choice') {
        options = MQ.shuffle([track.song].concat(pickDistractors(track.song, this.pool, 3)));
        msg.options = options.map(o => ({ title: o.title, artist: o.artist }));
      }
      const ps = new Map();
      this.players.forEach(p => ps.set(p.id, freshState()));
      this.round = { id: seq, track, options, msg, ps };
      this.state = 'round';
      this.send(null, msg);
      this.schedule(() => this.finishRound(), ROUND_SECONDS * 1000 + GRACE_MS);
    }

    receive(id, msg) {
      if (!msg || this.state !== 'round' || (this.paused && msg.t === 'guess')) return;
      const r = this.round;
      const st = r.ps.get(id);
      if (msg.id !== r.id || !st || !this.players.has(id)) return;

      if (msg.t === 'timeup') {
        st.timeup = true;
        // Le premier chrono terminé lance un court délai pour les retardataires, au lieu d'attendre la marge entière.
        if (!r.closing) { r.closing = true; if (!this.paused) this.schedule(() => this.finishRound(), LAST_CALL_MS); }
        this.checkDone();
        return;
      }
      if (msg.t !== 'guess' || st.done) return;

      const song = r.track.song;
      let result;
      st.guesses++;
      if (this.settings.answer === 'choice') {
        st.choice = msg.choice;
        const ok = r.options[msg.choice] === song;
        if (ok) { st.artist = PTS_ARTIST; st.title = PTS_TITLE; }
        st.done = true;
        result = 'sent'; // on ne dévoile qu'à l'intertitre
      } else {
        const text = String(msg.text || '').slice(0, 120);
        const g = MQ.match.judgeGuess(text, song);
        if (g.artist === 'full') st.artist = PTS_ARTIST;
        else if (g.artist === 'half' && st.artist < PTS_HALF_ARTIST) st.artist = PTS_HALF_ARTIST;
        if (g.title === 'full') st.title = PTS_TITLE;
        else if (g.title === 'half' && st.title < PTS_HALF_TITLE) st.title = PTS_HALF_TITLE;
        result = (g.artist === 'full' || g.title === 'full') ? 'good' : (g.artist || g.title) ? 'half' : 'bad';
        st.done = st.artist === PTS_ARTIST && st.title === PTS_TITLE;
      }
      this.send(id, {
        t: 'feedback', id: r.id, text: msg.text, result, done: st.done,
        artist: st.artist === PTS_ARTIST ? song.artist : st.artist ? 'half' : null,
        title: st.title === PTS_TITLE ? song.title : st.title ? 'half' : null,
        pts: this.roundPoints(st)
      });
      this.progress();
      this.checkDone();
    }

    roundPoints(st) {
      if (this.settings.answer === 'choice') return st.artist ? PTS_CHOICE : 0;
      return st.artist + st.title;
    }

    progress() {
      const r = this.round;
      this.send(null, {
        t: 'progress',
        players: Array.from(this.players.values()).filter(p => r.ps.has(p.id)).map(p => {
          const st = r.ps.get(p.id);
          return { id: p.id, name: p.name, artist: st.artist, title: st.title, done: st.done || st.timeup };
        })
      });
    }

    checkDone() {
      const r = this.round;
      const waiting = Array.from(r.ps.entries()).filter(([id, st]) => this.players.has(id) && !st.done && !st.timeup);
      if (!waiting.length) this.finishRound();
    }

    finishRound() {
      if (this.state !== 'round') return;
      this.cancelSchedule();
      this.state = 'reveal';
      const r = this.round;
      const results = [];
      this.players.forEach(p => {
        const st = r.ps.get(p.id);
        if (!st) return;
        const base = this.roundPoints(st);
        const good = st.artist === PTS_ARTIST || st.title === PTS_TITLE;
        p.streak = good ? p.streak + 1 : 0;
        const bonus = good ? streakBonus(p.streak) : 0;
        p.score += base + bonus;
        results.push({
          id: p.id, name: p.name, artist: st.artist, title: st.title, choice: st.choice,
          guesses: st.guesses, base, bonus, pts: base + bonus, streak: p.streak
        });
      });
      const { song, preview } = r.track;
      const last = this.index >= this.total;
      this.send(null, {
        t: 'reveal', id: r.id, n: this.index, total: this.total, last, breakMs: BREAK_MS,
        song: { title: song.title, artist: song.artist, year: song.year },
        artwork: preview.artwork, link: preview.link, source: preview.source,
        answerIndex: r.options ? r.options.indexOf(song) : null,
        results, standings: this.standings()
      });
      this.schedule(() => this.next(), BREAK_MS);
    }

    next() {
      if (this.state !== 'reveal') return;
      if (this.index >= this.total) {
        this.state = 'end';
        this.send(null, { t: 'end', standings: this.standings(), settings: this.settings });
      } else this.nextRound();
    }

    backToLobby() {
      this.cancelSchedule();
      this.paused = false;
      this.roundSeq++;
      this.state = 'lobby';
      this.lobby();
    }

    destroy() { this.cancelSchedule(); this.roundSeq++; this.state = 'closed'; }
  }

  MQ.BlindtestEngine = Engine;
  MQ.BLINDTEST_RULES = { PTS_ARTIST, PTS_TITLE, PTS_HALF_TITLE, PTS_HALF_ARTIST, PTS_CHOICE, ROUND_SECONDS, BREAK_MS };
})(window.MQ);
