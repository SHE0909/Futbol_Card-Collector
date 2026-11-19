// prizes.js
// --------------------------------------------------
// Dos funciones para el torneo / la defensa del proyecto:
//
// 1) CÓDIGOS CANJEABLES — el jugador escribe un código (Sobres → "¿Tienes un
//    código?") y recibe tiradas gratis. Cada código se puede usar UNA sola vez
//    por cuenta: el canje crea el documento redemptions/{CODIGO}_{uid}, que las
//    reglas de Firestore no dejan editar ni borrar ni volver a crear.
//
// 2) PREMIOS DEL ADMIN — el admin (ver admin.js) deja un premio en prizes/{id}
//    dirigido a un CORREO (carta a elección, tiradas o monedas). Cuando el
//    jugador con ese correo tiene la app abierta (o entra después), el premio
//    se le entrega solo y ve un mensaje de felicitación; si es carta, el
//    mensaje es más épico mientras más rara sea.
//
// El admin no puede escribir en el documento de otro usuario (las reglas solo
// dejan a cada uno tocar el suyo), por eso el premio queda "pendiente" y lo
// reclama el propio dueño con una transacción atómica: marca el premio como
// entregado y suma lo ganado a su cuenta en el mismo paso (no se duplica).

const Prizes = {
  MAX_TIRADAS: 1000,
  MAX_MONEDAS: 20000, // coincide con el tope por actualización de firestore.rules
  _queue: [], _busy: false, _seen: new Set(), _unsub: null, _bound: false,

  // Mensajes por rareza (el más épico = GOAT).
  TIERS: {
    common:    { color: '#9aa4b2', icon: '⚽', kicker: '¡FELICIDADES!',      line: n => `Recibiste a <b>${n}</b>` },
    rare:      { color: '#4aa8ff', icon: '💎', kicker: '¡EXCELENTE!',        line: n => `Recibiste a <b>${n}</b>, una carta <b>RARA</b>` },
    epic:      { color: '#b44fff', icon: '⚡', kicker: '¡ÉPICO!',            line: n => `Recibiste a <b>${n}</b>, una carta <b>ÉPICA</b> que pocos tienen` },
    legendary: { color: '#ffd700', icon: '✨', kicker: '¡LEGENDARIO!',       line: n => `Recibiste a <b>${n}</b>, una carta <b>LEGENDARIA</b>. ¡Eres una leyenda del torneo!` },
    goat:      { color: '#ff2244', icon: '🐐', kicker: '¡¡G.O.A.T!!',        line: n => `¡¡Recibiste al mismísimo <b>${n}</b>!! Carta <b>G.O.A.T</b>, lo más grande que existe` }
  },

  _esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },

  // ---------------------------------------------------------------- init
  init() {
    this._bindRedeemUI();
    this._listen();
  },

  // Escucha en tiempo real los premios pendientes de MI correo.
  _listen() {
    const fbUser = fbAuth.currentUser;
    if (!fbUser?.email || this._unsub) return;
    const email = fbUser.email.toLowerCase();
    try {
      this._unsub = fbDB.collection('prizes')
        .where('email', '==', email).where('claimed', '==', false)
        .onSnapshot(snap => {
          snap.docChanges().forEach(ch => {
            if (ch.type !== 'added' || this._seen.has(ch.doc.id)) return;
            this._seen.add(ch.doc.id);
            this._queue.push({ id: ch.doc.id, ...ch.doc.data() });
          });
          this._drain();
        }, err => console.warn('[Prizes] no se pudo escuchar premios', err));
    } catch (e) { console.warn('[Prizes] listen falló', e); }
  },

  async _drain() {
    if (this._busy) return;
    this._busy = true;
    try {
      while (this._queue.length) {
        const p = this._queue.shift();
        try {
          const out = await this._claim(p);
          if (out) { await this._reveal(out); }
        } catch (e) { console.error('[Prizes] error entregando premio', e); this._seen.delete(p.id); }
      }
    } finally { this._busy = false; }
  },

  // ------------------------------------------------- entrega de un premio
  async _claim(p) {
    const fbUser = fbAuth.currentUser; if (!fbUser) return null;
    const prizeRef = fbDB.collection('prizes').doc(p.id);
    const userRef  = fbDB.collection('users').doc(fbUser.uid);
    let out = null;

    await fbDB.runTransaction(async tx => {
      out = null; // la transacción puede reintentarse
      const ps = await tx.get(prizeRef);
      if (!ps.exists || ps.data().claimed) return;
      const us = await tx.get(userRef);
      const pr = ps.data(), u = us.data() || {};
      const upd = {};

      if (pr.type === 'card') {
        const card = Gacha.getPool().find(f => f.id === pr.cardId);
        if (!card) throw new Error('Carta inexistente: ' + pr.cardId);
        const figs = JSON.parse(JSON.stringify(u.figuritas || []));
        const have = figs.find(f => f.id === card.id);
        let dupe = false;
        if (have) { have.duplicados = (have.duplicados || 0) + 1; dupe = true; }
        else figs.push({ ...card, duplicados: 0, obtenida: new Date().toISOString() });
        upd.figuritas = figs;
        out = { type: 'card', card: { ...card }, isDuplicate: dupe, note: pr.note || '' };
      } else if (pr.type === 'tiradas') {
        const n = Math.max(1, Math.min(this.MAX_TIRADAS, Math.floor(Number(pr.amount) || 0)));
        upd.tiradas = (u.tiradas || 0) + n;
        out = { type: 'tiradas', amount: n, note: pr.note || '' };
      } else if (pr.type === 'monedas') {
        const n = Math.max(1, Math.min(this.MAX_MONEDAS, Math.floor(Number(pr.amount) || 0)));
        upd.monedas = (u.monedas || 0) + n;
        out = { type: 'monedas', amount: n, note: pr.note || '' };
      } else { throw new Error('Tipo de premio desconocido'); }

      tx.update(prizeRef, { claimed: true, claimedAt: new Date().toISOString(), claimedBy: fbUser.uid });
      tx.update(userRef, upd);
    });

    if (out) {
      if (typeof App !== 'undefined') App.refreshHeader().catch(() => {});
      if (out.type === 'card' && !out.isDuplicate && typeof Online !== 'undefined') {
        Auth.currentUser().then(u => u && Online.publishDrops(u, [out.card])).catch(() => {});
      }
      if (typeof DB !== 'undefined' && DB.logActivity) DB.logActivity(fbUser.email, 'prize', out.type);
    }
    return out;
  },

  // ----------------------------------------------- mensaje de felicitación
  async _reveal(out) {
    if (out.type === 'card') {
      const t = this.TIERS[out.card.rareza] || this.TIERS.common;
      return this.showReveal({
        color: t.color, icon: t.icon, kicker: t.kicker,
        line: t.line(this._esc(out.card.name)) + (out.isDuplicate ? ' <small>(ya la tenías: suma un duplicado)</small>' : ''),
        note: out.note, card: out.card, isDuplicate: out.isDuplicate, epic: ['legendary', 'goat'].includes(out.card.rareza)
      });
    }
    if (out.type === 'tiradas') {
      return this.showReveal({ color: '#2fd6ff', icon: '🎟️', kicker: '¡FELICIDADES!',
        line: `Recibiste <b>${out.amount}</b> tirada${out.amount > 1 ? 's' : ''}`, note: out.note });
    }
    return this.showReveal({ color: '#ffc83d', icon: '🪙', kicker: '¡FELICIDADES!',
      line: `Recibiste <b>${out.amount}</b> monedas para apostar`, note: out.note });
  },

  // Overlay a pantalla completa. Devuelve una promesa que se cumple al pulsar "Continuar".
  showReveal({ color, icon, kicker, line, note = '', card = null, isDuplicate = false, epic = false }) {
    return new Promise(async resolve => {
      const ov = document.createElement('div');
      ov.className = 'prize-ov' + (epic ? ' epic' : '');
      ov.style.setProperty('--pc', color);
      let cardHtml = '';
      if (card && typeof App !== 'undefined' && App._renderFiguritaCard) {
        let photo = null; try { photo = await API.getPhotoById(card.id); } catch (_) {}
        cardHtml = `<div class="prize-card">${App._renderFiguritaCard({ ...card, isDuplicate, duplicados: 0 }, photo, 0)}</div>`;
      }
      const conf = Array.from({ length: epic ? 46 : 26 }, () =>
        `<i style="left:${(Math.random() * 100).toFixed(1)}%;animation-delay:${(Math.random() * 1.2).toFixed(2)}s;animation-duration:${(1.8 + Math.random() * 1.6).toFixed(2)}s;width:${5 + Math.random() * 7}px;height:${8 + Math.random() * 10}px"></i>`).join('');
      ov.innerHTML = `
        <div class="prize-conf" aria-hidden="true">${conf}</div>
        <div class="prize-box" role="dialog" aria-modal="true">
          <div class="prize-icon">${icon}</div>
          <div class="prize-kicker">${kicker}</div>
          <p class="prize-line">${line}</p>
          ${cardHtml}
          ${note ? `<p class="prize-note">🏆 ${this._esc(note)}</p>` : ''}
          <button class="btn btn-primary prize-ok" type="button">Continuar</button>
        </div>`;
      document.body.appendChild(ov);
      if (window.parseEmojis) try { parseEmojis(ov); } catch (_) {}
      const btn = ov.querySelector('.prize-ok');
      btn.focus();
      btn.onclick = () => { ov.classList.add('out'); setTimeout(() => { ov.remove(); resolve(); }, 250); };
    });
  },

  // ------------------------------------------------------ canje de códigos
  _bindRedeemUI() {
    if (this._bound) return;
    const btn = document.getElementById('btn-redeem'), inp = document.getElementById('redeem-code');
    if (!btn || !inp) return;
    this._bound = true;
    const go = async () => {
      const msg = document.getElementById('redeem-msg');
      const setMsg = (t, cls) => { if (msg) { msg.textContent = t; msg.className = 'redeem-msg ' + (cls || ''); } };
      btn.disabled = true; setMsg('Verificando código…', '');
      const r = await this.redeem(inp.value);
      btn.disabled = false;
      if (r.ok) {
        inp.value = ''; setMsg('', '');
        if (typeof App !== 'undefined') App.refreshHeader().catch(() => {});
        this.showReveal({ color: '#2fd6ff', icon: '🎁', kicker: '¡CÓDIGO CANJEADO!',
          line: `Ganaste <b>${r.tiradas}</b> tirada${r.tiradas > 1 ? 's' : ''} gratis`, note: '' });
      } else setMsg(r.msg, 'err');
    };
    btn.addEventListener('click', go);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    inp.addEventListener('input', () => { inp.value = inp.value.toUpperCase(); });
  },

  async redeem(raw) {
    const fbUser = fbAuth.currentUser;
    if (!fbUser) return { ok: false, msg: 'Inicia sesión para canjear un código' };
    const code = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!/^[A-Z0-9-]{3,40}$/.test(code)) return { ok: false, msg: 'Escribe un código válido (letras, números y guiones)' };

    const uid = fbUser.uid;
    const codeRef = fbDB.collection('codes').doc(code);
    const redRef  = fbDB.collection('redemptions').doc(code + '_' + uid);
    const userRef = fbDB.collection('users').doc(uid);
    let res = null;
    try {
      await fbDB.runTransaction(async tx => {
        res = null;
        const cs = await tx.get(codeRef);
        if (!cs.exists) { res = { ok: false, msg: 'Ese código no existe' }; return; }
        const c = cs.data();
        if (c.active === false) { res = { ok: false, msg: 'Ese código ya no está activo' }; return; }
        const rs = await tx.get(redRef);
        if (rs.exists) { res = { ok: false, msg: 'Ya canjeaste este código en tu cuenta' }; return; }
        const uses = c.uses || 0, max = c.maxUses || 0;
        if (max > 0 && uses >= max) { res = { ok: false, msg: 'Este código ya alcanzó su límite de usos' }; return; }
        const us = await tx.get(userRef);
        const n = Math.max(1, Math.min(this.MAX_TIRADAS, Math.floor(Number(c.tiradas) || 10)));
        tx.set(redRef, { uid, code, tiradas: n, at: new Date().toISOString() });
        tx.update(codeRef, { uses: uses + 1 });
        tx.update(userRef, { tiradas: ((us.data() || {}).tiradas || 0) + n });
        res = { ok: true, tiradas: n };
      });
    } catch (e) {
      console.warn('[Prizes] canje falló', e);
      const denied = e && (e.code === 'permission-denied');
      return { ok: false, msg: denied ? 'No se pudo canjear (¿código agotado o ya usado?)' : 'Sin conexión o error inesperado. Intenta de nuevo' };
    }
    if (res?.ok && typeof DB !== 'undefined' && DB.logActivity) DB.logActivity(fbUser.email, 'code_redeem', code);
    return res || { ok: false, msg: 'No se pudo canjear' };
  }
};
