// raffles.js
// --------------------------------------------------
// SORTEOS con monedas del juego. El admin los crea desde su pestaña "Admin"
// (premio, costo de participación y hora de cierre). Mientras hay uno abierto,
// todos ven un anuncio ROJO en la cabecera (junto a tiradas y monedas); al tocarlo se
// abre una ventana con la info y el botón para participar.
//
// Firestore (ver firestore.rules):
//   raffles/{id}                 -> el sorteo (solo el admin lo crea / sortea)
//   raffles/{id}/entries/{uid}   -> una inscripción por jugador (uid, nombre, correo)
//
// Flujo:
//   1) Jugador participa: transacción que descuenta las monedas y crea su inscripción.
//   2) A la hora de cierre el admin revisa cuántos se anotaron y confirma el sorteo: se
//      elige un inscrito AL AZAR (crypto) y el sorteo pasa a status "done" con el ganador.
//   3) Todos los inscritos ven el resultado (el nombre del ganador). Quien ganó ve la
//      pantalla de victoria y reclama su premio: un SOBRE de una rareza (se abre tocándolo
//      varias veces) o TIRADAS. El premio se entrega con una transacción atómica
//      (raffles/{id}.claimed false -> true + se suma a la cuenta), así no se duplica.
//
// No hay servidor que sortee solo: el sorteo ocurre cuando el admin lo confirma.

const Raffles = {
  TAPS: 6,                                  // toques para abrir el sobre
  PACKS: {
    common:    { label: 'Común',      color: '#9aa4b2', icon: '📦' },
    rare:      { label: 'Raro',       color: '#4aa8ff', icon: '💎' },
    epic:      { label: 'Épico',      color: '#b44fff', icon: '⚡' },
    legendary: { label: 'Legendario', color: '#ffd700', icon: '✨' },
    goat:      { label: 'GOAT',       color: '#ff2244', icon: '🐐' }
  },
  open: [], _joined: {}, _unsubs: [], _started: false, _timer: null,
  _queue: [], _busy: false, _shown: new Set(), _modal: null,

  _esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  _seenKey() { return 'wcc_raffle_seen_' + (fbAuth.currentUser?.uid || ''); },
  _seen() { try { return new Set(JSON.parse(localStorage.getItem(this._seenKey()) || '[]')); } catch (_) { return new Set(); } },
  _markSeen(id) { try { const s = this._seen(); s.add(id); localStorage.setItem(this._seenKey(), JSON.stringify([...s].slice(-60))); } catch (_) {} },
  prizeLabel(p) {
    if (p?.type === 'tiradas') return `🎟️ ${Number(p.amount)} tiradas`;
    const k = this.PACKS[p?.rarity] || this.PACKS.common; return `${k.icon} Sobre ${k.label}`;
  },
  _fmt(ms) {
    const t = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
    return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(s).padStart(2, '0')}`;
  },
  _hhmm(ms) { return new Date(ms).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }); },

  // ------------------------------------------------------------ arranque
  init() {
    if (this._started || !fbAuth.currentUser) return;
    this._started = true;
    const uid = fbAuth.currentUser.uid, col = fbDB.collection('raffles');
    try {
      // 1) sorteos abiertos -> anuncio en la cabecera
      this._unsubs.push(col.where('status', '==', 'open').onSnapshot(snap => {
        this.open = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.endsAtMs - b.endsAtMs);
        this._renderBanner(); if (this._modal) this._renderModal();
      }, e => console.warn('[Raffles] abiertos', e)));
      // 2) resultados de las últimas 24 h (para los inscritos)
      this._unsubs.push(col.where('doneAtMs', '>', Date.now() - 24 * 3600 * 1000).onSnapshot(snap => {
        snap.docChanges().forEach(ch => { if (ch.type !== 'removed') this._consider({ id: ch.doc.id, ...ch.doc.data() }); });
      }, e => console.warn('[Raffles] resultados', e)));
      // 3) premios ganados y aún sin reclamar (aunque pasaran más de 24 h)
      this._unsubs.push(col.where('winnerUid', '==', uid).where('claimed', '==', false).onSnapshot(snap => {
        snap.docChanges().forEach(ch => { if (ch.type !== 'removed') this._consider({ id: ch.doc.id, ...ch.doc.data() }); });
      }, e => console.warn('[Raffles] ganados', e)));
    } catch (e) { console.warn('[Raffles] init falló', e); }
    clearInterval(this._timer); this._timer = setInterval(() => this._tick(), 1000);
    const b = document.getElementById('hdr-raffle'); if (b) b.onclick = () => this.openModal();
  },

  // ------------------------------------------------------------ anuncio rojo
  _renderBanner() {
    const b = document.getElementById('hdr-raffle'); if (!b) return;
    if (!this.open.length) { b.style.display = 'none'; return; }
    b.style.display = '';
    b.querySelector('.hr-more').textContent = this.open.length > 1 ? `+${this.open.length - 1}` : '';
    this._tick();
  },
  _tick() {
    const b = document.getElementById('hdr-raffle'); if (!b || !this.open.length) return;
    const r = this.open[0], left = r.endsAtMs - Date.now(), t = b.querySelector('.hr-time');
    if (t) t.textContent = left > 0 ? this._fmt(left) : 'SORTEANDO…';
    b.classList.toggle('closed', left <= 0);
    if (this._modal) this._modal.querySelectorAll('[data-end]').forEach(el => {
      const l = Number(el.dataset.end) - Date.now(); el.textContent = l > 0 ? this._fmt(l) : 'Sorteando…';
    });
  },

  // ------------------------------------------------------------ ventana de info
  async openModal() {
    if (this._modal) return;
    const ov = document.createElement('div'); ov.className = 'rf-ov';
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-close]')) this.closeModal(); });
    document.body.appendChild(ov); this._modal = ov;
    this._renderModal();
    await Promise.all(this.open.map(r => this._amIn(r.id)));
    this._renderModal();
  },
  closeModal() { this._modal?.remove(); this._modal = null; },
  async _amIn(id) {
    if (this._joined[id] != null) return this._joined[id];
    try { const s = await fbDB.collection('raffles').doc(id).collection('entries').doc(fbAuth.currentUser.uid).get(); this._joined[id] = s.exists; }
    catch (_) { this._joined[id] = false; }
    return this._joined[id];
  },
  _renderModal() {
    const ov = this._modal; if (!ov) return;
    const cards = this.open.map(r => {
      const left = r.endsAtMs - Date.now(), closed = left <= 0, joined = this._joined[r.id], pk = this.PACKS[r.prize?.rarity];
      const color = r.prize?.type === 'pack' ? (pk?.color || '#fff') : '#2fd6ff';
      const btn = joined ? '<button class="btn rf-btn" disabled>✅ Ya estás participando</button>'
        : closed ? '<button class="btn rf-btn" disabled>Inscripciones cerradas</button>'
        : `<button class="btn btn-primary rf-btn" data-join="${r.id}">Participar · ${Number(r.cost) > 0 ? `−${Number(r.cost)} 🪙` : 'Gratis'}</button>`;
      return `<div class="rf-card" style="--rc:${color}">
        <div class="rf-prize"><span class="rf-ico">${r.prize?.type === 'tiradas' ? '🎟️' : (pk?.icon || '📦')}</span><div><small>PREMIO</small><b>${this._esc(r.prize?.type === 'tiradas' ? Number(r.prize.amount) + ' tiradas' : 'Sobre ' + (pk?.label || ''))}</b></div></div>
        ${r.title ? `<p class="rf-title">${this._esc(r.title)}</p>` : ''}
        <ul class="rf-info">
          <li><span>⏱️ Termina en</span><b data-end="${r.endsAtMs}">${closed ? 'Sorteando…' : this._fmt(left)}</b></li>
          <li><span>🕒 Hora del sorteo</span><b>${this._hhmm(r.endsAtMs)}</b></li>
          <li><span>🪙 Cuesta participar</span><b>${Number(r.cost) > 0 ? Number(r.cost) + ' monedas' : 'Gratis'}</b></li>
        </ul>
        ${btn}
        <p class="rf-note">El ganador se elige al azar entre todos los inscritos y se anuncia aquí mismo.</p>
      </div>`;
    }).join('');
    ov.innerHTML = `<div class="rf-box" role="dialog" aria-modal="true">
      <button class="rf-x" data-close aria-label="Cerrar">✕</button>
      <h3>🎰 Sorteo${this.open.length > 1 ? 's' : ''} en curso</h3>
      ${cards || '<p class="rf-empty">No hay sorteos activos ahora mismo.<br>¡Vuelve pronto!</p>'}
    </div>`;
    ov.querySelectorAll('[data-join]').forEach(b => b.onclick = () => this.join(b.dataset.join, b));
  },

  // ------------------------------------------------------------ participar
  async join(id, btn) {
    const fbUser = fbAuth.currentUser, r = this.open.find(x => x.id === id); if (!fbUser || !r) return;
    const cost = Math.max(0, Math.floor(Number(r.cost) || 0));
    const go = async () => {
      if (btn) { btn.disabled = true; btn.textContent = 'Inscribiendo…'; }
      const raffleRef = fbDB.collection('raffles').doc(id), entryRef = raffleRef.collection('entries').doc(fbUser.uid), userRef = fbDB.collection('users').doc(fbUser.uid);
      try {
        await fbDB.runTransaction(async tx => {
          const rs = await tx.get(raffleRef);
          if (!rs.exists || rs.data().status !== 'open' || Date.now() >= rs.data().endsAtMs) throw new Error('closed');
          if ((await tx.get(entryRef)).exists) throw new Error('already');
          const us = await tx.get(userRef), u = us.data() || {};
          if ((u.monedas || 0) < cost) throw new Error('coins');
          tx.set(entryRef, { uid: fbUser.uid, name: u.name || 'Jugador', email: (fbUser.email || '').toLowerCase(), at: new Date().toISOString() });
          if (cost > 0) tx.update(userRef, { monedas: (u.monedas || 0) - cost });
        });
        this._joined[id] = true;
        Toast.success('✅ ¡Estás participando! Mucha suerte 🍀');
        if (typeof App !== 'undefined') App.refreshHeader().catch(() => {});
        if (typeof DB !== 'undefined' && DB.logActivity) DB.logActivity(fbUser.email, 'raffle_join', id);
      } catch (e) {
        const k = e.message;
        Toast.error(k === 'coins' ? 'No tienes monedas suficientes para participar' : k === 'already' ? 'Ya estás participando' : k === 'closed' ? 'Las inscripciones ya cerraron' : 'No se pudo participar. Intenta de nuevo');
        if (k === 'already') this._joined[id] = true;
      }
      this._renderModal();
    };
    if (cost > 0) {
      HeadCards._dialog({ icon: '🎰', title: '¿Participar en el sorteo?', text: `Se descontarán <b>${cost} 🪙</b> de tus monedas y no se devuelven. Premio: <b>${this._esc(this.prizeLabel(r.prize))}</b>.`, cancel: 'Cancelar', ok: 'Participar', onOk: go });
    } else go();
  },

  // ------------------------------------------------------------ resultados
  // Decide si este sorteo terminado debe mostrarse (solo a inscritos o al ganador sin reclamar).
  async _consider(r) {
    if (r.status !== 'done' || this._shown.has(r.id)) return;
    const uid = fbAuth.currentUser?.uid, iWon = !!uid && r.winnerUid === uid;
    if (iWon && r.claimed) return;
    if (!iWon && this._seen().has(r.id)) return;
    if (!iWon && !(await this._amIn(r.id))) return;
    if (this._shown.has(r.id)) return;
    this._shown.add(r.id); this._queue.push({ ...r, iWon });
    this._drain();
  },
  async _drain() {
    if (this._busy) return; this._busy = true;
    try { while (this._queue.length) { const r = this._queue.shift(); await this._showResult(r); } } finally { this._busy = false; }
  },
  _showResult(r) {
    return new Promise(resolve => {
      this.closeModal();
      const ov = document.createElement('div'), win = r.iWon;
      const pk = this.PACKS[r.prize?.rarity], color = win ? (r.prize?.type === 'pack' ? (pk?.color || '#ffc83d') : '#ffc83d') : '#6f7fb5';
      ov.className = 'rf-ov rf-result' + (win ? ' win' : ''); ov.style.setProperty('--rc', color);
      const conf = win ? Array.from({ length: 40 }, () => `<i style="left:${(Math.random() * 100).toFixed(1)}%;animation-delay:${(Math.random() * 1.2).toFixed(2)}s;animation-duration:${(1.8 + Math.random() * 1.6).toFixed(2)}s"></i>`).join('') : '';
      const winnerLine = r.winnerName
        ? `<div class="rf-winner"><small>🏆 GANADOR DEL SORTEO</small><b>${this._esc(r.winnerName)}${win ? ' (¡tú!)' : ''}</b></div>`
        : '<div class="rf-winner"><small>Sorteo cerrado</small><b>Sin inscritos</b></div>';
      ov.innerHTML = `<div class="rf-conf" aria-hidden="true">${conf}</div><div class="rf-box rf-rbox" role="dialog" aria-modal="true">
        <div class="rf-bigico">${win ? '🏆' : '😔'}</div>
        <h2>${win ? '¡GANASTE EL SORTEO!' : 'Lo siento, no ganaste'}</h2>
        ${winnerLine}
        <p class="rf-sub">${win ? `Tu premio: <b>${this._esc(this.prizeLabel(r.prize))}</b>` : `Premio sorteado: <b>${this._esc(this.prizeLabel(r.prize))}</b><br>¡Inténtalo la próxima vez!`}</p>
        <button class="btn btn-primary rf-go" type="button">${win ? (r.prize?.type === 'pack' ? '🎁 Abrir mi sobre' : '🎟️ Reclamar mis tiradas') : 'Cerrar'}</button>
      </div>`;
      document.body.appendChild(ov);
      const done = () => { ov.remove(); resolve(); };
      ov.querySelector('.rf-go').onclick = async () => {
        if (!win) { this._markSeen(r.id); return done(); }
        ov.querySelector('.rf-go').disabled = true;
        if (r.prize?.type === 'pack') { ov.remove(); await this._openPack(r); resolve(); }
        else { const ok = await this._claim(r); if (ok) { this._markSeen(r.id); } done(); if (ok) Prizes.showReveal({ color: '#2fd6ff', icon: '🎟️', kicker: '¡FELICIDADES!', line: `Recibiste <b>${Number(r.prize.amount)}</b> tiradas`, note: 'Ganador del sorteo' }); }
      };
    });
  },

  // ------------------------------------------------------------ abrir sobre
  _openPack(r) {
    return new Promise(resolve => {
      const pk = this.PACKS[r.prize?.rarity] || this.PACKS.common;
      const ov = document.createElement('div'); ov.className = 'rf-ov rf-packov'; ov.style.setProperty('--rc', pk.color);
      let taps = 0, busy = false;
      ov.innerHTML = `<div class="rf-packwrap">
        <p class="rf-packhint" id="rf-hint">¡Toca el sobre para abrirlo!</p>
        <button class="rf-pack" id="rf-pack" type="button" aria-label="Abrir sobre">
          <span class="rf-pack-foil"></span><span class="rf-pack-ico">${pk.icon}</span><b>SOBRE</b><em>${pk.label.toUpperCase()}</em>
          <i class="rf-crack c1"></i><i class="rf-crack c2"></i><i class="rf-crack c3"></i>
        </button>
        <div class="rf-ptrack"><u id="rf-pbar"></u></div>
        <small id="rf-pcount">0 / ${this.TAPS}</small>
      </div>`;
      document.body.appendChild(ov);
      const pack = ov.querySelector('#rf-pack');
      pack.addEventListener('click', async e => {
        if (busy) return; taps++;
        pack.classList.remove('shake'); void pack.offsetWidth; pack.classList.add('shake');
        const sp = document.createElement('i'); sp.className = 'rf-spark'; sp.style.left = (e.offsetX || 60) + 'px'; sp.style.top = (e.offsetY || 80) + 'px'; pack.appendChild(sp); setTimeout(() => sp.remove(), 500);
        pack.dataset.cracks = Math.min(3, Math.floor(taps / 2));
        ov.querySelector('#rf-pbar').style.width = (taps / this.TAPS * 100) + '%';
        ov.querySelector('#rf-pcount').textContent = `${taps} / ${this.TAPS}`;
        const left = this.TAPS - taps;
        ov.querySelector('#rf-hint').textContent = left > 0 ? (left === 1 ? '¡Un toque más!' : '¡Sigue tocando!') : '¡Abriendo…!';
        if (taps < this.TAPS) return;
        busy = true; pack.classList.add('burst');
        const out = await this._claim(r);
        setTimeout(async () => {
          ov.remove();
          if (out) {
            this._markSeen(r.id);
            const t = Prizes.TIERS[out.card.rareza] || Prizes.TIERS.common;
            await Prizes.showReveal({ color: t.color, icon: t.icon, kicker: t.kicker,
              line: t.line(this._esc(out.card.name)) + (out.isDuplicate ? ' <small>(ya la tenías: suma un duplicado)</small>' : ''),
              note: 'Ganador del sorteo', card: out.card, isDuplicate: out.isDuplicate, epic: ['legendary', 'goat'].includes(out.card.rareza) });
          } else { this._shown.delete(r.id); }
          resolve();
        }, 750);
      });
    });
  },

  // Entrega el premio con una transacción atómica. Devuelve { card, isDuplicate } | true (tiradas) | null.
  async _claim(r) {
    const fbUser = fbAuth.currentUser; if (!fbUser) return null;
    const raffleRef = fbDB.collection('raffles').doc(r.id), userRef = fbDB.collection('users').doc(fbUser.uid);
    let out = null;
    try {
      await fbDB.runTransaction(async tx => {
        out = null;
        const rs = await tx.get(raffleRef); if (!rs.exists) return;
        const rd = rs.data(); if (rd.claimed || rd.winnerUid !== fbUser.uid) return;
        const us = await tx.get(userRef), u = us.data() || {}, upd = {}, mark = { claimed: true, claimedAt: new Date().toISOString() };
        if (rd.prize?.type === 'pack') {
          const pool = Gacha.getPool().filter(f => f.rareza === rd.prize.rarity), pick = pool[Math.floor(Math.random() * pool.length)];
          if (!pick) throw new Error('Sin cartas de esa rareza');
          const figs = JSON.parse(JSON.stringify(u.figuritas || [])), have = figs.find(f => f.id === pick.id);
          if (have) have.duplicados = (have.duplicados || 0) + 1; else figs.push({ ...pick, duplicados: 0, obtenida: new Date().toISOString() });
          upd.figuritas = figs; mark.cardId = pick.id; out = { card: { ...pick }, isDuplicate: !!have };
        } else {
          const n = Math.max(1, Math.min(Prizes.MAX_TIRADAS, Math.floor(Number(rd.prize?.amount) || 0)));
          upd.tiradas = (u.tiradas || 0) + n; out = true;
        }
        tx.update(raffleRef, mark); tx.update(userRef, upd);
      });
    } catch (e) { console.error('[Raffles] reclamar', e); Toast.error('No se pudo entregar el premio. Se reintentará al volver a entrar'); return null; }
    if (out) {
      if (typeof App !== 'undefined') App.refreshHeader().catch(() => {});
      if (out !== true && !out.isDuplicate && typeof Online !== 'undefined') Auth.currentUser().then(u => u && Online.publishDrops(u, [out.card])).catch(() => {});
      if (typeof DB !== 'undefined' && DB.logActivity) DB.logActivity(fbUser.email, 'raffle_win', r.id);
    }
    return out;
  },

  // ------------------------------------------------------------ admin: sortear
  // Elige un inscrito al azar (crypto) y cierra el sorteo. Solo el admin puede escribir (reglas).
  async draw(id) {
    const raffleRef = fbDB.collection('raffles').doc(id);
    const snap = await raffleRef.collection('entries').get();
    const entries = snap.docs.map(d => d.data());
    const done = { status: 'done', doneAt: new Date().toISOString(), doneAtMs: Date.now(), entriesCount: entries.length, claimed: false };
    let winner = null;
    if (entries.length) {
      const buf = new Uint32Array(1); let n;
      const lim = Math.floor(4294967296 / entries.length) * entries.length;
      do { crypto.getRandomValues(buf); n = buf[0]; } while (n >= lim);   // sin sesgo
      winner = entries[n % entries.length];
      Object.assign(done, { winnerUid: winner.uid, winnerName: winner.name || 'Jugador' });
    }
    await raffleRef.update(done);
    return { winner, count: entries.length };
  }
};
