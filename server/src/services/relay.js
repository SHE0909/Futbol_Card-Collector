/**
 * relay.js
 * --------------------------------------------------
 * Relevo WebSocket para las salas P2P cuando WebRTC no puede conectar
 * (redes de universidad/empresa que bloquean UDP o puertos raros).
 * Va por el mismo puerto HTTP(S) del API (443 en producción), así que pasa
 * por casi cualquier firewall. Solo reenvía mensajes entre los 2 jugadores
 * de una sala (ws://host/relay?room=ABCDE); no interpreta el contenido.
 */
const { WebSocketServer } = require("ws");

const MAX_PEERS = 2;
const MAX_BYTES = 16 * 1024;
const ROOM_RE = /^[A-Z0-9]{5}$/;
const rooms = new Map(); // code -> Set<ws>

function notifyPeers(set) {
  const msg = JSON.stringify({ __relay: "peers", n: set.size });
  for (const c of set) if (c.readyState === 1) c.send(msg);
}

function attachRelay(httpServer) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_BYTES });

  httpServer.on("upgrade", (req, socket, head) => {
    let url;
    try { url = new URL(req.url, "http://x"); } catch (_) { return socket.destroy(); }
    if (url.pathname !== "/relay") return socket.destroy();
    const room = (url.searchParams.get("room") || "").toUpperCase();
    if (!ROOM_RE.test(room)) return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, room));
  });

  wss.on("connection", (ws, room) => {
    let set = rooms.get(room);
    if (!set) { set = new Set(); rooms.set(room, set); }
    if (set.size >= MAX_PEERS) { ws.send(JSON.stringify({ __relay: "full" })); return ws.close(); }
    set.add(ws);
    ws.isAlive = true;
    ws.on("pong", () => { ws.isAlive = true; });
    notifyPeers(set);

    ws.on("message", (data, isBinary) => {
      if (isBinary) return;
      for (const c of set) if (c !== ws && c.readyState === 1) c.send(data.toString());
    });
    ws.on("close", () => {
      set.delete(ws);
      if (!set.size) rooms.delete(room); else notifyPeers(set);
    });
    ws.on("error", () => {});
  });

  // keep-alive: evita que proxies cierren conexiones inactivas y limpia zombis
  const timer = setInterval(() => {
    for (const set of rooms.values()) for (const ws of set) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false; try { ws.ping(); } catch (_) {}
    }
  }, 25000);
  timer.unref();
  return wss;
}

module.exports = { attachRelay, _rooms: rooms };
