# Mensajería y videollamadas

## Alcance
Chat 1:1 entrenador ↔ alumno y enlaces de videollamada. **No hay servidor de medios ni integración con ningún proveedor**: una videollamada es un enlace https a un proveedor externo.

## Reglas (aplicadas en la base de datos, migración 0019/0020)
- Pueden escribirse solo si la relación está `active` **y** el alumno mantiene el consentimiento `share_with_trainer` (`can_message`). Revocarlo corta al entrenador al instante; el alumno conserva su historial.
- Escribir va solo por `send_message` (SECURITY DEFINER): el remitente sale de la sesión, no del cliente. No hay INSERT/UPDATE/DELETE directos: los mensajes son inmutables.
- El entrenador necesita espacio de trabajo activo para escribir o programar; el alumno siempre puede responder mientras la relación esté activa.
- Límite: 20 mensajes/minuto por remitente (bloqueo asesor por usuario). 1–2000 caracteres.
- Notificación: una por remitente y hora, no una por mensaje.
- Un alumno ve el nombre de su entrenador activo (política `profiles_client_sees_trainer`); nada más de otros usuarios.

## Videollamadas
- Solo el entrenador programa/cancela. Enlace permitido solo de: `meet.google.com`, `zoom.us`, `teams.microsoft.com`, `teams.live.com`, `meet.jit.si`, `whereby.com` (https, sin credenciales ni puerto, ≤500 caracteres). Evita que una cuenta comprometida envíe enlaces arbitrarios (phishing). La lista vive en SQL (`is_allowed_call_url`) y en TS (`links.ts`); una prueba de integración comprueba que coinciden en 19 vectores adversariales (`evilzoom.us`, `zoom.us.evil.com`, `@`, puertos, `javascript:`…).
- «Generar sala de Jitsi»: crea `meet.jit.si/rutinia-<128 bits aleatorios>`. **No se verificó contra el servicio real** (solo se valida la forma del enlace); cualquiera con el enlace puede entrar, por eso solo se muestra a las dos partes.
- La hora se interpreta como hora de Colombia (UTC-5, sin DST), no la del servidor.
- Al alumno se le muestra el dominio de destino antes de abrir; el enlace usa `rel="noopener noreferrer"`.

## Contenido
Los mensajes se muestran como texto plano (React escapa; los enlaces no se activan; se eliminan caracteres de control y de dirección bidi). Aviso visible: no es atención médica, urgencias al 123.

## Privacidad
- La exportación del alumno incluye mensajes y videollamadas; eliminar la cuenta del alumno los borra (cascada).
- Cierre de cuenta del entrenador: los mensajes que envió **permanecen** en la bandeja del alumno (son parte de su historial) bajo el nombre «Cuenta cerrada». Decisión a validar con asesoría legal (Ley 1581).

## Tiempo real (migración 0021)
- Supabase Realtime (Postgres Changes) sobre `messages`, `video_calls` y `notifications`. **RLS decide quién recibe qué**: una prueba de integración suscribe a un tercero con el mismo filtro y comprueba que no recibe nada, y que revocar el consentimiento corta la entrega al entrenador.
- `RealtimeSync` (en ambos layouts) no confía en el contenido del evento: solo dispara `router.refresh()` (con debounce de 250 ms), de modo que la página siempre muestra lo que el servidor dice, incluidos los contadores de no leídos y el «leído». La conversación abierta marca como leído al refrescar.
- **Autenticación del canal**: `RealtimeSync` obtiene la sesión y llama a `realtime.setAuth(token)` *antes* de suscribirse (y al refrescar el token). Sin eso el canal puede unirse como anónimo y quedar «SUBSCRIBED» sin recibir nada por RLS; se observó en una build de producción y la prueba de integración no lo detectaba porque usa supabase-js en Node (sin cookies). Verificado a mano en el navegador; **no hay una prueba automatizada del componente en navegador**.
- Degradación: si el canal cae (`CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED`) hace sondeo cada 20 s con la pestaña visible, y refresca al volver a la pestaña. **El sondeo de respaldo no se probó** (solo el camino con el canal activo).
- Sin indicador de «escribiendo…» ni presencia (no se pidió y añade superficie de privacidad).

## Recordatorios de videollamada
- `send_call_reminders()` (solo `service_role`), llamada desde `/api/cron/expire`: avisa a ambas partes 24 h y 1 h antes. Idempotente por `dedupe_key` (`callrem24h:<id>`, `callrem1h:<id>`); omite llamadas canceladas, pasadas, de relaciones inactivas, y recordatorios inútiles (llamada creada dentro de la ventana).
- **La puntualidad del aviso de 1 h es la del cron**: programarlo cada 5–15 min. No hay cron instalado en este entorno; hay que configurarlo en el hosting con `Authorization: Bearer $CRON_SECRET`.
- Los avisos aparecen en Notificaciones (y en vivo); no hay correo, SMS ni push.

## Limitaciones
Sin adjuntos, sin edición/borrado de mensajes por el usuario, sin recibos de lectura más allá de «leído», sin moderación/denuncia, sin comprobar que el enlace pegado realmente exista o sea la sala correcta.
