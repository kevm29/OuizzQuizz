/*
 * Moteur du blind test : tourne chez l'hôte (ou en local en solo).
 * Il choisit les titres, envoie les manches, reçoit et corrige les réponses,
 * tient les scores. Il ne touche jamais à l'écran : il échange des messages.
 *
 * Messages envoyés :  lobby, loading, round, progress, reveal, end, fail
 * Messages reçus :    answer
 */
window.MQ = window.MQ || {};

(function (MQ) {
  const ROUND_SECONDS = 20;
  const FLASH_MS = 1000;
  const GRACE_MS = 6000; // marge pour le chargement de l'extrait chez chacun

  function pickDistractors(answer, pool, n) {
    const others = MQ.shuffle(pool.filter(s => s !== answer));
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
    return MQ.catalog.filter(cat.test);
  };

  class Engine {
    /** send(toId|null, msg) : null = tout le monde. */
    constructor(send, hostId) {
      this.send = send;
      this.hostId = hostId;
      this.players = new Map(); // id -> {id, name, score, streak}
      this.settings = { rounds: 10, category: 'all', listen: 'normal', answer: 'text' };
      this.code = null;
      this.state = 'lobby';
      this.roundSeq = 0;
    }

    publicPlayers() {
      return Array.from(this.players.values()).map(p => ({ id: p.id, name: p.name, score: p.score }));
    }

    standings() {
      return this.publicPlayers().sort((a, b) => b.score - a.score);
    }

    lobby(to) {
      this.send(to === undefined ? null : to, {
        t: 'lobby', code: this.code, hostId: this.hostId,
        players: this.publicPlayers(), settings: this.settings, state: this.state
      });
    }

    addPlayer(id, name) {
      let clean = String(name || '').trim().slice(0, 20) || 'Joueur';
      const taken = new Set(Array.from(this.players.values()).map(p => p.name.toLowerCase()));
      let n = 2, base = clean;
      while (taken.has(clean.toLowerCase())) clean = base + ' ' + (n++);
      this.players.set(id, { id, name: clean, score: 0, streak: 0 });
      this.lobby();
      if (this.state === 'round' && this.round) this.send(id, this.round.msg); // rejoint en cours
    }

    removePlayer(id) {
      if (!this.players.delete(id)) return;
      this.lobby();
      if (this.state === 'round') this.checkAllAnswered();
    }

    setSettings(s) {
      Object.assign(this.settings, s);
      this.lobby();
    }

    start() {
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
      this.round = { id: seq, track, options, msg, answers: new Map(), participants: new Set(this.players.keys()) };
      this.state = 'round';
      clearTimeout(this.deadline);
      this.deadline = setTimeout(() => this.finishRound(), ROUND_SECONDS * 1000 + GRACE_MS);
      this.send(null, msg);
    }

    receive(id, msg) {
      if (!msg || msg.t !== 'answer' || this.state !== 'round') return;
      const r = this.round;
      if (msg.id !== r.id || r.answers.has(id) || !this.players.has(id)) return;
      r.answers.set(id, msg);
      this.send(null, { t: 'progress', answered: Array.from(r.answers.keys()) });
      this.checkAllAnswered();
    }

    checkAllAnswered() {
      const r = this.round;
      const waiting = Array.from(r.participants).filter(id => this.players.has(id) && !r.answers.has(id));
      if (!waiting.length) this.finishRound();
    }

    judge(a) {
      const r = this.round, song = r.track.song;
      const seconds = ROUND_SECONDS;
      const elapsed = Math.min(seconds, Math.max(0, (a && a.elapsed || seconds * 1000) / 1000));
      const speed = Math.round(100 * (seconds - elapsed) / seconds);
      const res = { answered: !!a, elapsed: a ? elapsed : null };
      if (!a) return Object.assign(res, { pts: 0, full: false });

      if (this.settings.answer === 'choice') {
        const ok = r.options[a.choice] === song;
        return Object.assign(res, { choice: a.choice, correct: ok, full: ok, pts: ok ? 100 + speed : 0 });
      }
      const artistOk = MQ.match.isMatch(a.artist, [song.artist].concat(song.artistAlt || []));
      const titleOk = MQ.match.isMatch(a.title, [song.title].concat(song.titleAlt || []));
      let pts = (titleOk ? 100 : 0) + (artistOk ? 50 : 0);
      if (pts) pts += Math.round(speed * (artistOk && titleOk ? 1 : 0.5));
      return Object.assign(res, {
        artist: String(a.artist || '').slice(0, 60), title: String(a.title || '').slice(0, 80),
        artistOk, titleOk, full: artistOk && titleOk, pts
      });
    }

    finishRound() {
      if (this.state !== 'round') return;
      clearTimeout(this.deadline);
      this.state = 'reveal';
      const r = this.round;
      const results = [];
      this.players.forEach(p => {
        if (!r.participants.has(p.id)) return;
        const res = this.judge(r.answers.get(p.id));
        if (res.full) p.streak++; else p.streak = 0;
        if (res.full && p.streak >= 3) { res.pts += 50; res.streakBonus = true; }
        p.score += res.pts;
        results.push(Object.assign({ id: p.id, name: p.name, streak: p.streak }, res));
      });
      const { song, preview } = r.track;
      this.send(null, {
        t: 'reveal', id: r.id, n: this.index, total: this.total, last: this.index >= this.total,
        song: { title: song.title, artist: song.artist, year: song.year },
        artwork: preview.artwork, link: preview.link, source: preview.source,
        answerIndex: r.options ? r.options.indexOf(song) : null,
        results, standings: this.standings()
      });
    }

    next() {
      if (this.state !== 'reveal') return;
      if (this.index >= this.total) {
        this.state = 'end';
        this.send(null, { t: 'end', standings: this.standings(), settings: this.settings });
      } else this.nextRound();
    }

    backToLobby() {
      clearTimeout(this.deadline);
      this.roundSeq++;
      this.state = 'lobby';
      this.lobby();
    }

    destroy() { clearTimeout(this.deadline); this.roundSeq++; this.state = 'closed'; }
  }

  MQ.BlindtestEngine = Engine;
  MQ.BLINDTEST_ROUND_SECONDS = ROUND_SECONDS;
})(window.MQ);
