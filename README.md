# Rutinia

SaaS en español para entrenadores personales y sus alumnos (Colombia): evaluación inicial y medidas, biblioteca de 600+ ejercicios, constructor de planes con versiones, registro de entrenamientos, motor de progresión con aprobación del entrenador, fotos privadas, informes PDF, mensajería y videollamadas, copiloto de IA opcional, y facturación (USD 10/mes con 20 alumnos, cupos prepagados) por PayPal y Wompi.

Next 16 · React 19 · Tailwind 4 · Supabase (Postgres + RLS + Storage + Realtime) · Vitest.

## Estado y licencia
Proyecto en preparación, **sin licencia definida** (todos los derechos reservados; ver `docs/LICENSE_DECISION.md`). Estado, brechas y prioridades: `docs/REVIEW.md`. Para publicarlo: `docs/GITHUB.md`. Seguridad: `SECURITY.md`.

## Desarrollo local
Requisitos: Node 20+, Docker, [Supabase CLI](https://supabase.com/docs/guides/cli).
```bash
supabase start                      # base local (aplica supabase/migrations)
cp .env.example .env.local          # y pega las claves que imprime `supabase status`
npm install && npm run dev
```
Datos de demostración (solo base local): `DEMO_PASSWORD=… node --env-file=.env.local scripts/dev/seed-demo.mjs`.

## Pruebas
```bash
npm test            # unitarias
npm run test:int    # integración contra el Supabase local (RLS, pagos, mensajería…)
npm run test:e2e    # Playwright contra un build de producción local (ver docs/E2E.md)
npm run lint && npx tsc --noEmit && npm run build
```

## Documentación (`docs/`)
`PHASE1` (índice) · `BILLING` · `PROGRESSION` · `PRIVACY` · `AI` · `MESSAGING` · `PWA` · `SECURITY` · `E2E` · `CI` · `GITHUB` · `PERFORMANCE` · `AUTH` · **`REVIEW`** (estado y prioridades) · **`DEPLOY`** (variables, cron, Supabase remoto, checklist).
