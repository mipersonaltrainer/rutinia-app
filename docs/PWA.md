# PWA y estado de la suscripción

## PWA (instalable)
- `src/app/manifest.ts` (standalone, `start_url=/login`, iconos 192/512/maskable), iconos generados por `scripts/make-brand.mjs` a partir del logotipo entregado (`docs/BRAND.md`), metadatos Apple y `themeColor`.
- `public/sw.js` es **deliberadamente mínimo**: solo hace instalable la app y muestra `/offline` cuando falla una navegación. **No cachea páginas, respuestas ni fotos**: los datos de salud no deben quedar en una caché del dispositivo que sobreviva a la sesión. Solo se guarda el shell estático (`/offline` + 2 iconos). Una prueba lo verifica (no hay `cache.put` en tiempo de ejecución y la lista del shell no contiene rutas privadas).
- Se registra solo en producción (`PwaRegister`); `/sw.js` se sirve con `no-cache` para que un arreglo llegue de inmediato.
- `InstallPrompt`: usa `beforeinstallprompt` donde existe (Chromium); en iOS muestra las instrucciones manuales (no hay API de instalación). Se puede descartar (localStorage, opcional).

### Verificado / no verificado
- Verificado en Chrome real (build de producción): registro del worker, caché con exactamente 3 entradas, y al apagar el servidor la navegación a `/trainer/clients` muestra «Sin conexión».
- No verificado: instalación real en Android/iOS, el evento `beforeinstallprompt`, Lighthouse. El panel de navegador integrado de la app no soporta service workers.
- Limitación: sin modo offline funcional (por diseño), sin notificaciones push, sin sincronización en segundo plano.

## Estado de la suscripción
- `src/lib/billing/access-status.ts` (`describeAccess`) es la única fuente del texto/tono del banner y de la tarjeta «Tu plan». Es pura (la hora se inyecta) y tiene 14 casos de prueba.
- Una prueba de integración recorre 42 combinaciones estado × fechas y exige que `describeAccess(...).allowed` coincida con `trainer_has_access` de la base de datos: la UI no puede prometer acceso que la base niega.
- Estados: prueba (info; advertencia ≤2 días; «termina en N horas» el último día; CTA desde 3 días), activa (silenciosa), pago vencido con acceso hasta fin de periodo (rojo), cancelada (acceso hasta el fin), bloqueada (prueba terminada, pago requerido, suspendida, expirada: «tus datos están intactos»).
- La barra de progreso de la prueba está en Facturación; allí el banner se oculta para no duplicar.
