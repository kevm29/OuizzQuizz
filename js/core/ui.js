/* Petits utilitaires d'interface partagés par tous les sous-jeux. */
window.MQ = window.MQ || {};

(function (MQ) {
  /** h('div.card#id', {onclick}, ...enfants) : création rapide d'éléments. */
  MQ.h = function (tag, attrs, ...children) {
    const m = tag.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i);
    const el = document.createElement(m[1] || 'div');
    (m[2].match(/[.#][\w-]+/g) || []).forEach(t => {
      if (t[0] === '.') el.classList.add(t.slice(1)); else el.id = t.slice(1);
    });
    const isAttrs = attrs != null && typeof attrs === 'object' && !(attrs instanceof Node) && !Array.isArray(attrs);
    if (!isAttrs) {
      if (attrs !== undefined) children.unshift(attrs);
      attrs = null;
    }
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k in el && k !== 'list') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    children.flat(Infinity).forEach(c => {
      if (c == null || c === false) return;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    });
    return el;
  };

  MQ.shuffle = function (arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  MQ.store = {
    get(key, fallback) {
      try { const v = localStorage.getItem('mq.' + key); return v == null ? fallback : JSON.parse(v); }
      catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('mq.' + key, JSON.stringify(value)); } catch (e) {}
    }
  };

  /** Égaliseur animé (purement décoratif). */
  MQ.equalizer = function (bars) {
    return MQ.h('div.eq', { 'aria-hidden': 'true' },
      Array.from({ length: bars || 5 }, (_, i) => MQ.h('span', { style: { animationDelay: (i * -0.17) + 's' } })));
  };
})(window.MQ);
