/*
 * Multijoueur en ligne, sans serveur à nous et sans compte.
 *
 * Deux chemins, essayés automatiquement :
 *  1. Direct (PeerJS / WebRTC) : les navigateurs se parlent en direct. Rapide, mais bloqué
 *     par certains réseaux (4G, box ou Wi-Fi d'entreprise qui empêchent les connexions directes).
 *  2. Relais (MQTT sur WebSocket) : les messages passent par un serveur public gratuit.
 *     Marche sur tous les réseaux qui ouvrent un site web. Plusieurs serveurs en secours.
 *
 * L'hôte écoute sur les deux chemins en même temps. Un invité essaie les deux à la fois
 * et garde le premier qui trouve la partie. L'hôte fait tourner la partie ; les invités lui
 * envoient leurs réponses.
 */
window.MQ = window.MQ || {};

(function (MQ) {
  const PREFIX = 'ouizzquizz-v1-';
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans 0/O ni 1/I/L
  const DIRECT_TIMEOUT_MS = 6000;
  const BROKERS = [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://broker.hivemq.com:8884/mqtt',
    'wss://test.mosquitto.org:8081/mqtt'
  ];
  const HEARTBEAT_MS = 5000;
  const SILENCE_MS = 20000;

  const rand = () => Math.random().toString(36).slice(2, 10);
  function randomCode() {
    let c = '';
    for (let i = 0; i < 4; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    return c;
  }
  const cleanCode = code => (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const topicBase = code => 'ouizzquizz/v1/' + cleanCode(code);
  const hasPeer = () => typeof window.Peer === 'function';
  const hasMqtt = () => typeof window.mqtt === 'object' && typeof window.mqtt.connect === 'function';
  function available() { return hasPeer() || hasMqtt(); }

  function log(...a) { try { console.info('[OuizzQuizz réseau]', ...a); } catch (e) {} }

  /* ================= Chemin direct : PeerJS ================= */

  function peerHost(code, h) {
    if (!hasPeer()) return null;
    const conns = new Map();
    let closed = false;
    const peer = new window.Peer(PREFIX + code.toLowerCase(), { debug: 0 });
    peer.on('open', () => { log('direct prêt'); h.onReady(); });
    peer.on('connection', conn => {
      conn.on('open', () => conns.set(conn.peer, conn));
      conn.on('data', msg => {
        if (!conns.has(conn.peer)) conns.set(conn.peer, conn);
        h.onMessage(conn.peer, msg);
      });
      const leave = () => { if (conns.delete(conn.peer)) h.onLeave(conn.peer); };
      conn.on('close', leave);
      conn.on('error', leave);
    });
    peer.on('error', err => log('direct indisponible côté hôte :', err && err.type));
    peer.on('disconnected', () => { if (!closed) { try { peer.reconnect(); } catch (e) {} } });
    return {
      has: id => conns.has(id),
      send(id, msg) { const c = conns.get(id); if (c && c.open) c.send(msg); },
      broadcast(msg) { conns.forEach(c => { if (c.open) c.send(msg); }); },
      close() { closed = true; conns.forEach(c => c.close()); peer.destroy(); }
    };
  }

  /** Essaie de rejoindre en direct. h.onOpen(api) si ça marche, h.onFail(raison) sinon. */
  function peerJoin(code, h) {
    if (!hasPeer()) { h.onFail('absent'); return; }
    let done = false, conn = null;
    const peer = new window.Peer({ debug: 0 });
    const fail = why => {
      if (done) return;
      done = true; clearTimeout(timer);
      try { peer.destroy(); } catch (e) {}
      h.onFail(why);
    };
    const timer = setTimeout(() => fail('délai'), DIRECT_TIMEOUT_MS);
    peer.on('open', () => {
      conn = peer.connect(PREFIX + cleanCode(code).toLowerCase(), { reliable: true });
      conn.on('open', () => {
        if (done) return;
        done = true; clearTimeout(timer);
        let closed = false;
        h.onOpen({
          send(msg) { if (conn.open) conn.send(msg); },
          close() { closed = true; try { peer.destroy(); } catch (e) {} },
          onData(fn) { conn.on('data', fn); },
          onClose(fn) { conn.on('close', () => { if (!closed) fn(); }); }
        });
      });
    });
    peer.on('error', err => fail(err && err.type));
  }

  /* ================= Chemin relais : MQTT ================= */

  function mqttHost(code, h) {
    if (!hasMqtt()) return null;
    const base = topicBase(code);
    const clients = [];
    const guests = new Map(); // id -> { client, last }
    let ready = false;
    BROKERS.forEach(url => {
      let c;
      try {
        c = window.mqtt.connect(url, {
          clientId: 'oq-h-' + rand(), clean: true, keepalive: 20,
          connectTimeout: 8000, reconnectPeriod: 4000,
          will: { topic: base + '/host', payload: '', retain: true, qos: 1 }
        });
      } catch (e) { return; }
      clients.push(c);
      c.on('connect', () => {
        c.subscribe(base + '/up/+');
        c.publish(base + '/host', 'open', { retain: true, qos: 1 });
        log('relais prêt :', url);
        if (!ready) { ready = true; h.onReady(); }
      });
      c.on('message', (topic, payload) => {
        const id = topic.slice(topic.lastIndexOf('/') + 1);
        let msg;
        try { msg = JSON.parse(payload.toString()); } catch (e) { return; }
        let g = guests.get(id);
        if (msg.t === 'bye') { if (g) { guests.delete(id); h.onLeave(id); } return; }
        if (!g) { g = { client: c, last: 0 }; guests.set(id, g); }
        g.client = c; g.last = Date.now();
        if (msg.t === '_ping') return;
        h.onMessage(id, msg);
      });
      c.on('error', err => log('relais en erreur :', url, err && err.message));
    });
    const hb = setInterval(() => {
      const now = Date.now();
      const used = new Set();
      guests.forEach((g, id) => {
        if (now - g.last > SILENCE_MS) { guests.delete(id); h.onLeave(id); } else used.add(g.client);
      });
      used.forEach(c => { if (c.connected) c.publish(base + '/down/all', '{"t":"_hb"}'); });
    }, HEARTBEAT_MS);
    return {
      has: id => guests.has(id),
      send(id, msg) { const g = guests.get(id); if (g && g.client.connected) g.client.publish(base + '/down/' + id, JSON.stringify(msg)); },
      broadcast(msg) {
        const p = JSON.stringify(msg), used = new Set();
        guests.forEach(g => used.add(g.client));
        used.forEach(c => { if (c.connected) c.publish(base + '/down/all', p); });
      },
      close() {
        clearInterval(hb);
        clients.forEach(c => {
          try { c.publish(base + '/host', '', { retain: true, qos: 1 }, () => c.end(true)); } catch (e) {}
          setTimeout(() => { try { c.end(true); } catch (e) {} }, 1500);
        });
      }
    };
  }

  /** Cherche la partie sur tous les serveurs relais en même temps ; le premier qui la trouve gagne. */
  function mqttJoin(code, h) {
    if (!hasMqtt()) { h.onFail('absent'); return () => {}; }
    const base = topicBase(code);
    const id = 'mq-' + rand();
    let winner = null, pending = BROKERS.length, stopped = false;
    const attempts = [];
    const lost = () => { if (--pending === 0 && !winner && !stopped) h.onFail('introuvable'); };

    BROKERS.forEach(url => {
      let c, found = false, failed = false;
      try {
        c = window.mqtt.connect(url, { clientId: 'oq-g-' + rand(), clean: true, keepalive: 20, connectTimeout: 6000, reconnectPeriod: 3000 });
      } catch (e) { lost(); return; }
      attempts.push(c);
      const giveUp = setTimeout(() => { if (!found) { failed = true; try { c.end(true); } catch (e) {} lost(); } }, 8000);
      let dataFn = () => {}, closeFn = () => {}, last = Date.now(), closed = false, hb = null;
      c.on('connect', () => c.subscribe([base + '/host', base + '/down/all', base + '/down/' + id]));
      c.on('message', (topic, payload) => {
        const s = payload.toString();
        if (topic === base + '/host') {
          if (s === 'open' && !found && !failed) {
            found = true; clearTimeout(giveUp);
            if (winner || stopped) { try { c.end(true); } catch (e) {} return; }
            winner = c;
            attempts.forEach(o => { if (o !== c) { try { o.end(true); } catch (e) {} } });
            log('partie trouvée via le relais', url);
            hb = setInterval(() => {
              if (c.connected) c.publish(base + '/up/' + id, '{"t":"_ping"}');
              if (Date.now() - last > SILENCE_MS && !closed) { closed = true; clearInterval(hb); closeFn(); }
            }, HEARTBEAT_MS);
            h.onOpen({
              send(msg) { if (c.connected) c.publish(base + '/up/' + id, JSON.stringify(msg)); },
              close() {
                closed = true; clearInterval(hb);
                try { c.publish(base + '/up/' + id, '{"t":"bye"}', {}, () => c.end(true)); } catch (e) {}
                setTimeout(() => { try { c.end(true); } catch (e) {} }, 1500);
              },
              onData(fn) { dataFn = fn; },
              onClose(fn) { closeFn = fn; }
            });
          } else if (s === '' && found && c === winner && !closed) { closed = true; clearInterval(hb); closeFn(); }
          return;
        }
        if (c !== winner) return;
        last = Date.now();
        let msg;
        try { msg = JSON.parse(s); } catch (e) { return; }
        if (msg.t === '_hb') return;
        dataFn(msg);
      });
      c.on('error', () => {});
    });
    // Arrêt de la recherche (l'autre chemin a gagné, ou l'invité annule).
    return () => { stopped = true; attempts.forEach(o => { if (o !== winner) { try { o.end(true); } catch (e) {} } }); };
  }

  /* ================= API utilisée par le jeu ================= */

  /**
   * Crée une partie. handlers : onReady(code), onMessage(peerId, msg), onLeave(peerId), onError(text)
   * Renvoie { send(peerId, msg), broadcast(msg), close() }.
   */
  function host(handlers) {
    const code = randomCode();
    let ready = false;
    const fireReady = () => { if (!ready) { ready = true; handlers.onReady(code); } };
    const sub = { onReady: fireReady, onMessage: handlers.onMessage, onLeave: handlers.onLeave };
    const transports = [peerHost(code, sub), mqttHost(code, sub)].filter(Boolean);
    const failTimer = setTimeout(() => {
      if (!ready) handlers.onError('Impossible de créer la partie : aucun service en ligne ne répond. Vérifie ta connexion internet.');
    }, 15000);
    return {
      send(id, msg) { const t = transports.find(t => t.has(id)); if (t) t.send(id, msg); },
      broadcast(msg) { transports.forEach(t => t.broadcast(msg)); },
      close() { clearTimeout(failTimer); transports.forEach(t => t.close()); }
    };
  }

  /**
   * Rejoint une partie. handlers : onOpen(), onMessage(msg), onClose(), onError(text)
   * Renvoie { send(msg), close() }.
   */
  function join(code, handlers) {
    // Direct et relais sont essayés en même temps : le premier chemin qui trouve la partie est gardé.
    let link = null, cancelled = false, failures = 0, stopRelay = () => {};
    const attach = api => {
      if (cancelled || link) { api.close(); return; }
      link = api;
      stopRelay();
      api.onData(handlers.onMessage);
      api.onClose(handlers.onClose);
      handlers.onOpen();
    };
    const failed = why => {
      log('chemin impossible :', why);
      if (++failures === 2 && !link && !cancelled) {
        handlers.onError('Aucune partie trouvée avec le code ' + cleanCode(code) + '. Vérifie le code, et que la page de l’hôte est toujours ouverte.');
      }
    };
    peerJoin(code, { onOpen: attach, onFail: why => failed('direct (' + why + ')') });
    stopRelay = mqttJoin(code, { onOpen: attach, onFail: why => failed('relais (' + why + ')') });
    return {
      send(msg) { if (link) link.send(msg); },
      close() { cancelled = true; stopRelay(); if (link) link.close(); }
    };
  }

  MQ.net = { available, host, join, cleanCode };
})(window.MQ);
