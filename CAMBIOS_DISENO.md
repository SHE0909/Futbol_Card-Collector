# Rediseño "seguimiento de competiciones" — qué cambió

Lógica (gacha, Firebase, API ESPN, predicciones, álbum) sin tocar.

## Nuevo
- `public/css/pitch.css`: capa de diseño (se carga al final desde AppHead.astro).
- Fondo: cancha nocturna en SVG/CSS (`#pitch-bg` en app.astro). Se quitó `menu.mp4` (11 MB).
- Cabecera con marca + navegación superior estilo marcador; móvil usa el drawer de siempre.
- Panel: franja de competiciones (LaLiga / Premier / Champions → abre Seguimiento > Tablas), acciones rápidas en rejilla, Próximos partidos a la izquierda y En vivo/Tabla/Favoritos a la derecha.
- Sobres: la carta ahora tiene dos caras y da la vuelta (2 giros, 0.9 s) al abrir; inclinación 3D + brillo con el puntero; tocar la carta = "Abrir 1 sobre". Mismos IDs (`sobre-closed`, `btn-gacha-1`, etc.), así que app.js funciona igual.
- Íconos PWA, favicon y manifest regenerados (sin trofeo "26").

## Retocado
- `club-theme.css`: variables `--wc-*` ahora cian / azul / oro; sin confeti ni degradados violeta-rosa.
- Textos: FWC/WCC/Copa del Mundo → Club Collector / En vivo / Temporada 26/27.
- Emojis del Mundial (🏆 🇪🇸 🏴 🇪🇺 🎴 🪙 📦 🗃️) → SVG.
- `app.js` (`refreshHeader`): solo cambia los íconos del contador por SVG.

## Pendiente (no lo toqué)
- `login.astro` y `public/videos/login-welcome.mp4` siguen con su estilo anterior.

---
# Ronda 2 (mejoras)

## Visual
- Sobres: con 1 sobre la carta aparece en el mismo lugar del sobre (`#sobre-open`). Con x10 la rejilla sigue debajo.
- Favoritos: los equipos muestran su escudo en Panel y Perfil (con respaldo si falta `crest`).
- Quitado el aviso "Usando key compartida · Límite…" (y el mensaje de límite horario).

## Rendimiento
- Scripts con `defer` (ya no bloquean el render), twemoji fijado a 15.0.3, preconnect a fonts/jsdelivr.
- El MutationObserver de twemoji ya no re-parsea todo el body en cada cambio: solo nodos nuevos, agrupados por frame.
- `App.init`: la UI se vuelve interactiva antes; evaluación de predicciones y tirada diaria van en segundo plano.
- Dashboard: upcoming / live / tabla / favoritos se cargan en paralelo.
- Online: rankings cacheados 60 s, drops 1 escritura por carta única, sync de perfil con throttle de 45 s.

## Online (Minijuegos → Online)  — NUEVO
- `online.js`: rankings (Head Cards, Colección, Rareza, Monedas), feed de drops épicos+, "¿quién tiene esta carta?".
- `headcards.js`: Head Cards 1v1 (física a 60 Hz, súper tiro, IA, vs CPU / vs carta de otro jugador / 2 jugadores local).
- **Publicar `firestore.rules`** (agrega `leaderboard` y `drops`).

## Apuestas (Predicciones → Apuestas / Mis apuestas) — NUEVO
- `bets.js`: 1X2, doble oportunidad, goles 1.5/2.5/3.5, ambos anotan, marcador exacto y EN VIVO "siguiente gol". Combinadas.

## Ronda 3
- Rango del cliente a la API: 14 días atrás / 28 adelante (antes 30/45) → menos peticiones.
- Servidor: el modo "día a día" de ESPN ahora es por liga (no global).
- Penales rediseñados (`penalties.js`, canvas): apuntas, barra de potencia, portero animado, y atajas eligiendo zona. 5 rondas + muerte súbita, mismas recompensas.

## Ronda 4
- `minigames.js` (Arcade): Quiz, Adivina, Conecta y Clásica con temporizador circular, racha x2/x3, puntos por rapidez, partículas, vibración al fallar y revelado animado.
  - Adivina: foto del jugador borrosa que se aclara con el tiempo.
  - Conecta: 45 s, cada error resta 4 s.
  - Clásica: barras animadas por posición.
  - Las recompensas no cambian (se calculan en Battle._end*).
- Servidor: `esp.1` va día a día desde el primer intento (variable `ESPN_PER_DAY_LEAGUES`, por defecto `esp.1`); reintento de rango cada 6 h.

## Ronda 5 — Duelo P2P (sin servidor propio)
- `p2p.js`: salas con código de 5 letras usando WebRTC (DataChannel). Firestore solo guarda la oferta/respuesta (`rooms/{codigo}`) → **volver a publicar `firestore.rules`**.
- Head Cards P2P: el anfitrión simula la física y manda el estado ~30 veces/s; el invitado envía sus teclas y solo dibuja.
- Recompensa: +10 pts por ganar (sin monedas, para evitar farmeo entre amigos).
- Límite: con algunas redes (CGNAT / firewalls estrictos) puede no conectar sin servidor TURN.

## Ronda 6 — Ajustes Head Cards (simulados con bots, 60 partidos por caso)
- Física: arco más bajo, velocidad máx. del balón 20, potencia de tiro reducida, orden de turnos aleatorio (sin ventaja para J1).
- IA: ya no patea hacia su propia portería ni sobre-predice el balón; es independiente del lado (también sirve de bot).
- Rareza pesa más: x1.00 / 1.07 / 1.14 / 1.24 / 1.38.
- Celular: aviso para girar a horizontal, canvas ajustado al alto, botones táctiles más grandes y flotantes en horizontal.

## Ronda 7 — Responsive (probado con Chromium headless: 360x740, 740x360, 768x1024, 1024x768)
- Sin desbordes horizontales ni errores JS en Online, Head Cards, Penales, Quiz, Conecta y Apuestas.
- Head Cards y Penales: en celular/tablet en vertical el escenario se gira 90° para ocupar toda la pantalla (`Arcade.fitStage`); en horizontal se ajusta al alto.
- Penales: el texto de instrucciones ya no se oculta en celular.
- Botón ✕ ya no tapa la racha en los minijuegos; el boleto de apuestas tiene scroll propio (máx. 55 % de la pantalla).

## Ronda 8 — Apuestas más completas + endurecimiento
- Nuevos mercados: goles por equipo (0.5 / 1.5), margen de victoria (2+), goles par/impar y, EN VIVO, "goles totales" (línea = goles actuales + 0.5).
- Cuotas: promedio de goles según competición (Champions, Premier, Liga, copas) + puntos por partido de la tabla; en vivo según minuto y marcador.
- `firestore.rules`: no saldo negativo, tope de +20 000 monedas y +60 pts de Head Cards por escritura; el ranking no puede superar lo del propio documento del usuario. **Volver a publicar las reglas.**
- Pendiente (necesita servidor): mover monedas/puntos/intentos a lógica del servidor para una protección real. "Goleador" requiere alineaciones (muchas peticiones extra).

## Ronda 9 — Corrección importante + verificación en navegador real (headless)
- **Bug corregido:** al cargar los scripts con `defer`, `DrawerScript.astro` se ejecutaba antes que `app.js` y fallaba con "App is not defined" (el menú lateral perdía el resaltado de pestaña activa). Ahora engancha `App.navigateTo` cuando el DOM está listo.
- La carta del gacha (1 sobre) se reduce al tamaño del sobre para no tapar el contador de sobres.
- Verificado con la app compilada (`astro build`) + Firebase simulado: sin errores de JS, sin desbordes en 390 / 768 / 1280 px.
- `PASOS_FIREBASE.md`: guía para publicar las reglas de Firestore.

## Ronda 10
- Perfil: nuevas estadísticas (puntos y V-D de Head Cards, apuestas ganadas); en pantallas chicas se ordenan en dos columnas.
- Revisados en celular/tablet/escritorio con la app compilada: Panel, Gacha, Álbum, Predicciones, Perfil, Canje y Estadísticas, sin errores de JS ni desbordes.

## Ronda 11 — Gacha
- Probabilidades: GOAT 0.3% → 0.08%, Legendaria 0.7% → 0.35%, Épica 9% → 7.5%, Rara 20% → 22%. Garantía de legendaria: 50 → 80 tiradas.
- Animaciones propias: Legendaria (anillo dorado giratorio, barrido de luz, chispas) y GOAT (anillo de fuego, brasas, temblor periódico) en las cartas obtenidas y en el Álbum; destello de pantalla completa (dorado/rojo) y vibración al sacarlas.
