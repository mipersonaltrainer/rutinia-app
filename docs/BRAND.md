# Marca: Rutinia

- **Nombre**: Rutinia · **Eslogan**: «Evolución en cada repetición» (`SITE_NAME` y `SITE_TAGLINE` en `src/lib/site.ts`; lo usan los metadatos, Open Graph, el manifest, el hero y el pie de la portada).
- **Fuente única del logotipo**: `brand/rutinia-logo-source.jpg` (la imagen entregada por el titular, 2000×1116, fondo negro). Todo lo demás se **genera** con `node scripts/make-brand.mjs`:
  - `public/brand/rutinia-logo.png`: marca de palabra con fondo transparente (para el tema oscuro). El fondo negro se convierte en transparencia usando el canal más brillante como alfa; sobre `#050505` es indistinguible del original.
  - `public/brand/rutinia-mark.png`: la «R» con el visto (se aísla por componentes conectados: la R, el visto y la pata de la R son tres formas; la «u» vecina se descarta).
  - `public/icons/*` y `src/app/favicon.ico`: íconos de la app (192/512/«maskable»/Apple touch y favicon 16-32-48) sobre fondo sólido.
  - `public/og.png`: vista previa social 1200×630 con el eslogan.
- **Limitación**: la fuente es un JPEG, no hay vectorial. El logotipo se sirve en PNG (800 px de ancho, para pantallas 2×); si se necesita impresión o tamaños grandes hay que pedir el SVG/AI original.
- **Color**: el verde del visto (≈ `#00FF73`) no es el verde lima de la interfaz (`--accent: #8CFF2E`). Se dejó la paleta de la app sin cambios; unificarla es una decisión de diseño pendiente (afecta contrastes y capturas de las pruebas).
- **Pendiente legal**: no se verificó que «Rutinia» esté libre como marca ni como dominio/usuario de redes (en Colombia, consulta de marcas en la SIC). Los dominios que aparecen en documentos y pruebas (`app.rutinia.co`) son **ejemplos**, no están registrados por nosotros.
- **Identificadores internos que NO cambian** (cambiarlos rompería el entorno local, CI o datos): `project_id = "training-os"` de Supabase (nombres de los contenedores locales), el directorio del proyecto en esta máquina.
