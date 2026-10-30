# Rutinia — Fase 1 (estado real)
> **Estado actual y lista priorizada de lo que falta: `docs/REVIEW.md`.** Este archivo conserva el detalle por módulo tal como se fue construyendo; los «Pendiente» que aparecen abajo ya fueron revisados contra el código (los hechos están marcados).

Verificado desde el inicio: SQL de RLS/capacidad/trial (`supabase/rls_test.sql`); signup → trial 7 días → vencimiento forzado → redirect a /trainer/billing.
Siguen pendientes solo con credenciales reales: PayPal/Wompi en sandbox y producción.
Local: `npx supabase start -x studio,imgproxy,vector,logflare,edge-runtime,mailpit` · `cp .env.example .env.local` · `npm run dev`.
Decisiones: slots = pago único $0.75 (1–10/compra); base $10/mes con 20 incluidos; dinero en centavos enteros.

## Invitaciones y clientes (verificado)
- Token aleatorio de 32 bytes, solo se guarda el hash SHA-256; el enlace se muestra una vez. Un solo uso (claim atómico), caducidad opcional, revocable.
- Alta de alumno: consentimientos obligatorios (no premarcados), cuenta creada con service role (`app_metadata.role=client`), capacidad validada por trigger en DB; si falla, se revierte usuario e invitación.
- Pendiente: envío por correo (adaptador sin proveedor), reutilizar correo existente con varios entrenadores, expiración automática por cron.
- Tests: `npm test` (14 al inicio), `npm run test:int` (11, requiere Supabase local), `supabase/rls_test.sql`.

## Anamnesis, medidas y cálculos (verificado)
- Evaluación en 5 secciones (zod); el cribado de riesgo corre en el servidor: señales de alarma → "valoración profesional" (no se genera plan estándar), sin diagnósticos.
- Medidas guardadas en métrico (conversión kg/lb, cm/in), con método, quién midió y fecha; append-only. Indicadores con fórmula, versión, insumos y procedencia "estimada"; sin datos suficientes → "no disponible" con motivo. Masa muscular/ósea/agua no se estiman.
- Acceso del entrenador solo con relación activa + workspace vigente + consentimientos health_data y share_with_trainer vigentes (RLS `can_access_client`); cada consulta a la ficha se registra en `access_audit`.
- Tests: 27 unitarios, 18 de integración/aislamiento, SQL de RLS.
- Hecho después: pantalla del alumno para retirar consentimientos (`/client/privacy`). Pendiente: borrador de anamnesis (hoy se envía completa), objetivos calóricos (no implementados a propósito), etiquetas en español de objetivos en la ficha del entrenador.

## Biblioteca de ejercicios y planes (verificado)
- Fuente: `data/exercises/*.txt` → `npm run exercises:build` (genera `data/exercises.generated.json`, reproducible) → `npm run exercises:seed` (idempotente). `npm run exercises:check` valida ≥500, duplicados y que el JSON esté al día. Inventario actual: 649 nombres únicos.
- **Limitación honesta:** instrucciones, errores frecuentes y seguridad son borradores genéricos por patrón de movimiento (`review_status=draft`); no hay videos (`media_status=pending`); las relaciones (regresión/progresión/alternativa/variante) y `joint_stress`/`goals` son heurísticas editoriales. Requieren revisión de un profesional antes de uso con alumnos reales. Algunas entradas son variantes de equipamiento del mismo movimiento; conviene una pasada de curación.
- Entrenador: filtros (texto sin acentos, músculo, equipo, nivel, patrón, objetivo, casa, excluir articulaciones), ejercicios propios y enlaces de video con procedencia obligatoria (subida de archivos: pendiente, requiere Storage).
- Planes: versiones inmutables al publicar (trigger), una sola versión borrador a la vez, nueva versión = copia; plantillas se asignan como copia independiente; notas privadas en tabla aparte sin política para el alumno; el alumno solo ve versiones publicadas y solo si el entrenador tiene el espacio vigente; publicar para un alumno con cribado "valoración profesional" exige excepción documentada.
- Hecho después: registro de entrenamientos y motor de progresión. Pendiente: subida de videos, comparar versiones lado a lado.

## Registro de entrenamientos (verificado)
- Flujo: `start_workout` (solo sesiones del plan vigente del propio alumno; una sesión abierta a la vez; reanudar devuelve la misma) → cada serie se guarda al instante (recuperable al recargar/cerrar) → molestias por ejercicio (0–10 + zona) → `finish_workout` (esfuerzo de sesión, dolor, notas; sesiones incompletas se guardan con lo realizado) o `abandon_workout`. Terminado = inmutable (triggers). Las series deben pertenecer a la sesión y al ejercicio prescritos.
- Cada log guarda `version_id`: el historial refleja la versión realmente ejecutada aunque el plan cambie.
- Métricas (src/lib/training/metrics.ts, probadas): volumen = Σ reps×carga de series de trabajo; 1RM Epley solo 1–12 reps; récord = valor estrictamente mayor, sin récord si molestia ≥ 6/10; más volumen no es "mejora" si sube esfuerzo, dolor o molestias; adherencia = sesiones distintas completadas / sesiones del plan por semana (lun–dom, hora de Colombia, UTC-5 fijo).
- Entrenador: ve logs solo con relación activa + espacio vigente + consentimientos vigentes; alertas separadas en "requiere atención profesional" (dolor ≥ 6, molestia ≥ 6) y recordatorios administrativos.
- Hecho después: motor de progresión (`docs/PROGRESSION.md`), aviso al entrenador por molestias ≥ 6/10 (`docs/PRIVACY.md`) y exportación de datos. Pendiente: temporizador sin sonido, edición posterior por el entrenador.

## Facturación, cupos y webhooks → ver `docs/BILLING.md`
Verificado: precios/FX/firmas (unit), liquidación idempotente y concurrente, máquina de estados, RLS y webhooks de punta a punta con la API del proveedor simulada (integración). **No verificado:** pagos reales en sandbox de Wompi/PayPal (sin credenciales); cobro recurrente Wompi no implementado (renovación manual).

## Fotos, privacidad, recordatorios e informes → ver `docs/PRIVACY.md` · Progresión → `docs/PROGRESSION.md` · Facturación → `docs/BILLING.md`
Verificado (en su momento) en una base **recién creada con `supabase db reset`** con las 15 migraciones de entonces (hoy son 24, reaplicadas en orden sobre una base vacía, ver `docs/REVIEW.md`): 112 tests unitarios, 98 de integración (dos corridas seguidas), RLS SQL, lint, build y pruebas manuales en el navegador. Hallazgo corregido en el camino: el embed `plan_versions` de `training_plans` era ambiguo (PGRST201) y dejaba vacía la lista de planes; ahora hay una prueba que lo impide.

Copiloto de IA → `docs/AI.md`
Mensajería y videollamadas → `docs/MESSAGING.md`
PWA y estado de suscripción → `docs/PWA.md`
Seguridad y accesibilidad → `docs/SECURITY.md`
Despliegue → `docs/DEPLOY.md`
E2E (Playwright) → `docs/E2E.md`
CI (GitHub Actions) → `docs/CI.md`
Revisión final y prioridades → `docs/REVIEW.md`
Cuentas, recuperación de contraseña y abuso → `docs/AUTH.md`
Publicar en GitHub → `docs/GITHUB.md` · Licencia → `docs/LICENSE_DECISION.md`
Rendimiento, SEO, accesibilidad y estabilidad (auditoría) → `docs/PERFORMANCE.md`
Marca (Rutinia) → `docs/BRAND.md`
Nutrición (calculadora, planes, medidas caseras, dieta con IA) → `docs/NUTRITION.md`
Videos de ejercicios (prompts con maniquí gris, subida masiva y reproducción) → `docs/video-prompts/GUIA.md`
Revisión profesional de alimentos → `docs/nutricion/REVISION_PROFESIONAL.md` · Correos (SMTP propio) → `docs/EMAIL.md`
