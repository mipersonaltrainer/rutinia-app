# Integración continua (GitHub Actions)

Archivos: `.github/workflows/ci.yml` (este), `audit.yml`, `codeql.yml` y `.github/dependabot.yml` (ver «Endurecimiento»). Se ejecuta en cada *push* a `main` y en cada *pull request*; cancela ejecuciones antiguas de la misma rama.

| Job | Qué hace | Necesita |
|---|---|---|
| `quality` (≤ 10 min) | `npm ci` → `npm run lint` → `npx tsc --noEmit` → `npm test` (unitarias) → `npm run exercises:check` | solo Node 24 |
| `integration-e2e` (≤ 25 min) | `supabase start` (aplica las 27 migraciones; **con Mailpit**, que las specs de contraseña necesitan) → genera `.env.local` → `exercises:seed` → `foods:seed` → `npm run test:int` → `supabase/rls_test.sql` → Playwright (Chromium) → `npm run test:e2e` (build de producción + 65 specs) | Docker (incluido en `ubuntu-latest`) |

## Seguridad del pipeline
- `permissions: contents: read` y **ningún secreto del repositorio**: las llaves de Supabase son las del stack local efímero (`supabase status`), las de Wompi/PayPal/IA son ficticias o están apagadas, y `CRON_SECRET` se genera por corrida. Por eso es seguro en *pull requests* de forks; no se usa `pull_request_target`.
- `scripts/ci/write-env.mjs` se niega a escribir un `.env.local` si la URL de Supabase no es local, y nunca imprime valores de llaves en sus errores. Acepta los nombres nuevos (`PUBLISHABLE_KEY`/`SECRET_KEY`) y los antiguos (`ANON_KEY`/`SERVICE_ROLE_KEY`) del CLI.
- Si falla, se sube `playwright-report/` y `test-results/` (trazas y capturas, 7 días) como artefacto; Supabase se detiene siempre.

## Verificado localmente
- El YAML se interpreta bien (Ruby `YAML.load_file`), `npm ci --dry-run` confirma que `package-lock.json` está sincronizado, y `tests/ci.test.ts` (13 pruebas) fija la estructura del workflow y el script (orden de pasos, sin `secrets.`, permisos mínimos, límites de tiempo, artefacto en fallo).
- **Las 22 migraciones se reaplican en orden sobre una base vacía** (esquemas base de Supabase + las migraciones, con `ON_ERROR_STOP`): sin errores. Esto importaba: las migraciones 0019–0022 solo se habían aplicado a mano sobre la base de desarrollo.
- Cada comando del pipeline (lint, tipos, unitarias, integración, RLS, E2E) ya se ejecutó con éxito en esta máquina.

## Endurecimiento de la cadena de suministro
- **Acciones fijadas por SHA de commit completo** (con la versión en un comentario), obtenidos de GitHub con `git ls-remote` y comprobando en cada SHA que `action.yml` expone las entradas que usamos: `actions/checkout` v7.0.1, `actions/setup-node` v7.1.0, `actions/cache` v6.1.0, `actions/upload-artifact` v7.0.2, `supabase/setup-cli` v3.0.1, `github/codeql-action` v4.39.0. Una prueba exige que **toda** línea `uses:` tenga SHA de 40 caracteres.
- **Dependabot** (`.github/dependabot.yml`): semanal (lunes 06:00 Bogotá) para `npm` y `github-actions`; los menores/parches de npm llegan agrupados y las versiones mayores siempre solas. Dependabot reescribe el SHA y el comentario de versión; cada PR corre este CI.
- **`audit.yml`**: `npm audit --omit=dev --audit-level=high` **bloquea** (hoy: 0 vulnerabilidades en producción). La auditoría de dependencias de desarrollo solo **informa** (hoy: 5 «high» por `braces` → `eslint-config-next`; la corrección exige una mayor de `eslint-config-next`). Corre en cambios de `package*.json`, en PR y cada lunes (los avisos nuevos aparecen sin tocar el código).
- **`codeql.yml`**: JavaScript/TypeScript con la suite `security-extended`, en push, PR y miércoles; el único permiso de escritura de todo el repositorio es `security-events: write` aquí (una prueba lo verifica).
- `persist-credentials: false` en todos los checkouts; CLI de Supabase en **versión exacta** (2.121.0, verificado que `-x` acepta `studio,mailpit,logflare,vector,edge-runtime` en esa versión).
- Los cuatro archivos se validaron contra los esquemas oficiales de SchemaStore (`github-workflow` y `dependabot-2.0`).

## NO verificado (se sabrá en la primera corrida real)
- **Los workflows nunca se ejecutaron en GitHub** (este repositorio no tiene remoto). No hay `act`.
- Que `supabase status -o json` use los nombres de clave que `scripts/ci/write-env.mjs` espera: el script acepta los dos juegos conocidos, pero la CLI 2.121 es una reescritura y su salida JSON no se ejecutó aquí.
- **Mayores nuevas**: las acciones saltaron a versiones mayores que las que yo conocía (checkout v7, setup-node v7, cache v6, upload-artifact v7, setup-cli v3). Verifiqué que las entradas que usamos existen, pero no sus cambios de comportamiento: el primer fallo inesperado puede venir de ahí.
- `languages: javascript-typescript` y `build-mode: none` de CodeQL siguen la documentación, pero no se ejecutó el análisis. **CodeQL en repositorios privados requiere GitHub Advanced Security**; sin ella el envío de resultados falla (no afecta a `ci.yml`).
- Tiempos reales de cada job; Chromium con `--with-deps` en `ubuntu-latest`.
- Falta (decisiones de plataforma, no de código): proteger la rama `main` exigiendo `quality`, `integration-e2e` y `audit`; activar *secret scanning* y alertas de Dependabot en la configuración del repositorio; revisar quién puede aprobar los PR de Dependabot.

## Ejecutar lo mismo en local
```bash
supabase start && supabase status -o json | node scripts/ci/write-env.mjs > .env.local
npm run exercises:seed && npm run lint && npx tsc --noEmit && npm test && npm run test:int && npm run test:e2e
```

## CodeQL en un repositorio privado
`codeql.yml` ejecuta el análisis (`security-extended`) en cada PR, en `main` y cada miércoles, pero **no sube los resultados a «Code scanning»**: en un repositorio privado eso exige GitHub Advanced Security (de pago) y GitHub rechazaba la subida («Code scanning is not enabled»), lo que dejaba la comprobación en rojo siempre. Ahora el informe SARIF queda como artefacto (`codeql-sarif`, 30 días) en la ejecución y la comprobación sale en verde si el análisis termina.
- **Ver los hallazgos:** abrir la ejecución de CodeQL en GitHub Actions → *Artifacts* → `codeql-sarif` (se abre con la extensión SARIF Viewer de VS Code).
- **Activar Code scanning de verdad:** GitHub → repositorio → *Settings* → *Code security* → *Code scanning* (requiere Advanced Security, o hacer público el repositorio). Después, en `codeql.yml` cambia `upload: never` por `upload: always`, vuelve a darle a `security-events: write` y quita `output` y el paso del artefacto.

