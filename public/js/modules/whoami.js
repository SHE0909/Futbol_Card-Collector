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
//   · RELOJ: en tu turno tienes 1 minuto para preguntar o arriesgar. Si se acaba,
//     pierdes 1 intento, nadie responde (no hubo pregunta) y pasa el turno. Si te
//     pasa 2 veces SEGUIDAS quedas DESCALIFICADO y el rival gana. El contador se
//     reinicia apenas preguntas o arriesgas. El reloj corre en el navegador de quien
//     tiene el turno (wh_skip avisa al rival); el rival tiene un respaldo con
//     margen por si el mensaje no llega.
//   · RELOJ PARA RESPONDER: quien debe contestar SÍ/NO tiene 30 s. Si no lo hace,
//     la pregunta se anula (el que preguntó recupera su intento y vuelve a preguntar),
//     el que no respondió pierde 1 intento, y si le pasa 2 veces SEGUIDAS queda
//     descalificado. Así la partida nunca se queda trabada esperando una respuesta.
// El jugador secreto solo vive en el navegador de cada uno; al terminar se
// revelan los dos. Mensajes por P2P.send(): wh_ready, wh_start, wh_q, wh_a,
// wh_g, wh_gr, wh_skip, wh_noans, wh_reveal, wh_again.

const WhoAmI = {
  ATTEMPTS: 5, MAX_Q: 120,
  ASK_MS: 60000, ANSWER_MS: 30000, GRACE_MS: 6000, MAX_STRIKES: 2,
  alive: false, ov: null, S: null, _tick: null,

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
      again: false, oppAgain: false, deadline: 0, dlMs: 0, strikes: { me: 0, opp: 0 }, noans: { me: 0, opp: 0 }, ...keep };
  },

  // ---------- ciclo de vida ----------
  start() {
    this.close(false);
    this.alive = true; this.S = this._fresh();
    this.ov = document.createElement('div'); this.ov.className = 'wh-ov'; document.body.appendChild(this.ov);
    document.body.classList.add('wh-open');
    clearInterval(this._tick); this._tick = setInterval(() => this._onTick(), 250);
    this.render();
  },
  close(leave = true) {
    clearInterval(this._tick); this._tick = null;
    if (this.ov) { this.ov.remove(); this.ov = null; }
    document.body.classList.remove('wh-open');
    if (this.alive && leave) { try { P2P.close(); } catch (_) {} }
    this.alive = false;
  },
  _p2pClosed() {
    if (!this.alive || !this.S) return;
    const S = this.S; if (S.phase === 'end') return;
    if (S.phase === 'play' && navigator.onLine !== false) {
      Toast.warn('El rival se desconectó. ¡Ganas la partida!');
      return this._finish(true, 'El rival se desconectó: ganas por abandono', true);
    }
    S.phase = 'end'; S.result = { dc: true }; this.render();
  },
  _send(o) { P2P.send(o, true); },

  // ---------- mensajes ----------
  _onMsg(m) {
    if (!this.alive || !this.S) return;
    const S = this.S;
    switch (m.t) {
      case 'wh_ready': S.oppReady = true; this._maybeStart(); break;
      case 'wh_start': S.started = true; S.phase = 'play'; { const t = (m.first === P2P.role) ? 'me' : 'opp'; this._turn(t, t === 'me' ? 'ask' : 'wait'); } break;
      case 'wh_q': // el rival me pregunta
        if (S.phase !== 'play') return;
        S.opp = Math.max(0, S.opp - 1); S.strikes.opp = 0; S.pendingQ = String(m.text || '').slice(0, this.MAX_Q); this._turn('opp', 'answer'); break;
      case 'wh_a': // respuesta a mi pregunta
        if (S.turn !== 'me' || S.sub !== 'wait' || S.guessing) return; // ya se anuló por tiempo
        S.noans.opp = 0;
        { const last = [...S.log].reverse().find(l => l.who === 'me' && l.kind === 'q' && l.ans == null); if (last) last.ans = !!m.v; }
        this._turn('opp', 'wait'); break;
      case 'wh_skip': // el rival se quedó sin tiempo: no hubo pregunta
        this._oppTimeout(); return;
      case 'wh_noans': // el rival no respondió mi pregunta a tiempo
        this._oppNoAnswer(); return;
      case 'wh_g': { // el rival intenta adivinar mi jugador
        S.strikes.opp = 0;
        const f = this._byId(m.id), ok = m.id === S.pick;
        S.log.push({ who: 'opp', kind: 'g', text: f ? f.name : '?', ok });
        if (ok) { this._reply({ t: 'wh_gr', ok: true }); this._finish(false, 'El rival adivinó tu jugador'); return; }
        S.opp -= 2; const over = S.opp <= 0;
        this._reply({ t: 'wh_gr', ok: false, over });
        if (over) { this._finish(true, 'El rival falló su intento final'); return; }
        this._turn('me', 'ask'); break;
      }
      case 'wh_gr': { // resultado de mi intento
        S.guessing = false;
        const last = [...S.log].reverse().find(l => l.who === 'me' && l.kind === 'g' && l.ok == null); if (last) last.ok = !!m.ok;
        if (m.ok) { this._finish(true, '¡Adivinaste su jugador!'); return; }
        S.me -= 2; if (m.over || S.me <= 0) { this._finish(false, 'Fallaste sin intentos suficientes'); return; }
        this._turn('opp', 'wait'); break;
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
      const t = first === 'host' ? 'me' : 'opp'; this._turn(t, t === 'me' ? 'ask' : 'wait');
    }
  },
  // Cambia el turno y (re)arma el reloj: corre en 'me/ask' (mi turno de preguntar)
  // y en 'opp/wait' (turno del rival; ahí solo sirve de respaldo + visual).
  // Relojes: yo preguntando (60 s) · yo respondiendo (30 s) · y los dos "de espejo" para
  // vigilar al rival (rival preguntando / rival respondiendo) con margen extra por latencia.
  _turn(turn, sub) {
    const S = this.S; S.turn = turn; S.sub = sub;
    const ms = (turn === 'me' && sub === 'ask') || (turn === 'opp' && sub === 'wait') ? this.ASK_MS
      : (turn === 'opp' && sub === 'answer') || (turn === 'me' && sub === 'wait' && !S.guessing) ? this.ANSWER_MS : 0;
    S.dlMs = ms; S.deadline = ms ? Date.now() + ms : 0;
  },
  _onTick() {
    const S = this.S; if (!this.alive || !S || S.phase !== 'play' || !S.deadline) return;
    const left = S.deadline - Date.now();
    const n = this.ov?.querySelector('#wh-tnum'), bar = this.ov?.querySelector('#wh-tbar'), box = this.ov?.querySelector('#wh-timer');
    if (n) n.textContent = Math.max(0, Math.ceil(left / 1000));
    if (bar) bar.style.width = Math.max(0, Math.min(100, left / (S.dlMs || this.ASK_MS) * 100)) + '%';
    if (box) box.classList.toggle('low', left <= 10000);
    if (S.turn === 'me' && S.sub === 'ask' && left <= 0) this._timeoutMine();
    else if (S.turn === 'opp' && S.sub === 'wait' && left <= -this.GRACE_MS) this._oppTimeout();
    else if (S.turn === 'opp' && S.sub === 'answer' && left <= 0) this._timeoutAnswer();
    else if (S.turn === 'me' && S.sub === 'wait' && !S.guessing && left <= -this.GRACE_MS) this._oppNoAnswer();
  },
  // Se me acabó el minuto sin preguntar ni arriesgar.
  _timeoutMine() {
    const S = this.S; if (S.turn !== 'me' || S.sub !== 'ask' || S.guessing) return;
    this.ov?.querySelector('.wh-pop')?.remove(); document.getElementById('hc-dlg')?.remove();
    const had = S.me > 0; S.me = Math.max(0, S.me - 1); S.strikes.me++;
    S.log.push({ who: 'me', kind: 't', lost: had });
    const dq = S.strikes.me >= this.MAX_STRIKES;
    this._send({ t: 'wh_skip' });
    if (dq) return this._finish(false, 'Descalificado: dejaste pasar el tiempo 2 rondas seguidas');
    Toast.warn(had ? '⏱️ Se acabó el tiempo: pierdes 1 intento y pasa el turno' : '⏱️ Se acabó el tiempo: pasa el turno');
    this._turn('opp', 'wait'); this.render();
  },
  // Me tocaba responder SÍ/NO y se acabó el tiempo: la pregunta se anula.
  _timeoutAnswer() {
    const S = this.S; if (S.turn !== 'opp' || S.sub !== 'answer') return;
    const had = S.me > 0; S.me = Math.max(0, S.me - 1); S.opp = Math.min(this.ATTEMPTS, S.opp + 1); // el rival recupera su intento
    S.noans.me++; S.pendingQ = null;
    S.log.push({ who: 'me', kind: 'n', lost: had });
    this._send({ t: 'wh_noans' });
    if (S.noans.me >= this.MAX_STRIKES) return this._finish(false, 'Descalificado: no respondiste a tiempo 2 veces seguidas');
    Toast.warn('⏱️ No respondiste a tiempo: pierdes 1 intento y la pregunta se anula');
    this._turn('opp', 'wait'); this.render();
  },
  // El rival no contestó mi pregunta a tiempo (aviso wh_noans o respaldo local). Idempotente.
  _oppNoAnswer() {
    const S = this.S; if (!S || S.phase !== 'play' || S.turn !== 'me' || S.sub !== 'wait' || S.guessing) return;
    const q = [...S.log].reverse().find(l => l.who === 'me' && l.kind === 'q' && l.ans == null);
    if (q) q.void = true;
    S.me = Math.min(this.ATTEMPTS, S.me + 1); S.opp = Math.max(0, S.opp - 1); // recupero mi intento; él paga 1
    S.noans.opp++;
    if (S.noans.opp >= this.MAX_STRIKES) return this._finish(true, 'El rival fue descalificado: no respondió a tiempo 2 veces seguidas');
    Toast.success('⏱️ Tu rival no respondió a tiempo: pierde 1 intento y recuperas el tuyo. ¡Pregunta de nuevo!');
    this._turn('me', 'ask'); this.render();
  },
  // El rival se quedó sin tiempo (aviso wh_skip o respaldo local). Idempotente.
  _oppTimeout() {
    const S = this.S; if (!S || S.phase !== 'play' || S.turn !== 'opp' || S.sub !== 'wait') return;
    const had = S.opp > 0; S.opp = Math.max(0, S.opp - 1); S.strikes.opp++;
    S.log.push({ who: 'opp', kind: 't', lost: had });
    if (S.strikes.opp >= this.MAX_STRIKES) return this._finish(true, 'El rival fue descalificado: dejó pasar el tiempo 2 rondas seguidas');
    Toast.success('⏱️ Tu rival no preguntó a tiempo: pierde 1 intento. ¡Es tu turno!');
    this._turn('me', 'ask'); this.render();
  },
  _finish(won, why, left = false) {
    const S = this.S; S.phase = 'end'; S.result = { won, why, left };
    if (!left) this._send({ t: 'wh_reveal', secret: S.pick });
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
    S.me -= 1; S.strikes.me = 0; S.log.push({ who: 'me', kind: 'q', text, ans: null }); this._turn('me', 'wait');
    this._send({ t: 'wh_q', text: text.slice(0, this.MAX_Q) }); this.render();
  },
  _answer(v) {
    const S = this.S; if (S.sub !== 'answer') return;
    S.log.push({ who: 'opp', kind: 'q', text: S.pendingQ, ans: v }); S.pendingQ = null;
    S.noans.me = 0; this._send({ t: 'wh_a', v }); this._turn('me', 'ask'); this.render();
  },
  _guess(id) {
    const S = this.S; if (S.turn !== 'me' || S.sub !== 'ask' || S.guessing) return;
    const f = this._byId(id); if (!f) return;
    S.guessing = true; S.strikes.me = 0; this._turn('me', 'wait'); S.log.push({ who: 'me', kind: 'g', text: f.name, ok: null });
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
    this.ov.querySelector('#wh-exit').onclick = () => {
      if (S.phase === 'end') return this.close(true);
      HeadCards._dialog({ icon: '🚪', title: '¿Salir de la partida?', text: 'Si sales, tu rival ganará por abandono.', cancel: 'Seguir jugando', ok: 'Salir', onOk: () => this.close(true) });
    };
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
      if (l.kind === 't') return `<div class="wh-msg ${l.who} t"><small>${who}</small>⏱️ Se acabó el tiempo sin preguntar<em class="no">${l.lost ? '−1 intento' : 'turno perdido'}</em></div>`;
      if (l.kind === 'n') return `<div class="wh-msg ${l.who} t"><small>${who}</small>⏱️ No respondió a tiempo: pregunta anulada<em class="no">${l.lost ? '−1 intento' : 'sin castigo'}</em></div>`;
      if (l.kind === 'q' && l.void) return `<div class="wh-msg ${l.who} t"><small>${who} preguntó</small>${this._esc(l.text)}<em class="no">ANULADA</em></div>`;
      if (l.kind === 'q') return `<div class="wh-msg ${l.who}"><small>${who} preguntó</small>${this._esc(l.text)}<em class="${l.ans == null ? '' : l.ans ? 'yes' : 'no'}">${l.ans == null ? '…' : l.ans ? 'SÍ' : 'NO'}</em></div>`;
      return `<div class="wh-msg ${l.who} g"><small>${who} arriesgó</small>¿Es ${this._esc(l.text)}?<em class="${l.ok == null ? '' : l.ok ? 'yes' : 'no'}">${l.ok == null ? '…' : l.ok ? 'ACERTÓ' : 'FALLÓ'}</em></div>`;
    }).join('') : '<p class="wh-sub" style="text-align:center">Aún no hay preguntas.</p>';

    let ctl = '';
    if (S.sub === 'answer') {
      ctl = `<div class="wh-q">${this._timerHtml('Tu tiempo para responder')}${S.noans.me >= 1 ? '<p class="wh-warn">⚠️ Ya no respondiste a tiempo una vez. Si vuelve a pasar, <b>quedas descalificado</b>.</p>' : ''}<small>El rival pregunta sobre tu jugador:</small><p>“${this._esc(S.pendingQ)}”</p><div class="wh-yn"><button class="btn wh-yes" id="wh-yes">SÍ</button><button class="btn wh-no" id="wh-no">NO</button></div></div>`;
    } else if (S.turn === 'me' && S.sub === 'ask') {
      const forced = S.me <= 0;
      ctl = `<div class="wh-ask">
        ${this._timerHtml('Tu tiempo para preguntar')}
        ${S.strikes.me >= 1 ? `<p class="wh-warn">⚠️ Ya pasaste el tiempo una vez. Si vuelve a pasar, <b>quedas descalificado</b>.</p>` : ''}
        <small>${forced ? '⚠️ Sin intentos: di tu nombre FINAL (si fallas, pierdes)' : `Tu turno · te quedan ${S.me} intento${S.me > 1 ? 's' : ''}`}</small>
        ${forced ? '' : `<div class="wh-row"><input id="wh-q" class="wh-input" maxlength="${this.MAX_Q}" placeholder="Escribe una pregunta de SÍ o NO…" autocomplete="off"><button class="btn btn-primary" id="wh-send">Preguntar</button></div>`}
        <button class="btn ${forced ? 'btn-primary' : ''}" id="wh-guess">${forced ? 'Decir mi respuesta final' : 'Arriesgar un nombre'}</button>
        ${forced ? '' : `<p class="wh-sub">Si arriesgas y fallas pierdes 2 intentos${S.me <= 2 ? ' — <b>con los que te quedan, perderías la partida</b>' : ''}.</p>`}
      </div>`;
    } else {
      ctl = S.turn === 'opp' && S.sub === 'wait'
        ? `<div class="wh-wait-line">${this._timerHtml('Turno del rival: tiene este tiempo para preguntar')}${S.strikes.opp >= 1 ? '<p class="wh-warn">Ya dejó pasar el tiempo una vez: otra más y queda descalificado.</p>' : ''}</div>`
        : `<div class="wh-wait-line">${S.sub === 'wait' && !S.guessing ? this._timerHtml('Tu rival tiene este tiempo para responderte') + (S.noans.opp >= 1 ? '<p class="wh-warn">Ya no respondió a tiempo una vez: otra más y queda descalificado.</p>' : '') : 'Esperando la respuesta del rival…'}</div>`;
    }
    const board = `<details class="wh-board"><summary>Tablero (toca para tachar)</summary>${this._grid(this._pool(), null, 'board')}</details>`;
    return `<div class="wh-top"><div class="wh-mine">${this._face(mine)}<span><small>Tu secreto</small><b>${this._esc(mine.name)}</b></span></div>
      <div class="wh-att"><div><small>Tú</small><span class="wh-dots">${this._dots(Math.max(0, S.me))}</span></div><div><small>Rival</small><span class="wh-dots opp">${this._dots(Math.max(0, S.opp))}</span></div></div></div>
      <div class="wh-log">${logHtml}</div>${ctl}${board}`;
  },
  _timerHtml(label) {
    const left = Math.max(0, (this.S.deadline || 0) - Date.now()), sec = Math.ceil(left / 1000);
    return `<div class="wh-timer ${left <= 10000 ? 'low' : ''}" id="wh-timer"><span class="wh-tlbl">⏱️ ${label}</span><b><span id="wh-tnum">${sec}</span>s</b><i><u id="wh-tbar" style="width:${Math.min(100, left / (this.S.dlMs || this.ASK_MS) * 100)}%"></u></i></div>`;
  },
  _viewEnd() {
    const S = this.S, r = S.result || {}, mine = this._byId(S.pick), opp = S.oppSecret ? this._byId(S.oppSecret) : null;
    if (r.dc) return `<div class="wh-wait"><h3>Rival desconectado</h3><p class="wh-sub">Se perdió la conexión con tu rival.</p><button class="btn btn-primary" id="wh-leave">Salir</button></div>`;
    return `<div class="wh-end ${r.won ? 'win' : 'lose'}"><h2>${r.won ? '🏆 ¡Ganaste!' : '💀 Perdiste'}</h2><p>${this._esc(r.why || '')}</p>
      <div class="wh-reveal"><div><small>Tu jugador</small>${this._face(mine, 'big')}<b>${this._esc(mine.name)}</b></div>
      <div><small>Su jugador</small>${opp ? this._face(opp, 'big') + `<b>${this._esc(opp.name)}</b>` : '<span class="wh-sub">…</span>'}</div></div>
      <div class="wh-yn">${r.left ? '' : `<button class="btn btn-primary" id="wh-again" ${S.again ? 'disabled' : ''}>${S.again ? 'Esperando revancha…' : S.oppAgain ? 'Aceptar revancha' : 'Revancha'}</button>`}<button class="btn" id="wh-leave">Salir</button></div></div>`;
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
      HeadCards._dialog({ icon: '🎯', title: `¿Arriesgar a ${f.name}?`, text: 'Si fallas, lo pagas. ¿Seguro?', cancel: 'Cancelar', ok: 'Arriesgar', onOk: () => { m.remove(); this._guess(b.dataset.id); } });
    });
    wire();
    m.querySelector('#wh-gs').oninput = e => { const k = e.target.value.trim().toLowerCase(); gl.innerHTML = this._grid(pool.filter(f => f.name.toLowerCase().includes(k)), null, 'pick'); wire(); if (window.parseEmojis) parseEmojis(gl); };
    const c = m.querySelector('#wh-pc'); if (c) c.onclick = () => m.remove();
    if (window.parseEmojis) parseEmojis(m);
  }
};
