# Pasos para activar Online (para quien administra Firebase)

Online (rankings, drops, Head Cards P2P) usa tres colecciones nuevas de Firestore:
`leaderboard`, `drops` y `rooms`. Sin publicar las reglas, Firebase las bloquea y aparece
"Missing or insufficient permissions".

## 1. Publicar las reglas
1. Firebase Console → el proyecto de la app → **Firestore Database** → pestaña **Reglas**.
2. Borra todo el contenido y pega **completo** el archivo `firestore.rules` de este proyecto.
   (Debe contener los bloques `users`, `config`, `leaderboard`, `drops` y `rooms`.)
3. Pulsa **Publicar** y espera ~10 segundos.

## 2. Comprobar que el usuario administrador sigue igual
El bloque `config` tiene el UID del admin fijo. No lo cambies.

## 3. Autenticación
Authentication → Sign-in method: debe estar habilitado el mismo proveedor que ya usa la app.
Las reglas nuevas exigen sesión iniciada (`request.auth != null`).

## 4. Probar
1. Abre la app con dos cuentas (ventana normal + incógnito).
2. Minijuegos → Online → Head Cards → **Crear sala** en una; el código en la otra → **Unirme**.
3. En Firebase → Firestore → Datos deberían aparecer `leaderboard`, `drops` y `rooms`.

## Notas
- `rooms/{código}` solo guarda la oferta/respuesta de conexión WebRTC; se borra al cerrar la sala.
- Si las reglas no están publicadas la app NO se rompe: Online muestra un aviso y los demás minijuegos funcionan.
- Si algún día aparece "permission-denied" en `leaderboard`, revisa que el documento del usuario
  (`users/{uid}`) se haya guardado antes (el ranking no puede superar lo guardado ahí).
