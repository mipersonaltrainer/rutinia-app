# Licencia: decisión pendiente

**Estado**: no hay archivo `LICENSE` y `package.json` declara `"license": "UNLICENSED"` (todos los derechos reservados). Es el valor seguro por omisión: publicar el repositorio *sin* licencia no concede a nadie permiso de uso, copia ni modificación más allá de lo que GitHub permite por sus términos (ver y bifurcar dentro de la plataforma). **No es asesoría legal**; confirma la decisión con un abogado antes de publicar o vender.

## Qué hay que decidir
1. **¿Se publica el código?** Si no, basta con un repositorio privado y nada de esto urge.
2. **Si se publica, ¿bajo qué términos?**

| Opción | Qué permite | Qué implica para este producto |
|---|---|---|
| Todos los derechos reservados (hoy) | Solo leer/bifurcar en GitHub | Nadie puede reutilizarlo; no atrae contribuciones |
| MIT / Apache-2.0 (permisivas) | Usar, modificar y vender, incluso como competidor | Apache-2.0 añade licencia de patentes. Cualquiera podría ofrecer un clon comercial |
| AGPL-3.0 (copyleft de red) | Usar y modificar; quien lo ofrezca como servicio debe publicar sus cambios | Protege contra clones cerrados de un SaaS; desalienta a muchas empresas; no es «software libre sin condiciones» |
| FSL / BSL (código disponible, no competir) | Leer y usar salvo para competir; se convierte en abierta tras un plazo | Protege el negocio; **no es de código abierto** según la OSI |

3. **Contribuciones externas**: si aceptas PRs, decide DCO o CLA para poder relicenciar después.

## Hechos que condicionan la decisión
- **Dependencias** (cierre de producción: 85 paquetes): 56 MIT, 14 ISC, 6 Apache-2.0, 2 0BSD, 2 BSD-3, 1 Unlicense, 1 `(MIT AND Zlib)`, 1 `MIT AND ISC`; todas permisivas. Dos a mirar: `@img/sharp-libvips-*` (**LGPL-3.0-or-later**, el binario de libvips que trae `sharp`; se usa enlazado dinámicamente y sin modificar, el caso habitual y compatible con un servicio alojado) y `caniuse-lite` (**CC-BY-4.0**, datos de compatibilidad de navegadores; atribución solo si se redistribuye). Revisar de nuevo si algún día se distribuye un binario o una imagen de contenedor.
- **Plantilla de diseño**: la landing se reconstruyó «en el mismo lenguaje visual» que la plantilla *Clario* de Framer (autor Kadir Calik; licencia «Limited») **sin copiar sus activos** (CSS/SVG propios; ver `docs/UI_MAP.md`, que además enlaza la vista previa de la plantilla). Parecerse mucho a un diseño comercial puede ser un problema aunque el código sea propio. **Antes de hacer público el repositorio**: confirma con el titular de la licencia de la plantilla qué se permite, o rediseña la landing, y valora quitar la mención y el enlace de `docs/UI_MAP.md`.
- **Datos de ejercicios** (`data/exercises/*.txt`, 649 entradas): redacción editorial propia, en estado `draft` y sin revisión profesional. Decide si el contenido lleva la misma licencia que el código o una distinta (p. ej. CC BY-SA), y no lo presentes como guía clínica.
- **Marca**: «Rutinia» y el ícono (SVG propio de `scripts/make-brand.mjs`) no están registrados ni revisados contra marcas existentes; una licencia de código no concede derechos de marca.
- **Código generado con asistencia de IA**: cada commit lleva el trailer `Co-Authored-By`. La titularidad y registrabilidad del código generado por IA varía según jurisdicción; consúltalo si importa para vender o ceder el software.

## Cuando decidas
Añade `LICENSE` con el texto oficial, cambia `package.json` (`"license": "<SPDX>"`), actualiza el README y borra esta decisión pendiente. `tests/repo-hygiene.test.ts` falla si un `LICENSE` convive con `UNLICENSED` (o al revés), para que no quede inconsistente.
