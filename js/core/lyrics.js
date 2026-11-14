/*
 * Paroles pour le jeu « Refrain » : recherche sur LRCLIB (lrclib.net, base ouverte,
 * gratuite, sans clé), détection du refrain et masquage du titre.
 *
 * Rien n'est stocké dans le jeu : les paroles sont lues à la volée par le navigateur
 * de l'hôte, et seules quelques lignes du refrain sont affichées.
 */
window.MQ = window.MQ || {};

(function (MQ) {
  const API = 'https://lrclib.net/api/';
  const MAX_LINES = 4;

  // Comparaison de lignes : sans casse, accents, ponctuation ni « (oh oh) » entre parenthèses.
  function norm(s) {
    return (s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s*[\(\[].*?[\)\]]\s*/g, ' ')
      .replace(/['’`´]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  // Repères de section : « [Refrain] », « [Couplet 2 : X] », « (Chorus) », « Refrain : », « Refrain x2 ».
  const SECTION = '(?:refrain|chorus|couplet|verse|pont|bridge|intro|outro|pr[eé]-?refrain|pre-?chorus|hook)';
  const LABEL = new RegExp('^\\s*(?:\\[[^\\]]*\\]|\\(\\s*' + SECTION + '[^)]*\\)|' + SECTION + '\\s*\\d*\\s*(?:x\\s*\\d+)?\\s*:?)\\s*$', 'i');
  const isLabel = l => LABEL.test(l);
  const isChorusLabel = l => isLabel(l) && /^\W*(refrain|chorus)\b/i.test(l);

  /** Découpe les paroles en strophes (séparées par des lignes vides). */
  function stanzas(text) {
    const out = [];
    let cur = [];
    let curIsChorus = false;
    const push = () => { if (cur.length) out.push({ lines: cur, labelled: curIsChorus }); cur = []; curIsChorus = false; };
    String(text || '').replace(/\r/g, '').split('\n').forEach(raw => {
      const line = raw.replace(/\[\d+:\d+(?:\.\d+)?\]/g, '').trim(); // horodatages LRC éventuels
      if (!line) return push();
      if (isLabel(line)) { push(); curIsChorus = isChorusLabel(line); return; }
      if (!norm(line)) return;            // « (oh oh oh) » seul
      cur.push(line);
    });
    push();
    return out;
  }

  // Part de lignes communes entre deux strophes (0 à 1).
  function overlap(a, b) {
    const A = new Set(a.map(norm)), B = new Set(b.map(norm));
    let n = 0;
    A.forEach(x => { if (B.has(x)) n++; });
    return n / Math.max(A.size, B.size);
  }

  /**
   * Trouve le refrain : une strophe marquée [Refrain] si les paroles le disent,
   * sinon la strophe qui revient le plus souvent, sinon la plus longue suite de
   * lignes qui reviennent au moins deux fois. Renvoie les lignes, ou null.
   */
  function findChorusLines(text) {
    const st = stanzas(text);
    if (!st.length) return null;

    const labelled = st.find(s => s.labelled && s.lines.length >= 2);
    if (labelled) return labelled.lines;

    let best = null, bestCount = 1;
    st.forEach((s, i) => {
      if (s.lines.length < 2) return;
      const count = st.filter(o => overlap(s.lines, o.lines) >= 0.6).length;
      // À égalité : la strophe la plus longue, puis la première.
      if (count > bestCount || (count === bestCount && best && s.lines.length > best.lines.length)) {
        best = s; bestCount = count;
      }
    });
    if (best) return best.lines;

    // Pas de strophe répétée : on cherche des lignes répétées consécutives.
    const all = st.flatMap(s => s.lines);
    const freq = new Map();
    all.forEach(l => { const k = norm(l); freq.set(k, (freq.get(k) || 0) + 1); });
    let run = [], bestRun = [];
    all.forEach(l => {
      if (freq.get(norm(l)) >= 2) run.push(l);
      else { if (run.length > bestRun.length) bestRun = run; run = []; }
    });
    if (run.length > bestRun.length) bestRun = run;
    return bestRun.length >= 2 ? bestRun : null;
  }

  // Petits mots qui ne sont masqués que s'ils font partie du titre entier.
  const STOP = new Set(('a an the of and or to in on at by for with from is it i me my you your we be o oh ' +
    'la le les l un une des de du d et ou au aux en dans sur pour par je j tu il elle on nous vous ne n pas que qui ' +
    'ce c se s m t y').split(' '));

  const TOKEN = /[\p{L}\p{N}]+/gu;
  const stars = w => '*'.repeat(Array.from(w).length);

  /** Remplace le titre (en entier, puis ses mots importants) par des astérisques, une par lettre. */
  function maskTitle(line, titles) {
    const tokens = [];
    let m;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(line))) tokens.push({ start: m.index, end: m.index + m[0].length, word: m[0], key: norm(m[0]) });
    const titleWords = t => (String(t).replace(/\s*[\(\[].*?[\)\]]\s*/g, ' ').match(TOKEN) || []).map(norm).filter(Boolean);
    const hide = new Array(tokens.length).fill(false);
    titles.forEach(t => {
      const tw = titleWords(t);
      if (!tw.length) return;
      // Titre entier (mots consécutifs).
      for (let i = 0; i + tw.length <= tokens.length; i++) {
        if (tw.every((w, j) => tokens[i + j].key === w)) for (let j = 0; j < tw.length; j++) hide[i + j] = true;
      }
      // Mots importants du titre, partout ailleurs.
      const key = new Set(tw.filter(w => !STOP.has(w) && w.length >= 2));
      if (tw.length === 1) key.add(tw[0]);
      tokens.forEach((tk, i) => { if (key.has(tk.key)) hide[i] = true; });
    });
    let out = '', pos = 0;
    tokens.forEach((tk, i) => {
      out += line.slice(pos, tk.start) + (hide[i] ? stars(tk.word) : tk.word);
      pos = tk.end;
    });
    out += line.slice(pos);
    return { text: out, hidden: hide.filter(Boolean).length, words: tokens.length };
  }

  /**
   * Prépare les lignes affichées : jusqu'à 4 lignes différentes du refrain, titre masqué.
   * Les lignes où le titre prend le plus de place passent en dernier.
   */
  function chorusClues(text, song) {
    const lines = findChorusLines(text);
    if (!lines) return null;
    const titles = [song.title].concat(song.titleAlt || []);
    const seen = new Set();
    const uniq = [];
    lines.forEach((l, i) => {
      const k = norm(l);
      if (!k || seen.has(k)) return;
      seen.add(k);
      const masked = maskTitle(l, titles);
      uniq.push({ i, masked: masked.text, share: masked.hidden / masked.words });
    });
    if (!uniq.length) return null;
    const picked = uniq.slice(0, MAX_LINES + 2)
      .sort((a, b) => (a.share > 0) - (b.share > 0) || a.i - b.i)
      .slice(0, MAX_LINES);
    return picked.map(p => p.masked);
  }

  function fetchJson(url, ms) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctrl && setTimeout(() => ctrl.abort(), ms || 8000);
    return fetch(url, ctrl ? { signal: ctrl.signal } : {})
      .then(r => r.ok ? r.json() : null)
      .finally(() => clearTimeout(t));
  }

  const firstArtist = a => a.split(/\s+(?:featuring|feat\.?|ft\.?|with|duet with|x|&|et)\s+|,\s*/i)[0];

  async function searchLyrics(song) {
    const tries = [
      API + 'search?track_name=' + encodeURIComponent(song.title) + '&artist_name=' + encodeURIComponent(song.artist),
      API + 'search?track_name=' + encodeURIComponent(song.title.replace(/\s*[\(\[].*?[\)\]]\s*/g, ' ').trim()) + '&artist_name=' + encodeURIComponent(firstArtist(song.artist)),
      API + 'search?q=' + encodeURIComponent(firstArtist(song.artist) + ' ' + song.title)
    ];
    const wantArtist = norm(firstArtist(song.artist));
    for (const url of tries) {
      let list;
      try { list = await fetchJson(url); } catch (e) { list = null; }
      if (!Array.isArray(list)) continue;
      const usable = list.filter(x => !x.instrumental && (x.plainLyrics || x.syncedLyrics));
      const good = usable.find(x => norm(x.artistName).includes(wantArtist) || wantArtist.includes(norm(x.artistName))) || null;
      if (good) return good.plainLyrics || good.syncedLyrics;
    }
    return null;
  }

  const cache = new Map();
  /** Renvoie les indices (lignes masquées) d'une chanson, ou null si introuvable. */
  MQ.findChorus = function (song) {
    const key = song.artist + '|' + song.title;
    if (!cache.has(key)) {
      cache.set(key, searchLyrics(song).then(text => text ? chorusClues(text, song) : null, () => null));
    }
    return cache.get(key);
  };

  MQ.lyrics = { stanzas, findChorusLines, maskTitle, chorusClues, MAX_LINES };
})(window.MQ);
