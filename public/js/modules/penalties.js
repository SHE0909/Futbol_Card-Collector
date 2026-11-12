// penalties.js
// --------------------------------------------------
// Tanda de penales en canvas. Tú pateas: apuntas con el mouse/dedo, tocas para
// fijar la mira y tocas otra vez cuando la barra de potencia esté en la zona
// verde. Luego ATAJAS: antes de que el CPU patee, toca la zona del arco a la
// que quieres lanzarte. 5 rondas + muerte súbita. Al terminar usa
// Battle._endPenaltyBattle (mismas recompensas que antes).

const PenaltyGame = {
  W: 800, H: 450, G: { x: 150, y: 80, w: 500, h: 170 }, SPOT: { x: 400, y: 395 },

  start() {
    this.u = 0; this.c = 0; this.log = []; this.round = 0; this.alive = true;
    this.ov = document.createElement('div'); this.ov.className = 'hc-overlay';
    this.ov.innerHTML = `<div class="hc-stage"><button class="hc-x" id="pg-x">✕</button>
      <canvas id="pg-cv"></canvas><p class="pg-help" id="pg-help"></p></div>`;
    document.body.appendChild(this.ov); document.body.style.overflow = 'hidden';
    this.cv = this.ov.querySelector('#pg-cv'); this.x = this.cv.getContext('2d');
    this.help = this.ov.querySelector('#pg-help');
    this._fit(); addEventListener('resize', this._rs = () => this._fit());
    this.mouse = { x: 400, y: 160 }; this.ball = { x: this.SPOT.x, y: this.SPOT.y, s: 1 };
    this.keeper = { x: 400, y: 215, rot: 0 }; this.cross = null; this.power = null; this.banner = null; this.net = 0; this.shake = 0; this.parts = []; this.hit = null;
    this._ptr = e => { const r = this.cv.getBoundingClientRect(); this.mouse = this.rot ? { x: (e.clientY - r.top) / r.height * this.W, y: (r.right - e.clientX) / r.width * this.H } : { x: (e.clientX - r.left) / r.width * this.W, y: (e.clientY - r.top) / r.height * this.H }; };
    this._dn = e => { this._ptr(e); const f = this.click; this.click = null; f && f(); };
    this.cv.addEventListener('pointermove', this._ptr); this.cv.addEventListener('pointerdown', this._dn);
    this.ov.querySelector('#pg-x').onclick = () => this.close(false);
    this._loop = () => { if (!this.alive) return; this._draw(); this._raf = requestAnimationFrame(this._loop); }; this._loop();
    this._play();
  },
  close(finished) {
    this.alive = false; cancelAnimationFrame(this._raf); removeEventListener('resize', this._rs);
    this.ov?.remove(); document.body.style.overflow = '';
    if (!finished) Battle.render();
  },
  _fit() { const f = Arcade.fitStage(this.ov.querySelector('.hc-stage'), this.cv, this.W, this.H, 56); this.sc = f.sc; this.rot = f.rot; },
  _wait(ms) { return new Promise(r => setTimeout(r, ms)); },
  _tween(ms, fn) { return new Promise(res => { const t0 = performance.now(); const f = now => { if (!this.alive) return res(); const k = Math.min(1, (now - t0) / ms); fn(k); k < 1 ? requestAnimationFrame(f) : res(); }; requestAnimationFrame(f); }); },
  _tap(msg) { this.help.textContent = msg; return new Promise(r => { this.click = r; }); },
  _zone(px, py) { const G = this.G, c = Math.min(2, Math.max(0, Math.floor((px - G.x) / (G.w / 3)))), r = py < G.y + G.h / 2 ? 0 : 1; return { c, r, id: r * 3 + c }; },
  _zc(z) { const G = this.G; return { x: G.x + (z.c + .5) * G.w / 3, y: G.y + (z.r + .5) * G.h / 2 + (z.r ? 12 : -4) }; },
  _beep(f, d) { try { const A = this._ac || (this._ac = new (window.AudioContext || window.webkitAudioContext)()), o = A.createOscillator(), g = A.createGain(); o.frequency.value = f; o.type = 'triangle'; g.gain.value = .05; g.gain.exponentialRampToValueAtTime(.0001, A.currentTime + d); o.connect(g); g.connect(A.destination); o.start(); o.stop(A.currentTime + d); } catch (_) {} },

  async _play() {
    for (let r = 0; this.alive; r++) {
      this.round = r;
      for (const who of ['u', 'c']) {
        if (!this.alive) return;
        const res = who === 'u' ? await this._shoot() : await this._defend();
        this.log.push({ who, goal: res }); if (res) who === 'u' ? this.u++ : this.c++;
        await this._wait(900);
        const us = this.log.filter(l => l.who === 'u').length, cs = this.log.filter(l => l.who === 'c').length;
        if (us <= 5 || cs <= 5) {
          const remU = Math.max(0, 5 - us), remC = Math.max(0, 5 - cs);
          if (this.u > this.c + remC || this.c > this.u + remU) return this._finish();
        }
        if (us === cs && us >= 5 && this.u !== this.c) return this._finish();
      }
    }
  },
  _finish() {
    this.alive = false; cancelAnimationFrame(this._raf);
    const w = this.u > this.c, d = this.u === this.c;
    this.ov.querySelector('.hc-stage').insertAdjacentHTML('beforeend', `<div class="hc-result" style="--c:${w ? '#3ddc84' : '#ff4d6d'}"><h2>${w ? '¡GANASTE LA TANDA!' : 'LA PERDISTE'}</h2><div class="hc-final">${this.u} - ${this.c}</div><button class="btn btn-primary" id="pg-ok">Continuar</button></div>`);
    this.ov.querySelector('#pg-ok').onclick = () => { this.close(true); Battle._endPenaltyBattle(this.u, this.c); };
  },
  _reset() { Object.assign(this.ball, { x: this.SPOT.x, y: this.SPOT.y, s: 1 }); Object.assign(this.keeper, { x: 400, y: 215, rot: 0 }); this.cross = null; this.power = null; this.hit = null; },

  // ---- tú pateas
  async _shoot() {
    this._reset(); this.banner = { txt: 'TU TURNO · PATEAS', t: 1 }; await this._wait(700); this.banner = null;
    this.aiming = true; await this._tap('Mueve la mira y toca para fijarla'); this.aiming = false;
    this.cross = { ...this.mouse };
    this.power = { v: 0, dir: 1 }; const t0 = performance.now();
    const tick = () => { if (!this.power || !this.alive) return; const t = (performance.now() - t0) / 1000 * 1.5; this.power.v = Math.abs(((t % 2) + 2) % 2 - 1); setTimeout(tick, 16); }; tick();
    await this._tap('¡Toca cuando la barra esté en verde!'); const p = this.power.v; this.power.done = true;
    this.help.textContent = '';
    const err = p > .93 ? 85 : p > .62 ? 9 : p > .35 ? 24 : 40, a = Math.random() * 6.283, rr = Math.random() * err;
    const T = { x: this.cross.x + Math.cos(a) * rr, y: this.cross.y + Math.sin(a) * rr * .8 - (p > .93 ? 30 : 0) };
    const G = this.G, out = T.x < G.x + 2 || T.x > G.x + G.w - 2 || T.y < G.y + 2 || T.y > G.y + G.h;
    const post = !out && (T.x < G.x + 12 || T.x > G.x + G.w - 12 || T.y < G.y + 12) && Math.random() < .5;
    const z = this._zone(T.x, T.y), kz = { c: [0, 1, 2][Math.floor(Math.random() * 3)], r: Math.random() < .55 ? 1 : 0 }; kz.id = kz.r * 3 + kz.c;
    const dist = Math.abs(kz.c - z.c) + Math.abs(kz.r - z.r);
    const save = !out && !post && (dist === 0 ? Math.random() < .9 - .6 * p : dist === 1 ? Math.random() < .22 * (1 - p) : false);
    const kc = this._zc(kz); const k0 = { ...this.keeper };
    const dur = 620 - p * 200; this._beep(200, .08);
    await Promise.all([
      this._tween(dur, k => { const e = 1 - Math.pow(1 - k, 2); this.ball.x = this.SPOT.x + (T.x - this.SPOT.x) * e; this.ball.y = this.SPOT.y + (T.y - this.SPOT.y) * e - Math.sin(k * Math.PI) * 38; this.ball.s = 1 - .6 * e; }),
      this._tween(dur * .85, k => { const e = Math.min(1, k * 1.15); this.keeper.x = k0.x + (kc.x - k0.x) * e; this.keeper.y = k0.y + (kc.y - k0.y) * e; this.keeper.rot = (kc.x - k0.x) / 160 * e; })
    ]);
    return this._outcome(save ? 'save' : out ? 'miss' : post ? 'post' : 'goal', T, true);
  },

  // ---- tú atajas
  async _defend() {
    this._reset(); this.banner = { txt: 'ATAJAS · ELIGE UN LADO', t: 1 }; await this._wait(700); this.banner = null;
    const w = [.28, .12, .28, .15, .05, .12]; const sx = Math.random() * w.reduce((a, b) => a + b); let acc = 0, id = 0; for (let i = 0; i < 6; i++) { acc += w[i]; if (sx <= acc) { id = i; break; } }
    const sz = { c: id % 3, r: id > 2 ? 1 : 0, id }; const T = this._zc(sz); T.x += (Math.random() - .5) * 40;
    this.pick = null; this.zonesOn = true; this.click = null;
    let chosen = null;
    this._dn2 = () => { const z = this._zone(this.mouse.x, this.mouse.y); if (this.mouse.y > this.G.y - 20 && this.mouse.y < this.G.y + this.G.h + 20) chosen = z; };
    const handler = e => { this._ptr(e); this._dn2(); }; this.cv.addEventListener('pointerdown', handler);
    this.help.textContent = '¡Toca la zona del arco donde crees que va el balón!';
    const t0 = performance.now(); let fired = false, dive = false; const k0 = { ...this.keeper };
    const wait = 1500; // tiempo de decisión
    await new Promise(res => { const f = () => { if (!this.alive) return res(); this.timer = 1 - (performance.now() - t0) / wait; if (chosen || performance.now() - t0 > wait) return res(); requestAnimationFrame(f); }; f(); });
    this.timer = null; this.zonesOn = false; this.cv.removeEventListener('pointerdown', handler); this.help.textContent = '';
    const kc = chosen ? this._zc(chosen) : { x: 400, y: 215 }; this._beep(200, .08);
    const dist = chosen ? Math.abs(chosen.c - sz.c) + Math.abs(chosen.r - sz.r) : 9;
    const save = dist === 0 ? true : dist === 1 ? Math.random() < .3 : false;
    const dur = 560;
    await Promise.all([
      this._tween(dur, k => { const e = 1 - Math.pow(1 - k, 2); this.ball.x = this.SPOT.x + (T.x - this.SPOT.x) * e; this.ball.y = this.SPOT.y + (T.y - this.SPOT.y) * e - Math.sin(k * Math.PI) * 38; this.ball.s = 1 - .6 * e; }),
      this._tween(dur * .9, k => { const e = Math.min(1, k * 1.1); this.keeper.x = k0.x + (kc.x - k0.x) * e; this.keeper.y = k0.y + (kc.y - k0.y) * e; this.keeper.rot = (kc.x - k0.x) / 160 * e; })
    ]);
    const r = await this._outcome(save ? 'save' : 'goal', T, false); return r;
  },

  async _outcome(kind, T, mine) {
    const good = mine ? kind === 'goal' : kind === 'save';
    if (kind === 'goal') { this.net = 1; this.shake = 8; this._confetti(T.x, T.y, mine); this._beep(660, .3); this.ball.s *= .9; }
    else if (kind === 'save') { this.shake = 4; this._beep(140, .2); this.ball.x += (Math.random() - .5) * 60; this.ball.y += 30; }
    else { this.shake = kind === 'post' ? 10 : 0; this._beep(kind === 'post' ? 800 : 120, .15); if (kind === 'miss') { this.ball.x += (T.x < 400 ? -1 : 1) * 40; this.ball.y -= 20; } }
    this.banner = { txt: kind === 'goal' ? (mine ? '¡¡GOOOL!!' : 'GOL DEL CPU') : kind === 'save' ? (mine ? '¡ATAJÓ!' : '¡ATAJASTE!') : kind === 'post' ? '¡AL PALO!' : '¡AFUERA!', t: 1, good };
    return mine ? kind === 'goal' : kind === 'goal';
  },
  _confetti(x, y, mine) { for (let i = 0; i < 60; i++) this.parts.push({ x, y, vx: (Math.random() - .5) * 9, vy: -Math.random() * 9, l: 1.2, c: ['#ffd24d', '#3ddc84', '#4aa8ff', '#fff'][i % 4] }); },

  // ---- dibujo
  _draw() {
    const x = this.x, G = this.G; x.setTransform(this.sc, 0, 0, this.sc, 0, 0);
    this.shake *= .88; x.save(); if (this.shake > .3) x.translate((Math.random() - .5) * this.shake, (Math.random() - .5) * this.shake);
    const sky = x.createLinearGradient(0, 0, 0, 270); sky.addColorStop(0, '#050a1c'); sky.addColorStop(1, '#16315f'); x.fillStyle = sky; x.fillRect(0, 0, this.W, 270);
    for (let i = 0; i < 400; i++) { const px = (i * 97) % 800, py = 10 + (i * 53) % 55; x.fillStyle = `hsla(${(i * 37) % 360},70%,70%,.35)`; x.fillRect(px, py, 2, 2); } // público
    [60, 740].forEach(lx => { const g = x.createRadialGradient(lx, 20, 4, lx, 20, 240); g.addColorStop(0, 'rgba(255,255,230,.5)'); g.addColorStop(1, 'rgba(255,255,230,0)'); x.fillStyle = g; x.fillRect(0, 0, 800, 300); });
    for (let i = 0; i < 12; i++) { x.fillStyle = i % 2 ? '#188a3a' : '#1f9c46'; x.fillRect(0, 250 + i * 17, 800, 17); }
    x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 3; x.strokeRect(G.x - 90, 250, G.w + 180, 90); x.beginPath(); x.arc(400, 395, 4, 0, 7); x.fillStyle = '#fff'; x.fill();
    // red del arco
    const rip = this.net; this.net *= .94; x.strokeStyle = 'rgba(255,255,255,.28)'; x.lineWidth = 1;
    for (let i = 0; i <= 25; i++) { const xx = G.x + i * G.w / 25; x.beginPath(); x.moveTo(xx, G.y); x.lineTo(xx + Math.sin(i + performance.now() / 60) * rip * 4, G.y + G.h); x.stroke(); }
    for (let j = 0; j <= 9; j++) { const yy = G.y + j * G.h / 9; x.beginPath(); x.moveTo(G.x, yy); x.lineTo(G.x + G.w, yy + Math.sin(j + performance.now() / 60) * rip * 4); x.stroke(); }
    // zonas al atajar
    if (this.zonesOn) for (let i = 0; i < 6; i++) { const c = i % 3, r = i > 2 ? 1 : 0, zx = G.x + c * G.w / 3, zy = G.y + r * G.h / 2; const hov = this._zone(this.mouse.x, this.mouse.y).id === i && this.mouse.y > G.y - 20 && this.mouse.y < G.y + G.h + 20; x.fillStyle = hov ? 'rgba(255,210,77,.35)' : 'rgba(74,168,255,.12)'; x.fillRect(zx + 2, zy + 2, G.w / 3 - 4, G.h / 2 - 4); }
    // portero
    const k = this.keeper; x.save(); x.translate(k.x, k.y); x.rotate(k.rot); x.fillStyle = '#ffb703'; x.fillRect(-16, -8, 32, 40); x.fillStyle = '#222'; x.fillRect(-16, 32, 14, 22); x.fillRect(2, 32, 14, 22);
    x.strokeStyle = '#ffb703'; x.lineWidth = 9; x.lineCap = 'round'; const ex = Math.abs(k.rot) * 36 + 18; x.beginPath(); x.moveTo(-14, 0); x.lineTo(-14 - ex, -16 - Math.abs(k.rot) * 22); x.moveTo(14, 0); x.lineTo(14 + ex, -16 - Math.abs(k.rot) * 22); x.stroke();
    x.fillStyle = '#ffd6a5'; x.beginPath(); x.arc(0, -20, 13, 0, 7); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(-14 - ex, -16 - Math.abs(k.rot) * 22, 7, 0, 7); x.arc(14 + ex, -16 - Math.abs(k.rot) * 22, 7, 0, 7); x.fill(); x.restore();
    // postes
    x.strokeStyle = '#fff'; x.lineWidth = 8; x.beginPath(); x.moveTo(G.x, G.y + G.h); x.lineTo(G.x, G.y); x.lineTo(G.x + G.w, G.y); x.lineTo(G.x + G.w, G.y + G.h); x.stroke();
    // mira y barra de potencia
    if (this.aiming) { const m = this.mouse; this._reticle(x, m.x, m.y, '#ffd24d'); }
    if (this.cross) this._reticle(x, this.cross.x, this.cross.y, '#3ddc84');
    if (this.power) { const bx = 250, by = 425, bw = 300; x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(bx - 4, by - 4, bw + 8, 22); const gr = x.createLinearGradient(bx, 0, bx + bw, 0); gr.addColorStop(0, '#ff4d6d'); gr.addColorStop(.35, '#ffd24d'); gr.addColorStop(.62, '#3ddc84'); gr.addColorStop(.93, '#3ddc84'); gr.addColorStop(1, '#ff4d6d'); x.fillStyle = gr; x.fillRect(bx, by, bw, 14); x.fillStyle = '#fff'; x.fillRect(bx + bw * this.power.v - 3, by - 6, 6, 26); }
    if (this.timer != null) { x.fillStyle = 'rgba(255,210,77,.9)'; x.fillRect(150, 62, 500 * Math.max(0, this.timer), 6); }
    // balón
    const b = this.ball; x.fillStyle = 'rgba(0,0,0,.3)'; x.beginPath(); x.ellipse(b.x, this.SPOT.y + 12, 14 * b.s, 4 * b.s, 0, 0, 7); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(b.x, b.y, 16 * b.s, 0, 7); x.fill(); x.fillStyle = '#222'; x.beginPath(); x.arc(b.x, b.y, 5 * b.s, 0, 7); x.fill();
    this.parts.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += .35; p.l -= 1 / 60; x.globalAlpha = Math.max(0, p.l); x.fillStyle = p.c; x.fillRect(p.x, p.y, 5, 5); }); x.globalAlpha = 1; this.parts = this.parts.filter(p => p.l > 0);
    x.restore(); this._hud(x);
  },
  _reticle(x, px, py, c) { x.strokeStyle = c; x.lineWidth = 3; x.beginPath(); x.arc(px, py, 16, 0, 7); x.moveTo(px - 24, py); x.lineTo(px - 8, py); x.moveTo(px + 8, py); x.lineTo(px + 24, py); x.moveTo(px, py - 24); x.lineTo(px, py - 8); x.moveTo(px, py + 8); x.lineTo(px, py + 24); x.stroke(); },
  _hud(x) {
    x.fillStyle = 'rgba(5,10,28,.8)'; x.beginPath(); x.roundRect(250, 6, 300, 54, 12); x.fill(); x.textAlign = 'center'; x.fillStyle = '#fff'; x.font = '700 28px Bebas Neue, sans-serif'; x.fillText(`TÚ ${this.u}  -  ${this.c} CPU`, 400, 36);
    [['u', 270], ['c', 530]].forEach(([w, bx]) => { const l = this.log.filter(q => q.who === w); for (let i = 0; i < Math.max(5, l.length); i++) { x.fillStyle = l[i] ? (l[i].goal ? '#3ddc84' : '#ff4d6d') : 'rgba(255,255,255,.25)'; x.beginPath(); x.arc(bx - 40 + i * 20 - (w === 'c' ? 0 : 0), 50, 5, 0, 7); x.fill(); } });
    if (this.banner) { this.banner.t = Math.max(0, this.banner.t - .006); x.save(); x.translate(400, 170); const s = 1 + (1 - this.banner.t) * .1; x.scale(s, s); x.font = '700 64px Bebas Neue, sans-serif'; x.lineWidth = 6; x.strokeStyle = '#000'; x.fillStyle = this.banner.good === false ? '#ff4d6d' : '#ffd24d'; x.strokeText(this.banner.txt, 0, 0); x.fillText(this.banner.txt, 0, 0); x.restore(); }
  }
};
