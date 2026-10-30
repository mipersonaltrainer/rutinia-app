## Qué cambia y por qué

## Cómo se probó
- [ ] `npm run lint && npx tsc --noEmit`
- [ ] `npm test` · `npm run test:int` (si toca la base de datos, RLS o pagos) · `npm run test:e2e` (si toca flujos de usuario)
- [ ] Probado en el navegador (describe qué pantalla y qué caso)

## Riesgos (marca los que apliquen)
- [ ] **Migración nueva**: se reaplica sobre una base vacía; no edité una migración ya aplicada; `supabase/rls_test.sql` pasa
- [ ] **Datos personales o de salud**: qué dato, quién lo ve, consentimiento que lo ampara, qué sale del sistema (correos, IA, logs)
- [ ] **Dinero**: enteros en centavos, idempotencia de webhooks, nada se activa por un redirect del navegador
- [ ] **Seguridad**: entrada no confiable validada en el servidor; sin secretos en código, logs ni mensajes de error
- [ ] **Constantes duplicadas SQL/TS** (umbral de atención, hosts de videollamada, límites): cambié ambos lados y su prueba de paridad
- [ ] **Variables de entorno nuevas**: `.env.example`, `src/lib/env.ts` y `docs/DEPLOY.md`
- [ ] Documentación actualizada (`docs/`), y si algo **no** se pudo verificar, dice por qué
