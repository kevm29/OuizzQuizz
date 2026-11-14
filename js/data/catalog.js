/*
 * Classiques choisis à la main (fusionnés avec le grand catalogue plus bas).
 * Seuls le titre, l'artiste et l'année sont stockés : l'extrait est cherché à la volée.
 * fr: true = chanson francophone (catégorie "Chanson française").
 * top: true = parmi les plus célèbres (utilisés par le mode Flash 1 seconde).
 * artistAlt / titleAlt = autres réponses acceptées en mode réponse écrite.
 * Pour ajouter un titre : une ligne de plus, rien d'autre à faire.
 */
window.MQ = window.MQ || {};

MQ.classics = [
  // 60s / 70s
  { title: 'Hey Jude', artist: 'The Beatles', year: 1968, top: true },
  { title: 'Satisfaction', artist: 'The Rolling Stones', year: 1965 },
  { title: 'Respect', artist: 'Aretha Franklin', year: 1967 },
  { title: 'Stayin\' Alive', artist: 'Bee Gees', year: 1977, top: true },
  { title: 'Bohemian Rhapsody', artist: 'Queen', year: 1975, top: true },
  { title: 'Dancing Queen', artist: 'ABBA', year: 1976, top: true },
  { title: 'Hotel California', artist: 'Eagles', year: 1976, top: true },
  { title: 'I Will Survive', artist: 'Gloria Gaynor', year: 1978, top: true },
  { title: 'Imagine', artist: 'John Lennon', year: 1971, top: true },
  { title: 'September', artist: 'Earth, Wind & Fire', year: 1978, artistAlt: ['Earth Wind Fire'] },
  { title: 'Superstition', artist: 'Stevie Wonder', year: 1972 },
  { title: 'Le Freak', artist: 'CHIC', year: 1978, artistAlt: ['Nile Rodgers'] },
  { title: 'Wish You Were Here', artist: 'Pink Floyd', year: 1975 },
  { title: 'Heroes', artist: 'David Bowie', year: 1977 },

  // 80s
  { title: 'Billie Jean', artist: 'Michael Jackson', year: 1982, top: true },
  { title: 'Take On Me', artist: 'a-ha', year: 1985, top: true },
  { title: 'Sweet Child O\' Mine', artist: 'Guns N\' Roses', year: 1987, top: true },
  { title: 'Like a Prayer', artist: 'Madonna', year: 1989 },
  { title: 'Africa', artist: 'TOTO', year: 1982, top: true },
  { title: 'Livin\' on a Prayer', artist: 'Bon Jovi', year: 1986, top: true },
  { title: 'Girls Just Want to Have Fun', artist: 'Cyndi Lauper', year: 1983 },
  { title: 'Don\'t Stop Believin\'', artist: 'Journey', year: 1981 },
  { title: 'Every Breath You Take', artist: 'The Police', year: 1983 },
  { title: 'Purple Rain', artist: 'Prince', year: 1984 },
  { title: 'Eye of the Tiger', artist: 'Survivor', year: 1982, top: true },
  { title: 'Sweet Dreams (Are Made of This)', artist: 'Eurythmics', year: 1983 },
  { title: 'Never Gonna Give You Up', artist: 'Rick Astley', year: 1987, top: true },
  { title: 'Wake Me Up Before You Go-Go', artist: 'Wham!', year: 1984 },

  // 90s
  { title: 'Smells Like Teen Spirit', artist: 'Nirvana', year: 1991, top: true },
  { title: 'Wonderwall', artist: 'Oasis', year: 1995, top: true },
  { title: 'Wannabe', artist: 'Spice Girls', year: 1996, top: true },
  { title: '...Baby One More Time', artist: 'Britney Spears', year: 1998, top: true },
  { title: 'Zombie', artist: 'The Cranberries', year: 1994, top: true },
  { title: 'I Want It That Way', artist: 'Backstreet Boys', year: 1999 },
  { title: 'Around the World', artist: 'Daft Punk', year: 1997 },
  { title: 'Torn', artist: 'Natalie Imbruglia', year: 1997 },
  { title: 'Gangsta\'s Paradise', artist: 'Coolio', year: 1995, top: true },
  { title: 'No Scrubs', artist: 'TLC', year: 1999 },
  { title: 'Losing My Religion', artist: 'R.E.M.', year: 1991 },
  { title: 'Bitter Sweet Symphony', artist: 'The Verve', year: 1997 },
  { title: 'Blue (Da Ba Dee)', artist: 'Eiffel 65', year: 1998 },

  // 2000+
  { title: 'Crazy in Love', artist: 'Beyoncé', year: 2003, top: true },
  { title: 'Hey Ya!', artist: 'OutKast', year: 2003 },
  { title: 'Seven Nation Army', artist: 'The White Stripes', year: 2003, top: true },
  { title: 'Mr. Brightside', artist: 'The Killers', year: 2004, titleAlt: ['Mister Brightside'] },
  { title: 'Umbrella', artist: 'Rihanna', year: 2007, top: true },
  { title: 'Rolling in the Deep', artist: 'Adele', year: 2010, top: true },
  { title: 'Get Lucky', artist: 'Daft Punk', year: 2013, top: true },
  { title: 'Happy', artist: 'Pharrell Williams', year: 2013, top: true },
  { title: 'Uptown Funk', artist: 'Mark Ronson', year: 2014, top: true, artistAlt: ['Bruno Mars'] },
  { title: 'Shape of You', artist: 'Ed Sheeran', year: 2017, top: true },
  { title: 'Blinding Lights', artist: 'The Weeknd', year: 2019, top: true },
  { title: 'Bad Guy', artist: 'Billie Eilish', year: 2019, top: true },
  { title: 'Poker Face', artist: 'Lady Gaga', year: 2008, top: true },
  { title: 'Viva la Vida', artist: 'Coldplay', year: 2008 },
  { title: 'Levitating', artist: 'Dua Lipa', year: 2020 },

  // Chanson française
  { title: 'La Bohème', artist: 'Charles Aznavour', year: 1965, fr: true },
  { title: 'Non, je ne regrette rien', artist: 'Édith Piaf', year: 1960, fr: true, top: true },
  { title: 'Les Champs-Élysées', artist: 'Joe Dassin', year: 1969, fr: true, top: true },
  { title: 'Alexandrie Alexandra', artist: 'Claude François', year: 1977, fr: true, top: true },
  { title: 'Ne me quitte pas', artist: 'Jacques Brel', year: 1959, fr: true, top: true },
  { title: 'Foule sentimentale', artist: 'Alain Souchon', year: 1993, fr: true },
  { title: 'L\'aventurier', artist: 'Indochine', year: 1982, fr: true },
  { title: 'Femme Libérée', artist: 'Cookie Dingler', year: 1984, fr: true },
  { title: 'Allumer le feu', artist: 'Johnny Hallyday', year: 1998, fr: true, top: true },
  { title: 'Je te promets', artist: 'Johnny Hallyday', year: 1986, fr: true },
  { title: 'Alors on danse', artist: 'Stromae', year: 2009, fr: true, top: true },
  { title: 'Papaoutai', artist: 'Stromae', year: 2013, fr: true, top: true },
  { title: 'Dernière danse', artist: 'Indila', year: 2013, fr: true, top: true },
  { title: 'Tous les mêmes', artist: 'Stromae', year: 2013, fr: true },
  { title: 'Christine', artist: 'Christine and the Queens', year: 2014, fr: true, artistAlt: ['Chris'] },
  { title: 'Djadja', artist: 'Aya Nakamura', year: 2018, fr: true, top: true },
  { title: 'Andalouse', artist: 'Kendji Girac', year: 2014, fr: true },
  { title: 'Moi... Lolita', artist: 'Alizée', year: 2000, fr: true },
  { title: 'Ces soirées-là', artist: 'Yannick', year: 2000, fr: true },
  { title: 'Tchiki Boum', artist: 'Niagara', year: 1986, fr: true }
];

/*
 * Catalogue final = grand catalogue 1970-2026 (js/data/big-catalog.js)
 * + les classiques ci-dessus qui n'y sont pas (surtout les années 60 et la chanson française).
 */
(function () {
  const key = s => MQ.match.normalize(s.artist.split(/\s+(?:featuring|feat\.?|ft\.?|with|duet with|x)\s+/i)[0]) + '|' + MQ.match.normalize(s.title.replace(/\s*\(.*?\)\s*/g, ' '));

  const big = (MQ.bigCatalogRows || []).map(r => ({
    year: r[0], artist: r[1], title: r[2], fame: r[3], score: r[4],
    source: r[5], frRank: r[6], usPeak: r[7], usWeeks: r[8], fr: !!r[9], genre: r[10] || null
  }));
  const seen = new Map(big.map(s => [key(s), s]));
  const extra = [];
  MQ.classics.forEach(c => {
    const twin = seen.get(key(c));
    if (twin) { // déjà dans le grand catalogue : on garde les réponses alternatives
      if (c.artistAlt) twin.artistAlt = c.artistAlt;
      if (c.titleAlt) twin.titleAlt = c.titleAlt;
      if (c.top) twin.classic = true;
    } else extra.push(Object.assign({ fame: 5, classic: true, fr: !!c.fr }, c));
  });

  /*
   * Célébrité fine, pour le public français : on prend le meilleur entre le rang
   * au hit-parade français (n°1 = 1) et le succès au Billboard (pic + semaines, pondéré 0,85),
   * avec un bonus si le titre a marché des deux côtés. Le score 0-100 départage les ex aequo.
   */
  // Titres choisis à la main (source CLASSIQUE) : pas de classement, on suit leur célébrité 1-5
  // (5 ≈ un top 10 français, 1 ≈ titre pour connaisseurs).
  const curated = [0, 0.05, 0.2, 0.4, 0.6, 0.85];
  MQ.fineFame = function (s) {
    if (s.frRank == null && s.usPeak == null) return s.classic ? 2 : (curated[s.fame] || 0) + (s.score || 0) / 1000;
    const fr = s.frRank ? (51 - Math.min(s.frRank, 50)) / 50 : 0;
    const us = s.usPeak ? 0.5 * Math.pow(1 - (s.usPeak - 1) / 100, 2) + 0.5 * Math.min(s.usWeeks || 0, 40) / 40 : 0;
    return Math.max(fr, 0.85 * us) + 0.25 * Math.min(fr, us) + (s.score || 0) / 1000 + (s.classic ? 0.2 : 0);
  };

  MQ.catalog = big.concat(extra);
  MQ.catalog.forEach(s => { s.fine = MQ.fineFame(s); });

  // Mode Flash 1 seconde : les 10 % les plus connus.
  const ranked = MQ.catalog.slice().sort((a, b) => b.fine - a.fine);
  const cut = Math.round(MQ.catalog.length * 0.10);
  ranked.slice(0, cut).forEach(s => { s.top = true; });
  ranked.slice(cut).forEach(s => { s.top = false; });
})();

MQ.levels = [
  { id: 'hits', label: 'Les grands tubes', test: s => s.fame >= 4 },
  { id: 'all', label: 'Tout le catalogue', test: () => true }
];

MQ.categories = [
  { id: 'all', label: 'Toutes les années', test: () => true },
  { id: 'old', label: 'Avant 1960', test: s => s.year < 1960 },
  { id: '6070', label: 'Années 60–70', test: s => s.year >= 1960 && s.year < 1980 },
  { id: '80', label: 'Années 80', test: s => s.year >= 1980 && s.year < 1990 },
  { id: '90', label: 'Années 90', test: s => s.year >= 1990 && s.year < 2000 },
  { id: '2000', label: 'Années 2000', test: s => s.year >= 2000 && s.year < 2010 },
  { id: '2010', label: 'Années 2010', test: s => s.year >= 2010 && s.year < 2020 },
  { id: '2020', label: 'Années 2020', test: s => s.year >= 2020 },
  { id: 'fr', label: 'Chanson française', test: s => !!s.fr }
];
