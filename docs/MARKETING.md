# Marketing (panel de soporte → Marketing)

Para escribir a **entrenadores** (nuestros clientes). No hay mensajes a alumnos: eso exigiría un consentimiento de marketing propio (Ley 1581) que hoy no se pide.

## Qué hay
- **Campañas y comunicados** (`/staff/marketing`): se guardan como borrador, la vista previa muestra el texto personalizado con un nombre de ejemplo y **a cuántas personas llegaría** por canal; el envío exige marcar una casilla que nombra esa cifra. Tipos: *comunicado* (aviso del servicio: a la campana llega a todos), *campaña* y *felicitación* (respetan a quien desactivó las novedades).
- **Públicos:** todos, pagando, en prueba, bloqueados, cumpleañeros de hoy, o un solo entrenador (prueba; ignora las preferencias porque es el equipo comprobando el mensaje). Las reglas de suscripción son las mismas del producto (`src/lib/staff/summary.ts`).
- **Canales:** en la plataforma (notificación con campana, tiempo real), **push web** (VAPID) y **correo** (Resend). Cada canal se activa solo si están todas sus variables (`.env.example`); si no, el compositor lo muestra deshabilitado y, si una campaña programada lo incluye, el resultado dice «No configurado» en lugar de fallar.
- **Cumpleaños** (`/staff/marketing/cumpleanos`): fecha opcional en el registro y en Mi cuenta (`profiles.birth_date`; solo entrenadores). Lista los de hoy y los próximos 30 días, botón «Felicitar» y un **saludo automático** opcional (título/mensaje con `{nombre}`, canales elegidos). Una persona recibe su saludo **una vez al año** (`birthday_greetings` y `dedupe_key = bday:<año>`). Día de Colombia (UTC-5); quien nació un 29 de febrero se felicita el 28 en años no bisiestos.
- **Programación:** una campaña con fecha se envía en la ejecución diaria del cron (`vercel.json`: 14:00 UTC = **9:00 a. m. en Colombia**; el plan Hobby solo permite una vez al día). Para enviar ya, «Enviar ahora».

## Seguridad y privacidad
- `marketing_campaigns`, `marketing_settings` y `birthday_greetings` tienen RLS **sin ninguna política**: solo el servidor con llave de servicio las toca, siempre tras `requireStaff()`. Un entrenador no puede leerlas ni escribirlas.
- El enlace de una campaña es una ruta interna (`/…`) o `https://…`, validado igual en la app y en la base (se rechaza `//sitio`, `javascript:`, `http:` y espacios). El texto es siempre texto plano: en la plataforma lo escapa React, en el correo se escapa a mano y el push usa texto.
- Un envío **no se puede duplicar**: el paso `borrador/programada → enviando` es una reclamación atómica (tres envíos simultáneos entregan una vez) y cada notificación lleva su `dedupe_key`.
- Preferencias del entrenador (Mi cuenta): novedades en la plataforma, novedades por correo, fecha de nacimiento y avisos push **por dispositivo** (el permiso se pide solo al pulsar el botón). Los avisos de la cuenta (pagos, soporte) nunca se pueden desactivar. El correo lleva el enlace a Mi cuenta para darse de baja.
- Push: `push_subscriptions` solo se escribe con `save_push_subscription` (solo entrenadores, https, máximo 10 dispositivos; un navegador que cambia de cuenta se reasigna). El service worker solo sigue rutas del mismo origen. Las suscripciones muertas (404/410) se borran solas.
- Alumnos: nunca llevan fecha de nacimiento (el registro y la conversión de cuenta de alumno la descartan).

## Activar los canales (lo que queda por hacer fuera del código)
1. **Push:** `npx web-push generate-vapid-keys`; poner las tres variables `VAPID_*` en Vercel (Production) y redesplegar. Hasta entonces el botón de avisos en Mi cuenta no aparece. En desarrollo el service worker no se registra (a propósito), así que el push real solo se prueba en producción.
2. **Correo:** dominio verificado en Resend + `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` (docs/EMAIL.md). Sin SPF/DKIM los correos caerían en spam.

## Límites
Sin segmentación por comportamiento, sin pruebas A/B, sin métricas de apertura o clic (a propósito: nada de rastreadores), sin plantillas guardadas, sin envío a alumnos. Los envíos programados tienen la precisión del cron diario.
