// ---------------------------------------------------------------------------
// Íconos en lugar de emojis: los emojis de interfaz se cambian por SVG
// (heredan color y tamaño del texto, se ven nítidos en cualquier sistema).
// Lo que no tiene ícono (banderas, etc.) sigue pasando por twemoji.
// ---------------------------------------------------------------------------
const EmojiIcons = (() => {
  const P = {
    ball: '<circle cx="12" cy="12" r="10"/><path d="M12 7l4 3-1.5 5h-5L8 10z"/><path d="M12 2v5M16 10l5-2M14.5 15l3 5M9.5 15l-3 5M8 10L3 8"/>',
    bolt: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    cards: '<rect x="2" y="4" width="13" height="17" rx="2"/><path d="M8 21h11a2 2 0 002-2V8a2 2 0 00-2-2h-2"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    checkc: '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    xc: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    trophy: '<path d="M8 21h8M12 17v4"/><path d="M7 4h10v6a5 5 0 01-10 0z"/><path d="M7 6H4v2a3 3 0 003 3M17 6h3v2a3 3 0 01-3 3"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    coin: '<circle cx="12" cy="12" r="10"/><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1 0-2-.5-2.5-1.5"/><path d="M12 6v2M12 16v2"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 00-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0012 3z"/>',
    dot: '<circle cx="12" cy="12" r="6" fill="currentColor"/>',
    flame: '<path d="M12 2c1 4 6 6 6 12a6 6 0 01-12 0c0-3 2-4 3-6 1 1 1.5 2 2 2 .5-2 0-5 1-8z"/>',
    wall: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9.3h18M3 14.7h18M9 4v5.3M15 9.3v5.4M9 14.7V20"/>',
    skull: '<path d="M12 3a8 8 0 00-8 8c0 2.5 1 4 3 5v3h10v-3c2-1 3-2.5 3-5a8 8 0 00-8-8z"/><circle cx="9" cy="11" r="1.4"/><circle cx="15" cy="11" r="1.4"/><path d="M10 19v2M14 19v2"/>',
    user: '<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    users: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>',
    alert: '<path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    crown: '<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/>',
    link: '<path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>',
    dice: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1" fill="currentColor"/>',
    hand: '<path d="M18 11V6a2 2 0 00-4 0M14 10V4a2 2 0 00-4 0v2M10 10.5V6a2 2 0 00-4 0v8"/><path d="M18 8a2 2 0 114 0v6a8 8 0 01-8 8h-2c-2.8 0-4.5-.9-5.9-2.4L3.4 16a2 2 0 013.2-2.4L8 15"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>',
    pin: '<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 00-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 000-7.8z"/>',
    gift: '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 3v4M17 5h4M5 17v4M3 19h4"/>',
    goal: '<path d="M3 20V6h18v14"/><path d="M3 11h18M8 6v14M13 6v14M18 6v14"/>',
    shuffle: '<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    medal: '<circle cx="12" cy="9" r="6"/><path d="M8.5 14L7 22l5-3 5 3-1.5-8"/>',
    receipt: '<path d="M4 2v20l3-2 3 2 3-2 3 2 3-2V2z"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/>',
    refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.5 9a9 9 0 0114.85-3.4L23 10M1 14l4.65 4.4A9 9 0 0020.5 15"/>',
    globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15 15 0 010 20 15 15 0 010-20z"/>',
    bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M9 4h6"/><circle cx="9" cy="14" r="1" fill="currentColor"/><circle cx="15" cy="14" r="1" fill="currentColor"/>',
    up: '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
    down: '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',
    swords: '<path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/><path d="M9.5 6.5L21 18v3h-3L6.5 9.5"/>',
    timer: '<circle cx="12" cy="13" r="8"/><polyline points="12 9 12 13 14.5 14.5"/><path d="M9 2h6"/>',
    shirt: '<path d="M16 3l5 3-2 4-3-1v12H8V9l-3 1-2-4 5-3a4 4 0 008 0z"/>',
    download: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    upload: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L21 2M16 7l3 3M14 9l2 2"/>',
    save: '<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
    clip: '<path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>',
    rocket: '<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 00-2.9-.1z"/><path d="M12 15l-3-3a22 22 0 012-3.9A12.9 12.9 0 0122 2c0 2.7-.8 7.5-6 11a22 22 0 01-4 2z"/><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5"/>',
    phone: '<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    left: '<polygon points="17 4 7 12 17 20" fill="currentColor"/>',
    right: '<polygon points="7 4 17 12 7 20" fill="currentColor"/>',
    smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
    frown: '<circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
    train: '<rect x="4" y="3" width="16" height="14" rx="3"/><path d="M4 11h16M8 21l2-4M16 21l-2-4"/><circle cx="8.5" cy="14" r=".6" fill="currentColor"/><circle cx="15.5" cy="14" r=".6" fill="currentColor"/>',
    snow: '<line x1="12" y1="2" x2="12" y2="22"/><path d="M20 7l-16 10M4 7l16 10M9 3l3 3 3-3M9 21l3-3 3 3"/>'
  };
  // emoji -> [ícono, clase de color]
  const M = {
    '⚽': ['ball'], '⚡': ['bolt', 'yellow'], '🎴': ['cards'], '🛡': ['shield'], '✅': ['checkc', 'green'], '❌': ['xc', 'red'],
    '⭐': ['star', 'gold'], '🌟': ['star', 'gold'], '🏆': ['trophy', 'gold'], '🎯': ['target', 'red'], '🪙': ['coin', 'gold'], '💰': ['coin', 'gold'],
    '🧠': ['bulb', 'yellow'], '🔴': ['dot', 'red'], '🔥': ['flame', 'orange'], '🧱': ['wall'], '💀': ['skull'], '👤': ['user'], '⚠': ['alert', 'amber'],
    '✓': ['check', 'green'], '🐐': ['crown', 'gold'], '👑': ['crown', 'gold'], '🎩': ['crown', 'gold'], '🔗': ['link'], '🎲': ['dice'], '🧤': ['hand'], '✋': ['hand'], '👋': ['hand'],
    '🔒': ['lock'], '📍': ['pin'], '🤍': ['heart'], '💜': ['heart', 'purple'], '🎁': ['gift'], '✨': ['sparkle', 'yellow'], '💫': ['sparkle', 'yellow'], '🔮': ['sparkle', 'purple'], '🎉': ['sparkle', 'yellow'],
    '🥅': ['goal'], '🔀': ['shuffle'], '🤝': ['users'], '❓': ['help'], '🥇': ['medal', 'gold'], '🥈': ['medal', 'silver'], '🥉': ['medal', 'bronze'],
    '🧾': ['receipt'], '🔄': ['refresh'], '🔁': ['refresh'], '🌐': ['globe'], '🤖': ['bot'], '⬆': ['up'], '⬇': ['down'], '⚔': ['swords'], '⏱': ['timer'], '⏰': ['timer'],
    '👕': ['shirt'], '📥': ['download'], '📤': ['upload'], '🔑': ['key'], '💾': ['save'], '📋': ['clip'], '📚': ['book'], '🚀': ['rocket'], '📱': ['phone'], '👁': ['eye'], '📊': ['chart'],
    '◀': ['left'], '▶': ['right'], '😅': ['smile'], '😕': ['frown'], '🙈': ['eye'], '🥶': ['snow'], '🚂': ['train']
  };
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'OPTION', 'INPUT', 'TITLE', 'CANVAS', 'SVG', 'NOSCRIPT']);
  const keys = Object.keys(M).sort((a, b) => b.length - a.length);
  const RE = new RegExp('(' + keys.join('|') + ')\\uFE0F?', 'g');
  let sprite = null;
  const ensureSprite = () => {
    if (sprite || !document.body) return;
    sprite = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    sprite.setAttribute('width', '0'); sprite.setAttribute('height', '0'); sprite.setAttribute('aria-hidden', 'true');
    sprite.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    sprite.innerHTML = Object.keys(P).map(k => `<symbol id="ei-${k}" viewBox="0 0 24 24">${P[k]}</symbol>`).join('');
    document.body.prepend(sprite);
  };
  const icon = (key, cls) => {
    const el = document.createElement('span');
    el.className = 'emo-ico' + (cls ? ' emo-' + cls : '');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<svg viewBox="0 0 24 24"><use href="#ei-${key}"/></svg>`;
    return el;
  };
  const replace = (root) => {
    if (!root) return;
    ensureSprite();
    if (root.nodeType === 3) root = root.parentElement; if (!root) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => {
        if (!n.nodeValue || n.nodeValue.length > 4000) return NodeFilter.FILTER_REJECT;
        const par = n.parentElement; if (!par || SKIP.has(par.tagName.toUpperCase()) || par.closest('[data-noicon],svg')) return NodeFilter.FILTER_REJECT;
        RE.lastIndex = 0; return RE.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach(n => {
      const txt = n.nodeValue, frag = document.createDocumentFragment(); let last = 0, m; RE.lastIndex = 0;
      while ((m = RE.exec(txt))) {
        if (m.index > last) frag.appendChild(document.createTextNode(txt.slice(last, m.index)));
        const [k, c] = M[m[1]]; frag.appendChild(icon(k, c)); last = m.index + m[0].length;
      }
      if (last < txt.length) frag.appendChild(document.createTextNode(txt.slice(last)));
      n.parentNode.replaceChild(frag, n);
    });
  };
  return { replace, html: (e) => { const m = M[e]; return m ? icon(m[0], m[1]).outerHTML : e; } };
})();

function parseEmojis(node) {
  const root = node || document.body;
  try { EmojiIcons.replace(root); } catch (_) {}
  // lo que no tiene ícono propio (banderas, etc.) pasa por twemoji
  if (window.twemoji) {
    try { twemoji.parse(root, { folder: 'svg', ext: '.svg' }); } catch(_) {}
  }
}
if (typeof window !== 'undefined') {
  window.parseEmojis = parseEmojis;
  document.addEventListener('DOMContentLoaded', () => {
    parseEmojis(document.body);
    // Rendimiento: antes se re-parseaba TODO el body en cada mutación del DOM.
    // Ahora solo se procesan los nodos nuevos, agrupados en un frame.
    let queue = new Set(), scheduled = false;
    const flush = () => {
      scheduled = false;
      const nodes = Array.from(queue); queue = new Set();
      nodes.forEach(n => { if (n.isConnected) parseEmojis(n); });
    };
    const observer = new MutationObserver(muts => {
      for (const m of muts) m.addedNodes.forEach(n => {
        if (n.nodeType === 1 && n.tagName !== 'IMG') queue.add(n);
        else if (n.nodeType === 3 && n.parentElement) queue.add(n.parentElement);
      });
      if (!scheduled && queue.size) { scheduled = true; requestAnimationFrame(flush); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

const App = {
  _currentTab: 'dashboard',

  async init() {
    const splash = document.getElementById('loading-splash');

    // --- Pedir almacenamiento persistente ---
    // En Android (Chrome/Samsung Internet), si el sitio tiene poco "site
    // engagement" (poco visitado, no instalado), el navegador puede borrar
    // IndexedDB/localStorage bajo presión de almacenamiento SIN avisar. Esto
    // es lo que explica que en desktop la caché sobreviva entre recargas y
    // en el celular no. persist() le pide al navegador que NO borre los
    // datos de este origen bajo presión (no garantizado, pero ayuda mucho,
    // y Chrome lo concede automáticamente si la app está instalada / en la
    // pantalla de inicio). No bloquea el arranque.
    try {
      if (navigator.storage?.persist) {
        navigator.storage.persist().then(granted => {
          console.log(`[Storage] persist() -> ${granted ? 'concedido ✅' : 'denegado ⚠️'}`);
        });
      }
      if (navigator.storage?.estimate) {
        navigator.storage.estimate().then(({ usage, quota }) => {
          console.log(`[Storage] uso: ${(usage/1024).toFixed(0)}KB / cuota: ${(quota/1024/1024).toFixed(1)}MB`);
        });
      }
    } catch(_) {}

    try {
      const now = new Date();
      const todayLocal = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      const lastDay = localStorage.getItem('wcc_upcoming_day');
      if (lastDay !== todayLocal) {
        localStorage.removeItem('wcc_cache_upcoming');
        localStorage.setItem('wcc_upcoming_day', todayLocal);
      }
    } catch(_) {}

    try {
      const _dbT0 = performance.now();
      await DB.open();
      console.log(`[Perf] DB.open() -> ${(performance.now()-_dbT0).toFixed(0)}ms`);
    } catch(dbErr) {
      console.error('DB.open() falló:', dbErr);
      // Antes: borraba una BD con nombre equivocado ('WCCollectorUES' en vez
      // de 'WCCollectorUES_cache') y forzaba un reload cada 2s — si el fallo
      // era persistente (p.ej. otra pestaña bloqueando en móvil, donde es
      // común que queden pestañas "congeladas" en segundo plano), esto
      // generaba un bucle de recargas que se sentía como "nunca carga".
      // Ahora: se limpia la BD correcta una sola vez y se sigue SIN caché
      // esta sesión, en vez de recargar en bucle.
      try { await DB.resetDB(); } catch(_) {}
    }

    let user = null;
    try {
      // La sesión y el pre-calentado de la caché SWR (matches, standings,
      // live, dashboard) no dependen entre sí: se resuelven en paralelo
      // para no sumar latencia. Preload() lee lo último guardado en
      // IndexedDB hacia memoria, así el primer Dashboard.render() ya
      // encuentra datos listos y no espera a la red.
      const _cacheT0 = performance.now();
      const [recoveredUser] = await Promise.all([
        Auth.recoverSession(),
        (typeof Cache !== 'undefined'
          ? Cache.preload(['live', 'upcoming', 'standings', 'finished']).then(() => {
              const hits = ['live', 'upcoming', 'standings', 'finished'].filter(k => Cache.get(k));
              console.log(`[Perf] Cache.preload() -> ${(performance.now()-_cacheT0).toFixed(0)}ms · hits: [${hits.join(', ') || 'ninguno'}]`);
            })
          : Promise.resolve())
      ]);
      user = recoveredUser;
    } catch(e) {
      console.error('recoverSession falló:', e);
    }

    if (splash) {
      splash.style.opacity = '0';
      splash.style.transition = 'opacity 0.3s';
      setTimeout(() => { if (splash.parentNode) splash.parentNode.removeChild(splash); }, 350);
    }

    if (!user) {
      window.location.replace('/Futbol_Card-Collector/login');
      return;
    }

    await this.loadUserData(user);
    this._setupAdminUI();
    try { Prizes.init(); } catch (e) { console.warn('Prizes.init falló', e); }
    // Rendimiento: la UI queda interactiva primero; lo pesado corre en segundo plano.
    this._bindNavEvents();
    this._bindGlobalEvents();
    this._bindDataSyncEvents();
    this.navigateTo('dashboard');

    Gacha.claimDaily().then(daily => {
      if (daily.ok) Toast.success('🎁 ¡Tirada diaria reclamada! +1 tirada');
    }).catch(() => {});

    const idle = window.requestIdleCallback || (fn => setTimeout(fn, 1200));
    idle(async () => {
      try {
        const finished = await API.getFinishedMatches();
        if (finished && finished.length) await Predictions.evaluatePredictions(finished);
      } catch(e) { console.error('Eval predicciones al iniciar falló:', e); }
    });
  },

  // Escucha las actualizaciones que llegan en background por el sistema
  // stale-while-revalidate (Cache, ver swr-cache.js) y refresca solo la
  // pestaña visible en ese momento, sin recargar la página ni interrumpir
  // al usuario. Así se reduce la dependencia del botón manual "Actualizar":
  // los datos se mantienen frescos solos mientras la app está abierta.
  _bindDataSyncEvents() {
    if (this._dataSyncBound) return;
    this._dataSyncBound = true;

    window.addEventListener('wcc:cache-update', async (e) => {
      const key = e?.detail?.key;
      if (!key) return;

      try {
        if (key === 'live' && typeof Bets !== 'undefined') Bets.evaluate(null);
        if (['live', 'upcoming', 'standings'].includes(key) && this._currentTab === 'dashboard') {
          // Dashboard.render() vuelve a leer de API.getXxx(), que ahora
          // sirve el dato recién cacheado sin ir a red de nuevo.
          Dashboard.render();
        }

        if (key === 'finished') {
          const finished = await API.getFinishedMatches();
          if (finished?.length && typeof Predictions !== 'undefined') {
            await Predictions.evaluatePredictions(finished);
          }
          if (this._currentTab === 'predictions' && typeof Predictions !== 'undefined') {
            Predictions.render();
          }
        }

        if (['standings', 'finished'].includes(key) && this._currentTab === 'stats' && typeof Stats !== 'undefined') {
          Stats.render(Stats._currentTab || 'teams');
        }
      } catch (err) {
        console.warn('[App] sync en background falló para', key, err);
      }
    });
  },

  async loadUserData(user = null) {
    const u = user || await Auth.currentUser();
    if (!u) return;
    this.refreshHeader(u);
  },

  // Muestra la pestaña "Admin" solo a la cuenta admin (la seguridad real está en firestore.rules).
  _setupAdminUI() {
    const show = typeof Admin !== 'undefined' && Admin.isAdmin();
    document.querySelectorAll('.nav-admin, .drawer-nav-admin').forEach(el => { el.style.display = show ? '' : 'none'; });
  },

  async refreshHeader(u = null) {
    const user = u || await Auth.currentUser();
    if (!user) return;
    document.getElementById('header-greeting').textContent = `Hola, ${user.name.split(' ')[0]}`;
    document.getElementById('hdr-tiradas').innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M9 8h6M9 12h6"/></svg> <strong>${user.tiradas ?? 0}</strong>`;
    const gc = document.getElementById('gacha-count');
    if (gc) gc.textContent = user.tiradas ?? 0;
    const hdrMonedas = document.getElementById('hdr-monedas');
    if (hdrMonedas) hdrMonedas.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h4a1.8 1.8 0 010 3.6h-3a1.8 1.8 0 000 3.6h4"/></svg> <strong>${user.monedas ?? 0}</strong>`;
  },

  navigateTo(tab) {
    const prevTab = this._currentTab;
    this._currentTab = tab;
    document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.drawer-nav-btn').forEach(b => b.classList.remove('active'));

    const section    = document.getElementById(`tab-${tab}`);
    const navBtn     = document.querySelector(`.nav-btn[data-tab="${tab}"]`);
    const drawerBtn  = document.querySelector(`.drawer-nav-btn[data-tab="${tab}"]`);
    if (section)   section.classList.add('active');
    if (navBtn)    navBtn.classList.add('active');
    if (drawerBtn) drawerBtn.classList.add('active');

    if (prevTab === 'live' && tab !== 'live') {
      const liveIframe = document.getElementById('live-iframe');
      if (liveIframe) {
        liveIframe.removeAttribute('src');
      }
    }

    return this._renderTab(tab);
  },

  async _renderTab(tab) {
    switch (tab) {
      case 'dashboard':   await Dashboard.render(); break;
      case 'stats':       await Stats.render(Stats._currentTab || 'teams'); break;
      case 'gacha': {
        
        const prevResult = document.getElementById('gacha-result');
        if (prevResult) { prevResult.innerHTML = ''; prevResult.style.display = 'none'; }
        const prevSlot = document.getElementById('sobre-open');
        if (prevSlot) { prevSlot.innerHTML = ''; prevSlot.style.display = 'none'; }
        const prevPack = document.getElementById('sobre-closed');
        if (prevPack) prevPack.style.visibility = 'visible';
        const u = await Auth.currentUser();
        if (u) {
          const gc = document.getElementById('gacha-count');
          if (gc) gc.textContent = u.tiradas ?? 0;
          const pc = u.pityCount || 0;
          const pd = document.getElementById('pity-display');
          const pb = document.getElementById('pity-bar');
          if (pd) pd.textContent = `${pc}/80`;
          if (pb) pb.style.width = `${Math.min(100, (pc/80)*100)}%`;
          if (u.tiradas > 0) document.getElementById('gacha-sphere')?.classList.add('has-tiradas');
        }
        break;
      }
      case 'album':
        await Album.render();
        await Album.renderIdealTeam();
        break;
      case 'predictions': await Predictions.render(); if (typeof Bets !== 'undefined') Bets.mount(); break;
      case 'battle':      await Battle.render(); break;
      case 'exchange':    await Exchange.render(); break;
      case 'profile':     await Profile.render(); break;
      case 'admin':       if (typeof Admin !== 'undefined' && Admin.isAdmin()) await AdminPanel.render(); break;
      case 'live': {
        await this._applyLiveConfig();
        this._renderLiveAdminButton();
        const liveIframe = document.getElementById('live-iframe');
        if (liveIframe && !liveIframe.getAttribute('src')) {
          const activeChannelBtn = document.querySelector('.live-channel-btn.active') || document.querySelector('.live-channel-btn');
          const src = activeChannelBtn?.dataset.src || liveIframe.dataset.src;
          if (src) liveIframe.setAttribute('src', src);
        }
        break;
      }
    }
  },

  // --------------------------------------------------------------
  // Sección "En Vivo" editable por el admin (ver public/js/utils/admin.js).
  // La config vive en Firestore config/live; si nadie ha guardado nada
  // todavía (getLiveConfig() devuelve null), se dejan los valores que ya
  // trae el HTML estático de TabLive.astro tal cual, sin tocar nada.
  // --------------------------------------------------------------

  async _applyLiveConfig() {
    if (typeof Admin === 'undefined') return;

    // Se pide una sola vez por sesión — no hace falta releer Firestore
    // cada vez que se vuelve a abrir la pestaña En Vivo.
    if (!this._liveConfigLoaded) {
      try {
        this._liveConfig = await Admin.getLiveConfig();
      } catch (err) {
        console.warn('[App] no se pudo cargar config de En Vivo', err);
        this._liveConfig = null;
      }
      this._liveConfigLoaded = true;
    }

    const cfg = this._liveConfig;
    if (!cfg) return;

    const btn1 = document.querySelector('.live-channel-btn[data-channel="1"]');
    const btn2 = document.querySelector('.live-channel-btn[data-channel="2"]');

    if (btn1) {
      if (cfg.canal1Url)   btn1.dataset.src = cfg.canal1Url;
      if (cfg.canal1Label) {
        const label = btn1.querySelector('.live-channel-label');
        if (label) label.textContent = cfg.canal1Label;
      }
    }
    if (btn2) {
      if (cfg.canal2Url)   btn2.dataset.src = cfg.canal2Url;
      if (cfg.canal2Label) {
        const label = btn2.querySelector('.live-channel-label');
        if (label) label.textContent = cfg.canal2Label;
      }
    }

    // El dataset.src del iframe (usado como fuente inicial antes de que el
    // usuario toque un botón) debe reflejar el canal que está activo ahora.
    const liveIframe = document.getElementById('live-iframe');
    const activeBtn = document.querySelector('.live-channel-btn.active') || btn1;
    if (liveIframe && activeBtn?.dataset.src) {
      liveIframe.dataset.src = activeBtn.dataset.src;
    }

    if (cfg.avisoTexto) {
      const noticeText = document.getElementById('live-notice-text');
      if (noticeText) noticeText.textContent = cfg.avisoTexto;
    }
  },

  _renderLiveAdminButton() {
    if (typeof Admin === 'undefined' || !Admin.isAdmin()) return;
    if (document.getElementById('btn-live-edit')) return; // ya existe, no duplicar

    const header = document.querySelector('#tab-live .section-header');
    if (!header) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'btn-live-edit';
    btn.className = 'btn-live-edit';
    btn.title = 'Editar transmisión En Vivo';
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
      Editar
    `;
    btn.addEventListener('click', () => this._openLiveEditModal());
    header.appendChild(btn);
  },

  _openLiveEditModal() {
    const btn1  = document.querySelector('.live-channel-btn[data-channel="1"]');
    const btn2  = document.querySelector('.live-channel-btn[data-channel="2"]');
    const label1 = btn1?.querySelector('.live-channel-label');
    const label2 = btn2?.querySelector('.live-channel-label');
    const notice = document.getElementById('live-notice-text');

    const current = {
      canal1Url:   btn1?.dataset.src || '',
      canal1Label: label1?.textContent.trim() || '',
      canal2Url:   btn2?.dataset.src || '',
      canal2Label: label2?.textContent.trim() || '',
      avisoTexto:  notice?.textContent.trim() || '',
    };

    Modal.open(`
      <h3 style="font-family:'Bebas Neue',cursive;letter-spacing:1px;margin-bottom:1rem">Editar En Vivo</h3>
      <form id="live-edit-form" class="live-admin-form">
        <div class="live-admin-field">
          <label for="live-edit-canal1-url">Canal 1 — URL</label>
          <input type="text" id="live-edit-canal1-url" value="${current.canal1Url.replace(/"/g, '&quot;')}">
        </div>
        <div class="live-admin-field">
          <label for="live-edit-canal1-label">Canal 1 — Texto del botón</label>
          <input type="text" id="live-edit-canal1-label" value="${current.canal1Label.replace(/"/g, '&quot;')}">
        </div>
        <div class="live-admin-field">
          <label for="live-edit-canal2-url">Canal 2 — URL</label>
          <input type="text" id="live-edit-canal2-url" value="${current.canal2Url.replace(/"/g, '&quot;')}">
        </div>
        <div class="live-admin-field">
          <label for="live-edit-canal2-label">Canal 2 — Texto del botón</label>
          <input type="text" id="live-edit-canal2-label" value="${current.canal2Label.replace(/"/g, '&quot;')}">
        </div>
        <div class="live-admin-field">
          <label for="live-edit-aviso">Texto del aviso</label>
          <textarea id="live-edit-aviso" rows="3">${current.avisoTexto}</textarea>
        </div>
        <button type="submit" class="btn-primary" style="width:100%;margin-top:0.5rem">Guardar</button>
      </form>
    `);

    document.getElementById('live-edit-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = e.target.querySelector('button[type="submit"]');
      const newCfg = {
        canal1Url:   document.getElementById('live-edit-canal1-url').value.trim(),
        canal1Label: document.getElementById('live-edit-canal1-label').value.trim(),
        canal2Url:   document.getElementById('live-edit-canal2-url').value.trim(),
        canal2Label: document.getElementById('live-edit-canal2-label').value.trim(),
        avisoTexto:  document.getElementById('live-edit-aviso').value.trim(),
      };

      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Guardando...'; }
      try {
        await Admin.saveLiveConfig(newCfg);
        this._liveConfig = { ...(this._liveConfig || {}), ...newCfg };
        this._liveConfigLoaded = true;
        await this._applyLiveConfig();
        Modal.close();
        Toast.success('✅ Transmisión actualizada');
      } catch (err) {
        console.error('[App] no se pudo guardar config de En Vivo', err);
        Toast.error('No se pudo guardar. Intenta de nuevo.');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Guardar'; }
      }
    });
  },

  _bindNavEvents() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => this.navigateTo(btn.dataset.tab));
    });

    document.querySelectorAll('.stab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const input = document.getElementById('search-input');
        if (input) input.value = '';
        Stats._lastQuery = '';
        Stats.render(btn.dataset.stab);
      });
    });

    document.getElementById('btn-search')?.addEventListener('click', () => {
      Stats.search(document.getElementById('search-input').value.trim());
    });
    document.getElementById('search-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('btn-search').click();
    });
    
    document.getElementById('search-input')?.addEventListener('input', (e) => {
      clearTimeout(this._searchDebounce);
      const value = e.target.value.trim();
      this._searchDebounce = setTimeout(() => Stats.search(value), 180);
    });

    document.querySelectorAll('.filt').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Album.render(btn.dataset.filt);
      });
    });

    document.getElementById('btn-save-team')?.addEventListener('click', () => Album.saveTeam());

    document.querySelectorAll('.live-channel-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('active')) return;
        document.querySelectorAll('.live-channel-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const liveIframe = document.getElementById('live-iframe');
        if (liveIframe && btn.dataset.src) {
          liveIframe.setAttribute('src', btn.dataset.src);
        }
      });
    });
  },

  _bindGlobalEvents() {
    document.getElementById('btn-logout')?.addEventListener('click', async () => {
      const confirmed = await this._confirmLogout();
      if (!confirmed) return;
      await Auth.logout();
      API.clearPhotoCache();            
      await DB.clear('stats_cache');   
      window.location.replace('/Futbol_Card-Collector/login');
    });

    document.getElementById('btn-gacha-1')?.addEventListener('click',  () => this.doPull(1));
    document.getElementById('btn-gacha-10')?.addEventListener('click', () => this.doPull(10));

    document.getElementById('btn-update-stats')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-update-stats');
      const svgIcon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>`;
      btn.disabled = true;
      btn.innerHTML = '⏳ Actualizando...';

      try {
        Toast.show('🔄 Consultando APIs...');
        const refreshResult = await API.forceRefresh();
        this._showApiStatus(refreshResult.source);

        const finished = refreshResult.finished?.length
          ? refreshResult.finished
          : await API.getFinishedMatches();

        const allForEval = [
          ...(finished || []),
          ...(refreshResult.upcoming || []).filter(m => m.status === 'finished' && m.scoreHome !== null)
        ];

        if (allForEval.length > 0) await Predictions.evaluatePredictions(allForEval);

        await Dashboard.render();
        await this.loadUserData();

        Toast.success('Estadísticas actualizadas ✅');
      } catch(err) {
        this._showApiStatus('network_error');
        Toast.error('Error al actualizar: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = `${svgIcon} Actualizar`;
      }
    });

    document.getElementById('btn-export')?.addEventListener('click', () => Profile.exportData());
    document.getElementById('btn-import')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) Profile.importData(file);
      e.target.value = '';
    });
  },

  _confirmLogout() {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'logout-overlay';
      overlay.innerHTML = `
        <div class="logout-modal">
          <div class="logout-icon">⏏️</div>
          <h3>¿Cerrar sesión?</h3>
          <p>Tu progreso está guardado localmente.</p>
          <div class="logout-btns">
            <button class="btn btn-secondary" id="lm-cancel">Cancelar</button>
            <button class="btn btn-logout-confirm" id="lm-confirm">Sí, salir</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('visible'));

      const close = (val) => {
        overlay.classList.remove('visible');
        setTimeout(() => overlay.remove(), 250);
        resolve(val);
      };

      document.getElementById('lm-cancel').addEventListener('click',  () => close(false));
      document.getElementById('lm-confirm').addEventListener('click', () => close(true));
      overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
    });
  },

  _showApiStatus(source) {
    const bar = document.getElementById('api-status-bar');
    if (!bar) return;

    bar.style.display = 'flex';

    if (source === 'mock' || source === 'sin_datos') {
      bar.className = 'api-status-bar api-status-mock';
      bar.innerHTML = `<span>⚠️ Sin datos disponibles en este momento. Intenta actualizar en unos minutos.</span>`;
    } else if (source === 'hourly_limit') {
      bar.style.display = 'none';
    } else if (source === 'rate_limit') {
      bar.className = 'api-status-bar api-status-mock';
      bar.innerHTML = `<span>⚠️ Límite diario de la API alcanzado. Se resetea a medianoche. Añade tu propia key en <strong>Perfil → API Key</strong>.</span>`;
    } else if (source === 'auth_error') {
      bar.className = 'api-status-bar api-status-mock';
      bar.innerHTML = `<span>❌ Key de API inválida — Verifica en <strong>Perfil → API Key → Verificar</strong>.</span>`;
    } else if (source === 'network_error') {
      bar.className = 'api-status-bar api-status-mock';
      bar.innerHTML = `<span>❌ No se pudo conectar con la API. Comprueba tu conexión o vuelve a intentar.</span>`;
    } else if (source && source !== 'undefined') {
      bar.className = 'api-status-bar api-status-live';
      bar.innerHTML = `<span>✅ Datos en vivo desde <strong>${source}</strong></span>`;
      setTimeout(() => { bar.style.display = 'none'; }, 5000);
    } else {
      bar.style.display = 'none';
    }
  },

  
  async doPull(n) {
    const sobreWrapper = document.getElementById('sobre-wrapper');
    const sobreClosed  = document.getElementById('sobre-closed');
    const result       = document.getElementById('gacha-result');
    const btnX1        = document.getElementById('btn-gacha-1');
    const btnX10       = document.getElementById('btn-gacha-10');

    if (btnX1)  btnX1.disabled  = true;
    if (btnX10) btnX10.disabled = true;

    const inPlace = (n === 1);
    const slot    = document.getElementById('sobre-open');
    if (slot) { slot.style.display = 'none'; slot.innerHTML = ''; }
    if (sobreClosed) sobreClosed.style.visibility = 'visible';
    result.style.display = 'none';
    if (sobreClosed) {
      sobreClosed.classList.add('sobre-opening');
      await new Promise(r => setTimeout(r, 900));
    }

    if (!inPlace) result.style.display = 'block';
    if (!inPlace) result.innerHTML = `
      <div class="sobre-loading">
        <div class="sobre-loading-cards">
          ${Array(n > 3 ? 5 : n).fill(0).map((_, i) => `
            <div class="sobre-loading-card" style="animation-delay:${i*0.12}s">
              <div class="sobre-loading-card-inner"></div>
            </div>`).join('')}
        </div>
        <p class="sobre-loading-text">Revelando figuritas…</p>
      </div>`;

    const pull = await Gacha.pull(n);

    if (sobreClosed) sobreClosed.classList.remove('sobre-opening');
    if (btnX1)  btnX1.disabled  = false;
    if (btnX10) btnX10.disabled = false;

    if (pull.error) {
      result.innerHTML = '';
      result.style.display = 'none';
      Toast.error(pull.error);
      return;
    }

    await App.refreshHeader(pull.user);

    await Promise.all(pull.results.map(f => Gacha.getPlayerPhoto(f)));

    const topR = pull.results.some(f => f.rareza === 'goat') ? 'goat' : pull.results.some(f => f.rareza === 'legendary') ? 'legendary' : null;
    if (topR) {
      const fl = document.createElement('div'); fl.className = 'rarity-flash ' + topR; document.body.appendChild(fl);
      setTimeout(() => fl.remove(), 1800);
      if (navigator.vibrate) navigator.vibrate(topR === 'goat' ? [80, 40, 160] : [60]);
    }
    const gridHtml = `
      <div class="gacha-cards-grid ${pull.results.length === 1 ? 'single-card' : ''}" id="gacha-grid">
        ${pull.results.map((f, idx) => this._renderFiguritaCard(f, null, idx)).join('')}
      </div>`;
    if (inPlace && slot) {
      // 1 sobre: la carta aparece justo donde estaba el sobre (sin sección debajo)
      slot.innerHTML = gridHtml;
      slot.style.display = 'flex';
      if (sobreClosed) sobreClosed.style.visibility = 'hidden';
      result.innerHTML = ''; result.style.display = 'none';
    } else {
      result.innerHTML = gridHtml;
      result.style.display = 'block';
    }

    document.querySelectorAll('#gacha-grid .figurita-card').forEach((card, i) => {
      setTimeout(() => card.classList.add('card-flip-in'), i * 100);
    });

    
    
    
    const seenPhotoIds = new Set();
    pull.results.forEach(f => {
      if (seenPhotoIds.has(f.id)) return; 
      seenPhotoIds.add(f.id);
      Gacha.getPlayerPhoto(f).then(url => {
        if (!url) return;
        
        const wraps = document.querySelectorAll(`#gacha-grid .fig-photo-wrap[data-id="${f.id}"]`);
        wraps.forEach(wrap => {
          
          const existingImg = wrap.querySelector('img.fig-photo');
          if (existingImg) existingImg.remove();
          const isCutout = url.includes('cutout') || url.includes('Cutout');
          const img = document.createElement('img');
          img.className = "fig-photo";
          img.referrerPolicy = "no-referrer";
          img.alt = f.name;
          img.style.cssText = `object-fit:${isCutout?'contain':'cover'};object-position:${isCutout?'center':'top center'};opacity:0;transition:opacity .3s;position:relative;z-index:1;`;
          img.onload = () => {
            img.style.opacity = '1';
            const em = wrap.querySelector('.fig-emoji-fallback');
            if (em) em.style.display = 'none';
          };
          img.onerror = () => { img.remove(); };
          img.src = url;
          wrap.insertBefore(img, wrap.firstChild);
          if (!wrap.querySelector('.fig-photo-gradient')) {
            const g = document.createElement('div');
            g.className = 'fig-photo-gradient';
            wrap.appendChild(g);
          }
        });
      }).catch(()=>{});
    });

    const pc = pull.user.pityCount || 0;
    const pd = document.getElementById('pity-display');
    const pb = document.getElementById('pity-bar');
    if (pd) pd.textContent = `${pc}/80`;
    if (pb) pb.style.width = `${Math.min(100, (pc / 80) * 100)}%`;

    const goat = pull.results.find(f => f.rareza === 'goat');
    const leg  = pull.results.find(f => f.rareza === 'legendary');
    const epic = pull.results.find(f => f.rareza === 'epic');

    
    if (goat || leg) {
      const rarityClass = goat ? 'reveal-goat' : 'reveal-legendary';
      const rarityLabel = goat ? '🐐 ¡¡G.O.A.T!!' : '✨ ¡LEGENDARIA!';
      const rarityColor = goat ? '#ff2244' : '#ffd700';
      const rarityName  = goat ? goat.name : leg.name;

      
      const overlay = document.createElement('div');
      overlay.id = 'rarity-reveal-overlay';
      overlay.innerHTML = `
        <div class="rarity-reveal-bg ${rarityClass}">
          <div class="rarity-rays"></div>
          <div class="rarity-particles" id="rarity-particles"></div>
          <div class="rarity-label-wrap">
            <div class="rarity-label-text" style="color:${rarityColor}">${rarityLabel}</div>
            <div class="rarity-label-name">${rarityName}</div>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      
      const particlesEl = overlay.querySelector('#rarity-particles');
      const colors = goat ? ['#ff2244','#ff6622','#ffcc00','#ffffff'] : ['#ffd700','#fff4a0','#fffbe6','#ffffff'];
      for (let i = 0; i < 40; i++) {
        const p = document.createElement('div');
        p.className = 'rarity-particle';
        p.style.cssText = `
          left:${Math.random()*100}%;
          animation-delay:${Math.random()*0.8}s;
          animation-duration:${0.8 + Math.random()*0.8}s;
          background:${colors[Math.floor(Math.random()*colors.length)]};
          width:${4 + Math.random()*8}px;
          height:${4 + Math.random()*8}px;
        `;
        particlesEl.appendChild(p);
      }

      
      setTimeout(() => {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.4s ease';
        setTimeout(() => overlay.remove(), 500);
      }, 2200);
    }

    if (goat)      Toast.success(`🐐 ¡¡GOAT!! ¡¡Obtuviste a ${goat.name}!! 🔴`, 7000);
    else if (leg)  Toast.success(`✨ ¡LEGENDARIA! ¡Obtuviste a ${leg.name}!`, 5000);
    else if (epic) Toast.success(`⚡ ¡Épica! ${epic.name}`, 3000);
    else           Toast.show(`+${pull.results.length} figurita${pull.results.length > 1 ? 's' : ''}`);
  },

  _renderFiguritaCard(f, photoUrl, idx) {
    const delay = idx * 0.08;
    const stats = Album.getPlayerStats ? (Album.getPlayerStats(f.id) || {}) : {};
    const isPOR = f.pos === 'POR';

    const cachedUrl = API.getPhotoSync(f) || photoUrl || null;
    const isCutout  = cachedUrl && (cachedUrl.includes('cutout') || cachedUrl.includes('Cutout'));

    const photoSection = `<div class="fig-photo-wrap" data-id="${f.id}" style="position:relative">
      <span class="fig-emoji-fallback" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:0">${f.emoji}</span>
      ${cachedUrl
        ? `<img class="fig-photo" src="${cachedUrl}" alt="${f.name}"
                style="object-fit:${isCutout?'contain':'cover'};object-position:${isCutout?'center':'top center'};opacity:0;transition:opacity .3s;position:relative;z-index:1;"
                referrerpolicy="no-referrer"
                onload="this.style.opacity='1';var em=this.parentNode.querySelector('.fig-emoji-fallback');if(em)em.style.display='none';"
                onerror="this.remove();">`
        : ''}
    </div>`;

    const statsHtml = isPOR
      ? `<div class="fig-stats-row">
           <span class="fig-stat"><span class="fig-stat-val">${stats.saves ?? '—'}</span><span class="fig-stat-lbl">Par.</span></span>
           <span class="fig-stat"><span class="fig-stat-val">${stats.apps ?? '—'}</span><span class="fig-stat-lbl">PJ</span></span>
           <span class="fig-stat"><span class="fig-stat-val">${f.rating}</span><span class="fig-stat-lbl">OVR</span></span>
         </div>`
      : `<div class="fig-stats-row">
           <span class="fig-stat"><span class="fig-stat-val">${stats.goals ?? '—'}</span><span class="fig-stat-lbl">Gls</span></span>
           <span class="fig-stat"><span class="fig-stat-val">${stats.assists ?? '—'}</span><span class="fig-stat-lbl">Ast</span></span>
           <span class="fig-stat"><span class="fig-stat-val">${f.rating}</span><span class="fig-stat-lbl">OVR</span></span>
         </div>`;

    return `
      <div class="figurita-card ${f.rareza}" style="animation-delay:${delay}s">
        <div class="fig-rarity-glow"></div>
        ${(f.rareza === 'goat' || f.rareza === 'legendary') ? '<i class="fx-aura"></i><i class="fx-shine"></i><i class="fx-sparks"></i>' : ''}
        <span class="rarity-badge badge-${f.rareza}">${Gacha.getRarityLabel(f.rareza)}</span>
        ${photoSection}
        <div class="fig-info">
          <div class="figurita-name">${f.name}</div>
          <div class="figurita-team">${f.team}</div>
          <div class="fig-footer">
            <span class="figurita-pos">${f.pos}</span>
          </div>
          ${statsHtml}
        </div>
        ${f.isDuplicate
          ? `<div class="figurita-dupe">DUPLICADO ×${f.duplicados + 1}</div>`
          : '<div class="figurita-new">¡NUEVA!</div>'
        }
      </div>
    `;
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());  