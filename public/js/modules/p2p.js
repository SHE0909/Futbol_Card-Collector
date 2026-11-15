// p2p.js
// --------------------------------------------------
// Salas 1v1 sin servidor propio: WebRTC (DataChannel) entre los dos navegadores.
// Firestore solo sirve de "buzón" para intercambiar la oferta/respuesta de
// conexión (rooms/{código}); una vez conectados, el juego va directo P2P.
// Sin ICE trickle: se espera a juntar los candidatos y se envía todo junto.
// STUN público de Google. Con algunas redes (CGNAT / firewalls estrictos)
// puede no conectar sin un servidor TURN: en ese caso se avisa al jugador.

const P2P = {
  ICE: { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] },
  pc: null, ch: null, ch2: null, code: null, role: null, _unsub: null,

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
    this.ch = ch; ch.onopen = () => onOpen && onOpen(); ch.onclose = () => onClose && onClose();
    ch.onmessage = e => { try { onMsg && onMsg(JSON.parse(e.data)); } catch (_) {} };
  },
  // reliable=true usa el canal ordenado y sin pérdidas (mensajes que no pueden perderse)
  send(obj, reliable = false) { const c = (reliable && this.ch2?.readyState === 'open') ? this.ch2 : this.ch; if (c?.readyState === 'open') c.send(JSON.stringify(obj)); },
  get open() { return this.ch?.readyState === 'open'; },

  // El anfitrión crea la sala y espera. cb: { onCode, onOpen, onMsg, onClose, onFail }
  async host(cb) {
    this.close(); this.role = 'host'; this.code = this._code();
    const pc = this.pc = new RTCPeerConnection(this.ICE);
    this._wire(pc.createDataChannel('g', { ordered: false, maxRetransmits: 0 }), cb);
    this.ch2 = pc.createDataChannel('r'); this.ch2.onmessage = e => { try { cb.onMsg && cb.onMsg(JSON.parse(e.data)); } catch (_) {} };
    await pc.setLocalDescription(await pc.createOffer()); await this._gathered(pc);
    await this._room(this.code).set({ offer: JSON.stringify(pc.localDescription), at: Date.now(), answer: null });
    cb.onCode && cb.onCode(this.code);
    this._unsub = this._room(this.code).onSnapshot(async s => {
      const d = s.data(); if (!d?.answer || pc.currentRemoteDescription) return;
      try { await pc.setRemoteDescription(JSON.parse(d.answer)); } catch (e) { cb.onFail && cb.onFail(e); }
    });
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') cb.onFail && cb.onFail(new Error('No se pudo conectar (red restrictiva)')); };
    this._timeout = setTimeout(() => { if (!this.open) cb.onFail && cb.onFail(new Error('Nadie se unió a la sala')); }, 180000);
  },

  async join(code, cb) {
    this.close(); this.role = 'guest'; this.code = code.trim().toUpperCase();
    const snap = await this._room(this.code).get();
    if (!snap.exists || !snap.data().offer) throw new Error('Sala no encontrada');
    const pc = this.pc = new RTCPeerConnection(this.ICE);
    pc.ondatachannel = e => { if (e.channel.label === 'r') { this.ch2 = e.channel; e.channel.onmessage = ev => { try { cb.onMsg && cb.onMsg(JSON.parse(ev.data)); } catch (_) {} }; } else this._wire(e.channel, cb); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') cb.onFail && cb.onFail(new Error('No se pudo conectar (red restrictiva)')); };
    await pc.setRemoteDescription(JSON.parse(snap.data().offer));
    await pc.setLocalDescription(await pc.createAnswer()); await this._gathered(pc);
    await this._room(this.code).update({ answer: JSON.stringify(pc.localDescription) });
    this._timeout = setTimeout(() => { if (!this.open) cb.onFail && cb.onFail(new Error('Tiempo de conexión agotado')); }, 20000);
  },

  close() {
    clearTimeout(this._timeout); this._unsub?.(); this._unsub = null;
    try { this.ch?.close(); this.pc?.close(); } catch (_) {}
    if (this.role === 'host' && this.code) this._room(this.code).delete().catch(() => {});
    this.pc = this.ch = this.ch2 = null; this.code = null; this.role = null;
  }
};
