// p2p.js
// --------------------------------------------------
// Salas 1v1: WebRTC (DataChannel) directo entre los dos navegadores.
// Firestore solo sirve de "buzón" para intercambiar la oferta/respuesta de
// conexión (rooms/{código}).
//
// RESPALDO POR RELEVO: en redes que bloquean UDP/puertos (universidades,
// empresas) WebRTC no conecta. Por eso, desde que se crea/une la sala, ambos
// jugadores también se conectan por WebSocket al servidor (/relay, puerto
// HTTPS normal). Si WebRTC no abre en RELAY_WAIT ms (o falla), se usa el
// relevo de forma automática y transparente: el resto del código (Head Cards,
// Penales, ¿Quién es mi jugador?) usa la misma API sin enterarse.
//
// Sin ICE trickle: se espera a juntar los candidatos y se envía todo junto.

const P2P = {
  ICE: { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] },
  RELAY_WAIT: 7000,
  pc: null, ch: null, ch2: null, code: null, role: null, _unsub: null,
  mode: null, ws: null, _cb: null, _peers: 0, _relayTimer: null,

  _code() { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from({ length: 5 }, () => a[Math.floor(Math.random() * a.length)]).join(''); },
  _room(code) { return fbDB.collection('rooms').doc(code); },
  _gathered(pc) {
    return new Promise(res => {
      if (pc.iceGatheringState === 'complete') return res();
      const t = setTimeout(res, 5000);
      pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
    });
  },
  _wire(ch, { onOpen, onMsg, onClose }) {
    this.ch = ch;
    ch.onopen = () => { if (this.mode === 'relay') return; this.mode = 'webrtc'; clearTimeout(this._relayTimer); onOpen && onOpen(); };
    ch.onclose = () => { if (this.mode === 'webrtc') onClose && onClose(); };
    ch.onmessage = e => { if (this.mode === 'relay') return; try { onMsg && onMsg(JSON.parse(e.data)); } catch (_) {} };
  },
  // reliable=true usa el canal ordenado y sin pérdidas (en relevo todo es fiable)
  send(obj, reliable = false) { const c = (reliable && this.ch2?.readyState === 'open') ? this.ch2 : this.ch; if (c?.readyState === 'open') c.send(JSON.stringify(obj)); },
  get open() { return this.ch?.readyState === 'open'; },
  get viaRelay() { return this.mode === 'relay'; },

  // ---------- relevo WebSocket ----------
  _relayUrl() {
    const base = (typeof WCC_BASE !== 'undefined' && WCC_BASE) || 'http://localhost:3001';
    return base.replace(/^http/i, 'ws').replace(/\/$/, '') + '/relay?room=' + this.code;
  },
  _startRelay(cb) {
    this._cb = cb; this._peers = 0;
    try { this.ws?.close(); } catch (_) {}
    let ws; try { ws = this.ws = new WebSocket(this._relayUrl()); } catch (_) { return; }
    ws.onmessage = ev => {
      let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
      if (m && m.__relay) {
        if (m.__relay === 'peers') { this._peers = m.n; if (m.n >= 2) this._armRelay(); else if (this.mode === 'relay') this._relayClosed(); }
        return;
      }
      // llegó un mensaje por el relevo y WebRTC no está abierto: el otro ya cambió a relevo
      if (this.mode !== 'relay') { if (this.open) return; this._useRelay(); }
      this._cb?.onMsg && this._cb.onMsg(m);
    };
    ws.onclose = () => { if (this.mode === 'relay') this._relayClosed(); };
    ws.onerror = () => {};
  },
  _armRelay() {
    if (this._relayTimer || this.mode) return;
    this._relayTimer = setTimeout(() => { if (!this.open) this._useRelay(); }, this.RELAY_WAIT);
  },
  _useRelay() {
    if (this.mode === 'relay' || !this.ws || this.ws.readyState !== 1) return false;
    this.mode = 'relay'; clearTimeout(this._relayTimer);
    try { this.pc?.close(); } catch (_) {}
    const ws = this.ws;
    this.ch2 = null;
    this.ch = { get readyState() { return ws.readyState === 1 ? 'open' : 'closed'; }, send: s => ws.send(s), close() {} };
    this._cb?.onOpen && this._cb.onOpen();
    return true;
  },
  _relayClosed() { if (this.mode === 'relay') { this.mode = 'closed'; this._cb?.onClose && this._cb.onClose(); } },

  // El anfitrión crea la sala y espera. cb: { onCode, onOpen, onMsg, onClose, onFail }
  async host(cb) {
    this.close(); this.role = 'host'; this.code = this._code();
    this._startRelay(cb);
    const pc = this.pc = new RTCPeerConnection(this.ICE);
    this._wire(pc.createDataChannel('g', { ordered: false, maxRetransmits: 0 }), cb);
    this.ch2 = pc.createDataChannel('r'); this.ch2.onmessage = e => { if (this.mode === 'relay') return; try { cb.onMsg && cb.onMsg(JSON.parse(e.data)); } catch (_) {} };
    await pc.setLocalDescription(await pc.createOffer()); await this._gathered(pc);
    await this._room(this.code).set({ offer: JSON.stringify(pc.localDescription), at: Date.now(), answer: null });
    cb.onCode && cb.onCode(this.code);
    this._unsub = this._room(this.code).onSnapshot(async s => {
      const d = s.data(); if (!d?.answer || pc.currentRemoteDescription) return;
      try { await pc.setRemoteDescription(JSON.parse(d.answer)); } catch (e) { if (!this._useRelay()) cb.onFail && cb.onFail(e); }
    });
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' && !this.mode && !this._useRelay()) cb.onFail && cb.onFail(new Error('No se pudo conectar (red restrictiva)')); };
    this._timeout = setTimeout(() => { if (!this.open) cb.onFail && cb.onFail(new Error('Nadie se unió a la sala')); }, 180000);
  },

  async join(code, cb) {
    this.close(); this.role = 'guest'; this.code = code.trim().toUpperCase();
    const snap = await this._room(this.code).get();
    if (!snap.exists || !snap.data().offer) throw new Error('Sala no encontrada');
    this._startRelay(cb);
    const pc = this.pc = new RTCPeerConnection(this.ICE);
    pc.ondatachannel = e => {
      if (e.channel.label === 'r') { this.ch2 = e.channel; e.channel.onmessage = ev => { if (this.mode === 'relay') return; try { cb.onMsg && cb.onMsg(JSON.parse(ev.data)); } catch (_) {} }; }
      else this._wire(e.channel, cb);
    };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' && !this.mode && !this._useRelay()) cb.onFail && cb.onFail(new Error('No se pudo conectar (red restrictiva)')); };
    await pc.setRemoteDescription(JSON.parse(snap.data().offer));
    await pc.setLocalDescription(await pc.createAnswer()); await this._gathered(pc);
    await this._room(this.code).update({ answer: JSON.stringify(pc.localDescription) });
    this._timeout = setTimeout(() => { if (!this.open) cb.onFail && cb.onFail(new Error('Tiempo de conexión agotado')); }, 30000);
  },

  close() {
    clearTimeout(this._timeout); clearTimeout(this._relayTimer); this._relayTimer = null; this._unsub?.(); this._unsub = null;
    const prev = this.mode; this.mode = 'closing';
    try { this.ch?.close(); this.pc?.close(); } catch (_) {}
    try { this.ws?.close(); } catch (_) {}
    if (this.role === 'host' && this.code) this._room(this.code).delete().catch(() => {});
    this.pc = this.ch = this.ch2 = this.ws = this._cb = null; this.code = null; this.role = null; this.mode = null; this._peers = 0;
  }
};
