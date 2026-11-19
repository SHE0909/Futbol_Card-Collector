// admin-panel.js
// --------------------------------------------------
// Pestaña "Admin": solo la ve la cuenta admin (ver admin.js). Sirve para el torneo:
//   · Enviar premios a un correo: carta a elección, tiradas o monedas.
//   · Crear / activar / borrar códigos canjeables de tiradas.
//   · Ver el historial de premios (pendiente / entregado) y cancelar pendientes.
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
        <div class="adm-head"><h3>📋 Historial de premios</h3><button class="btn" id="adm-refresh" type="button">Actualizar</button></div>
        <div id="adm-prizes" class="adm-list"><p class="adm-empty">Cargando…</p></div>
      </section>`;

    this._bind(root);
    this.loadCodes(); this.loadPrizes();
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
  },

  _msg(id, text, cls) { const el = document.getElementById(id); if (el) { el.textContent = text; el.className = 'adm-msg ' + (cls || ''); } },

  _confirm(title, text, onOk) {
    if (typeof HeadCards !== 'undefined' && HeadCards._dialog)
      HeadCards._dialog({ icon: '🏆', title, text, cancel: 'Cancelar', ok: 'Confirmar', onOk });
    else if (confirm(title + '\n' + text.replace(/<[^>]+>/g, ''))) onOk();
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
