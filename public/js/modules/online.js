// online.js
// --------------------------------------------------
// Apartado ONLINE de los minijuegos: rankings, feed de drops, "quién tiene
// esta carta" y rivales para Head Cards.
//
// Colecciones de Firestore (ver firestore.rules):
//   leaderboard/{uid}  -> resumen público del jugador (1 doc por usuario)
//   drops/{cardId_uid} -> primera vez que un usuario obtiene una carta
//
// Consumo de lecturas: todo se cachea en memoria 60 s y los rankings piden
// máximo 20 docs; los drops se escriben solo la primera vez por carta.

const Online = {
  TTL: 60 * 1000,
  _cache: {},
  _lastSync: 0,
  _denied: false,
  _isDenied(e) { return /permission|insufficient/i.test(e?.code + ' ' + e?.message); },
  _DENIED_MSG: 'Online no está activo todavía: falta publicar las reglas de Firestore (archivo firestore.rules).',
  _tab: 'ranking',

  RAREZA_PTS: { common: 1, rare: 3, epic: 10, legendary: 40, goat: 150 },
  CATS: {
    ranking: [
      { key: 'headPts',  label: 'Head Cards',  fmt: v => `${v} pts` },
      { key: 'unique',   label: 'Colección',   fmt: v => `${v} cartas` },
      { key: 'rarePts',  label: 'Rareza',      fmt: v => `${v} pts` },
      { key: 'monedas',  label: 'Monedas',     fmt: v => `${v} 🪙` },
    ]
  },

  // ---------- datos ----------
  _db() { return (typeof fbDB !== 'undefined') ? fbDB : null; },

  _summary(user) {
    const figs = user.figuritas || [];
    let rarePts = 0, total = 0;
    figs.forEach(f => { rarePts += this.RAREZA_PTS[f.rareza] || 1; total += 1 + (f.duplicados || 0); });
    // mejor carta = la de mayor rating (con prioridad por rareza)
    const order = { goat: 5, legendary: 4, epic: 3, rare: 2, common: 1 };
    const best = [...figs].sort((a, b) => (order[b.rareza] - order[a.rareza]) || (b.rating - a.rating))[0];
    const fav = user.headFighterId ? figs.find(f => f.id === user.headFighterId) : null;
    const fighter = fav || best;
    return {
      uid: user.uid,
      name: user.name || 'Jugador',
      monedas: user.monedas || 0,
      unique: figs.length,
      total, rarePts,
      cardIds: figs.map(f => f.id),
      headPts: user.headPts || 0,
      headW: user.headWins || 0,
      headL: user.headLosses || 0,
      fighter: fighter ? { id: fighter.id, name: fighter.name, rareza: fighter.rareza, rating: fighter.rating, pos: fighter.pos, team: fighter.team } : null,
      updatedAt: Date.now()
    };
  },

  // Publica/actualiza el resumen público. Throttle de 45 s salvo force.
  async syncProfile(user, force = false) {
    const db = this._db(); if (!db || !user?.uid) return;
    if (this._denied || (!force && Date.now() - this._lastSync < 45000)) return;
    this._lastSync = Date.now();
    try { await db.collection('leaderboard').doc(user.uid).set(this._summary(user), { merge: true }); }
    catch (e) { if (this._isDenied(e)) this._denied = true; else console.warn('[Online] sync falló', e.message); }
  },

  // Cartas NUEVAS de una tirada -> feed de drops (1 escritura por carta única).
  async publishDrops(user, newFigs) {
    const db = this._db(); if (this._denied || !db || !user?.uid || !newFigs?.length) return;
    try {
      const batch = db.batch();
      newFigs.forEach(f => {
        batch.set(db.collection('drops').doc(`${f.id}_${user.uid}`), {
          uid: user.uid, name: user.name || 'Jugador',
          cardId: f.id, cardName: f.name, rareza: f.rareza, rating: f.rating,
          at: Date.now()
        });
      });
      await batch.commit();
      this._lastSync = 0; // el perfil cambió -> próxima sync inmediata
      this.syncProfile(user, true);
    } catch (e) { if (this._isDenied(e)) this._denied = true; else console.warn('[Online] drops falló', e.message); }
  },

  async _cached(key, loader) {
    const c = this._cache[key];
    if (c && Date.now() - c.ts < this.TTL) return c.data;
    const data = await loader();
    this._cache[key] = { data, ts: Date.now() };
    return data;
  },

  async getTop(field) {
    return this._cached('top:' + field, async () => {
      const s = await this._db().collection('leaderboard').orderBy(field, 'desc').limit(20).get();
      return s.docs.map(d => d.data());
    });
  },
  async getFeed() {
    return this._cached('feed', async () => {
      const s = await this._db().collection('drops').orderBy('at', 'desc').limit(40).get();
      return s.docs.map(d => d.data()).filter(d => ['epic', 'legendary', 'goat'].includes(d.rareza)).slice(0, 20);
    });
  },
  async getOwners(cardId) {
    return this._cached('own:' + cardId, async () => {
      const s = await this._db().collection('leaderboard').where('cardIds', 'array-contains', cardId).limit(30).get();
      return s.docs.map(d => d.data());
    });
  },
  async getRivals(myUid) {
    const top = await this.getTop('headPts');
    return top.filter(r => r.uid !== myUid && r.fighter);
  },

  // ---------- UI ----------
  _ago(ts) {
    const m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return 'ahora'; if (m < 60) return `hace ${m} min`;
    const h = Math.floor(m / 60); if (h < 24) return `hace ${h} h`;
    return `hace ${Math.floor(h / 24)} d`;
  },
  _esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  _rz(r) { return `<span class="rarity-badge badge-${r}">${Gacha.getRarityLabel(r)}</span>`; },

  async open() {
    const el = document.getElementById('tab-battle'); if (!el) return;
    const user = await Auth.currentUser();
    this._me = user;
    el.innerHTML = `
      <div class="section-header">
        <h2 style="width:100%;text-align:center">🌐 Online</h2>
      </div>
      <div class="online-top">
        <button class="btn btn-sm" id="online-back">← Minijuegos</button>
        <div class="online-tabs" id="online-tabs">
          <button data-t="ranking" class="active">🏆 Rankings</button>
          <button data-t="drops">🎴 Drops</button>
          <button data-t="head">⚽ Head Cards</button>
        </div>
      </div>
      <div id="online-body" class="online-body"></div>`;
    document.getElementById('online-back').onclick = () => Battle.render();
    document.getElementById('online-tabs').addEventListener('click', e => {
      const b = e.target.closest('button[data-t]'); if (!b) return;
      this._tab = b.dataset.t;
      document.querySelectorAll('#online-tabs button').forEach(x => x.classList.toggle('active', x === b));
      this._renderTab();
    });
    this.syncProfile(user);
    this._renderTab();
  },

  _loading() { return '<p class="empty-state" style="opacity:.6">Cargando…</p>'; },
  _fail()    { return '<p class="empty-state">No se pudo cargar. ¿Publicaste las reglas de Firestore (firestore.rules)?</p>'; },

  async _renderTab() {
    const body = document.getElementById('online-body'); if (!body) return;
    body.innerHTML = this._loading();
    try {
      if (this._tab === 'ranking') await this._renderRanking(body);
      else if (this._tab === 'drops') await this._renderDrops(body);
      else await this._renderHead(body);
    } catch (e) { if (this._isDenied(e)) this._denied = true; else console.warn(e); body.innerHTML = this._isDenied(e) ? `<p class="empty-state">${this._DENIED_MSG}</p>` : this._fail(); }
  },

  async _renderRanking(body, catIdx = 0) {
    const cats = this.CATS.ranking, cat = cats[catIdx];
    const rows = await this.getTop(cat.key);
    const me = this._me?.uid;
    body.innerHTML = `
      <div class="online-chips">${cats.map((c, i) => `<button class="chip ${i === catIdx ? 'active' : ''}" data-i="${i}">${c.label}</button>`).join('')}</div>
      <ol class="rank-list">
        ${rows.length ? rows.map((r, i) => `
          <li class="rank-row ${r.uid === me ? 'me' : ''} ${i < 3 ? 'top' + (i + 1) : ''}">
            <span class="rank-pos">${['🥇', '🥈', '🥉'][i] || i + 1}</span>
            <span class="rank-name">${this._esc(r.name)}${r.fighter ? `<small>${this._esc(r.fighter.name)}</small>` : ''}</span>
            <span class="rank-val">${cat.fmt(r[cat.key] || 0)}</span>
          </li>`).join('') : '<p class="empty-state">Aún no hay jugadores. ¡Sé el primero!</p>'}
      </ol>`;
    body.querySelectorAll('.chip').forEach(b => b.onclick = () => this._renderRanking(body, +b.dataset.i));
  },

  async _renderDrops(body, selected = null) {
    const feed = await this.getFeed();
    const pool = Gacha.getPool().filter(f => ['goat', 'legendary', 'epic', 'rare'].includes(f.rareza));
    body.innerHTML = `
      <h3 class="online-h">Últimos drops épicos o mejores</h3>
      <ul class="drop-feed">
        ${feed.length ? feed.map(d => `
          <li class="drop-row drop-${d.rareza}">
            <b>${this._esc(d.name)}</b> consiguió a <b>${this._esc(d.cardName)}</b> ${this._rz(d.rareza)}
            <small>${this._ago(d.at)}</small>
          </li>`).join('') : '<p class="empty-state">Todavía no hay drops épicos registrados.</p>'}
      </ul>
      <h3 class="online-h">¿Quién tiene esta carta?</h3>
      <select id="owners-select" class="online-select">
        <option value="">Elige una carta…</option>
        ${pool.map(f => `<option value="${f.id}" ${f.id === selected ? 'selected' : ''}>${this._esc(f.name)} · ${Gacha.getRarityLabel(f.rareza)}</option>`).join('')}
      </select>
      <div id="owners-out"></div>`;
    const out = body.querySelector('#owners-out');
    body.querySelector('#owners-select').onchange = async e => {
      const id = e.target.value; if (!id) { out.innerHTML = ''; return; }
      out.innerHTML = this._loading();
      try {
        const owners = await this.getOwners(id);
        out.innerHTML = owners.length
          ? `<p class="online-sub">${owners.length} jugador${owners.length > 1 ? 'es' : ''} la tienen</p><div class="owner-chips">${owners.map(o => `<span class="chip">${this._esc(o.name)}</span>`).join('')}</div>`
          : '<p class="empty-state">Nadie la tiene todavía. ¡Podrías ser el primero!</p>';
      } catch (_) { out.innerHTML = this._fail(); }
    };
  },

  async _renderHead(body) {
    const user = this._me; const owned = user?.figuritas || [];
    if (!owned.length) { body.innerHTML = '<p class="empty-state">Necesitas al menos 1 carta del gacha para jugar.</p>'; return; }
    const rivals = this._denied ? [] : await this.getRivals(user.uid).catch(e => { if (this._isDenied(e)) this._denied = true; return []; });
    body.innerHTML = `
      <div class="head-intro">
        <h3>⚽ Head Cards</h3>
        <p>Duelo 1 vs 1 estilo Head Soccer. Tu carta define tu velocidad, salto, potencia de tiro y tamaño; la rareza multiplica todo.</p>
        <div class="head-record">🏆 ${user.headWins || 0} V · 💀 ${user.headLosses || 0} D · ${user.headPts || 0} pts</div>
      </div>
      <h4 class="online-h">Rivales online</h4>
      <p class="online-sub">Enfrentas la carta que otro jugador eligió como luchador (controlada por la IA).</p>
      <div class="rival-grid">
        ${rivals.length ? rivals.map(r => `
          <button class="rival-card" data-uid="${r.uid}">
            <b>${this._esc(r.name)}</b>
            <span>${this._esc(r.fighter.name)}</span>
            ${this._rz(r.fighter.rareza)}
            <small>${r.headPts || 0} pts</small>
          </button>`).join('') : '<p class="empty-state">Aún no hay rivales online. Juega contra la CPU para entrar al ranking.</p>'}
      </div>
      <div class="head-cpu-row">
        <button class="btn btn-primary" data-cpu="easy">CPU Fácil</button>
        <button class="btn btn-primary" data-cpu="normal">CPU Normal</button>
        <button class="btn btn-primary" data-cpu="hard">CPU Difícil</button>
        <button class="btn" data-cpu="local">2 jugadores (mismo teclado)</button>
      </div>
      <h4 class="online-h">⚡ Duelo en vivo con un amigo (P2P)</h4>
      <p class="online-sub">Crea una sala y pásale el código, o únete con el suyo. Sin servidor: se conectan directo entre navegadores.</p>
      <div class="head-cpu-row"><button class="btn btn-primary" id="p2p-host">🔑 Crear sala</button>
        <input id="p2p-code" class="online-select" style="max-width:130px;text-transform:uppercase" maxlength="5" placeholder="CÓDIGO">
        <button class="btn" id="p2p-join">Unirme</button></div>
      <div id="p2p-status" class="online-sub"></div>`;
    this._bindP2P(body);
    body.querySelectorAll('.rival-card').forEach(b => b.onclick = () => {
      const r = rivals.find(x => x.uid === b.dataset.uid);
      HeadCards.open({ type: 'online', rival: r });
    });
    body.querySelectorAll('[data-cpu]').forEach(b => b.onclick = () => HeadCards.open({ type: b.dataset.cpu }));
  }

  ,
  _bindP2P(body) {
    const st = body.querySelector('#p2p-status'); HeadCards._remoteCard = null;
    const cb = {
      onOpen: () => { st.textContent = '¡Conectado!'; HeadCards.open({ type: 'p2p' }); },
      onMsg: m => HeadCards._onMsg(m),
      onClose: () => HeadCards._p2pClosed(),
      onFail: e => { st.textContent = ''; Toast.error(this._isDenied(e) ? this._DENIED_MSG : (e.message || 'No se pudo conectar')); P2P.close(); }
    };
    body.querySelector('#p2p-host').onclick = async () => {
      st.textContent = 'Creando sala…';
      try { await P2P.host({ ...cb, onCode: c => { st.innerHTML = `Código de sala: <b style="font-size:1.6rem;letter-spacing:4px;color:var(--pt-gold,#ffc83d)">${c}</b> · esperando rival…`; } }); }
      catch (e) { cb.onFail(e); }
    };
    body.querySelector('#p2p-join').onclick = async () => {
      const code = body.querySelector('#p2p-code').value; if (code.trim().length < 5) return Toast.warn('Escribe el código de 5 letras');
      st.textContent = 'Conectando…'; try { await P2P.join(code, cb); } catch (e) { cb.onFail(e); }
    };
  }
};
