/*
 * Correction des réponses écrites, avec tolérance aux fautes.
 * On compare après normalisation (casse, accents, ponctuation, espaces) avec la
 * distance de Levenshtein : nombre de lettres à ajouter, supprimer ou remplacer.
 */
window.MQ = window.MQ || {};

(function (MQ) {
  // Nombre de fautes acceptées selon la longueur du nom attendu.
  // 3 fautes à partir de 8 caractères ; moins sur les noms très courts,
  // sinon « Abba » accepterait presque n'importe quel mot de 4 lettres.
  function tolerance(len) {
    if (len >= 8) return 3;
    if (len >= 5) return 2;
    return 1;
  }

  function normalize(s, keepArticle) {
    return (s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/['’`´.]/g, '')          // Don't -> dont, R.E.M. -> rem
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(keepArticle ? /^$/ : /^(the|les|le|la|l) /, '');
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(
          prev[j] + 1,
          cur[j - 1] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
      prev = cur;
    }
    return prev[b.length];
  }

  // Variantes acceptées d'un nom : complet, sans parenthèses, sans "feat."
  function variants(name) {
    const out = new Set([name]);
    out.add(name.replace(/\s*[\(\[].*?[\)\]]\s*/g, ' '));
    out.add(name.replace(/\s+(feat\.?|ft\.?|featuring)\s.*$/i, ''));
    const list = [];
    out.forEach(n => { list.push(normalize(n), normalize(n, true)); });
    return Array.from(new Set(list)).filter(Boolean);
  }

  /** true si `input` correspond à l'un des noms attendus, à quelques fautes près. */
  function isMatch(input, expectedNames) {
    const inputs = Array.from(new Set([normalize(input), normalize(input, true)])).filter(Boolean);
    if (!inputs.length) return false;
    for (const name of expectedNames) {
      for (const want of variants(name)) {
        const tol = tolerance(want.replace(/ /g, '').length);
        for (const got of inputs) {
          if (levenshtein(got, want) <= tol) return true;
          if (levenshtein(got.replace(/ /g, ''), want.replace(/ /g, '')) <= tol) return true;
        }
      }
    }
    return false;
  }

  // Petits mots ignorés pour la « moitié du titre ».
  const STOP = new Set(('a an the of and or to in on at by for with from is it its i me my you your we our be o oh ' +
    'la le les l un une des de du d et ou au aux en dans sur pour par je j tu il elle on nous vous ils ne n pas que qui ' +
    'ce c se s me m te t ma ta sa mon ton son y').split(' '));

  const words = s => normalize(s, true).split(' ').filter(Boolean);

  function sameWord(a, b) {
    if (a === b) return true;
    const len = Math.max(a.length, b.length);
    if (len < 4) return false;
    return levenshtein(a, b) <= (len >= 8 ? 2 : 1);
  }

  /** true si la saisie contient au moins la moitié des mots importants d'un des titres. */
  function halfTitle(text, titles) {
    const typed = words(text);
    return titles.some(t => {
      const key = words(t.replace(/\s*[\(\[].*?[\)\]]\s*/g, ' ')).filter(w => !STOP.has(w));
      if (key.length < 2) return false;
      const found = key.filter(w => typed.some(x => sameWord(x, w))).length;
      return found >= Math.ceil(key.length / 2);
    });
  }

  /**
   * Corrige une saisie libre pour une chanson.
   * La saisie peut contenir l'artiste, le titre, ou les deux (« queen bohemian rhapsody »).
   * Renvoie { artist: bool, title: 'full' | 'half' | null }.
   */
  function judgeGuess(text, song) {
    const artists = [song.artist].concat(song.artistAlt || []);
    const titles = [song.title].concat(song.titleAlt || []);
    let artist = isMatch(text, artists);
    let title = isMatch(text, titles) ? 'full' : null;
    const ws = words(text);
    for (let i = 1; i < ws.length && !(artist && title === 'full'); i++) {
      const left = ws.slice(0, i).join(' '), right = ws.slice(i).join(' ');
      for (const [a, t] of [[left, right], [right, left]]) {
        if (isMatch(a, artists)) {
          artist = true;
          if (isMatch(t, titles)) title = 'full';
        }
      }
    }
    if (!title && halfTitle(text, titles)) title = 'half';
    return { artist, title };
  }

  MQ.match = { normalize, levenshtein, tolerance, isMatch, judgeGuess, halfTitle };
})(window.MQ);
