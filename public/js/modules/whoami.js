// whoami.js
// --------------------------------------------------
// "¿Quién es mi jugador?" — duelo 1v1 por sala (P2P / relevo).
// Al empezar, cada uno elige en secreto un jugador de la lista. Por turnos,
// uno escribe una pregunta y el otro solo puede responder SÍ o NO.
// Cada jugador tiene 5 intentos:
//   · Preguntar cuesta 1 intento.
//   · Adivinar el nombre en tu turno: si aciertas, ganas al instante. Si
//     fallas NO pierdes automáticamente: se te restan 2 intentos (y pasa el
//     turno). Si te quedaban 2 o menos, perder es automático.
//   · Con 0 intentos, en tu turno debes decir tu nombre final: si fallas, pierdes.
// El jugador secreto solo vive en el navegador de cada uno; al terminar se
// revelan los dos. Mensajes por P2P.send(): wh_ready, wh_start, wh_q, wh_a,
// wh_g, wh_gr, wh_reveal, wh_again.

const WhoAmI = {
  ATTEMPTS: 5, MAX_Q: 120,
  alive: false, ov: null, S: null,

  _esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  _pool() { return [...Gacha.getPool()].sort((a, b) => a.name.localeCompare(b.name, 'es')); },
  _byId(id) { return Gacha.getPool().find(f => f.id === id); },
  _photo(f) { return `${API._PHOTO_BASE_URL}${f.id}.png`; },
  _face(f, cls = '') {
    return `<span class="wh-face ${cls}" data-ini="${this._esc(f.name[0])}"><img src="${this._photo(f)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()"></span>`;
  },
  _fresh(keep = {}) {
    return { phase: 'pick', pick: null, tentative: null, oppReady: false, started: false, me: this.ATTEMPTS, opp: this.ATTEMPTS,
      turn: null, sub: null, log: [], pendingQ: null, notes: new Set(), oppSecret: null, result: null, guessing: false,
      again: false, oppAgain: false, ...keep };
  },

  // ---------- ciclo de vida ----------
  start() {
    this.close(false);
    this.alive = true; this.S = this._fresh();
    this.ov = document.createElement('div'); this.ov.className = 'wh-ov'; document.body.appendChild(this.ov);
    document.body.classList.add('wh-open');
    this.render();
  },
  close(leave = true) {
    if (this.ov) { this.ov.remove(); this.ov = null; }
    document.body.classList.remove('wh-open');
    if (this.alive && leave) { try { P2P.close(); } catch (_) {} }
    this.alive = false;
  },
  _p2pClosed() {
    if (!this.alive || !this.S) return;
    if (this.S.phase !== 'end') { this.S.phase = 'end'; this.S.result = { dc: true }; this.render(); }
  },
  _send(o) { P2P.send(o, true); },

  // ---------- mensajes ----------
  _onMsg(m) {
    if (!this.alive || !this.S) return;
    const S = this.S;
    switch (m.t) {
      case 'wh_ready': S.oppReady = true; this._maybeStart(); break;
      case 'wh_start': S.started = true; S.phase = 'play'; S.turn = (m.first === P2P.role) ? 'me' : 'opp'; S.sub = S.turn === 'me' ? 'ask' : 'wait'; break;
      case 'wh_q': // el rival me pregunta
        if (S.phase !== 'play') return;
        S.opp = Math.max(0, S.opp - 1); S.pendingQ = String(m.text || '').slice(0, this.MAX_Q); S.sub = 'answer'; break;
      case 'wh_a': // respuesta a mi pregunta
        { const last = [...S.log].reverse().find(l => l.who === 'me' && l.kind === 'q' && l.ans == null); if (last) last.ans = !!m.v; }
        S.turn = 'opp'; S.sub = 'wait'; break;
      case 'wh_g': { // el rival intenta adivinar mi jugador
        const f = this._byId(m.id), ok = m.id === S.pick;
        S.log.push({ who: 'opp', kind: 'g', text: f ? f.name : '?', ok });
        if (ok) { this._reply({ t: 'wh_gr', ok: true }); this._finish(false, 'El rival adivinó tu jugador'); return; }
        S.opp -= 2; const over = S.opp <= 0;
        this._reply({ t: 'wh_gr', ok: false, over });
        if (over) { this._finish(true, 'El rival falló su intento final'); return; }
        S.turn = 'me'; S.sub = 'ask'; break;
      }
      case 'wh_gr': { // resultado de mi intento
        S.guessing = false;
        const last = [...S.log].reverse().find(l => l.who === 'me' && l.kind === 'g' && l.ok == null); if (last) last.ok = !!m.ok;
        if (m.ok) { this._finish(true, '¡Adivinaste su jugador!'); return; }
        S.me -= 2; if (m.over || S.me <= 0) { this._finish(false, 'Fallaste sin intentos suficientes'); return; }
        S.turn = 'opp'; S.sub = 'wait'; break;
      }
      case 'wh_reveal': S.oppSecret = m.secret; break;
      case 'wh_again': S.oppAgain = true; if (S.again) { this._restart(); return; } break;
    }
    this.render();
  },
  _reply(o) { this._send(o); },
  _maybeStart() {
    const S = this.S;
    if (P2P.role === 'host' && S.pick && S.oppReady && !S.started) {
      S.started = true; S.phase = 'play';
      const first = Math.random() < .5 ? 'host' : 'guest';
      this._send({ t: 'wh_start', first });
      S.turn = first === 'host' ? 'me' : 'opp'; S.sub = S.turn === 'me' ? 'ask' : 'wait';
    }
  },
  _finish(won, why) {
    const S = this.S; S.phase = 'end'; S.result = { won, why };
    this._send({ t: 'wh_reveal', secret: S.pick });
    this.render();
  },
  _restart() { this.S = this._fresh(); this.render(); },

  // ---------- acciones del jugador ----------
  _confirmPick() {
    const S = this.S; if (!S.tentative) return;
    S.pick = S.tentative; this._send({ t: 'wh_ready' }); this._maybeStart(); this.render();
  },
  _ask(text) {
    const S = this.S; text = String(text || '').trim();
    if (text.length < 3) return Toast.warn('Escribe una pregunta (mínimo 3 letras)');
    if (S.turn !== 'me' || S.sub !== 'ask' || S.me <= 0) return;
    S.me -= 1; S.log.push({ who: 'me', kind: 'q', text, ans: null }); S.sub = 'wait';
    this._send({ t: 'wh_q', text: text.slice(0, this.MAX_Q) }); this.render();
  },
  _answer(v) {
    const S = this.S; if (S.sub !== 'answer') return;
    S.log.push({ who: 'opp', kind: 'q', text: S.pendingQ, ans: v }); S.pendingQ = null;
    this._send({ t: 'wh_a', v }); S.turn = 'me'; S.sub = 'ask'; this.render();
  },
  _guess(id) {
    const S = this.S; if (S.turn !== 'me' || S.sub !== 'ask' || S.guessing) return;
    const f = this._byId(id); if (!f) return;
    S.guessing = true; S.sub = 'wait'; S.log.push({ who: 'me', kind: 'g', text: f.name, ok: null });
    this._send({ t: 'wh_g', id }); this.render();
  },

  // ---------- UI ----------
  _dots(n, total = this.ATTEMPTS) { return Array.from({ length: total }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join(''); },
  _grid(list, sel, mode) {
    return `<div class="wh-grid">${list.map(f => `<button class="wh-card ${sel === f.id ? 'sel' : ''} ${mode === 'board' && this.S.notes.has(f.id) ? 'out' : ''}" data-id="${f.id}" title="${this._esc(f.name)}">${this._face(f)}<b>${this._esc(f.name)}</b></button>`).join('')}</div>`;
  },
  render() {
    if (!this.ov || !this.S) return;
    const S = this.S, keepScroll = this.ov.querySelector('.wh-body')?.scrollTop || 0;
    const head = `<div class="wh-head"><b>❓ ¿Quién es mi jugador?</b><span class="wh-code">Sala ${P2P.code || ''}${P2P.viaRelay ? ' · relevo' : ''}</span><button class="wh-x" id="wh-exit" aria-label="Salir">✕</button></div>`;
    let body = '';
    if (S.phase === 'pick') body = this._viewPick();
    else if (S.phase === 'play') body = this._viewPlay();
    else body = this._viewEnd();
    this.ov.innerHTML = `<div class="wh-box">${head}<div class="wh-body">${body}</div></div>`;
    this.ov.querySelector('#wh-exit').onclick = () => { if (S.phase === 'end' || confirm('¿Salir de la partida?')) this.close(true); };
    this._bind();
    const b = this.ov.querySelector('.wh-body'); if (b) b.scrollTop = S.phase === 'play' ? keepScroll : 0;
    if (S.phase === 'play') { const lg = this.ov.querySelector('.wh-log'); if (lg) lg.scrollTop = lg.scrollHeight; }
    if (window.parseEmojis) parseEmojis(this.ov);
  },
  _viewPick() {
    const S = this.S, f = S.tentative ? this._byId(S.tentative) : null;
    if (S.pick) return `<div class="wh-wait"><h3>Tu jugador secreto</h3>${this._face(this._byId(S.pick), 'big')}<p><b>${this._esc(this._byId(S.pick).name)}</b></p><p class="wh-sub">${S.oppReady ? 'Empezando…' : 'Esperando a que tu rival elija…'}</p></div>`;
    return `<h3 class="wh-h">Elige tu jugador secreto</h3><p class="wh-sub">Tu rival tendrá que adivinarlo. No se lo digas.</p>
      <input id="wh-search" class="wh-input" placeholder="Buscar jugador…" autocomplete="off">
      <div id="wh-list">${this._grid(this._pool(), S.tentative, 'pick')}</div>
      <div class="wh-bar"><span>${f ? `Elegido: <b>${this._esc(f.name)}</b>` : 'Toca un jugador'}</span><button class="btn btn-primary" id="wh-confirm" ${f ? '' : 'disabled'}>Confirmar</button></div>`;
  },
  _viewPlay() {
    const S = this.S, mine = this._byId(S.pick);
    const logHtml = S.log.length ? S.log.map(l => {
      const who = l.who === 'me' ? 'Tú' : 'Rival';
      if (l.kind === 'q') return `<div class="wh-msg ${l.who}"><small>${who} preguntó</small>${this._esc(l.text)}<em class="${l.ans == null ? '' : l.ans ? 'yes' : 'no'}">${l.ans == null ? '…' : l.ans ? 'SÍ' : 'NO'}</em></div>`;
      return `<div class="wh-msg ${l.who} g"><small>${who} arriesgó</small>¿Es ${this._esc(l.text)}?<em class="${l.ok == null ? '' : l.ok ? 'yes' : 'no'}">${l.ok == null ? '…' : l.ok ? 'ACERTÓ' : 'FALLÓ'}</em></div>`;
    }).join('') : '<p class="wh-sub" style="text-align:center">Aún no hay preguntas.</p>';

    let ctl = '';
    if (S.sub === 'answer') {
      ctl = `<div class="wh-q"><small>El rival pregunta sobre tu jugador:</small><p>“${this._esc(S.pendingQ)}”</p><div class="wh-yn"><button class="btn wh-yes" id="wh-yes">SÍ</button><button class="btn wh-no" id="wh-no">NO</button></div></div>`;
    } else if (S.turn === 'me' && S.sub === 'ask') {
      const forced = S.me <= 0;
      ctl = `<div class="wh-ask">
        <small>${forced ? '⚠️ Sin intentos: di tu nombre FINAL (si fallas, pierdes)' : `Tu turno · te quedan ${S.me} intento${S.me > 1 ? 's' : ''}`}</small>
        ${forced ? '' : `<div class="wh-row"><input id="wh-q" class="wh-input" maxlength="${this.MAX_Q}" placeholder="Escribe una pregunta de SÍ o NO…" autocomplete="off"><button class="btn btn-primary" id="wh-send">Preguntar</button></div>`}
        <button class="btn ${forced ? 'btn-primary' : ''}" id="wh-guess">${forced ? 'Decir mi respuesta final' : 'Arriesgar un nombre'}</button>
        ${forced ? '' : `<p class="wh-sub">Si arriesgas y fallas pierdes 2 intentos${S.me <= 2 ? ' — <b>con los que te quedan, perderías la partida</b>' : ''}.</p>`}
      </div>`;
    } else {
      ctl = `<div class="wh-wait-line">${S.turn === 'opp' ? 'Turno del rival: está pensando su pregunta…' : 'Esperando la respuesta del rival…'}</div>`;
    }
    const board = `<details class="wh-board"><summary>Tablero (toca para tachar)</summary>${this._grid(this._pool(), null, 'board')}</details>`;
    return `<div class="wh-top"><div class="wh-mine">${this._face(mine)}<span><small>Tu secreto</small><b>${this._esc(mine.name)}</b></span></div>
      <div class="wh-att"><div><small>Tú</small><span class="wh-dots">${this._dots(Math.max(0, S.me))}</span></div><div><small>Rival</small><span class="wh-dots opp">${this._dots(Math.max(0, S.opp))}</span></div></div></div>
      <div class="wh-log">${logHtml}</div>${ctl}${board}`;
  },
  _viewEnd() {
    const S = this.S, r = S.result || {}, mine = this._byId(S.pick), opp = S.oppSecret ? this._byId(S.oppSecret) : null;
    if (r.dc) return `<div class="wh-wait"><h3>Rival desconectado</h3><p class="wh-sub">Se perdió la conexión con tu rival.</p><button class="btn btn-primary" id="wh-leave">Salir</button></div>`;
    return `<div class="wh-end ${r.won ? 'win' : 'lose'}"><h2>${r.won ? '🏆 ¡Ganaste!' : '💀 Perdiste'}</h2><p>${this._esc(r.why || '')}</p>
      <div class="wh-reveal"><div><small>Tu jugador</small>${this._face(mine, 'big')}<b>${this._esc(mine.name)}</b></div>
      <div><small>Su jugador</small>${opp ? this._face(opp, 'big') + `<b>${this._esc(opp.name)}</b>` : '<span class="wh-sub">…</span>'}</div></div>
      <div class="wh-yn"><button class="btn btn-primary" id="wh-again" ${S.again ? 'disabled' : ''}>${S.again ? 'Esperando revancha…' : S.oppAgain ? 'Aceptar revancha' : 'Revancha'}</button><button class="btn" id="wh-leave">Salir</button></div></div>`;
  },
  _bind() {
    const q = id => this.ov.querySelector(id), S = this.S;
    if (S.phase === 'pick' && !S.pick) {
      const list = q('#wh-list'), pool = this._pool();
      const wire = () => list.querySelectorAll('.wh-card').forEach(b => b.onclick = () => { S.tentative = b.dataset.id; const k = q('#wh-search')?.value || ''; this.render(); const s = q('#wh-search'); if (s) { s.value = k; s.dispatchEvent(new Event('input')); } });
      wire();
      q('#wh-search').oninput = e => {
        const k = e.target.value.trim().toLowerCase();
        list.innerHTML = this._grid(pool.filter(f => f.name.toLowerCase().includes(k)), S.tentative, 'pick'); wire();
        if (window.parseEmojis) parseEmojis(list);
      };
      q('#wh-confirm').onclick = () => this._confirmPick();
    }
    if (S.phase === 'play') {
      q('#wh-yes') && (q('#wh-yes').onclick = () => this._answer(true));
      q('#wh-no') && (q('#wh-no').onclick = () => this._answer(false));
      const send = q('#wh-send'), inp = q('#wh-q');
      if (send) { send.onclick = () => this._ask(inp.value); inp.onkeydown = e => { if (e.key === 'Enter') this._ask(inp.value); }; }
      q('#wh-guess') && (q('#wh-guess').onclick = () => this._openGuess());
      this.ov.querySelectorAll('.wh-board .wh-card').forEach(b => b.onclick = () => { b.classList.toggle('out'); S.notes.has(b.dataset.id) ? S.notes.delete(b.dataset.id) : S.notes.add(b.dataset.id); });
    }
    if (S.phase === 'end') {
      q('#wh-leave') && (q('#wh-leave').onclick = () => this.close(true));
      q('#wh-again') && (q('#wh-again').onclick = () => { S.again = true; this._send({ t: 'wh_again' }); if (S.oppAgain) this._restart(); else this.render(); });
    }
  },
  _openGuess() {
    const S = this.S, forced = S.me <= 0, pool = this._pool();
    const m = document.createElement('div'); m.className = 'wh-pop';
    m.innerHTML = `<div class="wh-popbox"><div class="wh-head"><b>¿Quién es el jugador del rival?</b>${forced ? '' : '<button class="wh-x" id="wh-pc">✕</button>'}</div>
      <p class="wh-sub" style="padding:0 14px">${forced ? 'Es tu intento final: si fallas, pierdes.' : S.me <= 2 ? 'Si fallas, pierdes la partida.' : 'Si fallas, pierdes 2 intentos.'}</p>
      <div style="padding:0 14px"><input class="wh-input" id="wh-gs" placeholder="Buscar jugador…" autocomplete="off"></div>
      <div class="wh-popbody" id="wh-gl">${this._grid(pool, null, 'pick')}</div></div>`;
    this.ov.appendChild(m);
    const gl = m.querySelector('#wh-gl');
    const wire = () => gl.querySelectorAll('.wh-card').forEach(b => b.onclick = () => {
      const f = this._byId(b.dataset.id);
      if (confirm(`¿Arriesgar a ${f.name}?`)) { m.remove(); this._guess(b.dataset.id); }
    });
    wire();
    m.querySelector('#wh-gs').oninput = e => { const k = e.target.value.trim().toLowerCase(); gl.innerHTML = this._grid(pool.filter(f => f.name.toLowerCase().includes(k)), null, 'pick'); wire(); if (window.parseEmojis) parseEmojis(gl); };
    const c = m.querySelector('#wh-pc'); if (c) c.onclick = () => m.remove();
    if (window.parseEmojis) parseEmojis(m);
  }
};
