# Fotos privadas, recordatorios, exportación/eliminación e informes (estado real)

## Fotos de progreso
- Bucket **privado** `progress-photos` (sin URL pública), JPG/PNG/WebP, 6 MB por objeto. Ruta `<client_id>/<uuid>.webp`.
- **Políticas de Storage (RLS):** el alumno sube/borra solo en su carpeta y solo con el consentimiento `photos`; el entrenador solo lee mientras haya relación activa, espacio vigente y el alumno mantenga **`photos` + `share_with_trainer`**. Retirar un consentimiento corta el acceso del entrenador al instante; el alumno siempre conserva el suyo.
- **Procesamiento en servidor:** se detecta el formato por los primeros bytes (no por nombre/MIME declarado), se rechaza lo que no sea una imagen decodificable, se corrige la orientación, se limita a 1600 px y se re-codifica a WebP **eliminando todos los metadatos (EXIF/GPS)**. Máximo 8 MB de entrada y 10 fotos por día.
- **Lectura:** URLs firmadas de 90–120 s generadas en el servidor tras comprobar acceso. Cada vez que un entrenador abre las fotos se registra en `access_audit`.
- Comparación visual opcional (A/B), sin juicios estéticos automáticos; no se usan para publicidad ni para entrenar modelos (no hay ningún pipeline que las toque).
- El entrenador define la frecuencia por alumno (2/4/6 semanas, mensual o 7–120 días) y puede marcar fotos como revisadas con comentario visible para el alumno.

## Consentimientos
Pantalla `/client/privacy`: ver, activar y retirar cada consentimiento (datos de salud, compartir con entrenador, fotos, comunicaciones, analítica anonimizada). `personal_data` no se retira individualmente (equivale a eliminar la cuenta). Nada viene premarcado.

## Recordatorios
- Notificaciones **dentro de la app** (campana con contador). Función `generate_reminders()` (idempotente por `dedupe_key`), ejecutada por `GET /api/cron/expire` junto al vencimiento de suscripciones.
- Foto pendiente → al alumno **solo si activó `communications`** (y `photos`); foto sin revisar → al entrenador; prueba por terminar (≤ 2 días) → al entrenador.
- **No hay envío por correo/push**: falta un proveedor; la estructura (tabla `notifications`) está lista.

## Exportación
`GET /api/export` (sesión requerida): JSON con todo lo del usuario. Alumno: perfil, consentimientos, evaluaciones, medidas, indicadores, entrenamientos con series y molestias, metadatos de fotos con **enlaces temporales de 10 min**, recordatorios, informes. Entrenador: cuenta, suscripción, pagos, planes con versiones, ejercicios propios, invitaciones y propuestas (los datos de salud de sus alumnos **no** se incluyen: pertenecen a ellos). Se registra en `access_audit`.

## Eliminación
- **Alumno** (`/client/privacy`): pide contraseña + escribir `ELIMINAR`. `erase_client()` borra evaluación, medidas, resultados, entrenamientos (aunque sean inmutables, mediante un bypass solo disponible dentro de la función de borrado), planes asignados, propuestas, fotos (archivos y filas), consentimientos, recordatorios y relaciones; luego se elimina el usuario de autenticación. Queda solo un registro **sin identificador** (hash SHA-256 del id, rol y fecha) en `erasure_log`. Si falla el borrado de archivos tras borrar la base, las rutas huérfanas quedan registradas para limpieza.
- **Entrenador** (`/trainer/account`): cierre de cuenta. Cancela PayPal (si aplica), archiva alumnos y planes, elimina propuestas/invitaciones/notificaciones, anonimiza el perfil, bloquea el acceso (email invalidado + baneo) y **conserva pagos y auditoría de facturación** por obligación contable. Sus alumnos ven "espacio no disponible".

## Informe PDF
`POST /api/reports/progress` (mismo origen). Datos reales del periodo: objetivos iniciales, sesiones, adherencia semanal, medidas (primera/última/cambio), gráfico de peso, indicadores estimados con fórmula, rendimiento por ejercicio, versiones del plan y observaciones/objetivos del entrenador. Lo que falta se dice como faltante. Solo ve lo que su RLS permite (el entrenador necesita consentimientos vigentes). Cada generación queda en `progress_reports`.

## Limitaciones y pendientes
- Sin correo/push; el cron debe programarse (Vercel Cron u otro).
- Sin análisis antivirus ni difuminado de rostros; una persona autorizada podría hacer capturas de pantalla (no se puede evitar técnicamente).
- Las **copias de seguridad** del proveedor no se borran al eliminar (política de retención/backups por definir).
- **Políticas de retención configurables** y plazos legales: no implementados; los textos legales siguen siendo borradores para revisión de un abogado. Cumplimiento de la Ley 1581 (acceso, rectificación, supresión, revocación): funcionalmente cubierto salvo rectificación libre de evaluaciones ya enviadas (se hace con una reevaluación).
- Las URLs firmadas de la galería caducan: si la página queda abierta mucho tiempo hay que recargar.
- PDF con fuentes estándar (Latin-1): caracteres fuera de Latin-1 se sustituyen por `?`.

## Aviso al entrenador por molestias (migración 0022)
Cuando el alumno guarda una molestia de **≥ 6/10** en un ejercicio, o termina un entrenamiento con dolor general **≥ 6/10**, el entrenador recibe una notificación (`kind = attention`). El umbral vive en `ATTENTION_THRESHOLD` (`src/lib/training/metrics.ts`) y en los triggers `trg_discomfort_attention` / `trg_pain_attention`; una prueba de integración comprueba que coinciden en el límite (5 no avisa, 6 sí).
- **Minimización**: el aviso dice quién y adónde mirar («Revisa su ficha…»); **no** incluye intensidad, zona, nota ni ejercicio. El detalle queda detrás de los consentimientos de la ficha.
- **Consentimientos**: solo se avisa si el alumno mantiene `health_data` y `share_with_trainer`, y la relación está activa. Si los retiró, no se crea el aviso (y no se emite uno retroactivo al restablecerlos; solo la siguiente escritura lo dispara).
- **Deduplicación**: un aviso por evento (`discomfort:<registro>:<ejercicio>` o `pain:<registro>`); subir la intensidad o editar la nota no lo repite. Si el alumno baja la molestia a 0 y la vuelve a subir en el mismo entrenamiento, tampoco se repite.
- Solo la función de base de datos inserta (los usuarios no pueden fabricar avisos ni llamar a `notify_trainer_attention`). Llega en vivo por Realtime a la insignia de Notificaciones.
- **Límites**: no hay correo, SMS ni push (el entrenador debe tener la app abierta o revisar su bandeja); no se avisa por esfuerzo de sesión alto (solo recordatorio en la ficha); no hay aviso si el espacio de trabajo del entrenador está vencido más allá de que la notificación quede guardada.
