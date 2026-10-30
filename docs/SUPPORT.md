# Soporte para entrenadores

## El equipo de soporte es un tipo de cuenta propio (migración 0036)
Las personas de soporte **no son entrenadores**: su perfil tiene `role = 'staff'`, **no tienen prueba de 7 días ni suscripción**, no ven pantallas de entrenador ni de alumno y entran directo a su panel `/staff` (el login y la página de inicio usan `homeFor(role)`). Un entrenador o un alumno que abra `/staff` es devuelto a su propio inicio; una visita anónima va al login. Cada página del panel comprueba el acceso por sí misma (no solo el layout).

Panel `/staff` (acento azul y barra lateral, para distinguirlo del espacio de entrenador), solo lectura salvo responder:
- **Resumen:** entrenadores y alumnos, consultas sin responder, pagos pendientes de más de 1 h, entrenadores por estado (pagando, en prueba, bloqueados), pagos de 30 días por moneda y salud del sistema.
- **Soporte:** bandeja con filtros por estado y por tema, y la conversación con el contexto del entrenador.
- **Entrenadores:** directorio con búsqueda por nombre o correo y filtro por estado; ficha con suscripción, alumnos y planes (conteos), pagos y compras, conversaciones y alertas de facturación. **Nunca** datos de salud ni de contenido de los alumnos.
- **Ventas:** gráfica por día del mes (28/29/30/31 días, hora de Colombia), pesos o dólares, mes anterior y siguiente, mejor día, promedio y desglose por tipo (suscripciones, cupos, créditos de IA).
- **Marketing:** campañas, comunicados, cumpleaños y saludos (docs/MARKETING.md).
- **Sistema:** configuración activa (qué proveedores están configurados, sin mostrar valores), alertas de facturación, avisos recientes de los proveedores de pago (procesados o no), compras pendientes de más de 1 h y uso de IA de 24 h.
Los datos se leen con la llave de servicio en el servidor, solo después de comprobar que quien mira es del equipo (`requireStaff`); los cálculos (cubos de suscripción, resumen de pagos) son funciones puras con tests (`src/lib/staff/summary.ts`).

**Convertir una cuenta en cuenta de soporte:** la persona se registra normalmente en `/signup` (nace con prueba de entrenador) y luego `node --env-file=.env.cloud scripts/ops/add-support-staff.mjs correo@…` llama a `make_support_staff`: pasa a `role = 'staff'` y se **borra su suscripción de prueba**. Se niega si la cuenta ya tiene alumnos, planes o pagos aprobados (no se convierte a un entrenador real) o si es de alumno. `--remove` quita la pertenencia (la cuenta queda sin acceso a ningún panel).


Canal para que un entrenador escriba al equipo (pagos, acceso, permisos, errores). Dos vías:
- **Chat en la plataforma:** `/trainer/support` (el entrenador) y `/staff/soporte` (el equipo). Migración 0035.
- **Correo:** `support@rutinia.company` (constante `SUPPORT_EMAIL` en `src/lib/site.ts`; visible en el pie de la landing, en Soporte y en Facturación). El buzón y el DNS de correo del dominio los configura el operador: la plataforma **no** envía ni recibe correo por sí misma (sigue pendiente el SMTP propio, ver docs/EMAIL.md).

## Cómo funciona
- Una **conversación** (`support_threads`) tiene tema (`pago`, `acceso`, `permisos`, `error`, `otro`), asunto y estado (`open`, `answered`, `closed`). Sus mensajes (`support_messages`) son inmutables y de tipo `trainer`, `staff` o `agent` (reservado para un asistente automático que responda por el equipo: **no está construido**, pero el modelo ya lo distingue).
- **Seguridad (RLS):** el entrenador solo ve sus conversaciones; el equipo (tabla `support_staff`, función `is_support_staff()`) ve todas y los nombres de los entrenadores (no de alumnos). Toda escritura pasa por funciones `SECURITY DEFINER` (`support_open_thread`, `support_send`, `support_mark_read`, `support_set_status`): el remitente sale de la sesión, no del cliente. `support_staff` no se puede leer ni escribir por la API.
- **Límites:** 5 conversaciones abiertas por entrenador, 10 mensajes/min al abrir y 20/min al responder, asunto 3–120 caracteres, mensaje 1–4000.
- **Funciona con el espacio de trabajo bloqueado:** `/trainer/support` está exento de la redirección a Facturación (una suscripción vencida es justo cuando hace falta soporte).
- **Avisos al entrenador:** una notificación por conversación y hora cuando el equipo responde, más un contador en el menú «Soporte».
- **Avisos dentro de la plataforma (sin servicios de terceros):** cuando un entrenador abre una conversación o escribe el primer mensaje sin responder de una existente, **cada miembro del equipo recibe un correo (Resend) y una notificación del navegador** en los dispositivos donde la activó (`/staff/soporte`, tarjeta «Avisos cuando un entrenador escribe»; el celular debe tener la aplicación instalada). Llevan quién escribió, el tema, el asunto y el enlace; **nunca el texto del mensaje**. Con el panel abierto, el título de la pestaña muestra «(n) …» y suena un aviso corto (se puede silenciar). Cuando el equipo responde, el entrenador recibe una notificación del navegador si activó los avisos en Mi cuenta. La bandeja muestra cuánto lleva esperando cada conversación abierta (hasta 1 h normal, hasta 24 h atención, más de 24 h resaltada). Todo se envía **después** de responder a quien escribió (`after()`), y un fallo de envío no afecta al chat. Requiere las claves VAPID y las variables de correo ya usadas por marketing. Migración `0046` (el equipo puede suscribir dispositivos). **Verificado con pruebas unitarias y E2E locales. Confirmado por el propietario en producción (29-oct-2026):** el correo al equipo llegó (remitente `no-responder@rutinia.company`, botón «Abrir en Rutinia», sin el texto del mensaje) y la notificación del navegador llegó en el computador y en el celular. **Sin probar:** la notificación al entrenador cuando el equipo responde (ningún entrenador tenía avisos activados), SPF/DKIM/DMARC del correo, y cómo se ve en otros clientes de correo.
- **Avisos al equipo:** webhook Slack/Discord (`SUPPORT_ALERT_WEBHOOK_URL`, o `ADMIN_ALERT_WEBHOOK_URL` si falta) cuando llega el **primer** mensaje sin responder de una conversación. Lleva nombre, tema, asunto y enlace a `/staff/<id>`; **nunca el texto del mensaje**. Un webhook caído no impide que el entrenador escriba.
- **Contexto para el equipo:** en cada conversación `/staff/soporte/<id>` se ve el correo del entrenador, el estado de su suscripción y sus últimos pagos (lectura con la llave de servicio, solo tras comprobar que quien mira es del equipo).
- **Tiempo real:** `support_threads` está en la publicación de Realtime (cada mensaje toca su fila); `RealtimeSync` refresca la pantalla del entrenador y del equipo.

## Operación
- **Agregar o quitar a alguien del equipo** (debe tener cuenta):
  `node --env-file=.env.cloud scripts/ops/add-support-staff.mjs persona@correo.co` y `… --remove persona@correo.co`.
  Esa persona entra con su usuario normal y llega directo al panel `/staff`.
- **Variables:** `SUPPORT_ALERT_WEBHOOK_URL` (opcional). `src/lib/env.ts` avisa si no hay ningún webhook y rechaza uno que no sea https.
- **Pendiente / límites:** sin adjuntos; sin correo entrante (quien escribe a `support@…` queda fuera del chat hasta que alguien lo transcriba o se conecte un buzón); sin asignación a personas concretas ni etiquetas; sin edición ni borrado de mensajes; el asistente automático (`sender_kind = 'agent'`) y las respuestas por correo desde la plataforma no existen todavía.
