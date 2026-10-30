# Cuentas: recuperación de contraseña, cambio y protección contra abuso

## Recuperar la contraseña
`/login` → «¿Olvidaste tu contraseña?» → `/forgot-password` → correo de Supabase Auth → `/auth/confirm` → `/reset-password` → `/login?reset=ok`.
- **Pedir el enlace** (`requestPasswordReset`): la respuesta es siempre la misma exista o no la cuenta (no hay forma de averiguar si un correo está registrado); solo las cuentas reales reciben correo. Los errores de Auth (límite de envío, SMTP caído) se registran en el servidor y no se muestran. Aviso para el usuario: si no llega, esperar un minuto (Auth separa los correos a una misma dirección; 60 s por defecto en Supabase).
- **`/auth/confirm`** (ruta pública) acepta `?code=` (PKCE, plantilla por defecto: **solo funciona en el mismo navegador que pidió el enlace**) o `?token_hash=&type=` (cualquier navegador, con la plantilla descrita en `docs/DEPLOY.md`). `next` se reduce a una lista interna (`/reset-password`, `/trainer`, `/client`, `/login`): no es una redirección abierta. Un enlace de recuperación solo puede llevar a `/reset-password`, aunque pida otra cosa.
- **Marcador de recuperación**: el enlace inicia sesión, así que sin más cualquiera con una sesión ordinaria (cookie robada, equipo compartido) podría abrir `/reset-password` y fijar una contraseña sin conocer la anterior. `/auth/confirm` pone una cookie httpOnly firmada (HMAC, atada al usuario, 15 min) y la página **y** la acción exigen ese marcador.
- **Al guardar**: política de contraseña, cierre de sesión **global** (todos los dispositivos, este incluido) y redirección al login. El enlace es de un solo uso (probado con Auth real).

## Cambiar la contraseña con sesión iniciada
Formulario en «Mi cuenta» (entrenador) y «Privacidad y datos» (alumno): pide la actual (re-autenticación), aplica la política, y cierra las **demás** sesiones (`scope: others`); la de este dispositivo sigue abierta.

## Política de contraseñas (`src/lib/auth/password.ts`)
10–72 bytes, con letras y números, sin caracteres repetidos, fuera de una lista corta de las más usadas, sin la parte local del correo ni el nombre de pila. Se aplica en registro, recuperación, cambio y aceptación de invitación. **El inicio de sesión no la aplica**: las cuentas creadas con reglas anteriores (8 caracteres) siguen entrando. Supabase debe tener el mismo mínimo (`config.toml` y panel).

## Abuso del registro y de la recuperación
| Capa | Qué hace | Dónde |
|---|---|---|
| Límites por ventana en la base | registro: 5/h por IP, 3/día por correo · recuperación: 8/h por IP, 3/h por correo · inicio de sesión: 10 por IP+correo y 60 por IP cada 15 min · cambio de contraseña: 6 por usuario / 15 min. Atómicos (12 solicitudes simultáneas no superan el límite), configurables con `AUTH_LIMIT_*` (un valor inválido vuelve al defecto, nunca a «sin límite»). Las claves son HMAC: la tabla no guarda correos ni IP. **Si el limitador falla, el intento se rechaza** (con un mensaje distinto al de un límite real). Un inicio correcto reinicia solo el contador de esa cuenta. | `auth_throttle` (migración 0025), `src/lib/auth/throttle.ts` |
| Campo trampa + tiempo mínimo | un formulario con el campo oculto relleno, sin token firmado, falsificado, más rápido que 3 s (`AUTH_MIN_FILL_MS`) o de más de 2 h se trata como robot: **misma respuesta que un éxito** («revisa tu correo») y no se crea nada. El token se captura una vez en el cliente: si se tomara el que reemite cada re-render, quien reintenta enseguida parecería un robot (error real que encontraron las pruebas). | `src/lib/auth/antibot.ts` |
| Mensajes sin enumeración | registro duplicado y recuperación no revelan si la cuenta existe | `src/app/actions.ts` |
| Correo de confirmación | si Supabase exige confirmar, el registro responde «revisa tu correo» (antes redirigía a una pantalla que devolvía al login) | `signUpTrainer` |

**Límites honestos**: la IP sale de `X-Forwarded-For` y solo es fiable detrás de un proxy de confianza (Vercel u otro): sin cabecera, todas las peticiones comparten un cupo común con un límite 10× mayor. El campo trampa y el tiempo mínimo frenan scripts simples, no a una persona decidida ni a un atacante que renderice el formulario. **No hay CAPTCHA, ni lista de correos desechables, ni MFA** (siguiente paso si aparece abuso; ver `docs/DEPLOY.md`). Cada registro válido sigue creando una prueba de 7 días con 20 cupos: los límites por IP/correo acotan el daño, no lo eliminan.

## Qué se verificó
- **Unitarias (25 + 1)**: política de contraseñas, token antirrobot (rápido/viejo/falsificado/retrofechado), marcador de recuperación (usuario, expiración, falsificación), `safeNext`, claves y reglas del limitador, mensajes.
- **Integración con Auth real (14) y base real**: el limitador (borde del límite, ventana, concurrencia 25→5, permisos, purga); cambio de contraseña + `signOut others` invalida de inmediato la otra sesión (incluido el refresco); un `token_hash` de recuperación entra una vez y muere; no sirve como otro tipo; reset + cierre global; y que `verifyPassword` ya no cierra sesiones.
- **E2E con correo real (13)**: recuperación de punta a punta leyendo el correo de Mailpit/sink (enlace PKCE, contraseña débil/no coincidente rechazada, sesión de otro dispositivo cerrada, la vieja deja de servir, el enlace no se reutiliza), respuesta idéntica para cuentas inexistentes y sin correo enviado, robots, límite por correo, `/auth/confirm` sin redirección abierta, una sesión ordinaria no puede usar `/reset-password`, cambio con sesión, bloqueo por 10 fallos, reinicio tras éxito, política en el registro, cuenta duplicada, robots en el registro y límite por IP.

## Hallazgos que salieron al hacerlo
1. `verifyPassword` (re-autenticación de «eliminar cuenta» y «cerrar cuenta») cerraba la sesión en **todos** los dispositivos al comprobar la contraseña (`signOut()` es global por defecto). Ahora `scope: "local"`; hay una prueba.
2. El token antirrobot se reemitía en cada re-render del servidor (pasa cuando la acción escribe cookies): un reintento rápido se descartaba en silencio. Corregido y cubierto por el E2E del límite de solicitudes.
3. ESLint analizaba `playwright-report/` y `test-results/` (generados): ahora se ignoran.

## No verificado
- Entrega con un SMTP real y la plantilla `token_hash` desplegada; Supabase en la nube (límites de correo, Site URL, confirmación de correo activada).
- La lista de redirecciones permitidas (`supabase/config.toml`) la aplica el stack al arrancar: el stack local de esta máquina se inició antes del cambio, así que sus pruebas siguieron el camino alternativo (el `code` se pasa a mano a `/auth/confirm`). CI arranca un stack nuevo y usará la lista.
- Una falla intermitente (no reproducida) de «Demasiados intentos… 1 min» en el E2E de cambio de contraseña, en una corrida; las 3 siguientes pasaron. Ahora el limitador registra `[auth] attempt limiter unavailable` y muestra otro mensaje si el limitador falla, para distinguir una caída de un límite real.
- La acción `resetPassword` se probó indirectamente (página + marcador); no hay una prueba que la invoque saltándose la página.

## Iniciar sesión y crear cuenta con Google
- **Qué hace:** «Continuar con Google» (login) y «Registrarme con Google» (registro) llevan a `/auth/google`, que inicia el flujo OAuth de Supabase con **PKCE** y vuelve a `/auth/confirm?next=/trainer&provider=google`. Un Google nuevo se convierte en **entrenador con la prueba de 7 días** (el mismo trigger que el registro con correo; el nombre sale de la cuenta de Google); un correo de Google que ya tiene cuenta en Rutinia **entra a esa cuenta** (Supabase vincula identidades con el mismo correo verificado), así que un alumno o una cuenta de soporte con ese correo conservan su rol y su panel.
- **Es un enlace (GET), no un formulario:** no hay reglas `form-action` de CSP en juego y el verificador PKCE queda en la cookie de ese mismo navegador.
- **Interruptor:** el botón solo aparece con `GOOGLE_SIGNIN=on` (Vercel Production). Sin eso no se ofrece, para que nadie llegue a un error crudo de Supabase mientras el proveedor no esté configurado.
- **No aparece con una invitación pendiente** (`/login?next=/invite/…`): un alumno invitado no debe crear por error una cuenta de entrenador.
- **Cancelación o fallo en Google:** `/login?error=google` con un aviso claro. Los demás avisos (`link`, `confirm`) no cambian.
- **Qué NO hace:** no pide fecha de nacimiento (se puede agregar en Mi cuenta) y no pasa por los límites de registro de la plataforma (los aplica Supabase/Google). Verifica con Google, no por correo de confirmación.
- **Activación (fuera del código):** Google Cloud (pantalla de consentimiento + cliente OAuth «Web» con la URL de retorno de Supabase) → Supabase → Authentication → Providers → Google (Client ID y Secret) → `GOOGLE_SIGNIN=on` y redespliegue.

