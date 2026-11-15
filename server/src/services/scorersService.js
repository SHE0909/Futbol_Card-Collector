/**
 * services/scorersService.js
 * --------------------------------------------------
 * Goleadores de una liga. ESPN no documenta este endpoint para fútbol, así que se
 * prueban varias rutas conocidas y se lee la respuesta de forma flexible
 * (busca la categoría de goles dentro del JSON). El log indica qué URL funcionó.
 * Caché en memoria de 6 h para no gastar peticiones.
 */
const axios = require("axios");
const logger = require("../utils/logger");

const TTL = 6 * 60 * 60 * 1000;
const store = new Map();

const candidates = (league) => [
  `https://site.web.api.espn.com/apis/site/v2/sports/soccer/${league}/statistics`,
  `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/statistics`,
  `https://site.web.api.espn.com/apis/v2/sports/soccer/${league}/statistics`,
  `https://site.api.espn.com/apis/site/v3/sports/soccer/${league}/leaders`,
  `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/leaders`
];

function collect(leaders, out) {
  for (const l of leaders || []) {
    const a = l.athlete || l.player || l;
    const name = a.displayName || a.fullName || a.shortName || a.name;
    const value = Number(l.value ?? l.displayValue ?? a.value);
    if (!name || !Number.isFinite(value)) continue;
    out.push({
      name,
      team: l.team?.displayName || l.team?.name || a.team?.displayName || a.team?.name || "",
      crest: l.team?.logo || l.team?.logos?.[0]?.href || a.team?.logos?.[0]?.href || null,
      photo: a.headshot?.href || a.headshot || null,
      goals: value
    });
  }
}

/** Recorre el JSON buscando categorías de goles con su lista de líderes. */
function extract(data) {
  const out = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    const label = String(node.name || node.displayName || node.abbreviation || node.shortDisplayName || "");
    if (Array.isArray(node.leaders) && /goal|gol/i.test(label) && !/assist|against|conced/i.test(label)) collect(node.leaders, out);
    Object.values(node).forEach(walk);
  };
  walk(data);
  const seen = new Set();
  return out.filter((r) => (seen.has(r.name) ? false : seen.add(r.name))).sort((a, b) => b.goals - a.goals).slice(0, 10);
}


// --- Respaldo fiable: página pública de estadísticas de ESPN (tabla "Top Scorers") ---
const PAGE_SLUG = { "esp.1": "ESP.1", "eng.1": "ENG.1", "uefa.champions": "UEFA.CHAMPIONS", "ger.1": "GER.1", "ita.1": "ITA.1", "fra.1": "FRA.1" };
const stripTags = (h) => String(h || "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

/** Lee la tabla "Top Scorers" del HTML de ESPN (solo la primera, antes de "Top Assists"). */
function parseScoringPage(html) {
  let h = String(html || "");
  const iA = h.search(/Top\s*Assists/i);
  if (iA > 0) h = h.slice(0, iA);
  const iS = h.search(/Top\s*Scorers/i);
  if (iS >= 0) h = h.slice(iS);
  const rows = h.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const withPlayer = [], numeric = [];
  for (const tr of rows) {
    const pm = tr.match(/\/soccer\/player\/_\/id\/(\d+)\/[^"']*["'][^>]*>([^<]+)</i);
    const cells = (tr.match(/<td[\s\S]*?<\/td>/gi) || []).map(stripTags);
    const nums = cells.filter((c) => /^\d+$/.test(c)).map(Number);
    if (pm) {
      const cm = tr.match(/\/soccer\/club\/_\/id\/(\d+)\/[^"']*["'][^>]*>([^<]+)</i);
      withPlayer.push({ id: pm[1], name: stripTags(pm[2]), teamId: cm?.[1] || null, team: cm ? stripTags(cm[2]) : "", nums });
    } else if (nums.length >= 2) {
      const cm = tr.match(/\/soccer\/club\/_\/id\/(\d+)\/[^"']*["'][^>]*>([^<]+)</i);
      numeric.push({ nums, teamId: cm?.[1] || null, team: cm ? stripTags(cm[2]) : "" });
    }
  }
  // Tablas partidas (nombres a la izquierda, números a la derecha): se unen por orden
  const out = withPlayer.map((r, i) => {
    const side = r.nums.length >= 2 ? null : (numeric[i] || null);
    const nums = side ? side.nums : r.nums;
    if (side && !r.teamId) { r.teamId = side.teamId; r.team = side.team; }
    const goals = nums.length ? nums[nums.length - 1] : NaN;
    const played = nums.length >= 2 ? nums[nums.length - 2] : null;
    return { name: r.name, team: r.team, crest: r.teamId ? `https://a.espncdn.com/i/teamlogos/soccer/500/${r.teamId}.png` : null,
      photo: `https://a.espncdn.com/i/headshots/soccer/players/full/${r.id}.png`, goals, played };
  }).filter((r) => r.name && Number.isFinite(r.goals));
  return out.sort((a, b) => b.goals - a.goals).slice(0, 10);
}

async function fromStatsPage(league) {
  const slug = PAGE_SLUG[league] || String(league).toUpperCase();
  const url = `https://www.espn.com/soccer/stats/_/league/${slug}/view/scoring`;
  const res = await axios.get(url, { timeout: 10000, headers: { "User-Agent": "Mozilla/5.0 (compatible; ClubCollector/1.0)", "Accept-Language": "en-US,en;q=0.9" }, validateStatus: (s) => s === 200 });
  const rows = parseScoringPage(res.data);
  if (rows.length) logger.info("scorers", `OK (página) ${league}`, { url, count: rows.length });
  return rows;
}

async function getScorers(league) {
  const hit = store.get(league);
  if (hit && Date.now() - hit.ts < TTL) return { data: hit.data, source: "cache" };
  try {
    const rows = await fromStatsPage(league);
    if (rows.length) { store.set(league, { data: rows, ts: Date.now() }); return { data: rows, source: "espn-page" }; }
    logger.warn("scorers", `Página de ESPN sin filas para ${league}`);
  } catch (e) { logger.warn("scorers", `Falló la página de ESPN ${league}`, { status: e.response?.status, msg: e.message }); }
  for (const url of candidates(league)) {
    try {
      const res = await axios.get(url, { timeout: 8000, validateStatus: (s) => s === 200 });
      const rows = extract(res.data);
      if (rows.length) {
        logger.info("scorers", `OK ${league}`, { url, count: rows.length });
        store.set(league, { data: rows, ts: Date.now() });
        return { data: rows, source: "espn" };
      }
      logger.warn("scorers", `Sin categoría de goles en ${url}`);
    } catch (e) {
      logger.warn("scorers", `Falló ${url}`, { status: e.response?.status, msg: e.message });
    }
  }
  if (hit) return { data: hit.data, source: "stale" };
  return { data: [], source: "unavailable" };
}

module.exports = { getScorers, _extract: extract, _parseScoringPage: parseScoringPage };
