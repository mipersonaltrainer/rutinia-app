# UI_MAP — Landing pública (referencia: plantilla Clario de Framer)

Medido en la vista previa en vivo (`clario.framer.website`, viewport 1440 px). **No se copian activos de la plantilla** (imágenes, logo, fotos, textos): se reconstruye el lenguaje visual con CSS/SVG propios. Licencia de la plantilla: "Limited".

## Tokens
| Token | Valor medido |
|---|---|
| Fondo página | `#050505` |
| Superficie (cards, footer, FAQ) | `#0D0D0D` |
| Superficie 2 (botón secundario) | `#171717` |
| Línea / borde sutil | `#2F2F2F` |
| Acento | `#8CFF2E` (sombra del botón `0 8px 20px rgba(132,255,31,.32)`) |
| Aviso / "negativo" | `#FF541C` |
| Texto | `#FFFFFF`; secundario `rgba(255,255,255,.65)` |
| Fuente | Manrope (pesos 400/500/600) |

## Escala tipográfica (px, line-height, letter-spacing)
H1 64/64/−2.56 (−0.04em) · H2 48/57.6/−1.92 · H3 34/44.2/−1.36 · H4 24/28.8/−0.48 · FAQ 20/26/−0.4 (600) · nav 16/22.4/−0.32 (500) · cuerpo 16/24 · hero sub 18/27 · botón 15/21 (600). Encabezados peso 500.

## Geometría
Contenedor de contenido 1000 px (nav ≈1108 px). Cards 30 px de radio (20 px en FAQ y precios), padding `10 10 30` con tile interior oscuro; botones pill 45 px de alto, `12×20`, radio 23; badge de paso: radio 10, `5×10`, sombras inset verdes. Footer `#0D0D0D`, padding `80 40 40`.

## Secciones (orden)
Nav fija (logo · enlaces centrados · botón secundario + primario) → Hero (badge, H1, subtítulo, CTA, mockup de dashboard con brillo verde) → Cómo funciona (3 cards con paso) → Funciones (bento 2+3) → Rejilla de 6 funciones + enlace → Comparativa (otros vs producto) → Carrusel (testimonios en Clario) → Precios → Preguntas (acordeón numerado) → Blog (no se replica) → CTA con imagen → Footer.

## Diferencias deliberadas (contenido honesto)
- Sin testimonios, cifras de usuarios ni logos de clientes: el producto no tiene aún; el carrusel muestra **principios de producto verificables**.
- Sin blog ni alternancia mensual/anual: no existen en el producto.
- Precios reales del producto: USD 10/mes (20 alumnos) + cupos de USD 0.75, pago único.
- Mockups son **ilustraciones** (marcadas como tales) con datos de ejemplo.

## Auditoría de fidelidad (comparación visual lado a lado, 1440 px y 390 px)
| Aspecto | Resultado |
|---|---|
| Paleta, superficies, acento, sombras del botón | Igual (valores medidos) |
| Tipografía (Manrope, escala H1–H4, pesos, tracking) | Igual (valores medidos) |
| Nav: ancho 1108, 3 enlaces centrados, 2 botones pill | Igual; añade menú móvil con `aria-expanded` |
| Hero: badge, H1 centrado, subtítulo, CTA, brillo verde y línea sobre el mockup | Equivalente; el H1 es más largo (3 líneas en móvil, 2 en escritorio ≥900 px) |
| Cómo funciona / bento / rejilla de 6 / comparativa / FAQ numerado / precios / CTA / footer | Misma composición, radios (30/20), paddings y ritmo (~110 px entre secciones) |
| Carrusel de testimonios | Reemplazado por principios del producto (no hay testimonios reales); mismo mecanismo (2 filas en sentidos opuestos, pausa al pasar el cursor, desactivado con `prefers-reduced-motion`) |
| Ilustraciones | Rehechas en CSS/SVG propios (no se usan imágenes de la plantilla) |
| Blog, selector mensual/anual, logos de clientes, video | No replicados (no existen en el producto) |
| Altura total de la página | ~8.7k px vs ~10.6k px de la referencia (sin blog) |
Limitación: no se hizo comparación automática de píxeles (sin herramienta de diff); la verificación fue visual con capturas y medición de estilos computados.

## Comportamiento y accesibilidad
Enlaces de ancla suaves con `scroll-padding`, "saltar al contenido", foco visible, acordeón con `<details name>` (nativo, teclado), revelado al hacer scroll que **no oculta contenido si JS/animaciones están desactivadas** (`@media (scripting: enabled)` + `prefers-reduced-motion`), mockups con `role="img"` y descripción.

## Inicio del alumno (`/client`)
Panel motivador, todo calculado con datos del propio alumno (sin guardar nada nuevo): entrenamiento de hoy con botón para empezarlo o continuarlo, semana (L–D) con avance de sesiones, racha de semanas seguidas, retos de la semana, progreso (carga, marcas personales de 30 días, peso), logros y accesos rápidos (mensajes, nutrición, avisos). Sin plan publicado muestra pasos para empezar. Reglas puras en `src/lib/dashboard/client-home.ts` (`tests/client-home.test.ts`), lectura en `client-home-data.ts`, pantallas en `src/components/client-home/` y recorrido en `e2e/client-home.spec.ts`. El tono nunca culpa por días perdidos y el peso se muestra como cifra, sin juicio.
