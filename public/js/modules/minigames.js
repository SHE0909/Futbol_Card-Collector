// minigames.js
// --------------------------------------------------
// Motor visual compartido por Quiz, Adivina, Conecta y la Batalla Clásica:
// temporizador circular animado, racha con multiplicador, partículas, vibración
// al fallar, barra de progreso y revelado animado de la batalla clásica.
// Las recompensas NO cambian: se siguen calculando en Battle._end*().

const Arcade = {
  _ov: null,
  _esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  _open(inner, cls = '') {
    this.close();
    const ov = document.createElement('div'); ov.className = 'hc-overlay mg-overlay ' + cls;
    ov.innerHTML = `<div class="mg-wrap"><button class="hc-x" data-x>✕</button>${inner}</div>`;
    document.body.appendChild(ov); document.body.style.overflow = 'hidden'; this._ov = ov; this._alive = true;
    ov.querySelector('[data-x]').onclick = () => { this._alive = false; this.close(); Battle.render(); };
    return ov;
  },
  close() { this._ov?.remove(); this._ov = null; document.body.style.overflow = ''; clearInterval(this._tm); },
  // Ajusta un canvas de juego a la pantalla. En celular vertical gira el escenario 90°
  // para jugar en "horizontal" sin que el usuario tenga que girar el teléfono.
  fitStage(stage, cv, W, H, reserve = 0) {
    const vw = innerWidth, vh = innerHeight, rot = matchMedia('(pointer:coarse) and (orientation:portrait)').matches;
    let aw, ah;
    if (rot) { stage.classList.add('rot'); stage.style.width = vh + 'px'; stage.style.height = vw + 'px'; stage.style.left = vw + 'px'; aw = vh - 16; ah = vw - reserve - 8; }
    else { stage.classList.remove('rot'); stage.style.width = stage.style.height = stage.style.left = ''; aw = Math.min(vw - 16, 940); ah = vh - reserve - 8; }
    const w = Math.max(260, Math.min(aw, ah * W / H)), d = Math.min(devicePixelRatio || 1, 2);
    cv.style.width = w + 'px'; cv.style.height = (w * H / W) + 'px'; cv.width = w * d; cv.height = w * H / W * d;
    return { rot, sc: cv.width / W };
  },
  _wait(ms) { return new Promise(r => setTimeout(r, ms)); },
  _burst(el, good) {
    const r = el.getBoundingClientRect(), cols = good ? ['#3ddc84', '#ffd24d', '#4aa8ff', '#fff'] : ['#ff4d6d', '#ff8a1f'];
    for (let i = 0; i < (good ? 22 : 8); i++) {
      const s = document.createElement('i'); s.className = 'mg-p';
      s.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;background:${cols[i % cols.length]};--dx:${(Math.random() - .5) * 220}px;--dy:${(Math.random() - .8) * 200}px`;
      document.body.appendChild(s); setTimeout(() => s.remove(), 800);
    }
  },
  _beep(f, d) { try { const A = this._ac || (this._ac = new (window.AudioContext || window.webkitAudioContext)()), o = A.createOscillator(), g = A.createGain(); o.frequency.value = f; o.type = 'triangle'; g.gain.value = .04; g.gain.exponentialRampToValueAtTime(.0001, A.currentTime + d); o.connect(g); g.connect(A.destination); o.start(); o.stop(A.currentTime + d); } catch (_) {} },

  // ------------------------------------------------ Preguntas (Quiz / Adivina)
  // items: [{ prompt, emoji?, photoId?, opts:[txt], ans:index }]
  async ask(items, { title, time = 12, icon = '🧠', onEnd }) {
    let score = 0, streak = 0, best = 0, pts = 0;
    const ov = this._open(`
      <div class="mg-top"><b>${icon} ${title}</b><span id="mg-pts">0 pts</span><span id="mg-streak" class="mg-streak">🔥 x1</span></div>
      <div class="mg-dots" id="mg-dots">${items.map(() => '<i></i>').join('')}</div>
      <div id="mg-body"></div>`);
    for (let i = 0; i < items.length && this._alive; i++) {
      const it = items[i], body = ov.querySelector('#mg-body');
      ov.querySelectorAll('#mg-dots i')[i].classList.add('cur');
      body.innerHTML = `
        <div class="mg-card">
          <div class="mg-timer"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" class="bg"/><circle cx="22" cy="22" r="19" class="fg" id="mg-ring"/></svg><span id="mg-sec">${time}</span></div>
          ${it.emoji || it.photoId ? `<div class="mg-visual" id="mg-visual"><span>${it.emoji || ''}</span></div>` : ''}
          <h3 class="mg-q">${this._esc(it.prompt)}</h3>
          <div class="mg-opts">${it.opts.map((o, k) => `<button class="mg-opt" data-k="${k}" style="animation-delay:${k * .06}s">${this._esc(o)}</button>`).join('')}</div>
        </div>`;
      if (it.photoId) Promise.resolve(API.getPhotoById(it.photoId)).then(u => { const v = ov.querySelector('#mg-visual'); if (u && v) { v.style.backgroundImage = `url(${u})`; v.classList.add('photo'); v.firstElementChild.style.opacity = .0; } }).catch(() => {});
      const ring = ov.querySelector('#mg-ring'), sec = ov.querySelector('#mg-sec'), vis = ov.querySelector('#mg-visual');
      const C = 2 * Math.PI * 19; ring.style.strokeDasharray = C; ring.style.strokeDashoffset = 0;
      const t0 = performance.now();
      const picked = await new Promise(res => {
        const done = k => { clearInterval(this._tm); res(k); };
        ov.querySelectorAll('.mg-opt').forEach(b => b.onclick = () => done(+b.dataset.k));
        this._tm = setInterval(() => {
          if (!this._alive) return done(-2);
          const left = Math.max(0, time - (performance.now() - t0) / 1000), f = left / time;
          ring.style.strokeDashoffset = C * (1 - f); sec.textContent = Math.ceil(left);
          ring.style.stroke = f > .5 ? '#3ddc84' : f > .25 ? '#ffd24d' : '#ff4d6d';
          if (it.photoId && vis) vis.style.filter = `blur(${Math.round(f * 16)}px) brightness(${.35 + (1 - f) * .65})`;
          if (left <= 5 && Math.abs(left - Math.round(left)) < .03) this._beep(500, .04);
          if (left <= 0) done(-1);
        }, 50);
      });
      if (!this._alive) return;
      const left = Math.max(0, time - (performance.now() - t0) / 1000), ok = picked === it.ans;
      if (vis) vis.style.filter = 'none';
      ov.querySelectorAll('.mg-opt').forEach(b => { b.disabled = true; const k = +b.dataset.k; if (k === it.ans) b.classList.add('ok'); else if (k === picked) b.classList.add('bad'); });
      const dot = ov.querySelectorAll('#mg-dots i')[i]; dot.classList.remove('cur'); dot.classList.add(ok ? 'ok' : 'bad');
      const card = ov.querySelector('.mg-card');
      if (ok) {
        score++; streak++; best = Math.max(best, streak); const g = Math.round(100 + left * 10 + (streak - 1) * 25); pts += g;
        this._burst(ov.querySelector('.mg-opt.ok'), true); this._beep(660, .15); this._float(card, `+${g}`);
      } else { streak = 0; card.classList.add('mg-shake'); this._beep(140, .25); this._burst(card, false); }
      ov.querySelector('#mg-pts').textContent = `${pts} pts`;
      const st = ov.querySelector('#mg-streak'); st.textContent = `🔥 x${Math.max(1, streak)}`; st.classList.toggle('hot', streak >= 2);
      if (streak >= 3) this._float(card, `¡RACHA x${streak}!`, true);
      await this._wait(ok ? 1100 : 1700);
    }
    if (!this._alive) return;
    this.close(); onEnd && onEnd(score, items.length, { pts, best });
  },
  _float(el, txt, big) { const f = document.createElement('div'); f.className = 'mg-float' + (big ? ' big' : ''); f.textContent = txt; el.appendChild(f); setTimeout(() => f.remove(), 1100); },

  // ------------------------------------------------ Conecta (jugador ↔ equipo, con tiempo)
  async connect(pairs, { time = 45, onEnd }) {
    const left = [...pairs].sort(() => Math.random() - .5), right = [...pairs].sort(() => Math.random() - .5);
    let sel = null, matched = 0, streak = 0, tLeft = time, mistakes = 0;
    const ov = this._open(`
      <div class="mg-top"><b>🔗 Conecta</b><span id="mg-pts">0/${pairs.length}</span><span id="mg-streak" class="mg-streak">🔥 x1</span></div>
      <div class="mg-bar"><i id="mg-bar"></i></div>
      <p class="mg-hint">Une cada jugador con su equipo. Cada error resta 4 s.</p>
      <div class="mg-cols">
        <div>${left.map((p, i) => `<button class="mg-link L" data-i="${i}">${this._esc(p.name)}</button>`).join('')}</div>
        <div>${right.map((p, i) => `<button class="mg-link R" data-i="${i}">${this._esc(p.team)}</button>`).join('')}</div>
      </div>`);
    const bar = ov.querySelector('#mg-bar'), finish = () => { clearInterval(this._tm); this.close(); onEnd && onEnd(matched === pairs.length, matched); };
    this._tm = setInterval(() => {
      if (!this._alive) return clearInterval(this._tm);
      tLeft -= .1; const f = Math.max(0, tLeft / time); bar.style.width = f * 100 + '%'; bar.style.background = f > .5 ? '#3ddc84' : f > .25 ? '#ffd24d' : '#ff4d6d';
      if (tLeft <= 0) finish();
    }, 100);
    ov.querySelectorAll('.mg-link').forEach(b => b.onclick = () => {
      if (b.classList.contains('done')) return;
      if (b.classList.contains('L')) { ov.querySelectorAll('.mg-link.L').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); sel = +b.dataset.i; this._beep(420, .05); return; }
      if (sel == null) { b.classList.add('mg-shake'); setTimeout(() => b.classList.remove('mg-shake'), 400); return; }
      const lp = left[sel], rp = right[+b.dataset.i], lb = ov.querySelector(`.mg-link.L[data-i="${sel}"]`);
      if (lp.team === rp.team) {
        matched++; streak++; [lb, b].forEach(x => { x.classList.remove('sel'); x.classList.add('done'); }); this._burst(b, true); this._beep(660, .12);
        ov.querySelector('#mg-pts').textContent = `${matched}/${pairs.length}`;
        if (matched === pairs.length) setTimeout(finish, 700);
      } else {
        streak = 0; mistakes++; tLeft -= 4; [lb, b].forEach(x => { x.classList.add('mg-shake'); setTimeout(() => x.classList.remove('mg-shake'), 450); }); this._beep(140, .2);
      }
      sel = null; ov.querySelectorAll('.mg-link.L').forEach(x => x.classList.remove('sel'));
      const st = ov.querySelector('#mg-streak'); st.textContent = `🔥 x${Math.max(1, streak)}`; st.classList.toggle('hot', streak >= 2);
    });
  },

  // ------------------------------------------------ Batalla clásica: revelado animado por línea
  async classic(rounds, uName, cName) {
    const ov = this._open(`
      <div class="mg-top"><b>⚔️ Batalla</b><span>${this._esc(uName)} vs ${this._esc(cName)}</span></div>
      <div class="mg-lanes">${rounds.map(r => `<div class="mg-lane"><b class="pos">${r.pos}</b>
        <div class="bars"><div class="b u"><i data-t="${r.userScore}"></i><em>0</em></div><div class="b c"><i data-t="${r.cpuScore}"></i><em>0</em></div></div><span class="res"></span></div>`).join('')}</div>
      <div class="mg-tally"><span id="mg-u">0</span> - <span id="mg-c">0</span></div>`);
    let u = 0, c = 0;
    for (const [i, r] of rounds.entries()) {
      if (!this._alive) return;
      const lane = ov.querySelectorAll('.mg-lane')[i]; lane.classList.add('on');
      const bars = lane.querySelectorAll('.b'); const t0 = performance.now(), dur = 1100;
      await new Promise(res => { const f = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); [r.userScore, r.cpuScore].forEach((v, j) => { bars[j].querySelector('i').style.width = (v * e) + '%'; bars[j].querySelector('em').textContent = Math.round(v * e); }); k < 1 ? requestAnimationFrame(f) : res(); }; requestAnimationFrame(f); });
      const win = r.winner === 'user'; win ? u++ : c++;
      lane.classList.add(win ? 'win' : 'loss'); lane.querySelector('.res').textContent = win ? '✅' : '❌';
      ov.querySelector('#mg-u').textContent = u; ov.querySelector('#mg-c').textContent = c; this._beep(win ? 660 : 160, .15);
      if (win) this._burst(lane, true);
      await this._wait(500);
    }
    await this._wait(700); this.close();
  }
};
