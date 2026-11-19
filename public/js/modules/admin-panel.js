// admin-panel.js
// --------------------------------------------------
// Pestaña "Admin": solo la ve la cuenta admin (ver admin.js). Sirve para el torneo:
//   · Enviar premios a un correo: carta a elección, tiradas o monedas.
//   · Crear / activar / borrar códigos canjeables de tiradas.
//   · Ver el historial de premios (pendiente / entregado) y cancelar pendientes.
//   · Sorteos: crear, ver inscritos y sortear (además, al cerrar uno sale una ventana que avisa).
//   · Intentos extra: ver todos los correos que han entrado y subirles el límite diario de intentos
//     por modo (torneo en persona). Se guarda en attemptLimits/{correo}; la lista de correos sale de
//     directory/{uid}, que cada jugador escribe al entrar (solo el admin puede leerla).
//
// La seguridad real está en firestore.rules (colecciones prizes y codes: solo el
// UID admin puede crearlas o borrarlas). Esto es únicamente la interfaz.

const AdminPanel = {
  _esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  _RARITY_ORDER: ['goat', 'legendary', 'epic', 'rare', 'common'],
  _TYPE_LABEL: { card: 'Carta', tiradas: 'Tiradas', monedas: 'Monedas' },

  async render() {
    const root = document.getElementById('admin-root');
    if (!root) return;
    if (!Admin.isAdmin()) { root.innerHTML = '<p class="adm-empty">Sin acceso.</p>'; return; }

    const pool = [...Gacha.getPool()].sort((a, b) =>
      this._RARITY_ORDER.indexOf(a.rareza) - this._RARITY_ORDER.indexOf(b.rareza) || a.name.localeCompare(b.name, 'es'));
    const cardOpts = this._RARITY_ORDER.map(r => {
      const list = pool.filter(f => f.rareza === r);
      return list.length ? `<optgroup label="${this._esc(Gacha.getRarityLabel(r))}">${list.map(f => `<option value="${f.id}">${this._esc(f.name)} · ${this._esc(f.team)}</option>`).join('')}</optgroup>` : '';
    }).join('');

    root.innerHTML = `
      <div class="adm-grid">
        <section class="adm-card">
          <h3>🏆 Enviar premio</h3>
          <p class="adm-hint">El premio le llega al jugador con ese correo (en vivo si tiene la app abierta, o al entrar). Puedes poner varios correos separados por coma, espacio o salto de línea.</p>
          <label class="adm-lbl">Correo(s) del ganador</label>
          <textarea id="adm-emails" class="adm-input" rows="2" placeholder="ganador@correo.com"></textarea>
          <label class="adm-lbl">Premio</label>
          <div class="adm-seg" id="adm-type">
            <button type="button" class="on" data-t="card">🃏 Carta</button>
            <button type="button" data-t="tiradas">🎟️ Tiradas</button>
            <button type="button" data-t="monedas">🪙 Monedas</button>
          </div>
          <div id="adm-card-box"><label class="adm-lbl">Carta</label><select id="adm-card" class="adm-input">${cardOpts}</select></div>
          <div id="adm-amount-box" style="display:none"><label class="adm-lbl" id="adm-amount-lbl">Cantidad</label><input id="adm-amount" class="adm-input" type="number" min="1" step="1" value="10"></div>
          <label class="adm-lbl">Motivo (lo verá el ganador, opcional)</label>
          <input id="adm-note" class="adm-input" maxlength="80" placeholder="Ej: 1er lugar del torneo">
          <button class="btn btn-primary adm-send" id="adm-send" type="button">Enviar premio</button>
          <p class="adm-msg" id="adm-msg" role="status"></p>
        </section>

        <section class="adm-card">
          <h3>🎁 Códigos de tiradas</h3>
          <p class="adm-hint">Quien escriba el código en <b>Sobres → ¿Tienes un código?</b> recibe las tiradas. Cada código se usa <b>una sola vez por cuenta</b>.</p>
          <div class="adm-row">
            <div><label class="adm-lbl">Código</label><input id="adm-code" class="adm-input" maxlength="40" placeholder="CC-DEFENSA" autocapitalize="characters"></div>
            <button class="btn" id="adm-gen" type="button" title="Generar uno al azar">🎲</button>
          </div>
          <div class="adm-row two">
            <div><label class="adm-lbl">Tiradas</label><input id="adm-code-n" class="adm-input" type="number" min="1" max="1000" value="10"></div>
            <div><label class="adm-lbl">Límite de usos (0 = ilimitado)</label><input id="adm-code-max" class="adm-input" type="number" min="0" value="0"></div>
          </div>
          <button class="btn btn-primary adm-send" id="adm-code-save" type="button">Crear código</button>
          <p class="adm-msg" id="adm-code-msg" role="status"></p>
          <div id="adm-codes" class="adm-list"><p class="adm-empty">Cargando…</p></div>
        </section>
      </div>

      <section class="adm-card adm-wide">
        <div class="adm-head"><h3>${Raffles.ico('dice')} Sorteos (monedas)</h3><button class="btn" id="adm-rf-refresh" type="button">Actualizar</button></div>
        <p class="adm-hint">Al crear un sorteo, todos ven un <b>anuncio rojo</b> arriba (junto a tiradas y monedas) con su info y el botón para participar. Cuando llegue la hora te saldrá una <b>ventana emergente</b> para sortear al ganador (también puedes pulsar <b>Sortear</b> en la lista): se elige un inscrito al azar y todos los inscritos ven el resultado. El sorteo NO se hace solo: lo confirmas tú.</p>
        <div class="adm-row two">
          <div><label class="adm-lbl">Título (opcional)</label><input id="adm-rf-title" class="adm-input" maxlength="60" placeholder="Ej: Sorteo de las 8 PM"></div>
          <div><label class="adm-lbl">Costo para participar (monedas)</label><input id="adm-rf-cost" class="adm-input" type="number" min="0" max="100000" value="50"></div>
        </div>
        <label class="adm-lbl">Premio</label>
        <div class="adm-seg" id="adm-rf-type">
          <button type="button" class="on" data-t="pack">${Raffles.ico('package')} Sobre</button>
          <button type="button" data-t="tiradas">${Raffles.ico('ticket')} Tiradas</button>
        </div>
        <div id="adm-rf-pack-box"><label class="adm-lbl">Categoría del sobre</label>
          <select id="adm-rf-rarity" class="adm-input">${Object.entries(Raffles.PACKS).map(([k, v]) => `<option value="${k}">Sobre ${v.label}</option>`).join('')}</select></div>
        <div id="adm-rf-amt-box" style="display:none"><label class="adm-lbl">Cantidad de tiradas</label><input id="adm-rf-amt" class="adm-input" type="number" min="1" max="${Prizes.MAX_TIRADAS}" value="10"></div>
        <label class="adm-lbl">Cierra / se sortea a las</label>
        <div class="adm-row">
          <div><input id="adm-rf-end" class="adm-input" type="datetime-local"></div>
          <button class="btn" type="button" data-rfq="30" title="En 30 minutos">+30 min</button>
          <button class="btn" type="button" data-rfq="hour" title="Próxima hora en punto">Próx. hora</button>
          <button class="btn" type="button" data-rfq="60" title="En 1 hora">+1 h</button>
        </div>
        <button class="btn btn-primary adm-send" id="adm-rf-create" type="button">Crear sorteo y publicar anuncio</button>
        <p class="adm-msg" id="adm-rf-msg" role="status"></p>
        <div id="adm-rf-list" class="adm-list"><p class="adm-empty">Cargando…</p></div>
      </section>

      <section class="adm-card adm-wide">
        <div class="adm-head"><h3>${Raffles.ico('users')} Intentos extra por jugador</h3><button class="btn" id="adm-lim-refresh" type="button">Actualizar</button></div>
        <p class="adm-hint">Cada jugador tiene <b>${BattleAttempts.MAX_DAILY} intentos por modo y por día</b>. Aquí ves los correos de todos los que han abierto la app y puedes subirles ese límite (por ejemplo, para un torneo en persona). Le llega en vivo a quien tenga la app abierta. Solo salen en la lista quienes hayan entrado a la app después de esta actualización; a cualquier otro puedes escribirle el correo abajo.</p>
        <label class="adm-lbl">Intentos por modo y día</label>
        <div class="adm-chips">
          <input id="adm-lim-n" class="adm-input" style="width:110px" type="number" min="3" max="${BattleAttempts.MAX_CAP}" value="20">
          <button type="button" data-lim="10">10</button><button type="button" data-lim="20">20</button><button type="button" data-lim="50">50</button><button type="button" data-lim="${BattleAttempts.MAX_CAP}">Sin límite</button>
        </div>
        <label class="adm-lbl">Correos que no estén en la lista (opcional)</label>
        <textarea id="adm-lim-emails" class="adm-input" rows="2" placeholder="uno@correo.com, otro@correo.com"></textarea>
        <div class="adm-btnrow">
          <button class="btn btn-primary" id="adm-lim-apply" type="button">Dar intentos a los seleccionados</button>
          <button class="btn" id="adm-lim-reset" type="button">Volver a normal</button>
        </div>
        <p class="adm-msg" id="adm-lim-msg" role="status"></p>
        <div class="adm-tools">
          <input id="adm-lim-q" class="adm-input" type="search" placeholder="Buscar por nombre o correo…" autocomplete="off">
          <label class="adm-chk"><input type="checkbox" id="adm-lim-all"> Seleccionar todos los que se ven</label>
          <span class="adm-count" id="adm-lim-count"></span>
        </div>
        <div id="adm-lim-list" class="adm-list"><p class="adm-empty">Cargando…</p></div>
      </section>

      <section class="adm-card adm-wide">
        <div class="adm-head"><h3>📋 Historial de premios</h3><button class="btn" id="adm-refresh" type="button">Actualizar</button></div>
        <div id="adm-prizes" class="adm-list"><p class="adm-empty">Cargando…</p></div>
      </section>`;

    this._bind(root);
    this.loadCodes(); this.loadPrizes(); this.loadRaffles(); this.loadLimits();
  },

  _bind(root) {
    const q = s => root.querySelector(s);
    let type = 'card';
    q('#adm-type').addEventListener('click', e => {
      const b = e.target.closest('button[data-t]'); if (!b) return;
      type = b.dataset.t;
      root.querySelectorAll('#adm-type button').forEach(x => x.classList.toggle('on', x === b));
      q('#adm-card-box').style.display = type === 'card' ? '' : 'none';
      q('#adm-amount-box').style.display = type === 'card' ? 'none' : '';
      q('#adm-amount-lbl').textContent = type === 'tiradas' ? 'Cantidad de tiradas' : 'Cantidad de monedas';
      q('#adm-amount').value = type === 'tiradas' ? 10 : 500;
    });
    q('#adm-send').onclick = () => this.sendPrize(type);
    q('#adm-gen').onclick = () => { q('#adm-code').value = this._randomCode(); };
    q('#adm-code-save').onclick = () => this.createCode();
    q('#adm-refresh').onclick = () => { this.loadPrizes(); this.loadCodes(); };
    q('#adm-codes').addEventListener('click', e => this._codeAction(e));
    q('#adm-prizes').addEventListener('click', e => this._prizeAction(e));
    // ---- sorteos
    let rtype = 'pack';
    q('#adm-rf-type').addEventListener('click', e => {
      const b = e.target.closest('button[data-t]'); if (!b) return; rtype = b.dataset.t;
      root.querySelectorAll('#adm-rf-type button').forEach(x => x.classList.toggle('on', x === b));
      q('#adm-rf-pack-box').style.display = rtype === 'pack' ? '' : 'none';
      q('#adm-rf-amt-box').style.display = rtype === 'tiradas' ? '' : 'none';
    });
    q('#adm-rf-end').value = this._localInput(this._nextHour());
    root.querySelectorAll('[data-rfq]').forEach(b => b.onclick = () => {
      const v = b.dataset.rfq; q('#adm-rf-end').value = this._localInput(v === 'hour' ? this._nextHour() : Date.now() + Number(v) * 60000);
    });
    q('#adm-rf-create').onclick = () => this.createRaffle(rtype);
    q('#adm-rf-refresh').onclick = () => this.loadRaffles();
    q('#adm-rf-list').addEventListener('click', e => this._raffleAction(e));
    // ---- intentos extra
    q('#adm-lim-refresh').onclick = () => this.loadLimits();
    root.querySelectorAll('[data-lim]').forEach(b => b.onclick = () => { q('#adm-lim-n').value = b.dataset.lim; });
    q('#adm-lim-q').addEventListener('input', () => this._limRender());
    q('#adm-lim-all').addEventListener('change', e => {
      this._limVisible().forEach(u => { e.target.checked ? this._limSel.add(u.email) : this._limSel.delete(u.email); });
      this._limRender();
    });
    q('#adm-lim-list').addEventListener('change', e => {
      const c = e.target.closest('input[data-em]'); if (!c) return;
      c.checked ? this._limSel.add(c.dataset.em) : this._limSel.delete(c.dataset.em);
      this._limCount();
    });
    q('#adm-lim-apply').onclick = () => this.applyLimits(false);
    q('#adm-lim-reset').onclick = () => this.applyLimits(true);
  },

  // ------------------------------------------------------ intentos extra
  _lim: { users: [], limits: {} }, _limSel: new Set(),

  async loadLimits() {
    const box = document.getElementById('adm-lim-list'); if (!box) return;
    try {
      const [dir, lims] = await Promise.all([
        fbDB.collection('directory').limit(1000).get(),
        fbDB.collection('attemptLimits').limit(1000).get()
      ]);
      const limits = {}; lims.docs.forEach(d => { const v = d.data(); limits[d.id] = { daily: Number(v.daily) || 0 }; });
      const byMail = new Map();
      dir.docs.forEach(d => { const u = d.data(), em = String(u.email || '').toLowerCase(); if (em) byMail.set(em, { email: em, name: u.name || '', lastSeen: u.lastSeen || '' }); });
      Object.keys(limits).forEach(em => { if (!byMail.has(em)) byMail.set(em, { email: em, name: '', lastSeen: '' }); });   // dados a mano y que aún no entran
      this._lim = { users: [...byMail.values()].sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, 'es')), limits };
      this._limSel = new Set([...this._limSel].filter(em => byMail.has(em)));
      this._limRender();
    } catch (e) {
      console.warn('[Admin] intentos extra', e);
      box.innerHTML = '<p class="adm-empty">No se pudo cargar la lista (¿publicaste las nuevas reglas de Firestore?).</p>';
    }
  },

  _limVisible() {
    const k = (document.getElementById('adm-lim-q')?.value || '').trim().toLowerCase();
    return this._lim.users.filter(u => !k || u.email.includes(k) || (u.name || '').toLowerCase().includes(k));
  },
  _limCount() {
    const el = document.getElementById('adm-lim-count'); if (!el) return;
    const withExtra = Object.keys(this._lim.limits).length;
    el.textContent = `${this._lim.users.length} correo${this._lim.users.length === 1 ? '' : 's'} · ${this._limSel.size} seleccionado${this._limSel.size === 1 ? '' : 's'} · ${withExtra} con intentos extra`;
  },
  _limRender() {
    const box = document.getElementById('adm-lim-list'); if (!box) return;
    const list = this._limVisible();
    box.innerHTML = list.length ? list.map(u => {
      const n = this._lim.limits[u.email]?.daily, on = this._limSel.has(u.email);
      const seen = u.lastSeen ? new Date(u.lastSeen).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }) : 'aún no ha entrado';
      return `<label class="adm-item"><span class="adm-chk"><input type="checkbox" data-em="${this._esc(u.email)}" ${on ? 'checked' : ''}></span>
        <div class="adm-item-main"><b>${this._esc(u.name || u.email)}</b><span>${u.name ? this._esc(u.email) : ''}</span><small>Última vez: ${seen}</small></div>
        <span class="adm-badge ${n ? 'extra' : 'norm'}">${n ? n + ' por modo' : 'Normal (' + BattleAttempts.MAX_DAILY + ')'}</span></label>`;
    }).join('') : `<p class="adm-empty">${this._lim.users.length ? 'Nadie coincide con la búsqueda.' : 'Todavía no hay correos: aparecerán cuando los jugadores abran la app.'}</p>`;
    const all = document.getElementById('adm-lim-all'); if (all) all.checked = list.length > 0 && list.every(u => this._limSel.has(u.email));
    this._limCount();
  },

  applyLimits(reset) {
    const typed = (document.getElementById('adm-lim-emails').value || '').split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
    const emails = [...new Set([...this._limSel, ...typed])];
    if (!emails.length) return this._msg('adm-lim-msg', 'Selecciona al menos un correo de la lista o escríbelo arriba', 'err');
    const bad = emails.find(e => !Auth.validateEmail(e));
    if (bad) return this._msg('adm-lim-msg', `Correo inválido: ${bad}`, 'err');
    const n = Math.floor(Number(document.getElementById('adm-lim-n').value));
    if (!reset && !(n > BattleAttempts.MAX_DAILY && n <= BattleAttempts.MAX_CAP)) return this._msg('adm-lim-msg', `Los intentos deben estar entre ${BattleAttempts.MAX_DAILY + 1} y ${BattleAttempts.MAX_CAP}`, 'err');
    const shown = emails.slice(0, 8).map(e => this._esc(e)).join('<br>') + (emails.length > 8 ? `<br>… y ${emails.length - 8} más` : '');
    const text = reset
      ? `Estos <b>${emails.length}</b> correo${emails.length === 1 ? '' : 's'} vuelven a <b>${BattleAttempts.MAX_DAILY} intentos</b> por modo y día:<br><b>${shown}</b>`
      : `Vas a dar <b>${n >= BattleAttempts.MAX_CAP ? 'intentos sin límite' : n + ' intentos'}</b> por modo y día a <b>${emails.length}</b> correo${emails.length === 1 ? '' : 's'}:<br><b>${shown}</b>`;
    this._confirm(reset ? '¿Volver a la normalidad?' : '¿Dar intentos extra?', text, async () => {
      const btns = [document.getElementById('adm-lim-apply'), document.getElementById('adm-lim-reset')]; btns.forEach(b => b && (b.disabled = true));
      try {
        for (let i = 0; i < emails.length; i += 400) {
          const batch = fbDB.batch();
          emails.slice(i, i + 400).forEach(email => {
            const ref = fbDB.collection('attemptLimits').doc(email);
            if (reset) batch.delete(ref);
            else batch.set(ref, { email, daily: n, updatedAt: new Date().toISOString(), updatedBy: fbAuth.currentUser.uid });
          });
          await batch.commit();
        }
        this._msg('adm-lim-msg', reset ? `${emails.length} correo${emails.length === 1 ? '' : 's'} vuelven al límite normal` : `Listo: ${emails.length} correo${emails.length === 1 ? '' : 's'} con ${n} intentos por modo`, 'ok');
        document.getElementById('adm-lim-emails').value = ''; this._limSel.clear();
        await this.loadLimits();
      } catch (e) {
        console.error('[Admin] intentos extra', e);
        this._msg('adm-lim-msg', 'No se pudo guardar: ¿publicaste las nuevas reglas de Firestore?', 'err');
      }
      btns.forEach(b => b && (b.disabled = false));
    });
  },

  _msg(id, text, cls) { const el = document.getElementById(id); if (el) { el.textContent = text; el.className = 'adm-msg ' + (cls || ''); } },

  _confirm(title, text, onOk) {
    if (typeof HeadCards !== 'undefined' && HeadCards._dialog)
      HeadCards._dialog({ icon: Raffles.ico('trophy', '#ffc83d'), title, text, cancel: 'Cancelar', ok: 'Confirmar', onOk });
    else if (confirm(title + '\n' + text.replace(/<[^>]+>/g, ''))) onOk();
  },

  // -------------------------------------------------------------- sorteos
  _nextHour() { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return d.getTime(); },
  _localInput(ms) { const d = new Date(ms), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; },

  createRaffle(type) {
    const q = id => document.getElementById(id);
    const endsAtMs = new Date(q('adm-rf-end').value).getTime();
    const cost = Math.floor(Number(q('adm-rf-cost').value));
    const title = q('adm-rf-title').value.trim().slice(0, 60);
    if (!Number.isFinite(endsAtMs) || endsAtMs <= Date.now() + 30000) return this._msg('adm-rf-msg', 'Elige una hora de cierre en el futuro', 'err');
    if (!(cost >= 0) || cost > 100000) return this._msg('adm-rf-msg', 'El costo debe estar entre 0 y 100000 monedas', 'err');
    let prize;
    if (type === 'pack') prize = { type: 'pack', rarity: q('adm-rf-rarity').value };
    else {
      const n = Math.floor(Number(q('adm-rf-amt').value));
      if (!(n >= 1) || n > Prizes.MAX_TIRADAS) return this._msg('adm-rf-msg', `Las tiradas deben estar entre 1 y ${Prizes.MAX_TIRADAS}`, 'err');
      prize = { type: 'tiradas', amount: n };
    }
    const when = new Date(endsAtMs).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' });
    this._confirm('¿Publicar el sorteo?', `Premio: <b>${this._esc(Raffles.prizeLabel(prize))}</b><br>Costo: <b>${cost} monedas</b><br>Se sortea: <b>${when}</b><br>Todos los jugadores verán el anuncio rojo.`, async () => {
      const btn = q('adm-rf-create'); btn.disabled = true;
      try {
        await fbDB.collection('raffles').add({ title, prize, cost, endsAtMs, endsAt: new Date(endsAtMs).toISOString(), status: 'open',
          createdAt: new Date().toISOString(), createdBy: fbAuth.currentUser.uid, claimed: false });
        this._msg('adm-rf-msg', 'Sorteo publicado: ya aparece el anuncio rojo a todos', 'ok');
        q('adm-rf-title').value = ''; q('adm-rf-end').value = this._localInput(this._nextHour());
        this.loadRaffles();
      } catch (e) {
        console.error('[Admin] crear sorteo', e);
        this._msg('adm-rf-msg', 'No se pudo crear: ¿publicaste las nuevas reglas de Firestore?', 'err');
      }
      btn.disabled = false;
    });
  },

  async loadRaffles() {
    const box = document.getElementById('adm-rf-list'); if (!box) return;
    try {
      const snap = await fbDB.collection('raffles').orderBy('createdAt', 'desc').limit(25).get();
      if (snap.empty) { box.innerHTML = '<p class="adm-empty">Todavía no has creado sorteos.</p>'; return; }
      box.innerHTML = snap.docs.map(d => {
        const r = d.data(), open = r.status === 'open', closed = open && r.endsAtMs <= Date.now();
        const when = new Date(r.endsAtMs).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' });
        const badge = open ? (closed ? '<span class="adm-badge pend">Listo para sortear</span>' : '<span class="adm-badge pend">Abierto</span>') : '<span class="adm-badge done">Sorteado</span>';
        const res = open ? '' : (r.winnerName ? ` · Ganador: ${this._esc(r.winnerName)} (${Number(r.entriesCount || 0)} inscritos)${r.claimed ? ' · premio reclamado' : ' · sin reclamar'}` : ' · sin inscritos');
        return `<div class="adm-item"><div class="adm-item-main"><b>${Raffles.prizeIcon(r.prize)} ${this._esc(Raffles.prizeLabel(r.prize))}${r.title ? ' · ' + this._esc(r.title) : ''}</b>
          <span>Cuesta ${Number(r.cost)} monedas · ${open ? 'sorteo' : 'se sorteó'}: ${when}${res}</span>
          <small id="adm-rf-n-${d.id}"></small></div>${badge}
          ${open ? `<button class="btn adm-x" data-rfcount="${d.id}" title="Ver cuántos se anotaron" aria-label="Ver inscritos">${Raffles.ico('users')}</button>
          <button class="btn btn-primary adm-x" data-rfdraw="${d.id}" title="Elegir ganador al azar">${Raffles.ico('dice')} Sortear</button>
          <button class="btn adm-x" data-rfdel="${d.id}" title="Cancelar sorteo" aria-label="Cancelar sorteo">${Raffles.ico('x')}</button>` : ''}</div>`;
      }).join('');
    } catch (e) {
      console.warn('[Admin] sorteos', e);
      box.innerHTML = '<p class="adm-empty">No se pudieron cargar los sorteos (revisa las reglas de Firestore).</p>';
    }
  },

  async _rfCount(id) {
    const s = await fbDB.collection('raffles').doc(id).collection('entries').get();
    const el = document.getElementById('adm-rf-n-' + id);
    if (el) el.innerHTML = `${Raffles.ico('users')} ${s.size} inscrito${s.size === 1 ? '' : 's'}` + (s.size ? ': ' + this._esc(s.docs.map(d => d.data().email).join(', ')) : '');
    return s.size;
  },

  async _raffleAction(e) {
    const t = e.target.closest('button'); if (!t) return;
    try {
      if (t.dataset.rfcount) { t.disabled = true; await this._rfCount(t.dataset.rfcount); t.disabled = false; }
      else if (t.dataset.rfdraw) {
        const id = t.dataset.rfdraw, n = await this._rfCount(id);
        if (!n) return Toast.warn('Todavía no hay inscritos');
        const doc = await fbDB.collection('raffles').doc(id).get(), early = doc.data().endsAtMs > Date.now();
        this._confirm('¿Sortear ahora?', `Hay <b>${n} inscrito${n === 1 ? '' : 's'}</b>.${early ? `<br>${Raffles.ico('alert', '#ffc83d')} Aún no llega la hora de cierre: al sortear se cierran las inscripciones.` : ''}<br>Se elegirá un ganador al azar y todos los inscritos verán el resultado.`, async () => {
          try {
            const r = await Raffles.draw(id);
            this._msg('adm-rf-msg', `Ganador: ${r.winner.name} (${r.winner.email}) · ${r.count} inscritos`, 'ok');
            this.loadRaffles();
          } catch (err) { console.error(err); Toast[err.message === 'already-done' ? 'warn' : 'error'](err.message === 'already-done' ? 'Este sorteo ya se había sorteado' : 'No se pudo sortear'); this.loadRaffles(); }
        });
      } else if (t.dataset.rfdel) {
        const id = t.dataset.rfdel, n = await this._rfCount(id);
        if (n > 0) return Toast.warn('Ya hay inscritos que pagaron: sortea en vez de cancelar');
        this._confirm('¿Cancelar este sorteo?', 'Nadie se ha inscrito. Se borrará el anuncio.', async () => { await fbDB.collection('raffles').doc(id).delete(); this.loadRaffles(); });
      }
    } catch (err) { console.error(err); Toast.error('No se pudo completar la acción'); }
  },

  // ------------------------------------------------------------- premios
  sendPrize(type) {
    const emails = [...new Set(document.getElementById('adm-emails').value.split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean))];
    const note = document.getElementById('adm-note').value.trim().slice(0, 80);
    if (!emails.length) return this._msg('adm-msg', 'Escribe al menos un correo', 'err');
    const bad = emails.find(e => !Auth.validateEmail(e));
    if (bad) return this._msg('adm-msg', `Correo inválido: ${bad}`, 'err');

    const base = { type, note, claimed: false, createdAt: new Date().toISOString(), createdBy: fbAuth.currentUser.uid };
    let label;
    if (type === 'card') {
      const id = document.getElementById('adm-card').value, card = Gacha.getPool().find(f => f.id === id);
      if (!card) return this._msg('adm-msg', 'Elige una carta', 'err');
      base.cardId = card.id; base.cardName = card.name; label = `la carta <b>${this._esc(card.name)}</b> (${this._esc(Gacha.getRarityLabel(card.rareza))})`;
    } else {
      const max = type === 'tiradas' ? Prizes.MAX_TIRADAS : Prizes.MAX_MONEDAS;
      const n = Math.floor(Number(document.getElementById('adm-amount').value));
      if (!(n >= 1) || n > max) return this._msg('adm-msg', `La cantidad debe estar entre 1 y ${max}`, 'err');
      base.amount = n; label = `<b>${n}</b> ${type === 'tiradas' ? 'tiradas' : 'monedas'}`;
    }

    this._confirm('¿Enviar premio?', `Vas a enviar ${label} a:<br><b>${emails.map(e => this._esc(e)).join('<br>')}</b>`, async () => {
      const btn = document.getElementById('adm-send'); btn.disabled = true;
      try {
        const batch = fbDB.batch();
        emails.forEach(email => batch.set(fbDB.collection('prizes').doc(), { ...base, email }));
        await batch.commit();
        this._msg('adm-msg', `✅ Premio enviado a ${emails.length} correo${emails.length > 1 ? 's' : ''}`, 'ok');
        document.getElementById('adm-emails').value = '';
        this.loadPrizes();
      } catch (e) {
        console.error('[Admin] enviar premio', e);
        this._msg('adm-msg', 'No se pudo enviar: ¿publicaste las nuevas reglas de Firestore?', 'err');
      }
      btn.disabled = false;
    });
  },

  async loadPrizes() {
    const box = document.getElementById('adm-prizes'); if (!box) return;
    try {
      const snap = await fbDB.collection('prizes').orderBy('createdAt', 'desc').limit(60).get();
      if (snap.empty) { box.innerHTML = '<p class="adm-empty">Todavía no has enviado premios.</p>'; return; }
      box.innerHTML = snap.docs.map(d => {
        const p = d.data();
        const what = p.type === 'card' ? `🃏 ${this._esc(p.cardName || p.cardId)}` : p.type === 'tiradas' ? `🎟️ ${Number(p.amount)} tiradas` : `🪙 ${Number(p.amount)} monedas`;
        const when = p.createdAt ? new Date(p.createdAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }) : '';
        return `<div class="adm-item"><div class="adm-item-main"><b>${this._esc(p.email)}</b><span>${what}${p.note ? ' · ' + this._esc(p.note) : ''}</span><small>${when}</small></div>
          <span class="adm-badge ${p.claimed ? 'done' : 'pend'}">${p.claimed ? 'Entregado' : 'Pendiente'}</span>
          ${p.claimed ? '' : `<button class="btn adm-x" data-del="${d.id}" title="Cancelar premio">✕</button>`}</div>`;
      }).join('');
    } catch (e) {
      console.warn('[Admin] historial', e);
      box.innerHTML = '<p class="adm-empty">No se pudo cargar el historial (revisa las reglas de Firestore).</p>';
    }
  },

  async _prizeAction(e) {
    const b = e.target.closest('[data-del]'); if (!b) return;
    this._confirm('¿Cancelar este premio?', 'El jugador ya no lo recibirá.', async () => {
      try { await fbDB.collection('prizes').doc(b.dataset.del).delete(); this.loadPrizes(); }
      catch (err) { Toast.error('No se pudo cancelar'); }
    });
  },

  // -------------------------------------------------------------- códigos
  _randomCode() {
    const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return 'CC-' + Array.from({ length: 6 }, () => a[Math.floor(Math.random() * a.length)]).join('');
  },

  async createCode() {
    const code = document.getElementById('adm-code').value.trim().toUpperCase().replace(/\s+/g, '');
    const tiradas = Math.floor(Number(document.getElementById('adm-code-n').value));
    const maxUses = Math.max(0, Math.floor(Number(document.getElementById('adm-code-max').value) || 0));
    if (!/^[A-Z0-9-]{3,40}$/.test(code)) return this._msg('adm-code-msg', 'El código debe tener 3–40 caracteres: letras, números o guion', 'err');
    if (!(tiradas >= 1) || tiradas > Prizes.MAX_TIRADAS) return this._msg('adm-code-msg', `Las tiradas deben estar entre 1 y ${Prizes.MAX_TIRADAS}`, 'err');
    const ref = fbDB.collection('codes').doc(code);
    try {
      if ((await ref.get()).exists) return this._msg('adm-code-msg', 'Ese código ya existe', 'err');
      await ref.set({ code, tiradas, maxUses, uses: 0, active: true, createdAt: new Date().toISOString(), createdBy: fbAuth.currentUser.uid });
      this._msg('adm-code-msg', `✅ Código ${code} creado`, 'ok');
      document.getElementById('adm-code').value = '';
      this.loadCodes();
    } catch (e) {
      console.error('[Admin] crear código', e);
      this._msg('adm-code-msg', 'No se pudo crear: ¿publicaste las nuevas reglas de Firestore?', 'err');
    }
  },

  async loadCodes() {
    const box = document.getElementById('adm-codes'); if (!box) return;
    try {
      const snap = await fbDB.collection('codes').orderBy('createdAt', 'desc').limit(50).get();
      if (snap.empty) { box.innerHTML = '<p class="adm-empty">Aún no hay códigos.</p>'; return; }
      box.innerHTML = snap.docs.map(d => {
        const c = d.data(), lim = c.maxUses > 0 ? `${c.uses || 0}/${c.maxUses}` : `${c.uses || 0}`;
        return `<div class="adm-item"><div class="adm-item-main"><b class="adm-code">${this._esc(d.id)}</b><span>${Number(c.tiradas)} tiradas · usos: ${lim}</span></div>
          <button class="btn adm-x" data-copy="${this._esc(d.id)}" title="Copiar">📋</button>
          <button class="btn adm-x" data-toggle="${this._esc(d.id)}" data-on="${c.active === false ? '0' : '1'}">${c.active === false ? 'Activar' : 'Pausar'}</button>
          <button class="btn adm-x" data-delcode="${this._esc(d.id)}" title="Borrar">🗑️</button></div>`;
      }).join('');
    } catch (e) {
      console.warn('[Admin] códigos', e);
      box.innerHTML = '<p class="adm-empty">No se pudieron cargar los códigos (revisa las reglas de Firestore).</p>';
    }
  },

  async _codeAction(e) {
    const t = e.target.closest('button'); if (!t) return;
    try {
      if (t.dataset.copy) { await navigator.clipboard.writeText(t.dataset.copy); Toast.success('Código copiado'); }
      else if (t.dataset.toggle) { await fbDB.collection('codes').doc(t.dataset.toggle).update({ active: t.dataset.on !== '1' }); this.loadCodes(); }
      else if (t.dataset.delcode) {
        this._confirm('¿Borrar este código?', `Se borrará <b>${this._esc(t.dataset.delcode)}</b>. Quienes ya lo canjearon conservan sus tiradas.`, async () => {
          await fbDB.collection('codes').doc(t.dataset.delcode).delete(); this.loadCodes();
        });
      }
    } catch (err) { Toast.error('No se pudo completar la acción'); }
  }
};
