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

  MQ.match = { normalize, levenshtein, tolerance, isMatch };
})(window.MQ);
