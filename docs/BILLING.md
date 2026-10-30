# Facturación (estado real)

## Bold reemplaza a Wompi (migración 0034)
Bold es ahora el proveedor en pesos de la interfaz. Wompi sigue en el enum, el código y las rutas solo para liquidar pagos anteriores; no se ofrece en los formularios. Las secciones de Wompi más abajo son históricas.
- **Checkout**: Embedded Checkout de Bold. La acción de servidor crea la fila `pending` (referencia `SP-`/`AC-`/`SUB-` + uuid = `data-order-id`), calcula el hash de integridad `SHA256(orden + monto en pesos + COP + llave secreta)` y devuelve los parámetros; el componente `BoldCheckout` inyecta el botón. La llave secreta nunca llega al navegador. CSP: `frame-src https://checkout.bold.co`.
- **Verificación**: el retorno (`/billing/bold/return?bold-order-id=…`) y el webhook (`/api/webhooks/bold`, firma `x-bold-signature` = HMAC-SHA256 del cuerpo en Base64) solo indican *qué* mirar; el estado y el monto se releen de `GET payments.api.bold.co/v2/payment-voucher/<orden>` con la llave de identidad y se comparan con lo guardado (`amount_mismatch` si difiere). Idempotencia por `provider_webhook_events (bold, id del evento)`.
- **Variables**: `BOLD_IDENTITY_KEY`, `BOLD_SECRET_KEY` (ambas del mismo ambiente: prueba o producción).
- **Pendiente / no verificado**: pago real en sandbox (no había llaves al construirlo); Bold **no envía webhooks en sandbox** (solo «Probar el webhook»), así que ahí la liquidación ocurre por el retorno; el monto mínimo de Bold es $1.000 COP; no hay cobro recurrente (renovación manual); el comportamiento exacto del botón embebido cargado dinámicamente debe confirmarse en el navegador; registrar la URL del webhook en el panel de Bold para producción.

## Modelo comercial implementado
- **Suscripción**: USD 10.00 / mes, incluye 20 alumnos activos. No cambia al comprar cupos.
- **Cupos adicionales**: USD 0.75 cada uno, **pago único prepagado**, 1–10 por compra, acumulables. `capacidad = 20 + cupos con pago verificado`. (Se descartó el cobro mensual por cliente extra del primer brief; el segundo brief lo reemplaza.)
- Dinero siempre en enteros (centavos). Constraints en DB: `total = cantidad × 75`, 1 ≤ cantidad ≤ 10, suscripción = 1000 centavos.
- Prueba de 7 días con hora del servidor; sin cobro automático al vencer; sin periodo de gracia.

## Máquina de estados (`trainer_subscriptions.status`)
| De → A | Disparador |
|---|---|
| registro → `trialing` | trigger de alta |
| `trialing` → `payment_required` | job `expire_subscriptions()` (y el acceso se bloquea antes, por hora, en `trainer_has_access`) |
| cualquiera → `active` | pago de suscripción **verificado** (`settle_subscription_payment`); suma 1 mes desde el fin del periodo vigente (o desde ahora si ya venció) |
| `active` → `past_due` | PayPal reporta pagos fallidos (se respeta lo ya pagado hasta `current_period_end`) |
| `active/past_due` → `payment_required` | el periodo venció sin renovación (job) |
| `*` → `canceled` | cancelación confirmada por PayPal; acceso hasta `current_period_end`, luego `expired` |
| `*` → `suspended` / `expired` | estado confirmado por el proveedor |
Acceso = `trialing` vigente, o `active/past_due/canceled` con `current_period_end > now()`. Se aplica en RLS (toda tabla de negocio) y en el servidor; los alumnos de un entrenador bloqueado no ven sus planes.

## Seguridad de pagos
- Nada se activa por la redirección del navegador: el retorno solo trae un id; el servidor **relee la transacción desde la API del proveedor** (Wompi con llave privada; PayPal con OAuth) y compara monto y moneda con lo que se guardó antes del checkout. Diferencias → `amount_mismatch` (auditado, no concede).
- Webhooks: Wompi → checksum SHA256 (`signature.properties` + timestamp + secreto de eventos, comparación en tiempo constante, entorno validado); PayPal → `POST /v1/notifications/verify-webhook-signature`. El evento solo indica *dónde mirar*; el estado se vuelve a leer de la API.
- Idempotencia: `provider_webhook_events (provider,event_id)` único + `settle_*` con `SELECT … FOR UPDATE` y transiciones permitidas. Probado con entregas repetidas y concurrentes.
- Reembolso/anulación: la compra pasa a `voided`, la capacidad baja, **no se desactiva ni borra a ningún alumno**; no se pueden activar más hasta ampliar capacidad. Un pago aprobado por el proveedor tras haber marcado nuestra compra como `expired` sí se acepta (el dinero ya entró).
- Los registros de pago no se borran en cascada al borrar un usuario (retención contable); el flujo de borrado de cuenta deberá anonimizarlos.

## Moneda
- PayPal cobra en **USD**. Wompi cobra en **COP** (único moneda disponible según su documentación).
- Tasa USD→COP: tabla `fx_rates`, cargada por un administrador (`node --env-file=.env.local scripts/set-fx-rate.mjs 3950.50 "TRM 2026-10-19"`). Sin tasa, Wompi queda deshabilitado (no se inventa). Se muestra antes de pagar y se guarda en cada cobro; redondeo al peso, mitad hacia arriba. La renovación manual usa la tasa vigente al iniciar cada pago.

## Qué falta para activar cada proveedor
### Wompi (sandbox → producción)
1. Cuenta de comercio Wompi; llaves `pub_*`, `prv_*`, secreto de eventos y de integridad (Desarrolladores).
2. Registrar la URL de eventos **por ambiente**: `https://TU_DOMINIO/api/webhooks/wompi` (evento `transaction.updated`). Wompi reintenta 3 veces en 24 h si no responde 200.
3. Verificar con Wompi el **monto mínimo** aceptado para tu cuenta (un cupo = ~3.000 COP a tasa 4.000; no confirmado).
4. **Cobro recurrente automático NO implementado.** Wompi lo soporta vía *fuentes de pago* (tokenizar tarjeta/Nequi por API + token de aceptación), lo que exige un formulario propio de captura y posible habilitación del comercio. Mientras tanto la suscripción con Wompi es **renovación manual** (se avisa en pantalla).
5. Tarjetas sandbox: 4242 4242 4242 4242 (aprobada), 4111 1111 1111 1111 (rechazada).
### PayPal
1. App en developer.paypal.com (sandbox) → `PAYPAL_CLIENT_ID/SECRET`.
2. `node --env-file=.env.local scripts/paypal-setup.mjs` crea el producto y el plan de USD 10/mes → `PAYPAL_PLAN_ID`.
3. Webhook a `https://TU_DOMINIO/api/webhooks/paypal` con los eventos `PAYMENT.CAPTURE.*`, `BILLING.SUBSCRIPTION.*`, `PAYMENT.SALE.*` → copiar su Webhook ID a `PAYPAL_WEBHOOK_ID`.
4. Los nombres exactos de eventos de suscripción no están en las especificaciones OpenAPI; el código despacha por prefijo y **siempre relee** la suscripción y sus transacciones desde la API, por lo que no depende de un nombre concreto.
### Job de vencimiento
Programar `GET /api/cron/expire` con `Authorization: Bearer $CRON_SECRET` (p. ej. Vercel Cron cada 15 min). El acceso ya se bloquea por hora en la base de datos aunque el job no corra; el job solo actualiza estados y expira compras pendientes (>24 h).

## Estado de verificación
| Pieza | Estado |
|---|---|
| Precios, FX, firmas (vector oficial de integridad Wompi), cliente PayPal con HTTP simulado | Probado (tests unitarios) |
| Funciones de liquidación, máquina de estados, RLS, capacidad, idempotencia concurrente | Probado contra Postgres local |
| Webhooks Wompi/PayPal de punta a punta con la API del proveedor **simulada** | Probado |
| Pago real en sandbox de Wompi / PayPal | **No probado**: no hay credenciales en este entorno |
| Cobro recurrente Wompi | No implementado |
| Retorno del navegador (`/billing/*/return`) | Código escrito; no ejercitado con proveedor real |
| Nota | El ejemplo de *checksum* de la página de eventos de Wompi no coincide con el SHA256 de los datos que esa misma página lista (verificado con Python); se implementó el algoritmo descrito. Confirmar con un evento real de sandbox. |

## Antigüedad de la tasa USD→COP (guardia)
La tasa la fija un administrador (`scripts/set-fx-rate.mjs`); nada la actualiza sola. Una tasa olvidada cobraría de más o de menos en cada pago Wompi, así que **una tasa más vieja que `FX_MAX_AGE_HOURS` (por defecto 168 h = 7 días) pausa los cobros nuevos en pesos**.
- Se evalúa la tasa **más reciente** ya vigente (`src/lib/billing/rate.ts`, política pura en `fx.ts`): una tasa vieja nunca se rescata con otra más antigua; registrar una nueva reactiva Wompi al instante. Una tasa con fecha futura, o con fecha inválida, se rechaza.
- **La autoridad es la acción de servidor** (compra de cupos y suscripción con Wompi): responde con el motivo («tiene 10 días de antigüedad (máximo permitido: 7 días)… puedes pagar con PayPal») y no crea ningún registro de pago ni redirige. Los formularios solo reflejan el mismo estado.
- No afecta a PayPal (USD), ni a pagos ya iniciados: cada pago guarda la tasa con la que se creó (`fx_rate`, `fx_rate_at`) y un webhook tardío se liquida con ella.
- `FX_MAX_AGE_HOURS` debe ser un entero entre 1 y 1440; un valor inválido **vuelve al valor por defecto, no desactiva la guardia** (el chequeo de entorno lo avisa). Valores > 168 generan advertencia.
- `/api/health` (modo operador) reporta `fx.state` y añade el problema «Wompi pausado: …» mientras la tasa no sea utilizable.
- Pendiente (operación): alguien debe registrar la tasa cada ≤ 7 días; no hay recordatorio automático ni tarea que la traiga de una fuente oficial. Cuando falte poco, el único aviso es `/api/health`.

## Aviso al operador cuando la tasa está por vencer
Como nadie más puede registrar la tasa, el **operador** recibe un aviso antes de que Wompi se pause (migración 0023, `src/lib/billing/fx-alert.ts`, ejecutado por `/api/cron/expire`):
- **Cuándo**: a `FX_WARN_HOURS` (24 por defecto, tope: límite − 1 h) del vencimiento → «🟠 vence en ~N h»; al vencer, faltar o tener fecha futura → «🔴 … cobros pausados»; al registrarse una tasa nueva → «🟢 al día». Solo si Wompi está configurado.
- **No se repite en cada corrida del cron**: un aviso por cambio de estado; mientras persista, un recordatorio cada 12 h (por vencer) o 6 h (pausado). La decisión es atómica en la base (`claim_operator_alert`, con bloqueo): 12 corridas simultáneas generan un solo aviso.
- **Entrega**: POST JSON `{ text, content }` a `ADMIN_ALERT_WEBHOOK_URL` (https, sin credenciales en la URL; http solo en loopback para pruebas; sin seguir redirecciones; 5 s de tiempo máximo). Además se escribe en los logs del servidor. Si la entrega falla, **se revierte el registro** y la siguiente corrida reintenta; un webhook roto nunca rompe el cron.
- `/api/health` (modo operador) muestra `fx.alertState`, `fx.hoursLeft` y si hay webhook configurado, y añade «vence en ~N h» a `warnings`. Sin `ADMIN_ALERT_WEBHOOK_URL` el chequeo de entorno avisa que nadie será notificado; una URL inválida **impide arrancar** en producción.
- Los entrenadores no ven nada de esto: solo el mensaje de pausa cuando la tasa ya no es utilizable.

**No verificado**: la entrega a Slack o Discord reales (solo contra un receptor HTTP de prueba). Se envía `text` y `content` para cubrir ambos formatos; que ninguno rechace el campo sobrante no está comprobado. **Límite**: la puntualidad depende de la frecuencia del cron (cada 15 min); con un cron diario el aviso de 24 h puede llegar tarde, y no hay correo, SMS ni escalamiento si nadie atiende el canal.

## Créditos de IA (migración 0032)
- **Qué cuesta:** un borrador de dieta o de plan de entrenamiento (`diet_draft`, `plan_draft`) gasta **1 crédito**. Cada entrenador tiene **3 gratis al mes** (se reinician el día 1, UTC); después compra paquetes prepagados de pago único (precios en «Listas de precios»; `AI_PACKS` en `src/lib/billing/pricing.ts`, y la base de datos también valida paquete, créditos y precio).
- **Qué no cobra:** el texto del informe de progreso y el asistente del alumno no gastan créditos. El asistente del alumno lo paga la plataforma, por eso su tope baja a 10 consultas al día y 200.000 tokens al mes.
- **Saldo:** nunca se guarda, se calcula: créditos de compras aprobadas menos borradores que gastaron crédito (`ai_credit_state`, `my_ai_credits()`). El crédito se toma al reservar (`ai_reserve`, atómico con los límites) y se devuelve si el borrador falla, el validador lo descarta o queda abandonado más de 10 minutos. Un rechazo por falta de créditos (`no_credits`) no registra nada.
- **Pagos:** mismo patrón que los cupos de alumnos. Referencias `AC-…` en Wompi; en PayPal la orden se asigna a cupos o a créditos según la tabla donde existe. Solo el servicio liquida una compra (`settle_ai_credit_purchase`), tras verificar el pago con el proveedor; montos y moneda se comparan y un pago reembolsado (`voided`) quita sus créditos. Historial en Facturación y en la exportación de datos del entrenador.
- **Presupuesto mensual de tokens:** ya no frena los borradores pagados (los limitan los créditos); sigue limitando los usos no facturados.
- **Antes de subir los precios o cambiar el modelo:** medir tokens reales en `ai_usage` (cada borrador guarda `input_tokens` y `output_tokens`). El modelo se elige con `AI_MODEL` en Vercel.

## Listas de precios (migración 0033)
Dos listas fijas, **sin conversión de moneda**: Wompi cobra en pesos (Colombia) y PayPal en dólares (fuera de Colombia). Los precios viven en `src/lib/billing/pricing.ts` y la base de datos los vuelve a validar (`slot_unit_cop()` y los checks `*_price_by_list`); una fila con otro monto se rechaza.

| Producto | Wompi (COP) | PayPal (USD) |
|---|---|---|
| Suscripción mensual (incluye 20 alumnos) | $40.000 | $10.00 |
| Cupo adicional, 1 o 2 | $2.500 c/u | $0.75 c/u |
| Cupo adicional, 3 o 4 | $2.400 c/u | $0.75 c/u |
| Cupo adicional, 5 a 9 | $2.200 c/u | $0.75 c/u |
| Cupo adicional, 10 | $2.000 c/u | $0.75 c/u |
| 20 borradores de IA | $25.000 | $6.00 |
| 100 borradores de IA | $100.000 | $20.00 |

- Wompi recibe los pesos en centavos (`amount_in_cents` = pesos × 100). Ya no se usa la tasa USD→COP para cobrar: `fx_rate` queda vacío en las compras nuevas. El monitoreo de la tasa (`/api/health`, aviso del cron) solo corre con `FX_MONITORING=on`.
- Las filas anteriores no se reescriben (las reglas nuevas se añadieron `NOT VALID`).
- Para cambiar un precio: editar `pricing.ts`, el SQL de 0033 (nueva migración) y estas tablas; las pruebas `tests/pricing.test.ts` y `tests/integration/prices-cop.test.ts` fallan si alguno queda distinto.
