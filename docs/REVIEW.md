# Revisión final — 20 de octubre de 2026

Qué hay, qué se comprobó, qué no, y en qué orden conviene atacar lo que falta. Es una foto del repositorio en el commit que la contiene; todo lo que afirma como «verificado» se ejecutó en esta máquina, nada se ejecutó contra servicios reales.

## 1. Qué existe
Monorepo único (Next 16, React 19, Tailwind 4, Supabase) con: landing pública; roles entrenador/alumno con aislamiento por RLS; invitaciones y consentimientos; evaluación inicial con cribado de riesgo; medidas y cálculos; biblioteca de 632 ejercicios; constructor de planes con versiones inmutables; registro de entrenamientos; motor de progresión con aprobación del entrenador; fotos privadas, informes PDF, exportación y eliminación de datos; copiloto de IA (opcional, con adaptador intercambiable); mensajería en vivo y enlaces de videollamada con recordatorios; facturación USD 10/mes + cupos prepagados con PayPal y Wompi; PWA; avisos de molestias al entrenador y de tasa por vencer al operador.

| Medida | Valor |
|---|---|
| Migraciones | 25 (`supabase/migrations`) · 40 tablas públicas, **todas con RLS** · 72 políticas · 50 funciones `SECURITY DEFINER` |
| Pruebas | 314 unitarias · 175 de integración (Supabase local) · SQL de RLS/privilegios · 65 E2E (Playwright sobre build de producción, con correo real de un capturador) |
| Calidad | `tsc`, `eslint` limpios · `npm audit` de producción: 0 vulnerabilidades · desarrollo: 5 «high» (`braces` ← `eslint-config-next`, solo tooling) |
| Documentos | 13 en `docs/` (este incluido) |

## 2. Hallazgos de esta revisión
**Corregidos aquí**
1. **Funciones auxiliares invocables con solo la llave pública** (`supabase/migrations/0024`). Cualquiera con la llave publishable podía llamar `trainer_capacity(uuid)`, `trainer_has_access(uuid)` o `has_consent(uuid, tipo)` con un UUID ajeno y enterarse de cupos comprados, estado de suscripción o consentimientos (se confirmó por REST antes y después). Se revocó `EXECUTE` a `anon`/`PUBLIC` en las 47 funciones y en las futuras; los usuarios autenticados lo conservan porque las políticas las usan. Se fijó además el `search_path` de `trainer_capacity` y `enforce_client_capacity`. `supabase/rls_test.sql` ahora **falla** si aparece una función así, una sin `search_path` o una tabla pública sin RLS.
2. **Re-autenticación que cerraba todas las sesiones** (encontrado al hacer la recuperación de contraseña): `verifyPassword`, usado para confirmar «eliminar cuenta» y «cerrar cuenta», llamaba `signOut()` con el alcance global por defecto y desconectaba al usuario de todos sus dispositivos al comprobar la clave. Corregido (`scope: "local"`) con una prueba de integración.
3. **Documentación desactualizada**: `PHASE1.md` listaba como «pendiente» cosas ya hechas (registro de entrenamientos, motor de progresión, aviso de molestias, pantalla de consentimientos). Corregido.

**Sin resolver — anotados**
4. **Falla intermitente no reproducida**: `tests/integration/privacy.test.ts › client erasure removes everything personal…` falló **una vez** en una corrida completa (se perdió el mensaje); pasó solo y en 6 corridas completas posteriores. Sospecha: tiempos (borrado de archivos en Storage o purga previa). Hay que capturar la salida cuando vuelva a ocurrir (en CI se sube como artefacto).
5. 5 avisos «high» de `npm audit` en dependencias de desarrollo; arreglarlos exige una mayor de `eslint-config-next`.
6. Mayores disponibles sin adoptar: ESLint 10, TypeScript 7, `@types/node` 26 (Dependabot las propondrá una a una).

## 3. Lo que falta antes de producción real, por prioridad
Esfuerzo: **S** ≤ 1 día · **M** unos días · **L** semanas. «Quién» indica si requiere decisión o cuentas que no son de código.

### P0 — bloquea abrir a usuarios o a dinero real
| # | Falta | Por qué importa | Esfuerzo / quién |
|---|---|---|---|
| 1 | ~~No existe «olvidé mi contraseña»~~ **HECHO** (20-oct-2026): recuperación, cambio con sesión y política de contraseñas, con cierre de sesiones; ver `docs/AUTH.md`. **Falta probar con un SMTP real** y desplegar la plantilla `token_hash` si se quiere abrir el enlace en otro dispositivo | Un usuario que olvida la clave pierde la cuenta | hecho · cuentas/SMTP tuyos |
| 2 | **Nada se ha ejecutado contra servicios reales**: Wompi/PayPal (sandbox y producción), Anthropic, webhook de avisos, Supabase remoto, GitHub Actions | Todo está probado con simuladores. Los contratos externos (firmas, eventos, montos mínimos, nombres de campos) pueden diferir | M · cuentas y credenciales tuyas |
| 3 | **Revisión legal** (Ley 1581): políticas y términos son borradores; registro de bases de datos ante la SIC si aplica; contratos de encargo de tratamiento con Supabase, hosting y proveedor de IA; transferencia internacional de datos de salud; retención y copias de seguridad que no se borran al eliminar | Son datos sensibles de salud y fotos | M · abogado |
| 4 | **Revisión profesional del contenido clínico**: los 649 ejercicios están en `draft` (instrucciones y seguridad genéricas, sin video); umbrales del cribado de riesgo y de progresión «razonables, no validados» | Un plan mal indicado puede lesionar a alguien | M–L · preparador físico / médico del deporte |
| 5 | **Autenticación del entorno remoto — parcial.** Hecho en código: límites por IP/correo en la base, campo trampa y tiempo mínimo, respuestas sin enumeración, política de 10 caracteres, el registro maneja «confirma tu correo». **Pendiente en la nube**: activar confirmar correo, mínimo 10 en Supabase, SMTP propio, Site URL y Redirect URLs (checklist en `docs/DEPLOY.md`) y, si hay abuso, CAPTCHA (no incluido). Cada registro válido aún abre un trial de 7 días con 20 cupos | Abuso de pruebas gratuitas y cuentas falsas | S · config + cuentas |
| 6 | **Copias de seguridad y restauración probada**, gestión y rotación de secretos | Sin esto una avería es pérdida de datos de pacientes | S · operación |
| 7 | **Observabilidad**: no hay seguimiento de errores, logs estructurados ni alertas (solo `/api/health` y el aviso de tasa) | Un webhook de pago roto o un 500 recurrente pasarían desapercibidos | M · código + herramienta |
| 8 | **Facturación fiscal**: la app no emite factura electrónica (DIAN), ni maneja IVA/retenciones; los reembolsos solo reducen capacidad | Obligación tributaria del negocio | M · contador |

### P1 — antes de crecer
| # | Falta | Nota |
|---|---|---|
| 9 | **Correo/push**: las invitaciones se envían copiando un enlace a mano; no hay recordatorios fuera de la app | Es la mayor fricción de producto; hay estructura (`notifications`) pero ningún proveedor |
| 10 | **Cron**: con un plan que solo permita diario, los avisos de 1 h y los vencimientos llegan tarde; no hay alerta si el cron deja de correr | `docs/DEPLOY.md` §3 |
| 11 | **Tasa USD→COP manual**: alguien debe registrarla al menos cada 7 días o Wompi se pausa; no hay panel (solo un script) ni fuente automática | Considera una pantalla de operador o traerla de una fuente oficial |
| 12 | **Wompi sin cobro recurrente**: la suscripción con Wompi es renovación manual | Exige tokenización de fuentes de pago y posible habilitación del comercio |
| 13 | **CSP**: `style-src 'unsafe-inline'`, sin `report-uri`; arrancar con `CSP_MODE=report-only` y revisar | `docs/SECURITY.md` |
| 14 | **Protección de la cuenta**: ya hay límite propio de intentos de login (por cuenta+IP), cierre de las demás sesiones al cambiar/recuperar la contraseña. **Falta MFA** para entrenadores | Supabase Auth ofrece TOTP; no se integró |
| 15 | **Rendimiento nunca medido**: 26 consultas de páginas sin `limit` explícito, listas sin paginación, la ficha del alumno carga todo; el tiempo real refresca con `router.refresh()` | Probar con volumen realista antes de cientos de alumnos |
| 16 | **Accesibilidad parcial**: axe WCAG 2.2 AA con cero violaciones en 27 pantallas (automatizado en E2E); falta lo manual; sin lector de pantalla, sin teclado de punta a punta, sin zoom 200 %; pantallas con datos reales no auditadas | Meta realista: WCAG 2.1 AA |
| 17 | **CI sin estrenar**: los workflows nunca corrieron en GitHub; falta proteger `main` exigiendo `quality`, `integration-e2e`, `audit` y activar *secret scanning* | `docs/CI.md` |
| 18 | **Back-office**: no hay rol administrador ni pantalla para revisar compras pendientes/rechazadas, usuarios, tasa o avisos | Hoy se hace por scripts/SQL |

### P2 — producto y pulido
19 Subida de video de ejercicios (hoy solo enlaces) y contenido multimedia · 20 comparar versiones de un plan · 21 un alumno con varios entrenadores (el correo se reutiliza mal) · 22 explicación de propuestas de progresión con IA (no implementada) · 23 notificar propuestas de progresión al entrenador · 24 modo offline útil (hoy deliberadamente solo una pantalla) · 25 videollamada embebida (hoy enlace a Meet/Zoom/Teams/Jitsi/Whereby) · 26 Safari/Firefox en E2E y PWA probada en móviles reales · 27 antivirus/rostros en fotos · 28 PDF con caracteres fuera de Latin-1 · 29 otros idiomas · 30 plazos de retención configurables.

## 4. Deuda técnica
- **Constantes duplicadas entre SQL y TypeScript**, protegidas por pruebas pero fáciles de desalinear: umbral de atención (6), lista de hosts de videollamada, límites de uso de IA, ventana de frescura de la tasa, estado de acceso del entrenador (`trainerAccess` vs `trainer_has_access`).
- **Estilo**: sin Prettier; muchas líneas de 200+ caracteres en componentes y pruebas. Legible por quien las escribió, costoso para un equipo.
- **Los dos mundos de pruebas** (Vitest y Playwright) comparten helpers solo en parte; `tests/setup/purge-test-users.ts` usa `session_replication_role = replica` y `docker exec`: solo funciona en local.
- **Migraciones**: 0019–0024 se aplicaron primero a mano a la base de desarrollo; se comprobó que las 24 se reaplican en orden sobre una base vacía, pero **nunca con `supabase db reset` real** (no hay CLI en esta máquina). Las migraciones son solo hacia delante (sin *down*).
- **Cobertura**: no se mide (sin proveedor de cobertura configurado); las pruebas se escribieron por riesgo, no por porcentaje.
- **`next dev` regenera `AGENTS.md`** con un bloque propio; está versionado a propósito.
- **Bifurcación PostgREST**: los *embeds* ambiguos (`plan_versions`) tienen una prueba guardia, pero es una trampa que reaparece con cada FK nueva.
- **IA**: el servidor falso (`scripts/dev/fake-anthropic.mjs`) no es un modelo; el comportamiento real ante prompts adversarios no se midió.

## 5. Lo que nunca se probó (resumen honesto)
Pagos reales o en sandbox · un modelo real · Slack/Discord reales · GitHub Actions · `supabase db reset` · Supabase en la nube · instalación de la PWA en Android/iOS · Safari y Firefox · lector de pantalla · carga/volumen · restauración de backups · un navegador real contra el dominio final con HTTPS y HSTS.

## 6. Orden sugerido
1. ~~Olvidé mi contraseña (P0-1) y endurecer registro/Auth (P0-5)~~ hecho en código; queda la configuración de Auth en la nube y probar con un SMTP real.
2. Subir el repositorio a GitHub, ver correr el CI real y arreglar lo que falle (P1-17) — descubre las suposiciones sin verificar con poco costo.
3. Sandbox de Wompi y PayPal de punta a punta con el flujo real (P0-2); luego Anthropic y el webhook de avisos.
4. En paralelo, lo que no es código: revisión legal (P0-3), revisión clínica del contenido (P0-4), contador (P0-8).
5. Observabilidad y backups (P0-6/7) antes del primer usuario real.
6. Correo transaccional (P1-9) y back-office mínimo (P1-18).
7. Piloto cerrado con pocos entrenadores conocidos, mirando rendimiento y accesibilidad con datos reales, antes de abrir el registro.

## 7. Mapa de documentos
`PHASE1` (índice y estado por módulo) · `BILLING` · `PROGRESSION` · `PRIVACY` · `AI` · `MESSAGING` · `PWA` · `SECURITY` · `E2E` · `CI` · `DEPLOY` · `UI_MAP` · **`REVIEW`** (este).
