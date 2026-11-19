// headcards.js
// --------------------------------------------------
// "Head Cards": duelo 1v1 estilo Head Soccer. Las stats salen de la carta
// elegida del gacha:
//   rating  -> base de velocidad / salto / potencia
//   rareza  -> multiplicador (común x1.00 … GOAT x1.28)
//   posición-> especialidad (DEL tiro, MED velocidad, DEF cabeza grande, POR salto + alcance)
// Rivales: CPU (3 niveles), carta de otro jugador online (IA) o 2 jugadores local.
// Física a paso fijo (60 Hz) -> el juego va igual en cualquier pantalla.

const HeadCards = {
  // Porterías el doble de altas (100 -> 200) para evitar el "camping" bajo el arco.
  W: 800, H: 420, GROUND: 366, GW: 54, BAR: 366 - 200,
  MULT: { common: 1, rare: 1.07, epic: 1.14, legendary: 1.24, goat: 1.38 },
  COLORS: { common: '#7d8fb3', rare: '#3d8bff', epic: '#a35bff', legendary: '#ffc83d', goat: '#ff3355' },
  POS: {
    DEL: { speed: 1.00, jump: 1.00, power: 1.25, size: 1.00, label: 'Delantero · tiro letal' },
    MED: { speed: 1.15, jump: 1.05, power: 1.05, size: 1.00, label: 'Mediocampista · veloz' },
    DEF: { speed: 0.95, jump: 1.00, power: 1.00, size: 1.15, label: 'Defensa · cabeza grande' },
    POR: { speed: 0.92, jump: 1.22, power: 0.90, size: 1.25, label: 'Portero · salto y alcance' },
  },

  statsOf(card) {
    const b = Math.max(0, Math.min(1, ((card.rating || 75) - 70) / 28));
    const m = this.MULT[card.rareza] || 1, p = this.POS[card.pos] || this.POS.MED;
    return {
      speed: 4.5 * (1 + 0.25 * b) * m * p.speed,
      jump: 12.6 * (1 + 0.10 * b) * Math.sqrt(m) * p.jump,
      power: 10.5 * (1 + 0.25 * b) * Math.sqrt(m) * p.power,
      r: 29 * p.size * (1 + 0.04 * (m - 1) * 10 * 0.25),
      skill: b, mult: m, label: p.label
    };
  },

  _photos: {},
  _photo(card) {
    if (this._photos[card.id] !== undefined) return this._photos[card.id];
    this._photos[card.id] = null;
    Promise.resolve(API.getPhotoById(card.id)).then(url => {
      if (!url) return; const im = new Image(); im.referrerPolicy = 'no-referrer';
      im.onload = () => { this._photos[card.id] = im; }; im.src = url;
    }).catch(() => {});
    return null;
  },

  // ------------------------------------------------ UI: selección
  async open(mode) {
    this._mode = mode; this._started = false; this._myReady = false; this.state = null;
    const user = await Auth.currentUser(); this._user = user;
    const lock = this._lockLeft();
    if (lock > 0) { if (mode?.type === 'p2p') P2P.close(); this._lockedDialog(lock); return; }
    const owned = [...(user.figuritas || [])].sort((a, b) => this._power(b) - this._power(a));
    this._owned = owned;
    this._sel = owned.find(f => f.id === user.headFighterId) || owned[0];
    const ov = document.createElement('div'); ov.className = 'hc-overlay'; ov.id = 'hc-overlay';
    document.body.appendChild(ov); this._ov = ov; document.body.style.overflow = 'hidden';
    this._pick();
  },
  _power(c) { const s = this.statsOf(c); return s.speed * 2 + s.jump + s.power; },
  close() {
    document.getElementById('hc-dlg')?.remove(); this._paused = false;
    if (this._mode?.type === 'p2p') P2P.close();
    this._stop(); this._ov?.remove(); this._ov = null; document.body.style.overflow = '';
    if (typeof Online !== 'undefined' && document.getElementById('tab-battle')) Online.open();
  },

  // ------------------------------------------------ abandono: aviso y penalización
  // 1 abandono al día = solo advertencia. 2.º abandono el mismo día = 2 h sin jugar Head Cards.
  LOCK_MS: 2 * 60 * 60 * 1000,
  _abKey() { return 'wcc_hc_abandon_' + (this._user?.uid || this._user?.email || 'anon'); },
  _abLoad() {
    const today = new Date().toDateString();
    try { const d = JSON.parse(localStorage.getItem(this._abKey()) || 'null') || {}; return { day: today, count: d.day === today ? (d.count || 0) : 0, until: d.until || 0 }; }
    catch (_) { return { day: today, count: 0, until: 0 }; }
  },
  _abSave(d) { try { localStorage.setItem(this._abKey(), JSON.stringify(d)); } catch (_) {} },
  _lockLeft() { return Math.max(0, this._abLoad().until - Date.now()); },
  _fmtLeft(ms) { const m = Math.ceil(ms / 60000), h = Math.floor(m / 60); return h ? `${h} h ${m % 60} min` : `${m} min`; },
  _recordAbandon() {
    const d = this._abLoad(); d.count++;
    if (d.count >= 2) d.until = Date.now() + this.LOCK_MS;
    this._abSave(d); return d;
  },
  // Diálogo propio (reemplaza confirm() del navegador). Reutilizable por otros juegos.
  _dialog({ icon = '⚠️', title, text, ok = 'Aceptar', cancel = null, danger = false, onOk, onCancel }) {
    document.getElementById('hc-dlg')?.remove();
    const d = document.createElement('div'); d.className = 'hc-dlg'; d.id = 'hc-dlg';
    d.innerHTML = `<div class="hc-dlg-box ${danger ? 'danger' : ''}" role="alertdialog" aria-modal="true">
      <div class="hc-dlg-ic">${icon}</div><h3>${title}</h3><p>${text}</p>
      <div class="hc-dlg-btns">${cancel ? `<button class="btn btn-primary" id="hc-dlg-no">${cancel}</button>` : ''}<button class="btn ${cancel ? '' : 'btn-primary'}" id="hc-dlg-ok">${ok}</button></div></div>`;
    document.body.appendChild(d);
    const done = cb => () => { d.remove(); cb?.(); };
    d.querySelector('#hc-dlg-ok').onclick = done(onOk);
    const no = d.querySelector('#hc-dlg-no'); if (no) { no.onclick = done(onCancel); no.focus(); } else d.querySelector('#hc-dlg-ok').focus();
    return d;
  },
  _lockedDialog(ms) {
    const at = new Date(Date.now() + ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    this._dialog({ icon: '⏳', danger: true, title: 'Head Cards bloqueado', text: `Abandonaste 2 partidas hoy. Podrás volver a jugar en <b>${this._fmtLeft(ms)}</b> (a las ${at}).`, ok: 'Entendido' });
  },
  // Pedir salir: antes de empezar o con la partida terminada se sale directo.
  _requestExit() {
    if (document.getElementById('hc-dlg')) { document.getElementById('hc-dlg').remove(); this._paused = false; return; }
    const m = this._mode, playing = this.state && this.state !== 'end' && this.p1;
    if (!playing || m.type === 'local') return this.close();
    const first = this._abLoad().count === 0, online = m.type === 'p2p';
    if (!online) this._paused = true;
    this._dialog({
      icon: first ? '⚠️' : '🚫', danger: !first,
      title: '¿Salir de la partida?',
      text: (first
        ? 'Por <b>esta vez</b> no pasa nada: solo puedes abandonar <b>1 vez al día</b> sin penalización. Si abandonas una 2.ª vez hoy, <b>no podrás jugar Head Cards por 2 horas</b>.'
        : 'Ya abandonaste una partida hoy. Si sales ahora quedarás <b>2 horas sin poder jugar Head Cards</b>.')
        + (online ? '<br><small>Tu rival ganará por abandono.</small>' : ''),
      cancel: 'Seguir jugando', ok: first ? 'Salir' : 'Salir y aceptar penalización',
      onCancel: () => { this._paused = false; this._last = performance.now(); },
      onOk: () => { const d = this._recordAbandon(); this._paused = false; this.close(); if (d.until > Date.now()) Toast.error('Penalización: 2 horas sin jugar Head Cards', 4500); else Toast.warn('Abandono registrado. El próximo abandono de hoy tendrá penalización', 4500); }
    });
  },
  _bar(label, v, max) { return `<div class="hc-stat"><span>${label}</span><i><b style="width:${Math.min(100, v / max * 100)}%"></b></i></div>`; },
  _pick() {
    const m = this._mode, label = { easy: 'CPU Fácil', normal: 'CPU Normal', hard: 'CPU Difícil', local: '2 Jugadores', online: 'vs ' + (m.rival?.name || ''), p2p: 'Sala online' }[m.type];
    const s = this.statsOf(this._sel);
    this._ov.innerHTML = `
      <div class="hc-pick">
        <button class="hc-x" id="hc-close">✕</button>
        <h2>Elige tu luchador <small>${label}</small></h2>
        <div class="hc-preview" style="--c:${this.COLORS[this._sel.rareza]}">
          <div class="hc-prev-head" id="hc-prev-head">${this._sel.emoji?.[0] || '⚽'}</div>
          <div><h3>${this._sel.name}</h3><p>${s.label} · ${Gacha.getRarityLabel(this._sel.rareza)} · ${this._sel.rating}</p>
          ${this._bar('Velocidad', s.speed, 7)}${this._bar('Salto', s.jump, 17)}${this._bar('Potencia', s.power, 20)}${this._bar('Tamaño', s.r, 40)}</div>
        </div>
        <div class="hc-grid">${this._owned.map(f => `
          <button class="hc-card ${f.id === this._sel.id ? 'sel' : ''}" data-id="${f.id}" style="--c:${this.COLORS[f.rareza]}">
            <b>${f.rating}</b><span>${f.pos}</span><small>${f.name.split(' ').slice(-1)[0]}</small></button>`).join('')}</div>
        <button class="btn btn-primary hc-go" id="hc-go">¡Jugar!</button>
      </div>`;
    this._ov.querySelector('#hc-close').onclick = () => this.close();
    this._ov.querySelectorAll('.hc-card').forEach(b => b.onclick = () => { this._sel = this._owned.find(f => f.id === b.dataset.id); this._pick(); });
    this._ov.querySelector('#hc-go').onclick = () => this._mode.type === 'p2p' ? this._p2pReady() : this._start();
    const ph = this._photo(this._sel), head = this._ov.querySelector('#hc-prev-head');
    const t = setInterval(() => { const im = this._photos[this._sel.id]; if (im) { head.style.backgroundImage = `url(${im.src})`; head.textContent = ''; clearInterval(t); } }, 150); setTimeout(() => clearInterval(t), 4000);
  },

  // ------------------------------------------------ P2P (sala con código)
  _brief(c) { return { id: c.id, name: c.name, rareza: c.rareza, rating: c.rating, pos: c.pos, emoji: c.emoji }; },
  _p2pReady() {
    this._myReady = true; P2P.send({ t: 'card', card: this._brief(this._sel) }, true);
    this._ov.querySelector('#hc-go').textContent = 'Esperando al rival…'; this._ov.querySelector('#hc-go').disabled = true;
    this._tryGo();
  },
  _tryGo() { if (this._myReady && this._remoteCard && P2P.role === 'host' && !this._started) { this._started = true; P2P.send({ t: 'go' }, true); this._start(); } },
  _snap() {
    const f = p => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, dir: p.dir, kick: p.kick, meter: p.meter, run: p.run, score: p.score, squash: p.squash }), b = this.ball;
    return { a: f(this.p1), c: f(this.p2), b: { x: b.x, y: b.y, rot: b.rot, fire: b.fire }, time: this.time, st: this.state, stT: this.stT, ex: this.extra, bn: this.banner, sh: this.shake };
  },
  _onMsg(m) {
    if (m.t === 'card') { this._remoteCard = m.card; this._tryGo(); }
    else if (m.t === 'go') { if (this._myReady && this._remoteCard && !this._started) { this._started = true; this._start(); } }
    else if (m.t === 'rm') { this._rmRemote = true; const n = this._ov?.querySelector('#hc-rnote'); if (n && this.state === 'end') n.textContent = '🔁 Tu rival quiere la revancha'; this._rmCheck(); }
    else if (m.t === 'in') this.remoteIn = m.i;
    else if (m.t === 's' && this._guest && this.p1) {
      const s = m.s; Object.assign(this.p1, s.a); Object.assign(this.p2, s.c); Object.assign(this.ball, s.b);
      this.ball.trail.push([s.b.x, s.b.y]); if (this.ball.trail.length > 10) this.ball.trail.shift();
      this.time = s.time; this.state = s.st === 'end' ? this.state : s.st; this.stT = s.stT; this.extra = s.ex; this.banner = s.bn; this.shake = s.sh;
    } else if (m.t === 'end' && this._guest) { this.p1.score = m.a; this.p2.score = m.b; this._finish(); }
  },
  _p2pClosed() {
    if (!this._ov) return;
    if (this.state === 'end') { // ya terminó: el rival salió de la sala (no cuenta como victoria nueva)
      const ag = this._ov.querySelector('#hc-again'), n = this._ov.querySelector('#hc-rnote');
      if (ag) { ag.disabled = true; ag.textContent = 'El rival salió'; }
      if (n) n.textContent = 'Tu rival salió de la sala';
      this._rmMine = this._rmRemote = false; return;
    }
    if (this.state && this.p1 && this._mode?.type === 'p2p') {
      if (navigator.onLine === false) { Toast.warn('Perdiste la conexión'); return this.close(); }
      Toast.warn('El rival se desconectó. ¡Ganas la partida!');
      return this._finish(true);
    }
    Toast.warn('El rival se desconectó'); this.close();
  },

  // ------------------------------------------------ juego
  _mk(card, side, human) {
    const st = this.statsOf(card);
    return { card, st, side, human, x: side < 0 ? 170 : this.W - 170, y: this.GROUND - st.r - 20, vx: 0, vy: 0, r: st.r,
      dir: -side, ground: true, kick: 0, cd: 0, meter: 0, run: 0, score: 0, ai: { tx: 0, t: 0 }, squash: 0 };
  },
  _rivalCard() {
    const m = this._mode, mine = this._sel;
    if (m.type === 'online') return { ...m.rival.fighter };
    if (m.type === 'local') return { ...mine, id: mine.id, name: 'Jugador 2' };
    const lvl = { easy: ['common', 76], normal: ['rare', 84], hard: ['epic', 90] }[m.type];
    const pool = Gacha.getPool().filter(f => f.rareza === lvl[0]);
    return { ...pool[Math.floor(Math.random() * pool.length)] };
  },
  _start() {
    this._user.headFighterId = this._sel.id; Auth.updateUser(this._user).catch(() => {});
    const p2p = this._mode.type === 'p2p', guest = p2p && P2P.role === 'guest';
    this._guest = guest; this._tick = 0; this.remoteIn = null;
    const c1 = guest ? this._remoteCard : this._sel;
    const rc = p2p ? (guest ? this._sel : this._remoteCard) : this._rivalCard();
    this.p1 = this._mk(c1, -1, true); this.p2 = this._mk(rc, 1, this._mode.type === 'local');
    this.p1.dir = 1; this.p2.dir = -1;
    this.ball = { x: this.W / 2, y: 160, vx: 0, vy: 0, r: 15, rot: 0, fire: 0, trail: [] };
    this.parts = []; this.shake = 0; this.time = 60; this.state = 'intro'; this.stT = 3.2; this.slow = 1; this.banner = null; this.extra = false;
    this.keys = {}; this.touch = {};
    this.level = this._mode.type === 'hard' ? 0.95 : this._mode.type === 'easy' ? 0.35 : this._mode.type === 'online' ? 0.45 + this.p2.st.skill * 0.6 : 0.72;
    this._ov.innerHTML = `
      <div class="hc-stage"><button class="hc-x" id="hc-close">✕</button>
        <canvas id="hc-canvas"></canvas>
        <div class="hc-touch" id="hc-touch">
          <div><button data-k="left">◀</button><button data-k="right">▶</button></div>
          <div><button data-k="jump">⤒</button><button data-k="kick">⚽</button></div>
        </div>
        <p class="hc-rotate">📱 Gira el teléfono en horizontal para jugar mejor</p>
        <p class="hc-help">A/D o ←/→ mover · W/↑ saltar · Espacio patear · Con la barra llena el tiro es SÚPER${this._mode.type === 'local' ? ' · J2: ←/→/↑ + Enter' : ''}</p>
      </div>`;
    this._ov.querySelector('#hc-close').onclick = () => this._requestExit();
    const cv = this._cv = this._ov.querySelector('#hc-canvas'); this._ctx = cv.getContext('2d');
    this._fit(); this._bg = this._buildBg();
    this._kd = e => { this.keys[e.code] = true; if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); if (e.code === 'Escape') this._requestExit(); };
    this._ku = e => { this.keys[e.code] = false; };
    addEventListener('keydown', this._kd); addEventListener('keyup', this._ku); addEventListener('resize', this._rs = () => this._fit());
    this._ov.querySelectorAll('.hc-touch button').forEach(b => {
      const on = v => e => { e.preventDefault(); this.touch[b.dataset.k] = v; };
      b.addEventListener('pointerdown', on(true)); b.addEventListener('pointerup', on(false)); b.addEventListener('pointerleave', on(false)); b.addEventListener('pointercancel', on(false));
    });
    this._photo(this.p1.card); this._photo(this.p2.card);
    this._last = performance.now(); this._acc = 0; this._raf = requestAnimationFrame(t => this._loop(t));
  },
  _stop() {
    cancelAnimationFrame(this._raf); this._raf = 0;
    removeEventListener('keydown', this._kd); removeEventListener('keyup', this._ku); removeEventListener('resize', this._rs);
  },
  _fit() {
    const coarse = matchMedia('(pointer:coarse)').matches;
    this._sc = Arcade.fitStage(this._ov.querySelector('.hc-stage'), this._cv, this.W, this.H, coarse ? 96 : 44).sc;
  },
  _loop(now) {
    if (!this._raf) return;
    if (this._paused) { this._last = now; this._acc = 0; this._draw(); this._raf = requestAnimationFrame(t => this._loop(t)); return; }
    this._acc += Math.min(0.05, (now - this._last) / 1000); this._last = now;
    if (this._guest) {
      this._acc = 0; if ((this._tick++ & 1) === 0) { const i = this._input(this.p1); P2P.send({ t: 'in', i: { l: !!i.l, r: !!i.r, j: !!i.j, k: !!i.k } }); }
    } else {
      while (this._acc >= 1 / 60) { this._step(1 / 60); this._acc -= 1 / 60; }
      if (this._mode.type === 'p2p' && (this._tick++ & 1) === 0) P2P.send({ t: 's', s: this._snap() });
    }
    this._draw(); this._raf = requestAnimationFrame(t => this._loop(t));
  },

  // ---- entrada / IA
  _input(p) {
    const k = this.keys, t = this.touch, mode = this._mode.type;
    if (p === this.p1) {
      const arrows = mode !== 'local';
      return { l: k.KeyA || t.left || (arrows && k.ArrowLeft), r: k.KeyD || t.right || (arrows && k.ArrowRight),
        j: k.KeyW || t.jump || (arrows && k.ArrowUp), k: k.Space || t.kick || k.KeyF };
    }
    if (mode === 'p2p') return this.remoteIn || {};
    if (mode === 'local') return { l: k.ArrowLeft, r: k.ArrowRight, j: k.ArrowUp, k: k.Enter || k.NumpadEnter };
    return this._ai(p);
  },
  // IA independiente del lado: trabaja en coordenadas "espejo" (su portería siempre a la derecha).
  _ai(p) {
    const s = p.side, W = this.W, mx = x => (s > 0 ? x : W - x), B = this.ball;
    const b = { x: mx(B.x), y: B.y, vx: s > 0 ? B.vx : -B.vx, vy: B.vy }, px = mx(p.x), a = p.ai, L = this.level, home = W - 150;
    a.t -= 1 / 60;
    if (a.t <= 0) { a.t = 0.12 + (1 - L) * 0.25; a.tx = Math.max(60, Math.min(W - 60, b.x + b.vx * (2 + 3 * L))) + (Math.random() - 0.5) * (1 - L) * 130; }
    const ballOnMySide = b.x > W * (0.42 - 0.1 * L);
    const target = ballOnMySide ? a.tx + 26 : home;
    const dx = target - px, near = Math.hypot(b.x - px, b.y - p.y);
    const foot = Math.hypot(b.x - (px - (p.r * 0.5 + 24)), b.y - (p.y + p.r + 2));
    const l = dx < -8, r = dx > 8;
    const j = ballOnMySide && Math.abs(b.x - px) < 80 && b.y < p.y + 10 && b.vy > -2 && Math.random() < 0.05 + 0.1 * L;
    const k = b.x < px + 8 && (foot < 52 || near < p.r + 50) && Math.random() < 0.25 + 0.5 * L;
    return s > 0 ? { l, r, j, k } : { l: r, r: l, j, k };
  },

  // ---- física
  _step(dt) {
    if (this.state === 'end') return;
    const ts = this.slow; this.slow += (1 - this.slow) * 0.03;
    this.stT -= dt;
    if (this.state === 'intro') { if (this.stT <= 0) { this.state = 'play'; this._beep(880, .12); } this._partsStep(); return; }
    if (this.state === 'goal') { this._partsStep(); this._ballStep(ts, true); if (this.stT <= 0) this._reset(); return; }
    this.time -= dt;
    (Math.random() < .5 ? [this.p1, this.p2] : [this.p2, this.p1]).forEach(p => this._playerStep(p, this._input(p), ts));
    this._ballStep(ts);
    this._partsStep();
    this.shake *= 0.9;
    if (this.time <= 0 && !this.extra) { if (this.p1.score !== this.p2.score) this._finish(); else { this.extra = true; this.time = 30; this.banner = { t: 1.6, txt: 'TIEMPO EXTRA · GOL DE ORO' }; } }
    else if (this.time <= 0 && this.extra) this._finish();
  },
  _playerStep(p, inp, ts) {
    const st = p.st, g = 0.62 * ts;
    const mv = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    p.vx += (mv * st.speed - p.vx) * 0.28 * ts;
    if (mv) { p.dir = mv; p.run += 0.35 * ts * Math.abs(mv); } else p.run *= 0.9;
    if (inp.j && p.ground) { p.vy = -st.jump; p.ground = false; this._dust(p.x, this.GROUND, 6); p.squash = -1; }
    p.vy += g; p.x += p.vx * ts; p.y += p.vy * ts;
    const floor = this.GROUND - p.r - 20;
    if (p.y >= floor) { if (!p.ground && p.vy > 4) { this._dust(p.x, this.GROUND, 8); p.squash = 1; } p.y = floor; p.vy = 0; p.ground = true; }
    p.x = Math.max(p.r, Math.min(this.W - p.r, p.x));
    p.cd -= 1 / 60; if (p.kick > 0) p.kick -= 1 / 60 * ts;
    if (inp.k && p.cd <= 0) { p.kick = 0.22; p.cd = 0.42; p.superKick = p.meter >= 100; this._beep(220, .05); }
    p.squash *= 0.85;
    // colisión cabeza-balón
    const b = this.ball, dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy), min = p.r + b.r;
    if (d < min && d > 0.001) {
      const nx = dx / d, ny = dy / d; b.x = p.x + nx * min; b.y = p.y + ny * min;
      const rv = (b.vx - p.vx) * nx + (b.vy - p.vy) * ny;
      if (rv < 0) { b.vx -= 1.7 * rv * nx; b.vy -= 1.7 * rv * ny; }
      b.vx += p.vx * 0.5 + nx * st.power * 0.18; b.vy += p.vy * 0.4 + ny * st.power * 0.12 - 1.2;
      p.meter = Math.min(100, p.meter + 14); this._spark(b.x, b.y, 6, '#fff'); this._beep(300, .04); this.shake = Math.max(this.shake, 2.5);
    }
    // botín: pegado a la cabeza (sube y baja con ella) y solo golpea hacia donde mira
    const bt = this._boot(p);
    if (p.kick > 0) {
      const fd = Math.hypot(b.x - bt.x, b.y - bt.y);
      if (fd < 16 + b.r + 4 && !p.hit) {
        p.hit = true;
        const sup = p.superKick, pw = st.power * (sup ? 1.7 : 1) * 1.1;
        // dirección: mezcla "adelante y un poco arriba" con la normal del contacto -> rebote predecible
        let nx = b.x - bt.x, ny = b.y - bt.y; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
        let dx = 0.7 * p.dir + 0.3 * nx, dy = -0.38 + 0.3 * ny; const dl = Math.hypot(dx, dy) || 1;
        if (dx * p.dir < 0.25) dx = 0.25 * p.dir;                      // nunca hacia atrás
        b.vx = dx / dl * pw + p.vx * 0.3; b.vy = dy / dl * pw + Math.min(0, p.vy) * 0.2;
        if (sup) { b.fire = 1.6; p.meter = 0; this.shake = 9; this.banner = { t: 0.9, txt: '¡SÚPER TIRO!' }; this._spark(b.x, b.y, 24, '#ff8a1f'); this._beep(120, .25); }
        else { p.meter = Math.min(100, p.meter + 22); this._spark(b.x, b.y, 10, '#ffd24d'); this.shake = 4; }
      }
    } else {
      p.hit = false;
      // el botín en reposo también es sólido (rebote suave)
      const dx = b.x - bt.x, dy = b.y - bt.y, d = Math.hypot(dx, dy), min = 11 + b.r;
      if (d < min && d > 0.001) { const nx = dx / d, ny = dy / d; b.x = bt.x + nx * min; b.y = bt.y + ny * min; const rv = (b.vx - p.vx) * nx + (b.vy - p.vy) * ny; if (rv < 0) { b.vx -= 1.4 * rv * nx; b.vy -= 1.4 * rv * ny; } }
    }
  },
  // posición del botín respecto a la cabeza (nunca depende del suelo)
  _boot(p) {
    const sw = p.kick > 0 ? 1 - p.kick / 0.22 : 0, a = Math.sin(sw * Math.PI);
    return { x: p.x + p.dir * (p.r * 0.5 + 9 + 24 * a), y: p.y + p.r + 8 - 11 * a, a, sw };
  },
  _ballStep(ts, still) {
    const b = this.ball, W = this.W, G = this.GROUND, GW = this.GW, BAR = this.BAR;
    b.vy += 0.42 * ts; b.vx *= 0.9985; b.x += b.vx * ts; b.y += b.vy * ts; b.rot += b.vx * 0.03 * ts;
    if (b.fire > 0) { b.fire -= 1 / 60; if (Math.random() < 0.8) this.parts.push({ x: b.x, y: b.y, vx: -b.vx * 0.05, vy: (Math.random() - .5) * 2, l: 0.4, c: Math.random() < .5 ? '#ff6a00' : '#ffd24d', s: 7 }); }
    b.trail.push([b.x, b.y]); if (b.trail.length > 10) b.trail.shift();
    if (b.y > G - b.r) { b.y = G - b.r; if (Math.abs(b.vy) > 2) this._dust(b.x, G, 3); b.vy *= -0.72; b.vx *= 0.985; if (Math.abs(b.vy) < 1) b.vy = 0; }
    if (b.y < b.r) { b.y = b.r; b.vy *= -0.8; }
    // travesaño de ambas porterías
    [[0, 1], [W, -1]].forEach(([x0, s]) => {
      const inX = s > 0 ? b.x < GW + b.r * 0.5 : b.x > W - GW - b.r * 0.5;
      if (inX && Math.abs(b.y - BAR) < b.r) { if (b.y < BAR) { b.y = BAR - b.r; b.vy = -Math.abs(b.vy) * 0.7; } else { b.y = BAR + b.r; b.vy = Math.abs(b.vy) * 0.5; } this._beep(520, .05); }
    });
    // pared / gol
    if (b.x < b.r) { if (b.y > BAR && !still) return this._goal(this.p2); b.x = b.r; b.vx *= -0.8; }
    if (b.x > W - b.r) { if (b.y > BAR && !still) return this._goal(this.p1); b.x = W - b.r; b.vx *= -0.8; }
    const sp = Math.hypot(b.vx, b.vy); if (sp > 20) { b.vx *= 20 / sp; b.vy *= 20 / sp; }
  },
  _goal(scorer) {
    scorer.score++; this.state = 'goal'; this.stT = 1.9; this.slow = 0.3; this.shake = 14;
    this.banner = { t: 1.9, txt: '¡¡GOOOL!!', sub: scorer.card.name };
    const col = this.COLORS[scorer.card.rareza];
    for (let i = 0; i < 70; i++) this.parts.push({ x: scorer.side < 0 ? this.W - 40 : 40, y: this.BAR + 30, vx: (Math.random() - .5) * 10, vy: -Math.random() * 11, l: 1.6, c: [col, '#fff', '#ffd24d'][i % 3], s: 5, g: .3 });
    this._beep(660, .35);
    if (this.extra) setTimeout(() => this._finish(), 1500);
  },
  _reset() {
    if (this.state === 'end') return;
    const a = this.p1, c = this.p2;
    [a, c].forEach(p => { p.x = p.side < 0 ? 170 : this.W - 170; p.y = this.GROUND - p.r - 20; p.vx = p.vy = 0; p.meter *= 0.5; });
    Object.assign(this.ball, { x: this.W / 2, y: 140, vx: 0, vy: 0, fire: 0, trail: [] });
    this.state = 'play'; this.slow = 1;
  },

  // ---- efectos
  _dust(x, y, n) { for (let i = 0; i < n; i++) this.parts.push({ x, y, vx: (Math.random() - .5) * 3, vy: -Math.random() * 2, l: .4, c: 'rgba(220,230,255,.5)', s: 4 }); },
  _spark(x, y, n, c) { for (let i = 0; i < n; i++) this.parts.push({ x, y, vx: (Math.random() - .5) * 9, vy: (Math.random() - .5) * 9, l: .4, c, s: 3 }); },
  _partsStep() {
    this.parts.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += p.g || 0; p.l -= 1 / 60; });
    this.parts = this.parts.filter(p => p.l > 0);
    if (this.banner && (this.banner.t -= 1 / 60) <= 0) this.banner = null;
  },
  _beep(f, d) {
    try {
      const A = this._ac || (this._ac = new (window.AudioContext || window.webkitAudioContext)());
      const o = A.createOscillator(), g = A.createGain(); o.frequency.value = f; o.type = 'square'; g.gain.value = 0.03;
      g.gain.exponentialRampToValueAtTime(0.0001, A.currentTime + d); o.connect(g); g.connect(A.destination); o.start(); o.stop(A.currentTime + d);
    } catch (_) {}
  },

  // ---- fin de partida + recompensas
  // El resultado se muestra DE INMEDIATO (con "calculando recompensa…") y la recompensa se
  // rellena en cuanto se guarda; así el ganador siempre la ve, aunque la red tarde.
  async _finish(forfeit = false) {
    if (this.state === 'end') return; this.state = 'end';
    const g = this._guest, a = g ? this.p2.score : this.p1.score, b = g ? this.p1.score : this.p2.score, won = forfeit || a > b, draw = !forfeit && a === b, m = this._mode;
    if (m.type === 'p2p' && !g && !forfeit) P2P.send({ t: 'end', a: this.p1.score, b: this.p2.score }, true);
    this._rmMine = this._rmRemote = false;
    const col = won ? '#3ddc84' : draw ? '#ffd24d' : '#ff4d6d', p2p = m.type === 'p2p', stage = this._ov?.querySelector('.hc-stage');
    if (!stage) return;
    stage.insertAdjacentHTML('beforeend', `
      <div class="hc-result" style="--c:${col}"><h2>${won ? '¡VICTORIA!' : draw ? 'EMPATE' : 'DERROTA'}</h2>
        <div class="hc-final">${a} - ${b}</div>
        <div class="hc-rew" id="hc-rew">${m.type === 'local' ? '<p>Partida local sin recompensas</p>' : '<p class="hc-rew-wait">⏳ Calculando tu recompensa…</p>'}</div>
        ${forfeit ? '<small>El rival se desconectó: ganas por abandono</small>' : ''}<small id="hc-rnote"></small>
        <div class="hc-rbtns">${forfeit ? '' : '<button class="btn btn-primary" id="hc-again">Revancha</button>'}<button class="btn" id="hc-exit">Salir</button></div></div>`);
    const again = this._ov.querySelector('#hc-again');
    if (again) again.onclick = () => {
      if (!p2p) { this._stop(); return this._pick(); }
      // P2P: la revancha es de a dos. Solo empieza cuando AMBOS la aceptan (nadie sale de la sala por pedirla).
      this._rmMine = true; P2P.send({ t: 'rm' }, true);
      again.disabled = true; again.textContent = 'Esperando al rival…'; this._rmCheck();
    };
    this._ov.querySelector('#hc-exit').onclick = () => this.close();

    // ---- recompensas (se guardan después de mostrar el resultado)
    let coins = 0, pts = 0, note = '', saved = true, used = 0;
    if (m.type !== 'local') {
      try {
        const u = await Auth.currentUser();
        if (won) {
          pts = { easy: 5, normal: 12, hard: 20, online: 25, p2p: 10 }[m.type] + (m.type === 'online' && (m.rival.headPts || 0) > (u.headPts || 0) ? 10 : 0);
          coins = { easy: 10, normal: 20, hard: 35, online: 40, p2p: 0 }[m.type];
          if (coins > 0 && !BattleAttempts.consume('headrewards')) { coins = 0; note = 'Ya cobraste las 2 recompensas de monedas de hoy (los puntos sí cuentan).'; }
          if (p2p) {
            if (P2PRewards.left(u) > 0) u.p2pRw = { d: P2PRewards._day(), n: P2PRewards.used(u) + 1 };
            else { pts = 0; note = `Llegaste al tope de ${P2PRewards.CAP} premios P2P de hoy (la victoria sí cuenta).`; }
          }
          u.headWins = (u.headWins || 0) + 1;
        } else if (draw) pts = 3; else { u.headLosses = (u.headLosses || 0) + 1; if (m.type === 'online') pts = -8; }
        u.headPts = Math.max(0, (u.headPts || 0) + pts); u.monedas = (u.monedas || 0) + coins; u.headFighterId = this._sel.id;
        used = P2PRewards.used(u);
        await Auth.updateUser(u); Online.syncProfile(u, true); App.refreshHeader?.(u);
      } catch (_) { saved = false; pts = 0; coins = 0; note = ''; }
      const box = this._ov?.querySelector('#hc-rew');
      if (box) box.innerHTML = !saved ? P2PRewards.errHtml()
        : `<div class="hc-chips"><span class="hc-chip ${pts < 0 ? 'neg' : 'pts'}">${pts >= 0 ? '+' : ''}${pts} PTS</span>${coins ? `<span class="hc-chip coin">+${coins} 🪙</span>` : ''}</div>`
          + (p2p ? `<p class="hc-rew-sub">Duelo con amigo: solo suma puntos (sin monedas) · Premios P2P de hoy: ${used}/${P2PRewards.CAP}</p>` : '');
      const n = this._ov?.querySelector('#hc-rnote'); if (n && note) n.textContent = note;
    }
  },
  // ---- revancha P2P (ambos deben aceptar)
  _rmCheck() { if (this._rmMine && this._rmRemote) { this._rmMine = this._rmRemote = false; this._rematch(); } },
  _rematch() {
    this._stop(); this._started = false; this._myReady = false; this._remoteCard = null; this.remoteIn = null;
    this.state = null; this.p1 = this.p2 = null; this._paused = false;
    this._pick();
  },

  // ------------------------------------------------ dibujo
  _buildBg() {
    const c = document.createElement('canvas'); c.width = this.W; c.height = this.H; const x = c.getContext('2d');
    const sky = x.createLinearGradient(0, 0, 0, this.GROUND); sky.addColorStop(0, '#050a1c'); sky.addColorStop(1, '#13264a'); x.fillStyle = sky; x.fillRect(0, 0, this.W, this.H);
    for (let i = 0; i < 1500; i++) { x.fillStyle = `hsla(${200 + Math.random() * 160},60%,${55 + Math.random() * 35}%,${0.25 + Math.random() * .4})`; x.fillRect(Math.random() * this.W, 60 + Math.random() * 200, 2, 2); }
    [90, 710].forEach(lx => { const g = x.createRadialGradient(lx, 30, 4, lx, 30, 260); g.addColorStop(0, 'rgba(255,255,230,.55)'); g.addColorStop(1, 'rgba(255,255,230,0)'); x.fillStyle = g; x.fillRect(0, 0, this.W, this.H); });
    for (let i = 0; i < 16; i++) { x.fillStyle = i % 2 ? '#1a8a3d' : '#1f9c46'; x.fillRect(i * 50, this.GROUND, 50, this.H - this.GROUND); }
    x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, this.GROUND, this.W, 4);
    x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 2; x.beginPath(); x.moveTo(this.W / 2, this.GROUND); x.lineTo(this.W / 2, this.GROUND + 54); x.stroke();
    return c;
  },
  _drawGoal(x, s) {
    const GW = this.GW, BAR = this.BAR, G = this.GROUND; x.save(); if (s < 0) { x.translate(this.W, 0); x.scale(-1, 1); }
    x.fillStyle = 'rgba(255,255,255,.06)'; x.fillRect(0, BAR, GW, G - BAR);
    x.strokeStyle = 'rgba(255,255,255,.28)'; x.lineWidth = 1;
    for (let i = 0; i <= GW; i += 9) { x.beginPath(); x.moveTo(i, BAR); x.lineTo(i, G); x.stroke(); }
    for (let j = BAR; j <= G; j += 9) { x.beginPath(); x.moveTo(0, j); x.lineTo(GW, j); x.stroke(); }
    x.strokeStyle = '#fff'; x.lineWidth = 5; x.beginPath(); x.moveTo(0, BAR); x.lineTo(GW, BAR); x.lineTo(GW, G); x.stroke(); x.restore();
  },
  _drawPlayer(x, p) {
    const col = this.COLORS[p.card.rareza], im = this._photos[p.card.id], r = p.r, G = this.GROUND, bt = this._boot(p);
    x.save();
    // sombra
    const hh = Math.max(0, Math.min(1, (G - (p.y + r + 18)) / 220));
    x.fillStyle = 'rgba(0,0,0,.32)'; x.beginPath(); x.ellipse(p.x, G + 2, r * (0.95 - hh * 0.45), 6 - hh * 2, 0, 0, 7); x.fill();
    // botín (se pivota sobre el tobillo y gira hacia adelante al patear)
    x.save(); x.translate(bt.x, bt.y); x.scale(p.dir * 1.3, 1.3); x.rotate(-0.1 + bt.a * 0.7);
    x.fillStyle = '#10131c'; x.beginPath(); x.moveTo(-13, -6); x.quadraticCurveTo(-13, 7, -8, 8); x.lineTo(12, 8); x.quadraticCurveTo(19, 7, 17, 0); x.quadraticCurveTo(10, -4, 4, -6); x.closePath(); x.fill();
    x.fillStyle = col; x.beginPath(); x.moveTo(5, -5); x.quadraticCurveTo(14, -2, 17, 1); x.quadraticCurveTo(18, 7, 12, 8); x.lineTo(4, 8); x.closePath(); x.fill();
    x.fillStyle = '#f5f7ff'; x.fillRect(-11, 8, 24, 2.4); x.fillStyle = 'rgba(255,255,255,.85)'; x.fillRect(-5, -3, 2.2, 7); x.fillRect(-1, -3, 2.2, 7);
    x.restore();
    // cabeza con foto (gira hacia donde mira)
    const sq = 1 + p.squash * 0.08;
    x.save(); x.translate(p.x, p.y); x.scale(1 / sq, sq);
    if (p.card.rareza === 'legendary' || p.card.rareza === 'goat') { x.shadowColor = col; x.shadowBlur = 18; }
    x.beginPath(); x.arc(0, 0, r, 0, 7); x.fillStyle = '#0d1430'; x.fill(); x.shadowBlur = 0;
    x.save(); x.beginPath(); x.arc(0, 0, r - 2, 0, 7); x.clip();
    if (im) { const s = (r * 2.3) / Math.min(im.width, im.height); x.save(); if (p.dir < 0) x.scale(-1, 1); x.drawImage(im, -im.width * s / 2, -r * 0.95, im.width * s, im.height * s); x.restore(); }
    else { x.fillStyle = col; x.globalAlpha = .35; x.fillRect(-r, -r, 2 * r, 2 * r); x.globalAlpha = 1; x.fillStyle = '#fff'; x.font = '700 ' + Math.round(r * 0.9) + 'px Bebas Neue, sans-serif'; x.textAlign = 'center'; x.fillText(String(p.card.rating || ''), 0, r * .3); }
    x.restore(); x.lineWidth = 4; x.strokeStyle = col; x.beginPath(); x.arc(0, 0, r - 1, 0, 7); x.stroke();
    x.restore();
    x.restore();
  },
  _draw() {
    const x = this._ctx, s = this._sc, b = this.ball;
    x.setTransform(s, 0, 0, s, 0, 0); x.clearRect(0, 0, this.W, this.H);
    x.save(); if (this.shake > .3) x.translate((Math.random() - .5) * this.shake, (Math.random() - .5) * this.shake);
    x.drawImage(this._bg, 0, 0);
    this._drawGoal(x, 1); this._drawGoal(x, -1);
    // sombra y estela del balón
    x.fillStyle = 'rgba(0,0,0,.3)'; const hh = Math.max(0, 1 - (this.GROUND - b.y) / 340); x.beginPath(); x.ellipse(b.x, this.GROUND + 2, 15 * hh + 4, 4, 0, 0, 7); x.fill();
    b.trail.forEach((t, i) => { x.globalAlpha = i / b.trail.length * (b.fire > 0 ? .6 : .25); x.fillStyle = b.fire > 0 ? '#ff7a1a' : '#fff'; x.beginPath(); x.arc(t[0], t[1], b.r * (i / b.trail.length), 0, 7); x.fill(); }); x.globalAlpha = 1;
    [this.p1, this.p2].forEach(p => this._drawPlayer(x, p));
    // balón
    x.save(); x.translate(b.x, b.y); x.rotate(b.rot); if (b.fire > 0) { x.shadowColor = '#ff6a00'; x.shadowBlur = 20; }
    x.fillStyle = '#fff'; x.beginPath(); x.arc(0, 0, b.r, 0, 7); x.fill(); x.shadowBlur = 0;
    x.fillStyle = '#1a1a1a'; for (let i = 0; i < 5; i++) { const a = i * 1.2566; x.beginPath(); x.arc(Math.cos(a) * 8, Math.sin(a) * 8, 3.4, 0, 7); x.fill(); } x.beginPath(); x.arc(0, 0, 4, 0, 7); x.fill(); x.restore();
    this.parts.forEach(p => { x.globalAlpha = Math.max(0, Math.min(1, p.l * 2)); x.fillStyle = p.c; x.fillRect(p.x, p.y, p.s, p.s); }); x.globalAlpha = 1;
    x.restore();
    this._hud(x);
  },
  _hud(x) {
    const W = this.W, p1 = this.p1, p2 = this.p2;
    x.fillStyle = 'rgba(5,10,28,.75)'; x.beginPath(); x.roundRect(W / 2 - 80, 8, 160, 46, 12); x.fill();
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.font = '700 30px Bebas Neue, sans-serif'; x.fillText(`${p1.score}  -  ${p2.score}`, W / 2, 40);
    x.font = '700 13px Barlow Condensed, sans-serif'; x.fillStyle = this.extra ? '#ff4d6d' : '#ffd24d'; x.fillText(this.extra ? 'GOL DE ORO' : `${Math.max(0, Math.ceil(this.time))}s`, W / 2, 52 - 0);
    x.textAlign = 'left'; x.fillStyle = '#fff'; x.font = '600 14px Barlow, sans-serif'; x.fillText(p1.card.name, 16, 24);
    x.textAlign = 'right'; x.fillText(p2.card.name, W - 16, 24);
    [[p1, 16, 'left'], [p2, W - 176, 'right']].forEach(([p, px]) => {
      x.fillStyle = 'rgba(255,255,255,.15)'; x.fillRect(px, 32, 160, 8); x.fillStyle = p.meter >= 100 ? '#ff8a1f' : '#4aa8ff'; x.fillRect(px, 32, 160 * p.meter / 100, 8);
      if (p.meter >= 100 && Math.floor(performance.now() / 250) % 2) { x.fillStyle = '#ffb347'; x.font = '700 11px Barlow Condensed'; x.textAlign = 'left'; x.fillText('¡SÚPER LISTO!', px, 54); }
    });
    x.textAlign = 'center';
    if (this.state === 'intro') { const n = Math.ceil(this.stT - 0.2); x.fillStyle = '#fff'; x.font = `700 ${110 - (this.stT % 1) * 30}px Bebas Neue`; x.globalAlpha = .9; x.fillText(n > 0 ? n : '¡YA!', W / 2, 230); x.globalAlpha = 1; }
    if (this.banner) { const k = Math.min(1, this.banner.t * 3); x.save(); x.translate(W / 2, 190); x.scale(.6 + .4 * k, .6 + .4 * k); x.fillStyle = '#ffd24d'; x.strokeStyle = '#000'; x.lineWidth = 6; x.font = '700 78px Bebas Neue'; x.strokeText(this.banner.txt, 0, 0); x.fillText(this.banner.txt, 0, 0); if (this.banner.sub) { x.font = '600 24px Barlow'; x.fillStyle = '#fff'; x.fillText(this.banner.sub, 0, 36); } x.restore(); }
  }
};
