# Política de seguridad

Rutinia maneja datos de salud, fotos de progreso y pagos. Si encuentras una vulnerabilidad, **no abras un issue público**.

## Cómo reportarla
Usa el reporte privado de GitHub: pestaña **Security → Report a vulnerability** de este repositorio (requiere que el titular lo haya activado; ver `docs/GITHUB.md`). Incluye: qué componente, pasos para reproducir, qué datos quedarían expuestos y, si puedes, una prueba mínima. No accedas a datos de personas reales ni los modifiques para demostrar el problema.

> **Pendiente de decidir por el titular**: tiempos de respuesta y un canal alterno (correo) si el reporte privado no está disponible. Hasta entonces no se promete ningún plazo.

## Alcance
Dentro: el código de este repositorio, sus migraciones (RLS, funciones), los endpoints `/api/*`, `/auth/*` y los webhooks de pago. Fuera: servicios de terceros (Supabase, Wompi, PayPal, Anthropic, hosting) — repórtalos al proveedor; ataques de fuerza bruta o denegación de servicio masivos; ingeniería social.

## Lo que ya existe (no es un reporte)
Aislamiento por RLS verificado por pruebas, límites de intentos, CSP con nonce, cabeceras de seguridad; ver `docs/SECURITY.md` y `docs/AUTH.md`. Las brechas conocidas están listadas con honestidad en `docs/REVIEW.md`.
