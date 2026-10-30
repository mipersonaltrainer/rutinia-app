# Rendimiento, SEO técnico, accesibilidad y estabilidad — auditoría y resultados

Auditoría del 20-oct-2026 sobre el build de producción servido en local (Next 16, Chrome estable de escritorio, Lighthouse 13.5.0, `scripts/audit/probe.ts`). **Son mediciones de laboratorio en una sola máquina, con Supabase local: ordenan problemas y detectan regresiones; no demuestran Core Web Vitals de usuarios reales** (no hay tráfico ni datos de campo). INP no se puede medir en laboratorio: Lighthouse usa TBT como sustituto.

## 1. Diagnóstico (Fase A)
| # | Hallazgo | Gravedad | Evidencia |
|---|---|---|---|
| 1 | **El titular de la portada esperaba a la hidratación**: el hero estaba envuelto en `Reveal` (opacidad 0 hasta que un script marcaba la clase) | Importante | LCP móvil simulado 2,67 s (> 2,5 s); «element render delay» 1,1 s de 1,2 s |
| 2 | **SEO técnico casi ausente**: sin `robots.txt`, `sitemap.xml`, canónicas, `metadataBase`, Open Graph con imagen, Twitter Card, datos estructurados, `noindex` en áreas privadas ni en las URLs con token de invitación; 404 genérico en inglés | Importante | `/robots.txt` y `/sitemap.xml` → 404; un solo `description` global |
| 3 | **Un fallo de red en cualquier formulario destruía la página**: Next mostraba «This page couldn't load» y se perdía lo escrito | Importante | sonda sin conexión sobre `/login` |
| 4 | **JavaScript innecesario en la primera carga**: la librería de gráficas (≈104 KB gz) se descargaba aunque no hubiera datos que dibujar; el cliente de Supabase/Realtime (≈62 KB gz) bloqueaba el arranque de todas las pantallas; `zod` (≈28 KB gz) viajaba al navegador solo por una constante | Importante | fichas 314 KB, progreso/medidas 310 KB, login 167 KB |
| 5 | **Cookie de sesión legible por JavaScript y sin `Secure`**: un XSS habría podido robar el token de refresco | Importante (seguridad) | `httpOnly: false` por defecto de `@supabase/ssr` |
| 6 | Accesibilidad: contraste 3,94:1 en el mock de la portada; `<main>` anidado en el inicio del alumno; 404 sin landmarks | Moderado | axe: 1 serio + 5 moderados |
| 7 | Íconos y favicon con `max-age=0`; páginas públicas con `no-store` (bloquea bfcache) | Menor | cabeceras |
| 8 | Activos de plantilla sin uso en `public/` (5 SVG de Next) | Menor | — |

Sin hallazgos críticos nuevos: la autenticación, RLS, CSP, límites y copias ya estaban cubiertos (`docs/SECURITY.md`, `docs/AUTH.md`).

## 2. Cambios (Fase C)
**Rendimiento**
- Hero con entrada **solo CSS** (`Rise`): no depende de JavaScript ni de la hidratación. El resto de la portada usa un único `RevealObserver` en vez de ≈60 componentes cliente con su propio observador.
- Gráficas cargadas **bajo demanda** (`next/dynamic`) y **solo si hay ≥ 2 datos**; el cliente de Realtime se importa **después de que la página queda inactiva** y recibe el token del servidor; `zod` fuera del bundle del navegador.
- Cabeceras de caché: íconos, favicon e imagen social 1 día + 1 semana *stale-while-revalidate*; `robots.txt`/`sitemap.xml` 1 h; portada y páginas legales/registro con `private, no-cache` (restaurables con «atrás», bfcache; nunca en cachés compartidas).
- Se **probó y se descartó** `loading.tsx` por segmento: en carga completa **empeoró** el LCP de las pantallas con datos de ≈120 ms a ≈440 ms (A/B medido). En su lugar, `NavLink` muestra un indicador solo si la navegación tarda más de ~120 ms (`useLinkStatus`).
**SEO**: `robots.ts`, `sitemap.ts` (solo páginas públicas, sin fechas inventadas, leídos en tiempo de ejecución), `metadataBase`, canónicas, títulos/descripciones únicos, Open Graph + Twitter Card con imagen propia 1200×630 (`public/og.png`), JSON-LD `SoftwareApplication` con el precio de las mismas constantes que muestra la página (sin valoraciones ni reseñas, que no existen), `noindex` en áreas privadas, acceso, recuperación e invitaciones, 404 real en español.
**Estabilidad/UX**: `guardAction` convierte *solo* los fallos de conexión en el error del propio formulario (se conserva lo escrito; las redirecciones y errores de Next pasan intactos); `error.tsx` y `global-error.tsx` en español, sin detalles técnicos; marcador `Cerrar sesión` sin red cae en esa pantalla con «Reintentar».
**Seguridad de sesión**: cookies `httpOnly`, `SameSite=Lax` y `Secure` en HTTPS; el navegador ya no lee la sesión: el servidor entrega un token de acceso de vida corta a Realtime (el token de refresco no sale del servidor).
**Accesibilidad**: contraste, un solo `<main>`, WCAG 2.2 AA verificado con axe en **todas** las pantallas públicas, del entrenador y del alumno.

## 3. Mediciones antes / después (Lighthouse, móvil simulado: CPU ×4, 1,6 Mbps / 150 ms)
| Página | Rendimiento | Accesib. | LCP | TBT | JS en la primera carga* |
|---|---|---|---|---|---|
| Portada | 97 → **98** | 96 → **100** | 2 674 → **2 493 ms** | 54 → **13 ms** | 141 → 146 KB† |
| Registro | 97 → **98** | 100 | 2 506 → **2 342 ms** | 20 → 15 ms | 166 → 145 KB |
| Privacidad | 99 → 99 | 100 | 2 079 → 2 122 ms (ruido) | 14 → 24 ms | 137 → 141 KB† |
Escritorio: 100 en rendimiento, accesibilidad, buenas prácticas y SEO antes y después (LCP 592 → 526 ms en la portada). Buenas prácticas y SEO: 100 en todas las corridas.
*KB transferidos (gz) antes del evento `load`, sonda con 390 px sin limitación. †Sube ≈5 KB por los metadatos, `NavLink` y el observador único; el LCP real baja porque el titular ya no espera.

Sonda sin limitación (LCP observado): portada **1 084 → 212 ms**. Pantallas con datos (JS al cargar): ficha del alumno **314 → 149 KB**, progreso **310 → 145 KB**, medidas **310 → 148 KB**; el cliente de Realtime (≈62 KB) se descarga después, en reposo.
**Lectura honesta**: el LCP móvil *simulado* queda en 2,3–2,5 s aunque el *observado* es ≈170 ms; Lighthouse lo estima con un modelo pesimista que incluye todo el JavaScript de la página, y de él **≈108 KB son React y el runtime de Next** (no reducibles sin cambiar de framework). La portada queda justo en el umbral de 2,5 s: no se afirma que lo cumpla con holgura ni con usuarios reales.

## 4. Pruebas añadidas (se ejecutan en `npm test` y `npm run test:e2e`)
- Unitarias (`tests/seo.test.ts`, 15): origen del sitio, sitemap/robots, datos estructurados (precio de las constantes, sin reseñas, no puede cerrar el `<script>`), cookies, reconocimiento de fallos de red.
- E2E (`e2e/quality.spec.ts`, 20): SEO (robots, sitemap con URLs reales, título/descripción/canónica únicos y un `h1`, OG con imagen 1200×630 accesible, JSON-LD que coincide con la página, `noindex`, 404 real); red (acceso, recuperación y guardado de series sin conexión conservan lo escrito; pantalla de error con «Reintentar»); **axe WCAG 2.2 AA con cero violaciones en 27 pantallas**; teclado («saltar al contenido», foco visible); cookies `httpOnly` y token de refresco ausente de la página; Realtime se conecta tras la carga; hero visible sin JavaScript (se comprobó que **falla** si se restaura el comportamiento anterior); contenido legible sin JavaScript; presupuesto de JS por ruta; gráficas no descargadas sin datos; cachés; bfcache; consola limpia.
- La sonda `scripts/audit/probe.ts` repite la medición página por página (`node --env-file=.env.local --experimental-strip-types scripts/audit/probe.ts http://localhost:3060 [--throttle]`).

## 5. Pendiente y no verificado
- **No se midió con usuarios reales** (sin Search Console/CrUX, sin tráfico). No hay INP de campo.
- **No se hicieron pruebas de carga** ni se midió con volumen realista: 26 consultas de páginas siguen sin `limit` explícito ni paginación (ver `docs/REVIEW.md` P1-15).
- La portada y el resto son **dinámicos** por la CSP con nonce por petición (decisión de seguridad, `docs/SECURITY.md`): no hay CDN que sirva HTML estático; el TTFB local es 20–100 ms, en producción dependerá de la región del servidor y de Supabase. `private, no-cache` mantiene la portada fuera de cachés compartidas.
- El token de acceso (≈1 h) va en el HTML de las pantallas privadas para Realtime: un XSS aún podría leerlo durante esa hora, pero ya no el de refresco. La CSP estricta es la defensa principal.
- WCAG 2.2: axe solo cubre una parte de los criterios. Revisión manual: 3.3.8 (autenticación accesible) se cumple por diseño (sin CAPTCHA, `autocomplete` correcto, sin bloquear el pegado); **no se verificaron manualmente** 2.4.11 (foco no oculto), 2.5.7 (arrastre), 2.5.8 más allá de lo que detecta axe, 3.2.6 ni 3.3.7, ni con lector de pantalla.
- La acción «Crear como borrador» del copiloto y los botones de formulario simples (cerrar sesión, consentimientos, borrar foto) sin conexión caen en la pantalla de error (con «Reintentar»), no en un aviso en línea.
- `sitemap.xml` y `robots.txt` leen `APPLICATION_BASE_URL` en cada petición: sin ella en producción apuntarían a `localhost` (el chequeo de arranque ya lo rechaza).
- Search Console: tras desplegar, verifica el dominio, envía `/sitemap.xml` y revisa «Páginas» (que `/login` y `/reset-password` figuren como «excluidas por noindex»). Un `noindex` solo se respeta si la URL no está bloqueada en robots.txt: por eso esas rutas **no** están en `Disallow`.
- Posicionamiento: nada de lo anterior lo garantiza; solo elimina bloqueos técnicos bajo nuestro control.
