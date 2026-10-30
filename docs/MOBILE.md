# Celular y pantallas táctiles

La plataforma se usa sobre todo desde el celular. Estas son las reglas y cómo se vigilan.

## Estructura
- **Barra superior + cajón** (`src/components/shell/AppBar.tsx`, `MobileMenu.tsx`) en los tres paneles (entrenador, alumno y equipo de soporte) por debajo de `md` (768 px). Desde `md` cada área conserva su barra lateral o su cabecera. El cajón lo cierra una navegación, Escape o tocar fuera; bloquea el scroll de atrás; la campana de notificaciones sale en la barra con su contador.
- **Sección activa:** `NavLink` marca `aria-current="page"` y se resalta en todos los menús.
- **Zonas seguras del iPhone** (`viewport-fit=cover` + `black-translucent`): la barra superior, el cajón y el pie de las pantallas usan `env(safe-area-inset-*)`, así que nada queda bajo el notch ni la barra de inicio en la app instalada.
- **Altura real de pantalla:** `min-h-dvh` (no `100vh`, que en iOS se desajusta con la barra del navegador).

## Reglas táctiles (`globals.css`, bajo `pointer: coarse` o ≤ 767 px)
- Campos, selects y textareas a **16 px**: por debajo, iOS Safari hace zoom al enfocarlos y no vuelve.
- Botones, enlaces de navegación y píldoras de **44 px** de alto mínimo; casillas y radios con una etiqueta de 44 px y control de 22 px.
- `touch-action: manipulation` (sin el retraso de 300 ms del doble toque) y sin resaltado gris al tocar.

## Rendimiento
- Medido con CPU 4× más lenta y 4G lento: las pantallas públicas pintan en 0,8–1,3 s (LCP), CLS 0, sin tareas largas relevantes; el JS de la primera carga está bajo presupuesto (≤ 170 KB).
- Servidor: `requireUser` / `requireStaff` / `trainerAccess` comparten **una** consulta por petición (`cache` de React: layout y página ya no verifican la sesión dos veces) y los layouts lanzan sus lecturas en **paralelo** (antes eran 3–5 viajes a la base seguidos en cada navegación).
- Fondo de las pantallas de acceso más liviano en celular (menos desenfoque, un destello menos, sin animar las capas grandes) y la tarjeta de cristal solo desde `md`.

## Bloqueos que se quitaron
- **Límites por dirección IP demasiado bajos para redes móviles** (varias personas comparten la misma IP en una operadora o en un gimnasio): registro 5 → 30 por hora, recuperar contraseña 8 → 30, ingreso 60 → 200 cada 15 min. Los límites estrictos siguen **por correo** y **por cuenta+IP**, que son los que frenan el abuso.
- **Registro o recuperación enviados muy rápido** (autofill + un toque) o con la página abierta horas (se fue al correo y volvió): antes se respondía en silencio «revisa tu correo» sin enviar nada; ahora se pide reintentar con un mensaje claro. El campo oculto y los tokens falsos siguen con la respuesta neutra para scripts.
- Enlace de confirmación abierto en otro navegador: aviso claro de que el correo ya está confirmado.

## Cómo se vigila
`e2e/mobile.spec.ts` recorre **todas las pantallas** (públicas, entrenador, alumno y equipo) en un perfil de celular con pantalla táctil y falla si hay desborde horizontal, controles de menos de 40 px o campos de menos de 16 px; también prueba el menú. Con `MOBILE_AUDIT_OUT=archivo.jsonl` guarda un reporte completo. Línea base antes de esta versión: 453 hallazgos; ahora 0.

## Límites / no verificado
- Probado en Chromium con perfil móvil, **no** en un iPhone ni en un Android reales (el comportamiento exacto de la barra del navegador, el teclado y las zonas seguras debe confirmarse en dispositivo).
- Push en iOS exige instalar la app en la pantalla de inicio (iOS 16.4+).
- Los datos medidos son locales: en producción pesa la latencia real hacia Supabase, que es lo que las consultas en paralelo reducen.
