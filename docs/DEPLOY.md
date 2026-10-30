# Despliegue a producción

> Estado honesto: **nada de esto se ha ejecutado contra servicios reales** (no hay proyecto Supabase remoto, ni cuentas Wompi/PayPal de producción, ni hosting conectado). Se verificó en local: el arranque en modo producción (`next start`) rechaza una configuración inválida, `/api/health` y `/api/cron/expire` responden como se documenta. Todo lo demás es una lista de pasos para hacer y comprobar, marcada con ☐.

## 0. Qué necesitas
Proyecto Supabase (Postgres + Auth + Storage + Realtime), hosting Next.js 16 con Node (la guía asume Vercel por el `vercel.json`; otro hosting funciona si ejecuta el cron), dominio con HTTPS, cuenta Wompi (Colombia) y/o PayPal (negocio) con acceso a producción, y — opcional — clave de Anthropic.

## 1. Supabase remoto
1. ☐ Crea el proyecto (elige región cercana: privacidad de datos de salud y latencia).
2. ☐ Enlaza y aplica las migraciones **en orden** (0001 → 0021):
   ```bash
   supabase link --project-ref <ref>
   supabase db push
   ```
   Las migraciones crean el bucket privado `progress-photos` y sus políticas, y añaden `messages`, `video_calls`, `notifications` a la publicación `supabase_realtime`. ☐ Comprueba ambos en el dashboard (Storage → bucket **no público**; Database → Replication).
3. ☐ **Auth → Configuración** (detalle de recuperación de contraseña abajo): `Site URL` = `APPLICATION_BASE_URL`; `Redirect URLs` solo tu dominio; confirmación de correo **activada**; longitud mínima de contraseña **≥ 10** (el `config.toml` local usa 6, solo para desarrollo); revisa los límites de tasa de Auth; configura SMTP propio (el de pruebas tiene cuota baja). Ten claro si quieres registro público abierto (`enable_signup`).
4. ☐ Copia `Project URL`, la clave *publishable* y la clave *service role* (esta última **solo** en variables del servidor; nunca `NEXT_PUBLIC_`).
5. ☐ Copias de seguridad: activa backups diarios/PITR según tu plan y **prueba una restauración** antes de tener alumnos reales.
6. ☐ Tasa USD→COP (obligatoria para Wompi; la app nunca la inventa):
   ```bash
   node --env-file=.env.cloud scripts/set-fx-rate.mjs 3950.50 "TRM Banco de la República AAAA-MM-DD"
   ```
   **No hay actualización automática**: alguien debe registrar la tasa al menos cada 7 días. Si pasa de `FX_MAX_AGE_HOURS` (por defecto 168 h) los cobros nuevos con Wompi se **rechazan** hasta registrar una tasa nueva (PayPal sigue funcionando); `/api/health` (modo operador) lo reporta como problema. Ver `docs/BILLING.md`.
7. ☐ Datos de ejercicios y alimentos: `npm run exercises:seed` y `npm run foods:seed` (con las variables de producción). Siguen marcados `review_status=draft`: revísalos con un profesional antes de usarlos con alumnos reales.

### Recuperación de contraseña y registro: lo que debe estar configurado en Supabase Auth
- ☐ **Site URL** = `APPLICATION_BASE_URL` y **Redirect URLs** con `https://TU_DOMINIO/auth/confirm` (y solo tu dominio). Si falta, Supabase redirige a su Site URL y el enlace del correo no llega a la app (en local se ve como `redirect_to=http://127.0.0.1:3000`).
- ☐ **Confirmar correo activado** (el registro ya responde «revisa tu correo» cuando no hay sesión inmediata) y **longitud mínima de contraseña = 10** (la app exige 10 con letras y números; Supabase debe coincidir).
- ☐ **SMTP propio** con SPF/DKIM/DMARC del dominio de envío; sin él los correos de recuperación van a spam o no salen (el SMTP de prueba de Supabase tiene cuota muy baja). **Límites de tasa de correo de Auth** coherentes con los de la app (por defecto la app permite 3 solicitudes por correo y hora).
- ☐ **Plantilla «Reset password»**: la predeterminada usa `{{ .ConfirmationURL }}` (flujo PKCE) y **solo funciona si el enlace se abre en el mismo navegador** que lo pidió. Para que funcione en cualquier dispositivo, cambia el enlace de la plantilla a `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password` (`/auth/confirm` ya acepta ambas formas; la segunda se probó con tokens reales de Auth, no con una plantilla desplegada).
- ☐ Prueba completa en producción con un correo real: pedir enlace → llega → abrir → nueva contraseña → la sesión de otros dispositivos se cierra.
- Si aparece abuso masivo de registros: activar **CAPTCHA** de Supabase Auth (hCaptcha/Turnstile) y añadir el widget al formulario; la app no lo incluye todavía (requiere cuenta del proveedor).

## 2. Variables de entorno (hosting)
Plantilla: `.env.example`. El servidor **no arranca** en producción si algo crítico falla (`src/instrumentation.ts` + `src/lib/env.ts`; los logs `[config]` nombran la variable, nunca el valor).

| Variable | Obligatoria | Nota |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | sí | públicas por diseño |
| `SUPABASE_SERVICE_ROLE_KEY` | sí | secreta; solo servidor |
| `APPLICATION_BASE_URL` | sí | `https://…` sin barra final; se usa en retornos de pago y enlaces |
| `CRON_SECRET` | sí | ≥ 32 caracteres aleatorios (`openssl rand -hex 32`) |
| `WOMPI_*` (5) | uno de los dos proveedores | todo o nada; `WOMPI_ENVIRONMENT=production` con llaves reales |
| `PAYPAL_*` (5) | uno de los dos proveedores | `PAYPAL_PLAN_ID` sale de `scripts/paypal-setup.mjs` (una vez, en producción) |
| `AI_PROVIDER` (`anthropic`, `openai` o `gemini`), la clave de ESE proveedor (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY`), `AI_MODEL` (obligatorio salvo con Anthropic), … | no | sin ellas la IA queda apagada («Modo sin IA»); ver `docs/AI.md` |
| `AI_ALLOW_SENSITIVE` | no | `true` envía contexto de salud minimizado a un tercero: requiere contrato/DPA y aviso de privacidad actualizado |
| `CSP_MODE` | no | `report-only` = la CSP no bloquea, solo registra; úsalo el primer día y quítalo cuando la consola esté limpia |
| `FX_MAX_AGE_HOURS` | no | 1–1440, por defecto 168: edad máxima de la tasa USD→COP para cobrar con Wompi |
| `FX_WARN_HOURS` | no | 24 por defecto: horas antes del vencimiento de la tasa en que se avisa al operador |
| `ADMIN_ALERT_WEBHOOK_URL` | recomendada con Wompi | webhook https del operador (Slack/Discord/…) para avisos de tasa; sin ella solo hay `/api/health` y logs |
| `AUTH_LIMIT_*`, `AUTH_MIN_FILL_MS` | no | límites de intentos y tiempo mínimo de formulario (ver `.env.example`); los valores por defecto son los recomendados |
| `ALLOW_LOCAL_PRODUCTION` | **nunca en producción** | solo para probar `next start` en un portátil |

☐ Define las de **Production** y **Preview** por separado; un preview no debe apuntar a la base de producción ni a llaves reales de pago.

## 3. Cron
`vercel.json` programa `GET /api/cron/expire` cada 15 minutos. Vercel envía `Authorization: Bearer $CRON_SECRET` si la variable existe (comportamiento descrito en su documentación; **compruébalo en tu panel tras el primer despliegue**). La ruta ejecuta: vencimiento de pruebas/periodos/compras pendientes, recordatorios (fotos, fin de prueba) y recordatorios de videollamada 24 h / 1 h.
- ☐ La frecuencia permitida depende del plan de hosting: si tu plan solo permite diario, el aviso de 1 h antes de la videollamada **no será puntual** y los vencimientos llegarán tarde (el acceso igualmente se bloquea al instante en la base de datos; el cron solo actualiza estados y avisa).
- Alternativa sin Vercel: cualquier planificador externo con `curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://tu-dominio/api/cron/expire` cada 5–15 min.
- ☐ Alerta si el cron falla: respuesta no-200 repetida. El mismo cron envía el aviso de tasa por vencer (ver `docs/BILLING.md`): prueba el webhook una vez con una tasa de prueba antes de salir.

## 4. Pagos
- ☐ **Wompi** (dashboard → Desarrolladores): URL de eventos `https://tu-dominio/api/webhooks/wompi` (la app procesa `transaction.updated`); copia el secreto de eventos y el de integridad. Prueba primero en sandbox con una transacción real de prueba.
- ☐ **PayPal** (developer dashboard → producción): crea la app, registra el webhook `https://tu-dominio/api/webhooks/paypal` (eventos `PAYMENT.CAPTURE.*`, `BILLING.SUBSCRIPTION.*`, `PAYMENT.SALE.*`), copia su **Webhook ID**, y ejecuta una vez `scripts/paypal-setup.mjs` con `PAYPAL_ENVIRONMENT=production` para crear el plan.
- La activación **nunca** depende del redirect del navegador: cada pago se confirma releyéndolo al proveedor y es idempotente. ☐ Haz un pago real de importe mínimo, reembólsalo y verifica que la capacidad baja y que un webhook repetido no duplica nada.
- ☐ Revisa con tu contador: facturación electrónica DIAN, IVA, retenciones y comisiones. **La app no emite facturas fiscales.**

## 5. Seguridad antes de abrir
- ☐ `curl -sI https://tu-dominio/login` muestra las cabeceras de `docs/SECURITY.md` (incluida la CSP con nonce distinto en cada petición); `https://tu-dominio/sw.js` con `no-cache`.
- ☐ Revisa las brechas conocidas de `docs/SECURITY.md` (CSP sin `report-uri`; límite de intentos de login solo el de Supabase; sin pentest).
- ☐ Privacidad (Ley 1581): textos de `/privacidad` y `/terminos` revisados por abogado; registro de bases de datos ante la SIC si aplica; contrato con Supabase/hosting/proveedor de IA.
- ☐ Usuarios de demostración **no** existen en producción (`scripts/dev/*` rechaza bases no locales; no los ejecutes).

## 6. Verificación posterior al despliegue
1. ☐ `GET /api/health` → `{"ok":true}`; con el secreto → `problems: []`.
2. ☐ Registro de entrenador real → correo de confirmación llega → entra → ve «Prueba gratis: 7 días».
3. ☐ Invitar alumno, aceptar consentimientos, evaluación, plan, registrar entrenamiento, subir foto, chat en vivo entre dos navegadores.
4. ☐ Pago de prueba (sandbox) de suscripción y de cupos; luego el mismo en producción con importe mínimo.
5. ☐ Instalar la PWA en un Android y en un iPhone (**no probado**); sin conexión muestra la pantalla offline.
6. ☐ Exportar datos y eliminar cuenta con un usuario de prueba.

## 6b. SEO tras el despliegue
- ☐ `APPLICATION_BASE_URL` correcta **en tiempo de ejecución** (la leen `robots.txt`, `sitemap.xml`, canónicas y Open Graph).
- ☐ Abre `https://TU_DOMINIO/robots.txt`, `/sitemap.xml` y una página inexistente (debe ser un 404 en español).
- ☐ Comparte la portada en un chat o un validador de vista previa social para ver `og.png`; valida el JSON-LD de la portada con la herramienta de resultados enriquecidos de Google.
- ☐ Verifica el dominio en Search Console, envía el sitemap y revisa a la semana la cobertura. Sin tráfico no hay datos de campo de Core Web Vitals.

## 7. Operación
- Monitorea `/api/health` (modo operador) cada minuto: base de datos, webhooks sin procesar > 15 min, tasa vieja, errores de configuración.
- Reversa: las migraciones son solo hacia delante; ante un fallo, restaura backup o aplica una migración correctiva. No edites migraciones ya aplicadas.
- Tareas manuales recurrentes: registrar la tasa USD→COP; revisar compras pendientes/rechazadas; curar ejercicios.

## 7. Cuenta demo para presentaciones
`scripts/ops/create-demo.mjs` crea un entrenador demo (suscripción activa 365 días, sin proveedor de pago, **nunca cobra**) y cuatro alumnos **ficticios** con evaluación, plan publicado, cuatro semanas de entrenamientos y conversación. Todas las cuentas usan `@example.com` (no recibe correo). Requiere la biblioteca de ejercicios cargada y se niega a correr dos veces.
```bash
DEMO_PASSWORD='…' node --env-file=.env.cloud scripts/ops/create-demo.mjs --confirm-production
```
Para rehacerla: borra los usuarios `demo.*@example.com` en Supabase → Authentication → Users y vuelve a ejecutarla. No cargues datos de personas reales en esta cuenta.
