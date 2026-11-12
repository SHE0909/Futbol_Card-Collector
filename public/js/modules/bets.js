// bets.js
// --------------------------------------------------
// Apuestas con monedas estilo casa de apuestas (solo monedas virtuales).
// Mercados: Resultado 1X2, Doble oportunidad, Total de goles (1.5/2.5/3.5),
// Ambos anotan, Marcador exacto y, EN VIVO, "Siguiente gol".
// Las cuotas salen de un modelo Poisson sencillo (fuerza = puntos por partido
// de la tabla si está en caché) con 7 % de margen de la casa.
// Se pueden combinar selecciones de partidos distintos en una combinada.
//
// Datos: user.apuestas[] = { id, legs[], stake, odds, status, payout, at }
// No consume API extra: usa getPredictableMatches / getLiveMatches (ya cacheados).

const Bets = {
  MIN: 5, MAX: 1000, MAX_OPEN: 12, MARGIN: 0.93,
  slip: [], _tab: 'markets', _matches: [], _filter: 'all', _mk: {}, _busy: false,

  // ---------- modelo de cuotas ----------
  _ppg(name) {
    try {
      for (const k of Object.keys(Cache._mem || {})) {
        if (!k.startsWith('standings')) continue;
        const rows = Cache._mem[k]?.data; if (!Array.isArray(rows)) continue;
        const r = rows.find(t => (t.team || t.name) === name);
        if (r && r.pj > 2) return r.pts / r.pj;
      }
    } catch (_) {}
    return 1.4;
  },
  _pois(l, k) { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; },
  _leagueGoals(m) {
    const c = String(m.competition || m.league || '').toLowerCase();
    if (/champions|europa|conference/.test(c)) return 2.9;
    if (/premier|bundesliga|eredivisie/.test(c)) return 2.95;
    if (/copa|cup|fa\b|super/.test(c)) return 2.7;
    if (/la ?liga|primera|serie a|ligue/.test(c)) return 2.55;
    return 2.6;
  },
  _model(m) {
    const sH = this._ppg(m.home), sA = this._ppg(m.away), base = this._leagueGoals(m);
    const d = Math.max(-0.28, Math.min(0.28, (sH - sA) * 0.1 + 0.05));
    const total = Math.max(1.9, Math.min(3.5, base + (sH + sA - 2.8) * 0.18));
    const lH = total * (0.5 + d), lA = total - lH;
    return { lH, lA, total, d };
  },
  _odd(p) { return Math.max(1.05, Math.round(this.MARGIN / Math.max(0.01, p) * 100) / 100); },
  _grid(mod, max = 7) {
    const g = []; for (let h = 0; h <= max; h++) for (let a = 0; a <= max; a++) g.push({ h, a, p: this._pois(mod.lH, h) * this._pois(mod.lA, a) });
    return g;
  },
  _markets(m, state) {
    const mod = this._model(m), g = this._grid(mod), P = f => g.filter(f).reduce((s, x) => s + x.p, 0);
    const mk = [];
    if (state === 'live') {
      const sh = m.scoreHome || 0, sa = m.scoreAway || 0, min = Math.min(88, Number(String(m.minute || '0').replace(/\D/g, '')) || 45);
      const rem = (90 - min) / 90, l = mod.total * rem, p0 = Math.exp(-l), pAny = 1 - p0, shareH = mod.lH / mod.total;
      mk.push({ id: 'next', label: 'Siguiente gol', picks: [
        { k: 'home', l: m.home, o: this._odd(pAny * shareH) }, { k: 'none', l: 'Sin más goles', o: this._odd(p0) }, { k: 'away', l: m.away, o: this._odd(pAny * (1 - shareH)) }],
        base: { h: sh, a: sa } });
      const line = sh + sa + 0.5, pOver = 1 - p0;
      mk.push({ id: 'ltot', label: `Goles totales ${line}`, line, picks: [{ k: 'over', l: `Más de ${line}`, o: this._odd(pOver) }, { k: 'under', l: `Menos de ${line}`, o: this._odd(p0) }] });
      return mk;
    }
    const pH = P(x => x.h > x.a), pD = P(x => x.h === x.a), pA = P(x => x.h < x.a);
    mk.push({ id: '1x2', label: 'Resultado', picks: [{ k: 'home', l: m.home, o: this._odd(pH) }, { k: 'draw', l: 'Empate', o: this._odd(pD) }, { k: 'away', l: m.away, o: this._odd(pA) }] });
    mk.push({ id: 'dc', label: 'Doble oportunidad', picks: [{ k: '1X', l: `${m.home} o empate`, o: this._odd(pH + pD) }, { k: '12', l: 'Gana alguno', o: this._odd(pH + pA) }, { k: 'X2', l: `${m.away} o empate`, o: this._odd(pD + pA) }] });
    [1.5, 2.5, 3.5].forEach(line => {
      const po = P(x => x.h + x.a > line);
      mk.push({ id: 'tot' + line, label: `Goles ${line}`, line, picks: [{ k: 'over', l: `Más de ${line}`, o: this._odd(po) }, { k: 'under', l: `Menos de ${line}`, o: this._odd(1 - po) }] });
    });
    const pb = P(x => x.h > 0 && x.a > 0);
    mk.push({ id: 'btts', label: 'Ambos anotan', picks: [{ k: 'yes', l: 'Sí', o: this._odd(pb) }, { k: 'no', l: 'No', o: this._odd(1 - pb) }] });
    [0.5, 1.5].forEach(line => {
      const ph = P(x => x.h > line), pa = P(x => x.a > line);
      mk.push({ id: 'th' + line, label: `${m.home} goles ${line}`, line, team: 'h', picks: [{ k: 'over', l: `Más de ${line}`, o: this._odd(ph) }, { k: 'under', l: `Menos de ${line}`, o: this._odd(1 - ph) }] });
      mk.push({ id: 'ta' + line, label: `${m.away} goles ${line}`, line, team: 'a', picks: [{ k: 'over', l: `Más de ${line}`, o: this._odd(pa) }, { k: 'under', l: `Menos de ${line}`, o: this._odd(1 - pa) }] });
    });
    const pH2 = P(x => x.h - x.a >= 2), pA2 = P(x => x.a - x.h >= 2);
    mk.push({ id: 'margin', label: 'Margen de victoria', picks: [{ k: 'h2', l: `${m.home} por 2+`, o: this._odd(pH2) }, { k: 'other', l: 'Otro', o: this._odd(1 - pH2 - pA2) }, { k: 'a2', l: `${m.away} por 2+`, o: this._odd(pA2) }] });
    const pOdd = P(x => (x.h + x.a) % 2 === 1);
    mk.push({ id: 'parity', label: 'Goles par/impar', picks: [{ k: 'odd', l: 'Impar', o: this._odd(pOdd) }, { k: 'even', l: 'Par', o: this._odd(1 - pOdd) }] });
    const top = [...g].sort((a, b) => b.p - a.p).slice(0, 8), pTop = top.reduce((s, x) => s + x.p, 0);
    mk.push({ id: 'exact', label: 'Marcador exacto', list: top.map(x => `${x.h}-${x.a}`), picks: [...top.map(x => ({ k: `${x.h}-${x.a}`, l: `${x.h}-${x.a}`, o: this._odd(x.p) })), { k: 'other', l: 'Otro', o: this._odd(1 - pTop) }] });
    return mk;
  },

  // ---------- liquidación ----------
  _legResult(leg, cur, finished) {
    const h = cur.h, a = cur.a, t = h + a;
    switch (leg.market) {
      case 'next': {
        const dh = h - leg.base.h, da = a - leg.base.a;
        if (dh > 0 && da > 0) return 'void';
        if (dh > 0) return leg.pick === 'home' ? 'won' : 'lost';
        if (da > 0) return leg.pick === 'away' ? 'won' : 'lost';
        return finished ? (leg.pick === 'none' ? 'won' : 'lost') : null;
      }
      case '1x2': return !finished ? null : (leg.pick === (h > a ? 'home' : h < a ? 'away' : 'draw') ? 'won' : 'lost');
      case 'dc': return !finished ? null : ({ '1X': h >= a, 'X2': a >= h, '12': h !== a }[leg.pick] ? 'won' : 'lost');
      case 'tot': {
        if (t > leg.line) return leg.pick === 'over' ? 'won' : 'lost';   // se resuelve antes de tiempo
        if (!finished) return null;
        return (leg.pick === 'over') === (t > leg.line) ? 'won' : 'lost';
      }
      case 'tt': {
        const gl = leg.team === 'h' ? h : a;
        if (gl > leg.line) return leg.pick === 'over' ? 'won' : 'lost';
        return !finished ? null : (leg.pick === 'under' ? 'won' : 'lost');
      }
      case 'margin': {
        if (!finished) return null;
        const r = h - a >= 2 ? 'h2' : a - h >= 2 ? 'a2' : 'other'; return leg.pick === r ? 'won' : 'lost';
      }
      case 'parity': return !finished ? null : ((t % 2 === 1) === (leg.pick === 'odd') ? 'won' : 'lost');
      case 'btts': {
        if (leg.pick === 'yes' && h > 0 && a > 0) return 'won';
        if (leg.pick === 'no' && h > 0 && a > 0) return 'lost';
        return !finished ? null : ((leg.pick === 'yes') === (h > 0 && a > 0) ? 'won' : 'lost');
      }
      case 'exact': {
        if (!finished) return null;
        const s = `${h}-${a}`; return leg.pick === 'other' ? (leg.list.includes(s) ? 'lost' : 'won') : (leg.pick === s ? 'won' : 'lost');
      }
    }
    return null;
  },

  async evaluate(finishedList) {
    if (this._busy) return; this._busy = true;
    try {
      const user = await Auth.currentUser(); if (!user) return;
      const open = (user.apuestas || []).filter(b => b.status === 'pending'); if (!open.length) return;
      const live = await API.getLiveMatches().catch(() => []) || [];
      const fin = finishedList || await API.getFinishedMatches().catch(() => []) || [];
      const byId = (arr, id) => arr.find(m => String(m.id) === String(id));
      let changed = false; const done = [];
      for (const bet of open) {
        for (const leg of bet.legs) {
          if (leg.state !== 'pending') continue;
          const f = byId(fin, leg.matchId), l = byId(live, leg.matchId);
          const src = f || l; if (!src || src.scoreHome == null || src.scoreAway == null) continue;
          const r = this._legResult(leg, { h: Number(src.scoreHome), a: Number(src.scoreAway) }, !!f);
          if (r) { leg.state = r; changed = true; }
        }
        if (bet.legs.some(x => x.state === 'lost')) { bet.status = 'lost'; bet.payout = 0; }
        else if (bet.legs.every(x => x.state !== 'pending')) {
          const wonLegs = bet.legs.filter(x => x.state === 'won');
          if (!wonLegs.length) { bet.status = 'void'; bet.payout = bet.stake; }
          else { bet.status = 'won'; bet.payout = Math.round(bet.stake * wonLegs.reduce((p, x) => p * x.odds, 1)); }
        }
        if (bet.status !== 'pending') { done.push(bet); user.monedas = (user.monedas || 0) + (bet.payout || 0); }
      }
      if (!changed) return;
      // limpieza: máx. 40 apuestas resueltas guardadas
      const res = user.apuestas.filter(b => b.status !== 'pending'); if (res.length > 40) user.apuestas = [...user.apuestas.filter(b => b.status === 'pending'), ...res.slice(-40)];
      await Auth.updateUser(user);
      done.forEach(b => b.status === 'won' ? Toast.success(`🎉 ¡Apuesta ganada! +${b.payout} 🪙`, 5000) : b.status === 'void' ? Toast.show(`Apuesta anulada: devolución de ${b.payout} 🪙`) : Toast.show('Apuesta perdida 😕'));
      App.refreshHeader?.(user);
      if (this._tab === 'mine') this._render();
    } catch (e) { console.warn('[Bets] evaluate', e); } finally { this._busy = false; }
  },

  // ---------- UI ----------
  mount() {
    const sec = document.getElementById('tab-predictions'); if (!sec) return;
    if (!document.getElementById('bets-switch')) {
      const sw = document.createElement('div'); sw.id = 'bets-switch'; sw.className = 'bets-switch';
      sw.innerHTML = `<button data-v="pred" class="active">🎯 Predicciones</button><button data-v="markets">💰 Apuestas</button><button data-v="mine">🧾 Mis apuestas</button>`;
      const root = document.createElement('div'); root.id = 'bets-root'; root.style.display = 'none';
      const list = document.getElementById('predictions-list'); list.before(sw); list.after(root);
      sw.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; sw.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b)); this._show(b.dataset.v); });
    }
  },
  _show(v) {
    const pred = v === 'pred'; this._tab = v;
    ['predictions-list'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = pred ? '' : 'none'; });
    document.querySelector('#tab-predictions .pred-section-header')?.style.setProperty('display', pred ? '' : 'none');
    document.getElementById('bets-root').style.display = pred ? 'none' : '';
    if (!pred) this._render();
  },
  async _render() {
    const root = document.getElementById('bets-root'); if (!root) return;
    const user = await Auth.currentUser(); this._user = user;
    if (this._tab === 'mine') return this._renderMine(root, user);
    root.innerHTML = '<p class="empty-state" style="opacity:.6">Cargando partidos…</p>';
    let all = [], live = [];
    try { [all, live] = await Promise.all([API.getPredictableMatches(), API.getLiveMatches().catch(() => [])]); } catch (_) {}
    const liveMap = {}; (live || []).forEach(m => liveMap[String(m.id)] = m);
    this._matches = (all || []).map(m => liveMap[String(m.id)] ? { ...m, ...liveMap[String(m.id)] } : m)
      .map(m => ({ ...m, _s: liveMap[String(m.id)] ? 'live' : API.getMatchState(m) }))
      .filter(m => m._s !== 'finished' && !(m._s === 'live' && m.scoreHome == null))
      .sort((a, b) => (b._s === 'live') - (a._s === 'live')).slice(0, 30);
    const comps = ['all', ...new Set(this._matches.map(m => m.competition).filter(Boolean))];
    const shown = this._matches.filter(m => this._filter === 'all' || m.competition === this._filter);
    root.innerHTML = `
      <div class="bets-bal">Saldo: <b id="bets-bal">${user.monedas || 0}</b> 🪙 · Cuotas con modelo estadístico · solo monedas virtuales</div>
      <div class="online-chips">${comps.map(c => `<button class="chip ${c === this._filter ? 'active' : ''}" data-f="${c}">${c === 'all' ? 'Todas' : c}</button>`).join('')}</div>
      <div class="bets-grid">${shown.length ? shown.map(m => this._card(m)).join('') : '<p class="empty-state">No hay partidos disponibles para apostar ahora.</p>'}</div>
      <div id="bets-slip" class="bets-slip"></div>`;
    root.querySelectorAll('.chip').forEach(c => c.onclick = () => { this._filter = c.dataset.f; this._render(); });
    root.querySelectorAll('.bet-mtab').forEach(b => b.onclick = () => { this._mk[b.dataset.m_] = b.dataset.t; this._render(); });
    root.querySelectorAll('.odd').forEach(b => b.onclick = () => this._toggle(b.dataset.m, b.dataset.mk, b.dataset.k));
    this._drawSlip();
  },
  _card(m) {
    const mks = this._markets(m, m._s), cur = this._mk[m.id] && mks.find(x => x.id === this._mk[m.id]) || mks[0];
    const sel = k => this.slip.some(s => s.key === `${m.id}|${cur.id}|${k}`);
    const crest = u => `<img src="${u || ''}" referrerpolicy="no-referrer" loading="lazy" onerror="this.style.display='none'">`;
    return `<article class="bet-card ${m._s === 'live' ? 'is-live' : ''}">
      <header><span class="bet-comp">${m.competition || ''}</span>${m._s === 'live' ? `<b class="bet-live">● EN VIVO ${m.minute || ''}</b>` : `<span class="bet-time">${API.getTimeUntilMatch(m) || (m.time || '')}</span>`}</header>
      <div class="bet-teams"><span>${crest(m.homeCrest)}${m.home}</span><b>${m._s === 'live' ? `${m.scoreHome ?? 0} - ${m.scoreAway ?? 0}` : 'vs'}</b><span>${m.away}${crest(m.awayCrest)}</span></div>
      <div class="bet-mtabs">${mks.map(x => `<button class="bet-mtab ${x.id === cur.id ? 'active' : ''}" data-m_="${m.id}" data-t="${x.id}">${x.label}</button>`).join('')}</div>
      <div class="bet-odds n${Math.min(cur.picks.length, 3)}">${cur.picks.map(p => `<button class="odd ${sel(p.k) ? 'on' : ''}" data-m="${m.id}" data-mk="${cur.id}" data-k="${p.k}"><span>${p.l}</span><b>${p.o.toFixed(2)}</b></button>`).join('')}</div>
    </article>`;
  },
  _toggle(matchId, mkId, k) {
    const m = this._matches.find(x => String(x.id) === String(matchId)); if (!m) return;
    const mk = this._markets(m, m._s).find(x => x.id === mkId), p = mk.picks.find(x => x.k === k), key = `${matchId}|${mkId}|${k}`;
    const i = this.slip.findIndex(s => s.key === key);
    if (i >= 0) this.slip.splice(i, 1);
    else {
      if (mk.id === 'next' && this.slip.length) { Toast.warn('"Siguiente gol" solo se puede apostar como simple'); return; }
      if (this.slip.some(s => s.market === 'next')) this.slip = [];
      this.slip = this.slip.filter(s => String(s.matchId) !== String(matchId)); // 1 selección por partido
      this.slip.push({ key, matchId, matchLabel: `${m.home} vs ${m.away}`, market: mkId.startsWith('tot') || mkId === 'ltot' ? 'tot' : /^t[ha]\d/.test(mkId) ? 'tt' : mkId, team: mk.team, mlabel: mk.label, line: mk.line, list: mk.list, pick: k, plabel: p.l, odds: p.o, base: mk.base, state: 'pending' });
    }
    this._render();
  },
  _drawSlip() {
    const el = document.getElementById('bets-slip'); if (!el) return;
    if (!this.slip.length) { el.style.display = 'none'; return; }
    const odds = this.slip.reduce((p, s) => p * s.odds, 1), st = this._stake || 20;
    el.style.display = '';
    el.innerHTML = `<div class="slip-head"><b>${this.slip.length > 1 ? `Combinada (${this.slip.length})` : 'Boleto'}</b><button id="slip-clear">Vaciar</button></div>
      ${this.slip.map(s => `<div class="slip-leg"><div><small>${s.matchLabel} · ${s.mlabel}</small><span>${s.plabel}</span></div><b>${s.odds.toFixed(2)}</b></div>`).join('')}
      <div class="slip-row"><label>Apuesta 🪙</label><input id="slip-stake" type="number" min="${this.MIN}" max="${this.MAX}" value="${st}">
        <div class="slip-quick">${[10, 50, 100].map(v => `<button data-v="${v}">${v}</button>`).join('')}<button data-v="max">Máx</button></div></div>
      <div class="slip-total"><span>Cuota total <b>${odds.toFixed(2)}</b></span><span>Ganancia <b id="slip-win">${Math.round(st * odds)}</b> 🪙</span></div>
      <button class="btn btn-primary" id="slip-go">Apostar</button>`;
    const inp = el.querySelector('#slip-stake'), upd = () => { this._stake = Math.floor(+inp.value || 0); el.querySelector('#slip-win').textContent = Math.round(this._stake * odds); };
    inp.oninput = upd;
    el.querySelectorAll('.slip-quick button').forEach(b => b.onclick = () => { inp.value = b.dataset.v === 'max' ? Math.min(this.MAX, this._user.monedas || 0) : b.dataset.v; upd(); });
    el.querySelector('#slip-clear').onclick = () => { this.slip = []; this._render(); };
    el.querySelector('#slip-go').onclick = () => this._place();
  },
  async _place() {
    const stake = Math.floor(this._stake || 0), user = await Auth.currentUser();
    if (stake < this.MIN || stake > this.MAX) return Toast.warn(`La apuesta debe estar entre ${this.MIN} y ${this.MAX} 🪙`);
    if ((user.monedas || 0) < stake) return Toast.warn('No tienes suficientes monedas');
    const ap = user.apuestas || [];
    if (ap.filter(b => b.status === 'pending').length >= this.MAX_OPEN) return Toast.warn(`Máximo ${this.MAX_OPEN} apuestas abiertas`);
    // re-validar que los partidos de la selección no hayan empezado (salvo "siguiente gol")
    for (const s of this.slip) {
      const m = this._matches.find(x => String(x.id) === String(s.matchId)); const st = m ? API.getMatchState(m) : 'finished';
      if (s.market !== 'next' && (st === 'live' || st === 'finished')) return Toast.warn(`${s.matchLabel} ya comenzó`);
    }
    const odds = this.slip.reduce((p, s) => p * s.odds, 1);
    ap.push({ id: 'b' + Date.now().toString(36), legs: this.slip.map(({ key, ...l }) => l), stake, odds: Math.round(odds * 100) / 100, status: 'pending', payout: 0, at: Date.now() });
    user.apuestas = ap; user.monedas -= stake;
    await Auth.updateUser(user); App.refreshHeader?.(user);
    Toast.success(`🧾 Apuesta realizada: ${stake} 🪙 a cuota ${odds.toFixed(2)}`);
    this.slip = []; this._render();
  },
  _renderMine(root, user) {
    const list = [...(user.apuestas || [])].reverse(), lbl = { pending: '⏳ Pendiente', won: '✅ Ganada', lost: '❌ Perdida', void: '↩ Anulada' };
    const won = list.filter(b => b.status === 'won').reduce((s, b) => s + b.payout - b.stake, 0), lost = list.filter(b => b.status === 'lost').reduce((s, b) => s + b.stake, 0);
    root.innerHTML = `<div class="bets-bal">Saldo: <b>${user.monedas || 0}</b> 🪙 · Balance histórico: <b style="color:${won - lost >= 0 ? '#3ddc84' : '#ff4d6d'}">${won - lost >= 0 ? '+' : ''}${won - lost}</b></div>
      <div class="mine-list">${list.length ? list.map(b => `<div class="mine-card st-${b.status}">
        <div class="mine-head"><b>${b.legs.length > 1 ? `Combinada x${b.legs.length}` : 'Simple'}</b><span>${lbl[b.status]}</span></div>
        ${b.legs.map(l => `<div class="mine-leg ${l.state}"><span>${l.matchLabel}<small> · ${l.mlabel}: ${l.plabel}</small></span><b>${l.odds.toFixed(2)}</b></div>`).join('')}
        <div class="mine-foot"><span>Apostado ${b.stake} 🪙 · cuota ${b.odds.toFixed(2)}</span><b>${b.status === 'pending' ? `Posible: ${Math.round(b.stake * b.odds)} 🪙` : b.status === 'lost' ? `-${b.stake}` : `+${b.payout - b.stake}`}</b></div></div>`).join('') : '<p class="empty-state">Aún no has apostado. Ve a «Apuestas» y arma tu boleto.</p>'}</div>`;
  }
};
