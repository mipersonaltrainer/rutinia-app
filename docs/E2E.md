# Pruebas E2E (Playwright)

```bash
npm run test:e2e        # build de producción + todas las specs
npm run test:e2e:run    # sin recompilar (si el build está al día)
```
El servidor de pruebas usa un secreto de cron fijo y local (`E2E_CRON_SECRET`) y un receptor de avisos en el puerto 3059 que levanta la propia spec.

Requisitos: Supabase local en marcha, Chrome instalado (se usa `channel: "chrome"`: no se descarga ningún navegador; `E2E_BROWSER=chromium` usa el Chromium de Playwright si lo instalas con `npx playwright install chromium`).

## Cómo funciona
- Levanta `next start` (build de producción, puerto 3050) con `ALLOW_LOCAL_PRODUCTION=1` y llaves **falsas** de Wompi; así se ejercita la misma CSP con nonce, la validación de entorno y el proxy que en producción.
- Cada spec crea sus propios usuarios (`e2e-…@x.co`, contraseña de prueba local) vía API de administración y **se niega a correr contra una base que no sea local**. Antes y después de la corrida se purgan con `scripts/dev/purge-test-users.sql`. La tabla `fx_rates` se estaciona y se restaura.
- Los dos navegadores de «mensajes en vivo» son contextos independientes (entrenador y alumno).
- **Nunca se contacta a Wompi**: la navegación del navegador a `checkout.wompi.co` se intercepta y se inspecciona la URL.

## Qué cubre (65 pruebas)
| Spec | Verifica |
|---|---|
| `auth` | contraseña incorrecta no inicia sesión; entrenador y alumno entran a su área; cada rol es devuelto de la del otro; rutas privadas redirigen sin sesión; cerrar sesión revoca; `/api/health` anónimo mínimo; nonce de CSP distinto por petición y sin `unsafe-inline`; cero violaciones de CSP |
| `messages` | un mensaje del alumno aparece al entrenador **sin recargar** (marcador JS intacto) y viceversa; «leído» llega en vivo; insignia de no leídos aparece y se limpia; HTML/enlaces se muestran como texto y no se ejecutan; un entrenador ajeno recibe 404; aviso 123 y límite de 2000 caracteres |
| `billing` | con tasa vigente: URL de checkout con monto/moneda/firma/referencia correctos, registro `pending` con la tasa congelada, **el retorno del navegador no activa capacidad**; con tasa de 10 días: rechazo de servidor, sin registro ni navegación; sin tasa → mensaje, y una tasa nueva reactiva Wompi; cantidad manipulada (99) rechazada por el servidor |
| `client-flow` — evaluación | el servidor rechaza un envío sin objetivos; riesgo calculado en el servidor (`review` por lesión; `professional_evaluation` por dolor en el pecho en la reevaluación); el alumno ve el aviso **sin** los motivos y el entrenador los ve; el acceso a la ficha queda en `access_audit`; retirar el consentimiento de salud oculta la evaluación al entrenador |
| `client-flow` — entrenamiento | iniciar con recuperación; un solo entrenamiento abierto («Continuar» en vez de «Entrenar»); guardar series una a una con repeticiones prellenadas; persisten al recargar; molestia 8/10; finalizar incompleto (3 de 4, 75 %); la sesión terminada es de solo lectura; el entrenador ve el avance y la alerta profesional; otro alumno recibe 404 |
| `photos` | consentimiento antes de subir; archivo falso y de más de 8 MB rechazados sin dejar rastro; JPEG con EXIF → WebP **sin metadatos** en la carpeta del dueño; carga bajo la CSP; URL pública, otro alumno y otro entrenador no pueden leer, firmar ni escribir en esa carpeta; el entrenador la ve con registro de acceso y deja de verla al retirar el consentimiento; la revisión llega al alumno; límite de 10 al día; eliminar borra archivo y registro |
| `client-flow` — aviso de molestias | 5/10 no avisa; 6/10 hace aparecer la insignia del entrenador **en vivo**; subir a 9/10 o editar la nota no duplica el aviso; terminar con dolor general 6/10 es un segundo evento; la bandeja nombra al alumno pero no muestra intensidad, zona ni nota; «Abrir» lleva a la ficha donde sí está el detalle; sin el permiso de compartir no hay aviso |
| `ops` | el cron exige su secreto; aviso único a ~20 h del límite aunque el cron corra varias veces; `/api/health` anónimo mínimo y, con secreto, estado/horas/webhook sin exponer la URL; el entrenador no ve información operativa; al vencer el aviso escala y Wompi se pausa para el entrenador; la recuperación se avisa; un receptor caído no rompe el cron y se reintenta |
| `marketing` | el equipo crea un comunicado, ve la vista previa personalizada y el alcance, no puede enviar sin confirmar, y el entrenador lo recibe en su campana (solo el nombre de pila); preferencias y fecha de nacimiento en Mi cuenta (se rechaza una fecha futura); cumpleaños: se felicita una sola vez y el saludo llega; un entrenador no entra al panel |
| `support` | el entrenador abre una conversación (correo visible, fila `open` con 1 sin responder); con la suscripción vencida el soporte sigue accesible y el resto redirige a Facturación; el equipo responde desde `/staff` y el entrenador ve la respuesta, el contador y puede marcarla resuelta; un entrenador común no entra a `/staff` |
| `password` (13) | recuperar contraseña con el correo real, cuentas inexistentes sin pistas ni correo, robots, límite por correo, `/auth/confirm` sin redirección abierta, `/reset-password` inaccesible con una sesión ordinaria, cambio con sesión (cierra otras), bloqueo por 10 fallos y su reinicio, registro con política, duplicados, robots y límite por IP (detalle en `docs/AUTH.md`) |
| `quality` (20) | SEO técnico, errores de red/interfaz, axe WCAG 2.2 AA en 27 pantallas, cookies de sesión, Realtime diferido, presupuestos de rendimiento, cachés y consola limpia (detalle en `docs/PERFORMANCE.md`) |

## Correo en las pruebas
Las specs de contraseña leen el correo desde la API de Mailpit (`http://127.0.0.1:54324`; `MAIL_API` la cambia). En CI el stack de Supabase arranca Mailpit. **En esta máquina** el stack se inició sin él: `scripts/dev/start-mail-sink.sh` levanta un sumidero SMTP propio (`scripts/dev/mail-sink.mjs`, un arnés de pruebas, no un servidor de correo) con el nombre de contenedor y el puerto que GoTrue ya espera, usando una imagen que el stack ya tenía; expone el mismo subconjunto de la API de Mailpit.

## Qué NO cubre (honesto)
- Un pago completo: confirmar con el proveedor exige la API de Wompi/PayPal y un webhook firmado; eso está cubierto a nivel de integración con proveedores simulados (`tests/integration/billing.test.ts`), no de navegador.
- PayPal, la IA, el constructor de planes del entrenador (el plan de las specs se crea por RPC), medidas antropométricas, invitaciones, informes PDF, PWA/offline, Safari y Firefox. Móvil solo por estilos responsivos, no emulado.
- Accesibilidad con axe se hizo a mano (ver `SECURITY.md`), no es parte de la suite.
- Verificación de que las pruebas detectan fallos: se rompió a propósito el filtro de realtime y la spec «en vivo» falló; no se hizo mutación sistemática del resto.

## Hallazgos que salieron al escribirlas
- La pantalla de entrenamiento decía «Tu entrenador será notificado» ante una molestia, pero no existe ese aviso (el entrenador la ve en la ficha). Se corrigió el texto; **sigue pendiente decidir si se implementa la notificación**.
- Tras enviar la primera evaluación, el formulario se desmonta (la página pasa al resumen) y el mensaje de éxito nunca se ve; el resumen hace de confirmación.
- Una cantidad fuera de rango manipulada en el DOM (`99`) rompe el formulario en el cliente (excepción en `slotPurchaseTotalCents`) antes de llegar al servidor; el servidor sí la rechaza (verificado enviando el DOM alterado sin eventos). Solo es alcanzable manipulando el DOM.
- Next añade un `role="alert"` vacío (`__next-route-announcer__`) en cada página: las specs usan `alerts(page)` para ignorarlo.
- Los archivos de Storage no se borran al borrar un usuario: la purga de pruebas ahora limpia carpetas huérfanas.
