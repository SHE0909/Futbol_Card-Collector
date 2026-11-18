/**
 * server.js
 * --------------------------------------------------
 * Punto de entrada de la aplicación. Levanta el servidor Express y arranca
 * la tarea de actualización automática de partidos en vivo.
 */

const app = require("./src/app");
const { startLiveUpdater } = require("./src/services/liveUpdater");
const { attachRelay } = require("./src/services/relay");

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log(`⚽ Futbol API corriendo en http://localhost:${PORT}`);
  startLiveUpdater();
});

// Relevo WebSocket para salas P2P en redes que bloquean WebRTC
attachRelay(server);
