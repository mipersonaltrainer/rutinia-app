# Publicar en GitHub: preparación y checklist

Estado al 20-oct-2026: el repositorio es **solo local** (rama `main`, 30 commits, sin remoto). Nada de lo que sigue se ejecutó contra GitHub: son comandos y ajustes para hacer tú, en este orden.

## A. Revisión previa (hecha aquí)
| Comprobación | Resultado |
|---|---|
| Archivos sensibles alguna vez versionados (`.env*`, `.pem`, llaves, dumps) | solo `.env.example` (plantilla con marcadores) |
| Secretos en **todo el historial** (`git log --all -p`; 15 patrones: llaves privadas, JWT, `sb_secret_`, `sk-ant-`, `sk-…`, AWS, tokens de GitHub/Slack/Google, llaves reales de Wompi, URLs de base de datos con clave) | **0 coincidencias**; control positivo comprobado. Las credenciales que aparecen en pruebas (`Test-Pass-12345`, `E2e-Local-Pass-12345`…) son contraseñas de **usuarios que se crean en una base local desechable**, no valen para nada fuera de ella |
| Secretos en el árbol actual | 0; ahora lo vigila `tests/repo-hygiene.test.ts` (también archivos nuevos aún sin `git add`), con una prueba de que cada patrón puede coincidir y una comprobación manual de que atrapa una credencial plantada |
| Rutas personales, nombre de la máquina, correos reales en el contenido | ninguno (solo direcciones ficticias `@x.co`, `@local.dev`, `@example.com`) |
| Archivos grandes | el mayor es `data/exercises.generated.json` (1,3 MB, reproducible con `npm run exercises:build`) |
| Tamaño y ramas | sin ramas adicionales, etiquetas ni *stash* |
| `.gitignore` | `.env*` ignorado salvo `.env.example`; resultados de Playwright, `.claude/`, logs y editores ignorados; `.gitattributes` marca los JSON generados |
| Licencias | `UNLICENSED` hasta decidir: ver `docs/LICENSE_DECISION.md` |

**Limitación**: es una búsqueda por patrones, no un escáner con base de reglas ni entropía. Antes de hacerlo público corre además un escáner dedicado sobre el historial (p. ej. `gitleaks detect` o `trufflehog git file://.`) y activa *secret scanning* en GitHub (sección C). Un secreto que *hubiera* estado versionado habría que **rotarlo**, no solo borrarlo.

## B. Decisiones que bloquean la publicación
1. **Identidad de los commits** (hallazgo): 18 commits llevan la identidad por defecto del sistema (tu nombre de usuario y un correo `usuario@<nombre-del-equipo>.local`) y 12 llevan `dev <a@b.c>` (identidad de prueba). Compruébalo con `git log --format='%an <%ae>' | sort | uniq -c`. Publicados así, GitHub no los asocia a tu cuenta y expones el nombre del equipo. Como aún no hay remoto, reescribirlos es seguro (cambia todos los hashes). Con una copia de respaldo:
   ```bash
   git branch backup-antes-de-reescribir
   git config user.name  "TU NOMBRE"
   git config user.email "<ID>+<usuario>@users.noreply.github.com"   # el correo «noreply» de tu perfil de GitHub
   git rebase --root --exec 'git commit --amend --no-edit --reset-author'
   git log --format='%an <%ae>' | sort | uniq -c                      # debe mostrar una sola identidad
   ```
   Después de publicar **no** se debe repetir (reescribir una rama compartida rompe a quien la clonó). Si prefieres conservar el trailer `Co-Authored-By`, no hace falta tocarlo.
2. **Licencia** (`docs/LICENSE_DECISION.md`).
3. **Plantilla Clario**: confirma lo que permite su licencia o rediseña antes de hacerlo público (mismo documento).
4. **Visibilidad**: recomendado **privado primero**: crear, subir, activar los ajustes de la sección C, ver pasar el CI, y solo entonces decidir si se hace público.

## C. Crear el repositorio y ajustes (checklist)
```bash
gh repo create <usuario>/training-os --private --source=. --remote=origin --push   # o créalo en la web y: git remote add origin … && git push -u origin main
```
**Settings → Code security** (varias funciones son gratuitas solo en repositorios públicos; en privados dependen del plan y de GitHub Advanced Security)
- ☐ *Dependency graph*, *Dependabot alerts* y *Dependabot security updates* (`.github/dependabot.yml` ya programa las actualizaciones semanales)
- ☐ **Secret scanning** y **push protection** (bloquea un `git push` con credenciales)
- ☐ **Private vulnerability reporting** (lo que `SECURITY.md` promete)
- ☐ *Code scanning*: el workflow `codeql.yml` ya sube resultados; en privados exige GitHub Advanced Security: si no la tienes, ese job falla y **no** debe ser un check requerido

**Settings → Actions → General**
- ☐ *Actions permissions*: «Allow … and select non-… actions»; permite solo `actions/*`, `github/codeql-action/*` y `supabase/setup-cli` (están fijadas por SHA)
- ☐ *Workflow permissions*: **Read repository contents** (los workflows ya declaran `contents: read`; solo CodeQL pide `security-events: write`)
- ☐ *Fork pull request workflows*: exigir aprobación para colaboradores externos
- ☐ Sin *secrets* de repositorio: el pipeline no los usa. Si algún día los hay, ponlos en un *Environment* con revisores

**Settings → General**
- ☐ Solo *Squash merge* (historial lineal), «Automatically delete head branches», «Always suggest updating pull request branches»
- ☐ Desactiva Wiki, Projects y Discussions si no los vas a usar (menos superficie)

## D. Protección de la rama `main`
Importa `.github/rulesets/main.json` en **Settings → Rules → Rulesets → New ruleset → Import a ruleset** (no se pudo probar aquí; si GitHub lo rechaza, crea el mismo conjunto a mano con esta lista):
- ☐ Exigir *pull request* (sin *push* directo); resolver todas las conversaciones; descartar aprobaciones antiguas al subir cambios
- ☐ **Checks requeridos** (nombres exactos de los jobs; una prueba de `tests/ci.test.ts` vigila que no se desfasen): `Lint, types and unit tests` · `Integration, RLS and E2E (local Supabase)` · `npm audit` · `Analyze (javascript-typescript)`; con «la rama debe estar al día»
- ☐ Bloquear eliminación y *force-push*; historial lineal
- ☐ Sin actores con permiso de saltarse la regla (incluye a los administradores)
- **Aprobaciones**: el ruleset pide **0** porque una sola persona no puede aprobar su propio PR. Con un segundo revisor súbelo a 1, activa «Require review from Code Owners» y añade `.github/CODEOWNERS` (plantilla abajo).
- Si CodeQL no está disponible (repositorio privado sin GHAS) **quita** `Analyze (javascript-typescript)` de la lista, o ningún PR podrá integrarse.
- ☐ *Tags*: protege `v*` si vas a publicar versiones.

Plantilla de `.github/CODEOWNERS` (necesita usuarios reales; no se incluye para no inventarlos):
```
*                              @<usuario>
/supabase/migrations/          @<usuario>   # RLS, funciones y datos de salud
/src/lib/billing/              @<usuario>   # dinero
/.github/                      @<usuario>   # el propio pipeline
```

## E. Primer push: qué esperar
Los workflows **nunca se han ejecutado en GitHub**. `docs/CI.md` lista lo que no se pudo comprobar (flags del CLI de Supabase en el runner, claves de `supabase status -o json`, tiempos, instalación de Chromium, comportamiento de las versiones mayores nuevas de las acciones). Trata la primera corrida como una prueba y arregla lo que falle antes de activar los checks requeridos (si no, el ruleset bloqueará todo).

## F. Si se hace público
Revisa de nuevo `docs/REVIEW.md` (las brechas conocidas quedan a la vista de todos, con su prioridad), quita lo que no quieras exponer, confirma la decisión de licencia y la de la plantilla, y rota cualquier credencial que haya tocado un equipo ajeno.

## G. Cómo se trabaja desde la publicación (30-oct-2026)
- Este repositorio es público y **empezó con un solo commit**: el historial anterior vive en un repositorio privado de archivo, que no debe volver a hacerse público (su historial contiene correos personales que no se quieren exponer).
- **`main` está protegida** (protección clásica de rama, no ruleset): hay que pasar por un PR, deben pasar los tres chequeos (`Lint, types and unit tests`, `Integration, RLS and E2E (local Supabase)` y `Analyze (javascript-typescript)`), se piden 0 aprobaciones (una sola persona no puede aprobar su propio PR), no se permite el empuje forzado ni borrar `main`, y la regla vale también para los administradores. Un empuje directo a `main` es rechazado por GitHub.
- La detección de secretos y la protección de empuje con claves están activadas.
- Flujo: rama nueva → PR → esperar los tres chequeos en verde → *Squash and merge* → Vercel despliega `main`. Las **migraciones de base de datos no se aplican solas**: se aplican a mano con `supabase db push --linked` después del merge, y se verifica el resultado.
- Configuración de GitHub de la persona titular: «Keep my email addresses private» y «Block command line pushes that expose my email» activados, para que los merges desde la web no firmen con un correo personal.
- **Cómo fusionar PR mientras se confirma la privacidad del correo:** usa **Rebase and merge**: conserva la firma de los commits de la rama (que ya usan la dirección privada), así que no depende de ningún ajuste de la cuenta. Tras cualquier merge, comprueba con `gh api repos/<dueño>/<repo>/commits/main --jq '.commit.author.email'` que sale `…@users.noreply.github.com`.
