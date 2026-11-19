// wordle.js
// --------------------------------------------------
// "Wordle de fútbol" — duelo 1v1 por sala (P2P / relevo).
// Los dos tienen el MISMO jugador secreto (elegido al azar entre las cartas del
// juego por el anfitrión). Cada intento es un jugador de la lista y el juego
// pinta, como en Wordle, qué tanto se parece al secreto:
//   Equipo · País · Posición · Rareza · Rating (con flecha ▲ / ▼)
//   🟩 igual · 🟨 cerca (rareza contigua o rating a ±2) · ⬛ distinto
// El primero en adivinar gana. Hay 8 intentos y 5 minutos por partida; si nadie
// acierta (o se acaba el tiempo) es empate. Pistas gratis: tras 4 intentos fallidos
// se revela la inicial y tras 6 la cantidad de letras.
// Recompensa: +10 pts al ganar, con el tope diario compartido entre todos los P2P (P2PRewards, en p2p.js).
// Mensajes por P2P.send(): wd_ready, wd_start, wd_p, wd_win, wd_out, wd_to, wd_again.

const FootWordle = {
  MAX_TRIES: 8, GAME_MS: 5 * 60 * 1000,
  TIER: { common: 0, rare: 1, epic: 2, legendary: 3, goat: 4 },
  alive: false, ov: null, S: null, _tick: null,

  _esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  _norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); },
  _pool() { return [...Gacha.getPool()].sort((a, b) => a.name.localeCompare(b.name, 'es')); },
  _byId(id) { return Gacha.getPool().find(f => f.id === id); },
  _photo(f) { return `${API._PHOTO_BASE_URL}${f.id}.png`; },
  _face(f, cls = '') {
    return `<span class="wh-face ${cls}" data-ini="${this._esc(f.name[0])}"><img src="${this._photo(f)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()"></span>`;
  },
  _fresh() {
    return { phase: 'wait', secret: null, guesses: [], q: '', oppN: 0, oppBest: 0, out: false, oppOut: false,
      result: null, again: false, oppAgain: false, ready: false, deadline: 0, winTs: 0 };
  },

  // ---------- ciclo de vida ----------
  start() {
    this.close(false);
    this.alive = true; this.S = this._fresh();
    this.ov = document.createElement('div'); this.ov.className = 'wh-ov'; document.body.appendChild(this.ov);
    document.body.classList.add('wh-open');
    clearInterval(this._tick); this._tick = setInterval(() => this._onTick(), 500);
    if (P2P.role === 'guest') this._send({ t: 'wd_ready' });
    this.render();
  },
  close(leave = true) {
    clearInterval(this._tick); this._tick = null;
    if (this.ov) { this.ov.remove(); this.ov = null; }
    document.body.classList.remove('wh-open');
    if (this.alive && leave) { try { P2P.close(); } catch (_) {} }
    this.alive = false;
  },
  _send(o) { P2P.send(o, true); },
  _p2pClosed() {
    if (!this.alive || !this.S) return;
    const S = this.S; if (S.phase === 'end') { S.oppGone = true; this.render(); return; }
    if (S.phase === 'play' && navigator.onLine !== false) {
      Toast.warn('El rival se desconectó. ¡Ganas la partida!');
      return this._end({ kind: 'win', why: 'El rival se desconectó: ganas por abandono' });
    }
    S.phase = 'end'; S.result = { kind: 'dc', why: 'El rival se desconectó antes de empezar' }; S.oppGone = true; this.render();
  },

  // ---------- inicio de partida (lo decide el anfitrión) ----------
  _hostBegin() {
    const S = this.S;
    if (P2P.role !== 'host' || !S.ready || S.phase !== 'wait') return;
    const pool = Gacha.getPool(), pick = pool[Math.floor(Math.random() * pool.length)];
    this._send({ t: 'wd_start', id: pick.id });
    this._begin(pick.id);
  },
  _begin(id) {
    const S = this.S; S.secret = id; S.phase = 'play'; S.guesses = []; S.q = ''; S.out = false; S.oppOut = false;
    S.oppN = 0; S.oppBest = 0; S.result = null; S.again = false; S.oppAgain = false; S.winTs = 0; S.rw = null;
    S.deadline = Date.now() + this.GAME_MS; this.render();
  },

  // ---------- mensajes ----------
  _onMsg(m) {
    if (!this.alive || !this.S) return;
    const S = this.S;
    switch (m.t) {
      case 'wd_ready': S.ready = true; this._hostBegin(); return;
      case 'wd_start': if (this._byId(m.id)) this._begin(m.id); return;
      case 'wd_p': S.oppN = m.n | 0; S.oppBest = Math.max(S.oppBest, m.g | 0); break;
      case 'wd_win':
        if (S.phase === 'play') return this._end({ kind: 'lose', why: `Tu rival adivinó en ${m.n} intento${m.n > 1 ? 's' : ''}` });
        // los dos acertaron casi a la vez: gana quien acertó primero (si empatan, el anfitrión)
        if (S.phase === 'end' && S.result?.kind === 'win' && S.winTs) {
          const mine = S.winTs, theirs = Number(m.t0) || Infinity;
          if (theirs < mine || (theirs === mine && P2P.role === 'guest')) { S.result = { kind: 'lose', why: 'Tu rival acertó un instante antes que tú' }; break; }
        }
        return;
      case 'wd_out': S.oppOut = true; if (S.out && S.phase === 'play') return this._end({ kind: 'draw', why: 'Nadie adivinó al jugador' }); break;
      case 'wd_to': if (S.phase === 'play') return this._end({ kind: 'draw', why: 'Se acabó el tiempo' }); return;
      case 'wd_again': S.oppAgain = true; if (S.again && P2P.role === 'host') return this._hostBegin2(); break;
    }
    this.render();
  },
  _hostBegin2() { const S = this.S; S.phase = 'wait'; S.ready = true; this._hostBegin(); },

  // ---------- reloj ----------
  _onTick() {
    const S = this.S; if (!this.alive || !S || S.phase !== 'play') return;
    const left = S.deadline - Date.now();
    const el = this.ov?.querySelector('#wd-time');
    if (el) { const t = Math.max(0, Math.ceil(left / 1000)); el.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; el.parentElement.classList.toggle('low', t <= 30); }
    if (left <= 0) { this._send({ t: 'wd_to' }); this._end({ kind: 'draw', why: 'Se acabó el tiempo' }); }
  },

  // ---------- reglas ----------
  _cells(g, sec) {
    const dir = (a, b) => (a === b ? '' : (b > a ? '▲' : '▼'));
    const tg = this.TIER[g.rareza] ?? 0, ts = this.TIER[sec.rareza] ?? 0, rg = g.rating || 0, rs = sec.rating || 0;
    return [
      { k: 'Equipo', v: this._esc(g.team), s: g.team === sec.team ? 'ok' : 'no', small: true },
      { k: 'País', v: this._esc(g.emoji?.[0] || '❔'), s: (g.emoji?.[0] || 'a') === (sec.emoji?.[0] || 'b') ? 'ok' : 'no', big: true },
      { k: 'Pos.', v: this._esc(g.pos), s: g.pos === sec.pos ? 'ok' : 'no' },
      { k: 'Rareza', v: this._esc(Gacha.getRarityLabel(g.rareza).replace('🐐 ', '')), s: tg === ts ? 'ok' : Math.abs(tg - ts) === 1 ? 'near' : 'no', arrow: dir(tg, ts), small: true },
      { k: 'Rating', v: String(rg), s: rg === rs ? 'ok' : Math.abs(rg - rs) <= 2 ? 'near' : 'no', arrow: dir(rg, rs) }
    ];
  },
  _greens(cells) { return cells.filter(c => c.s === 'ok').length; },

  _guess(id) {
    const S = this.S; if (!S || S.phase !== 'play' || S.out) return;
    const f = this._byId(id), sec = this._byId(S.secret);
    if (!f || !sec || S.guesses.some(g => g.id === id)) return;
    const cells = this._cells(f, sec), win = f.id === sec.id;
    S.guesses.push({ id, cells }); S.q = '';
    const best = Math.max(...S.guesses.map(g => this._greens(g.cells)));
    if (win) { S.winTs = Date.now(); this._send({ t: 'wd_win', n: S.guesses.length, t0: S.winTs }); return this._end({ kind: 'win', why: `¡Lo adivinaste en ${S.guesses.length} intento${S.guesses.length > 1 ? 's' : ''}!` }); }
    this._send({ t: 'wd_p', n: S.guesses.length, g: best });
    if (S.guesses.length >= this.MAX_TRIES) {
      S.out = true; this._send({ t: 'wd_out' });
      if (S.oppOut) return this._end({ kind: 'draw', why: 'Nadie adivinó al jugador' });
    }
    this.render(true);
  },
  _end(result) {
    const S = this.S; if (!S || S.phase === 'end') return;
    S.phase = 'end'; S.result = result; this.render();
    // Se espera un instante: si los dos aciertan casi a la vez, el desempate puede cambiar el resultado.
    if (result.kind === 'win') setTimeout(() => { if (this.alive && this.S === S && S.result?.kind === 'win') this._reward(S); }, 1500);
  },
  async _reward(S) {
    if (S.rw && S.rw.done) return;
    S.rw = { done: true, html: '<p class="wh-sub">⏳ Calculando tu recompensa…</p>' }; this.render();
    try { S.rw.html = P2PRewards.html(await P2PRewards.award()); } catch (_) { S.rw.html = P2PRewards.errHtml(); }
    if (this.alive && this.S === S && S.phase === 'end') this.render();
  },
  _again() {
    const S = this.S; if (S.phase !== 'end' || S.oppGone) return;
    S.again = true; this._send({ t: 'wd_again' });
    if (P2P.role === 'host' && S.oppAgain) return this._hostBegin2();
    this.render();
  },

  // ---------- UI ----------
  _cellHtml(c) {
    return `<div class="wd-cell ${c.s}" title="${c.k}"><small>${c.k}</small><b class="${c.big ? 'big' : ''} ${c.small ? 'sm' : ''}">${c.v}${c.arrow ? `<em>${c.arrow}</em>` : ''}</b></div>`;
  },
  _rowHtml(g) {
    const f = this._byId(g.id);
    return `<div class="wd-row"><div class="wd-name">${this._face(f)}<b>${this._esc(f.name)}</b></div><div class="wd-cells">${g.cells.map(c => this._cellHtml(c)).join('')}</div></div>`;
  },
  _hint() {
    const S = this.S, n = S.guesses.length, sec = this._byId(S.secret); if (!sec) return '';
    const parts = [];
    if (n >= 4) parts.push(`Empieza con <b>${this._esc(sec.name[0])}</b>`);
    if (n >= 6) parts.push(`Su nombre tiene <b>${sec.name.replace(/\s+/g, '').length}</b> letras`);
    return parts.length ? `<p class="wd-hint">💡 Pista: ${parts.join(' · ')}</p>` : '';
  },
  _suggest() {
    const S = this.S, q = this._norm(S.q.trim()), used = new Set(S.guesses.map(g => g.id));
    if (q.length < 1) return '<p class="wh-sub">Escribe para buscar un jugador…</p>';
    const list = this._pool().filter(f => !used.has(f.id) && (this._norm(f.name).includes(q) || this._norm(f.team).includes(q))).slice(0, 8);
    if (!list.length) return '<p class="wh-sub">Sin resultados</p>';
    return list.map(f => `<button type="button" class="wd-opt" data-id="${f.id}">${this._face(f)}<span><b>${this._esc(f.name)}</b><small>${this._esc(f.team)} · ${this._esc(f.pos)} · ${f.rating}</small></span></button>`).join('');
  },
  _viewWait() {
    return `<div class="wh-wait"><div style="font-size:2.6rem">🟩</div><h3 class="wh-h">Wordle de fútbol</h3><p class="wh-sub">${P2P.role === 'host' ? 'Preparando la partida…' : 'Esperando al anfitrión…'}</p></div>`;
  },
  _viewPlay() {
    const S = this.S, left = Math.max(0, Math.ceil((S.deadline - Date.now()) / 1000));
    const dots = (n, c) => Array.from({ length: this.MAX_TRIES }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
    const top = `<div class="wd-top">
      <div class="wd-prog"><small>Tú · ${S.guesses.length}/${this.MAX_TRIES}</small><div class="wh-dots">${dots(S.guesses.length)}</div></div>
      <div class="wd-timer ${left <= 30 ? 'low' : ''}">⏱️ <b id="wd-time">${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</b></div>
      <div class="wd-prog"><small>Rival · ${S.oppN}/${this.MAX_TRIES}${S.oppBest ? ` · mejor ${S.oppBest}/5 🟩` : ''}</small><div class="wh-dots opp">${dots(S.oppN)}</div></div></div>`;
    const legend = `<p class="wd-legend"><span class="ok">🟩 igual</span><span class="near">🟨 cerca</span><span class="no">⬛ distinto</span><span>▲▼ el secreto es mayor / menor</span></p>`;
    const rows = S.guesses.length ? S.guesses.map(g => this._rowHtml(g)).join('') : '<p class="wh-sub" style="text-align:center">Elige un jugador para empezar. ¡El primero en adivinar gana!</p>';
    const input = S.out
      ? '<div class="wh-wait-line">Te quedaste sin intentos. Esperando al rival…</div>'
      : `<div class="wd-input"><input id="wd-q" class="wh-input" placeholder="Busca un jugador o equipo…" autocomplete="off" value="${this._esc(S.q)}"><div id="wd-list" class="wd-list">${this._suggest()}</div></div>`;
    return `${top}${legend}${this._hint()}<div class="wd-rows" id="wd-rows">${rows}</div>${input}`;
  },
  _viewEnd() {
    const S = this.S, r = S.result || {}, sec = this._byId(S.secret);
    const title = r.kind === 'win' ? '¡GANASTE!' : r.kind === 'lose' ? 'PERDISTE' : r.kind === 'draw' ? 'EMPATE' : 'PARTIDA TERMINADA';
    const cls = r.kind === 'win' ? 'win' : r.kind === 'lose' ? 'lose' : '';
    const reveal = sec ? `<div class="wd-reveal">${this._face(sec, 'big')}<div><small>El jugador era</small><b>${this._esc(sec.name)}</b><span>${this._esc(sec.team)} · ${this._esc(sec.pos)} · ${sec.rating}</span></div></div>` : '';
    const rows = S.guesses.length ? `<details class="wh-board"><summary>Ver mis ${S.guesses.length} intentos</summary><div class="wd-rows">${S.guesses.map(g => this._rowHtml(g)).join('')}</div></details>` : '';
    const again = S.oppGone ? '<p class="wh-sub">Tu rival salió de la sala</p>'
      : `<button class="btn btn-primary" id="wd-again" ${S.again ? 'disabled' : ''}>${S.again ? 'Esperando al rival…' : '🔁 Revancha'}</button>${S.oppAgain && !S.again ? '<p class="wh-sub">🔁 Tu rival quiere la revancha</p>' : ''}`;
    return `<div class="wh-end ${cls}"><h2>${title}</h2><p class="wh-sub">${this._esc(r.why || '')}</p>${reveal}${rows}<div class="wh-rew">${S.rw ? S.rw.html : r.kind === 'win' ? '<p class="wh-sub">⏳ Calculando tu recompensa…</p>' : `<p class="wh-sub">${P2PRewards.loserNote}</p>`}</div><div class="wh-row" style="justify-content:center">${again}<button class="btn" id="wd-leave">Salir</button></div></div>`;
  },
  render(keepFocus = false) {
    if (!this.ov || !this.S) return;
    const S = this.S, hadFocus = keepFocus || document.activeElement?.id === 'wd-q';
    const head = `<div class="wh-head"><b>🟩 Wordle de fútbol</b><span class="wh-code">Sala ${P2P.code || ''}${P2P.viaRelay ? ' · relevo' : ''}</span><button class="wh-x" id="wd-exit" aria-label="Salir">✕</button></div>`;
    const body = S.phase === 'wait' ? this._viewWait() : S.phase === 'play' ? this._viewPlay() : this._viewEnd();
    const keepScroll = this.ov.querySelector('.wh-body')?.scrollTop || 0;
    this.ov.innerHTML = `<div class="wh-box">${head}<div class="wh-body">${body}</div></div>`;
    const bodyEl = this.ov.querySelector('.wh-body'); if (bodyEl) bodyEl.scrollTop = S.phase === 'play' ? keepScroll : 0;
    this.ov.querySelector('#wd-exit').onclick = () => {
      if (S.phase !== 'play') return this.close(true);
      HeadCards._dialog({ icon: '🚪', title: '¿Salir de la partida?', text: 'Si sales, tu rival ganará por abandono.', cancel: 'Seguir jugando', ok: 'Salir', onOk: () => this.close(true) });
    };
    const leave = this.ov.querySelector('#wd-leave'); if (leave) leave.onclick = () => { this.close(true); if (typeof Online !== 'undefined' && document.getElementById('tab-battle')) Online.open(); };
    const ag = this.ov.querySelector('#wd-again'); if (ag) ag.onclick = () => this._again();
    const q = this.ov.querySelector('#wd-q');
    if (q) {
      const list = this.ov.querySelector('#wd-list');
      const wire = () => list.querySelectorAll('.wd-opt').forEach(b => b.onclick = () => this._guess(b.dataset.id));
      q.oninput = () => { S.q = q.value; list.innerHTML = this._suggest(); wire(); };
      q.onkeydown = e => { if (e.key === 'Enter') { const first = list.querySelector('.wd-opt'); if (first) this._guess(first.dataset.id); } };
      wire();
      if (hadFocus) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
    }
    const rows = this.ov.querySelector('#wd-rows'); if (rows && S.phase === 'play') rows.scrollTop = rows.scrollHeight;
  }
};
