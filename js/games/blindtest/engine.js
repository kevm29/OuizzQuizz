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
  const FLASH_SECONDS = [1, 2, 3]; // durées possibles du flash (réglage « Durée »)
  const CHOICE_COUNTS = [4, 6, 8];  // nombre de propositions (réglage « Propositions »)
  const GRACE_MS = 6000;        // marge pour le chargement de l'extrait chez chacun
  // Chaque joueur a son propre chrono, lancé quand IL entend la musique.
  // Après le premier « temps écoulé », on attend les autres au plus ce délai.
  const LAST_CALL_MS = 4000;

  // Barème (réponse écrite)
  const PTS_ARTIST = 20;
  const PTS_TITLE = 20;
  const PTS_HALF_TITLE = 10;
  const PTS_HALF_ARTIST = 10;
  const PTS_CHOICE = 40;        // mode propositions : artiste + titre d'un coup
  // Jeu « Quelle année ? » : une seule réponse par manche.
  // Année exacte : 50 pts ; à 2 ans près : 30 pts ; sinon dans la bonne décennie : 25 pts.
  const PTS_YEAR_EXACT = 50;
  const PTS_YEAR_NEAR = 30;
  const PTS_YEAR_DECADE = 25;
  const YEAR_NEAR = 2;
  const yearPoints = (guess, year) => {
    if (!guess || !year) return 0;
    if (guess === year) return PTS_YEAR_EXACT;
    if (Math.abs(guess - year) <= YEAR_NEAR) return PTS_YEAR_NEAR;
    if (Math.floor(guess / 10) === Math.floor(year / 10)) return PTS_YEAR_DECADE;
    return 0;
  };
  const YEAR_MIN = 1950;
  // Bonus de série : manches d'affilée avec au moins l'artiste ou le titre trouvé.
  // 2e manche : +20, 3e : +20, 4e : +20, puis +30 à chaque manche.
  const streakBonus = n => n < 2 ? 0 : n < 5 ? 20 : 30;
  // Bonus de classement (à partir de 2 joueurs) : pour l'artiste et pour le titre,
  // le 1er à trouver gagne +30 % de ces points, le 2e +20 %, le 3e +10 %.
  // L'ordre se fait sur le temps de chacun, compté depuis le moment où il a entendu la musique.
  const RANK_BONUS = [0.30, 0.20, 0.10];
  // Jeu « Refrain » : une ligne du refrain de plus toutes les LINE_SECONDS secondes (4 au plus).
  // Bonus si l'on trouve l'artiste ou le titre en entier dès la 1re, 2e ou 3e ligne.
  const LINE_SECONDS = 10;
  const LINE_BONUS = [20, 10, 5, 0];

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
    if (settings.listen === 'refrain') return MQ.refrainSongs.slice();
    const cat = MQ.categories.find(c => c.id === settings.category) || MQ.categories[0];
    const level = MQ.levels.find(l => l.id === settings.level) || MQ.levels[0];
    const style = MQ.styles.find(st => st.id === settings.style) || MQ.styles[0];
    // Quelle année ? : pas de musique classique ni de titres d'avant 1950 (dates de composition).
    const yearOk = settings.listen === 'year' ? (s => s.year >= YEAR_MIN && s.genre !== 'classique') : () => true;
    return MQ.catalog.filter(s => cat.test(s) && level.test(s) && style.test(s) && yearOk(s));
  };
  MQ.flashSeconds = s => FLASH_SECONDS.includes(Number(s.flashSec)) ? Number(s.flashSec) : 1;
  MQ.choiceCount = s => CHOICE_COUNTS.includes(Number(s.choices)) ? Number(s.choices) : 4;
  MQ.answerMode = s => s.listen === 'year' ? 'year' : s.answer === 'choice' ? 'choice' : 'text';

  // artist et title : 0, à moitié ou trouvé (en points) ; artistAt / titleAt : temps du joueur (ms)
  const freshState = () => ({ artist: 0, title: 0, artistAt: null, titleAt: null, choice: null, year: null, yearPts: 0, yearAt: null, done: false, timeup: false, guesses: 0 });

  class Engine {
    /** send(toId|null, msg) : null = tout le monde. */
    constructor(send, hostId) {
      this.send = send;
      this.hostId = hostId;
      this.players = new Map(); // id -> {id, name, score, streak}
      this.settings = { rounds: 10, category: 'all', level: 'hits', style: 'all', listen: 'normal', answer: 'text', flashSec: 1, choices: 4 };
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
      return Array.from(this.players.values()).map(p => ({
        id: p.id, name: p.name, score: p.score, streak: p.streak,
        found: p.found || 0, avgMs: p.found ? Math.round(p.timeSum / p.found) : null
      }));
    }
    // Classement : le score d'abord ; à égalité, le plus rapide en moyenne sur ses bonnes réponses.
    standings() {
      const t = p => p.avgMs == null ? Infinity : p.avgMs;
      return this.publicPlayers().sort((a, b) => b.score - a.score || t(a) - t(b));
    }

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
      this.players.forEach(p => { p.score = 0; p.streak = 0; p.timeSum = 0; p.found = 0; });
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
        if (this.settings.listen === 'refrain') {
          // Les paroles d'abord ; l'extrait ne sert qu'à la pochette de l'intertitre.
          // On n'attend pas la pochette plus de 3 s.
          const cover = Promise.race([MQ.findPreview(song).catch(() => null), new Promise(ok => setTimeout(() => ok(null), 3000))]);
          const lines = await MQ.findChorus(song);
          if (lines && lines.length) return { song, preview: (await cover) || {}, lines };
          continue;
        }
        const preview = await MQ.findPreview(song);
        if (preview) return { song, preview };
      }
      return null;
    }

    async nextRound() {
      this.state = 'loading';
      this.send(null, { t: 'loading' });
      const seq = ++this.roundSeq;
      const s0 = this.settings;
      const track = await this.prefetch;
      if (seq !== this.roundSeq || this.state !== 'loading') return; // annulé entre-temps
      if (!track) {
        this.state = 'lobby';
        this.send(null, { t: 'fail', reason: s0.listen === 'refrain'
          ? 'Impossible de trouver les paroles (le site LRCLIB ne répond pas).'
          : 'Impossible de charger les extraits (iTunes et Deezer ne répondent pas).' });
        return;
      }
      this.index++;
      this.prefetch = this.index < this.total ? this.findTrack() : Promise.resolve(null);

      const s = this.settings;
      const refrain = s.listen === 'refrain';
      const seconds = refrain ? track.lines.length * LINE_SECONDS : ROUND_SECONDS;
      const answer = MQ.answerMode(s);
      const flashMs = MQ.flashSeconds(s) * 1000;
      const msg = {
        t: 'round', id: seq, n: this.index, total: this.total,
        listen: s.listen, answer, seconds,
        lines: refrain ? track.lines : null, lineSeconds: LINE_SECONDS,
        previewUrl: track.preview.previewUrl,
        offset: s.listen === 'flash' ? Math.round(4 + Math.random() * (24 - flashMs / 1000)) : 0,
        flashMs
      };
      let options = null;
      if (answer === 'choice') {
        options = MQ.shuffle([track.song].concat(pickDistractors(track.song, this.pool, MQ.choiceCount(s) - 1)));
        msg.options = options.map(o => ({ title: o.title, artist: o.artist }));
      }
      const ps = new Map();
      this.players.forEach(p => ps.set(p.id, freshState()));
      this.round = { id: seq, track, options, msg, ps };
      this.state = 'round';
      this.send(null, msg);
      this.schedule(() => this.finishRound(), seconds * 1000 + GRACE_MS);
    }

    receive(id, msg) {
      if (!msg || this.state !== 'round' || (this.paused && msg.t === 'guess')) return;
      const r = this.round;
      const st = r.ps.get(id);
      if (msg.id !== r.id || !st || !this.players.has(id)) return;

      if (msg.t === 'timeup') {
        st.timeup = true;
        // Le premier chrono terminé lance un court délai pour les retardataires, au lieu d'attendre la marge entière.
        if (!r.closing) { r.closing = true; if (!this.paused && this.timerAt - Date.now() > LAST_CALL_MS) this.schedule(() => this.finishRound(), LAST_CALL_MS); }
        this.checkDone();
        return;
      }
      if (msg.t !== 'guess' || st.done) return;

      const song = r.track.song;
      let result;
      st.guesses++;
      // Temps du joueur depuis qu'il entend la musique (pauses déduites), envoyé par son appareil.
      const max = r.msg.seconds * 1000;
      const at = Math.max(0, Math.min(max + GRACE_MS, Number(msg.elapsed) || max));
      if (r.msg.answer === 'year') {
        const y = Math.round(Number(msg.year));
        if (!(y >= 1000 && y <= 2100)) { st.guesses--; return; }
        st.year = y;
        st.yearPts = yearPoints(y, song.year);
        st.yearAt = at;
        st.done = true;
        result = 'sent'; // on ne dévoile qu'à l'intertitre
      } else if (r.msg.answer === 'choice') {
        st.choice = msg.choice;
        const ok = r.options[msg.choice] === song;
        if (ok) { st.artist = PTS_ARTIST; st.title = PTS_TITLE; st.artistAt = st.titleAt = at; }
        st.done = true;
        result = 'sent'; // on ne dévoile qu'à l'intertitre
      } else {
        const text = String(msg.text || '').slice(0, 120);
        const g = MQ.match.judgeGuess(text, song);
        const a0 = st.artist, t0 = st.title;
        if (g.artist === 'full') st.artist = PTS_ARTIST;
        else if (g.artist === 'half' && st.artist < PTS_HALF_ARTIST) st.artist = PTS_HALF_ARTIST;
        if (g.title === 'full') st.title = PTS_TITLE;
        else if (g.title === 'half' && st.title < PTS_HALF_TITLE) st.title = PTS_HALF_TITLE;
        if (st.artist > a0) st.artistAt = at;
        if (st.title > t0) st.titleAt = at;
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
      const mode = this.round ? this.round.msg.answer : MQ.answerMode(this.settings);
      if (mode === 'year') return st.yearPts;
      if (mode === 'choice') return st.artist ? PTS_CHOICE : 0;
      return st.artist + st.title;
    }

    progress() {
      const r = this.round;
      this.send(null, {
        t: 'progress',
        players: Array.from(this.players.values()).filter(p => r.ps.has(p.id)).map(p => {
          const st = r.ps.get(p.id);
          return { id: p.id, name: p.name, artist: st.artist, title: st.title, answered: st.done, done: st.done || st.timeup };
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
      // Bonus de classement, élément par élément (artiste, puis titre).
      const rank = new Map(); // id -> {bonus, artistRank, titleRank}
      const inRound = Array.from(r.ps.keys()).filter(id => this.players.has(id));
      const mode = r.msg.answer;
      if (inRound.length >= 2 && mode !== 'year') {
        const choice = mode === 'choice';
        (choice ? ['title'] : ['artist', 'title']).forEach(el => {
          inRound
            .filter(id => r.ps.get(id)[el] > 0)
            .sort((a, b) => r.ps.get(a)[el + 'At'] - r.ps.get(b)[el + 'At'])
            .slice(0, RANK_BONUS.length)
            .forEach((id, i) => {
              const st = r.ps.get(id);
              const pts = choice ? PTS_CHOICE : st[el];
              const e = rank.get(id) || { bonus: 0 };
              e.bonus += Math.round(pts * RANK_BONUS[i]);
              e[el + 'Rank'] = i + 1;
              rank.set(id, e);
            });
        });
      }
      this.players.forEach(p => {
        const st = r.ps.get(p.id);
        if (!st) return;
        const rk = rank.get(p.id) || { bonus: 0 };
        const base = this.roundPoints(st);
        const year = mode === 'year';
        // Quelle année ? : la série compte les manches à 2 ans près ou mieux, sans bonus (barème fixe).
        const good = year ? st.yearPts >= PTS_YEAR_NEAR : st.artist === PTS_ARTIST || st.title === PTS_TITLE;
        p.streak = good ? p.streak + 1 : 0;
        const bonus = good && !year ? streakBonus(p.streak) : 0;
        // Refrain : à quelle ligne le joueur a trouvé l'artiste ou le titre en entier.
        let line = null, lineBonus = 0;
        if (r.msg.listen === 'refrain' && good) {
          const times = [];
          if (st.artist === PTS_ARTIST) times.push(st.artistAt);
          if (st.title === PTS_TITLE) times.push(st.titleAt);
          line = Math.min(r.msg.lines.length, Math.floor(Math.min(...times) / (LINE_SECONDS * 1000)) + 1);
          lineBonus = LINE_BONUS[line - 1] || 0;
        }
        p.score += base + bonus + rk.bonus + lineBonus;
        // Rapidité, pour départager les égalités : temps de chaque réponse trouvée (artiste, titre, même à moitié).
        if (year) {
          if (st.yearPts && st.yearAt != null) { p.timeSum = (p.timeSum || 0) + st.yearAt; p.found = (p.found || 0) + 1; }
        } else if (mode === 'choice') {
          if (st.title && st.titleAt != null) { p.timeSum = (p.timeSum || 0) + st.titleAt; p.found = (p.found || 0) + 1; }
        } else {
          ['artist', 'title'].forEach(el => {
            if (st[el] && st[el + 'At'] != null) { p.timeSum = (p.timeSum || 0) + st[el + 'At']; p.found = (p.found || 0) + 1; }
          });
        }
        results.push({
          id: p.id, name: p.name, artist: st.artist, title: st.title, choice: st.choice, year: st.year, yearPts: st.yearPts,
          guesses: st.guesses, base, bonus, rankBonus: rk.bonus, artistRank: rk.artistRank || null, titleRank: rk.titleRank || null,
          line, lineBonus, pts: base + bonus + rk.bonus + lineBonus, streak: p.streak
        });
      });
      const { song, preview } = r.track;
      const last = this.index >= this.total;
      this.send(null, {
        t: 'reveal', id: r.id, n: this.index, total: this.total, last, breakMs: BREAK_MS,
        song: { title: song.title, artist: song.artist, year: song.year },
        lines: r.msg.lines ? r.msg.lines.length : 0,
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
  MQ.BLINDTEST_RULES = { RANK_BONUS, PTS_ARTIST, PTS_TITLE, PTS_HALF_TITLE, PTS_HALF_ARTIST, PTS_CHOICE, ROUND_SECONDS, BREAK_MS, LINE_SECONDS, LINE_BONUS,
    PTS_YEAR_EXACT, PTS_YEAR_NEAR, PTS_YEAR_DECADE, YEAR_NEAR, YEAR_MIN, FLASH_SECONDS, CHOICE_COUNTS };
  MQ.yearPoints = yearPoints;
})(window.MQ);
