/*
 * Multijoueur en ligne, sans serveur à nous.
 * PeerJS (WebRTC) relie directement les navigateurs. Le serveur public gratuit
 * de PeerJS sert seulement à se trouver grâce au code de partie : pas de compte.
 * L'hôte fait tourner la partie ; les invités lui envoient leurs réponses.
 */
window.MQ = window.MQ || {};

(function (MQ) {
  const PREFIX = 'ouizzquizz-v1-';
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans 0/O ni 1/I/L

  function randomCode() {
    let c = '';
    for (let i = 0; i < 4; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    return c;
  }

  const cleanCode = code => (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  function available() { return typeof window.Peer === 'function'; }

  function explain(err) {
    const type = err && err.type;
    if (type === 'peer-unavailable') return 'Aucune partie avec ce code. Vérifie le code auprès de l’hôte.';
    if (type === 'network' || type === 'server-error' || type === 'socket-error') return 'Connexion au service multijoueur impossible. Vérifie ta connexion internet.';
    if (type === 'browser-incompatible') return 'Ce navigateur ne gère pas le jeu en ligne. Essaie Chrome, Firefox ou Safari récent.';
    return 'Problème de connexion (' + (type || 'inconnu') + ').';
  }

  /**
   * Crée une partie. handlers : onReady(code), onMessage(peerId, msg), onLeave(peerId), onError(text)
   * Renvoie { send(peerId, msg), broadcast(msg), close() }.
   */
  function host(handlers) {
    const conns = new Map();
    let peer = null, closed = false, tries = 0;

    function open() {
      const code = randomCode();
      peer = new window.Peer(PREFIX + code.toLowerCase());
      peer.on('open', () => handlers.onReady(code));
      peer.on('connection', conn => {
        conn.on('open', () => conns.set(conn.peer, conn));
        conn.on('data', msg => {
          if (!conns.has(conn.peer)) conns.set(conn.peer, conn); // les données peuvent arriver avant 'open'
          handlers.onMessage(conn.peer, msg);
        });
        const leave = () => { if (conns.delete(conn.peer)) handlers.onLeave(conn.peer); };
        conn.on('close', leave);
        conn.on('error', leave);
      });
      peer.on('error', err => {
        if (err.type === 'unavailable-id' && tries++ < 5) { peer.destroy(); return open(); }
        if (!closed) handlers.onError(explain(err));
      });
      peer.on('disconnected', () => { if (!closed) peer.reconnect(); });
    }
    open();

    return {
      send(id, msg) { const c = conns.get(id); if (c && c.open) c.send(msg); },
      broadcast(msg) { conns.forEach(c => { if (c.open) c.send(msg); }); },
      close() { closed = true; conns.forEach(c => c.close()); if (peer) peer.destroy(); }
    };
  }

  /**
   * Rejoint une partie. handlers : onOpen(), onMessage(msg), onClose(), onError(text)
   * Renvoie { send(msg), close() }.
   */
  function join(code, handlers) {
    let closed = false, opened = false;
    const peer = new window.Peer();
    let conn = null;
    const timeout = setTimeout(() => {
      if (!opened && !closed) { handlers.onError('La partie ne répond pas. Vérifie le code.'); api.close(); }
    }, 15000);

    peer.on('open', () => {
      conn = peer.connect(PREFIX + cleanCode(code).toLowerCase(), { reliable: true });
      conn.on('open', () => { opened = true; clearTimeout(timeout); handlers.onOpen(); });
      conn.on('data', msg => handlers.onMessage(msg));
      conn.on('close', () => { if (!closed) handlers.onClose(); });
    });
    peer.on('error', err => { if (!closed) { clearTimeout(timeout); handlers.onError(explain(err)); } });

    const api = {
      send(msg) { if (conn && conn.open) conn.send(msg); },
      close() { closed = true; clearTimeout(timeout); peer.destroy(); }
    };
    return api;
  }

  MQ.net = { available, host, join, cleanCode };
})(window.MQ);
