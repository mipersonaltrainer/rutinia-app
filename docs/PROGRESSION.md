# Motor de progresión (estado real)

**Principio:** el motor solo *propone*. Nada cambia el plan sin una decisión humana, y cada decisión queda registrada. No es IA ni modelo estadístico: son reglas explícitas, deterministas y con pruebas (`src/lib/progression/engine.ts`, versión `2026.1`).

## Datos que usa (por ejercicio prescrito)
Series realizadas (reps, carga, RPE) de las últimas sesiones completadas, series planificadas vs. hechas, molestia por ejercicio, dolor y esfuerzo de la sesión, recuperación previa (1–5), adherencia de las últimas 2 semanas, nivel del plan, equipamiento (incremento mínimo), regla de progresión del ejercicio (`double_progression`, `linear_load`, `rpe_based`, `none`) y alternativas de la biblioteca.

## Reglas (en orden de prioridad)
1. **Seguridad primero.** Molestia ≥ 6/10 en el ejercicio → *revisar técnica* (o *sustituir* si se repite y hay alternativa), severidad "requiere atención profesional". Dolor general o molestia ≥ 6 en la última sesión → *solicitar evaluación adicional*. Nunca se propone subir carga con molestia significativa en las últimas 3 sesiones.
2. **Caída inusual de rendimiento** (dos bajadas seguidas ≥ 10 % de volumen) → *reducir volumen* (−1 serie).
3. **Fallo repetido** del mínimo de repeticiones con la misma carga (2 sesiones) → *bajar carga*.
4. **Progresar:** todas las series planificadas en el máximo del rango, con esfuerzo aceptable (RPE ≤ objetivo, o ≤ 8.5 si no hay objetivo), con la misma carga durante 2 sesiones (1 para `linear_load` en principiantes) → *subir carga* en el **menor salto razonable** (barra 2.5 kg, mancuerna 2, kettlebell 4, máquina/polea 2.5; editable) o, en ejercicios sin carga, *ampliar el rango de repeticiones*.
5. **Estancamiento** (4 sesiones, misma carga, sin mejorar repeticiones) → *sustituir* por una alternativa (confianza baja).
6. **Bloqueos que impiden subir:** adherencia < 50 % en 2 semanas, molestia 4–5/10, recuperación ≤ 2 en las dos últimas sesiones → *mantener*, explicando el motivo.
7. **Fatiga a nivel plan:** ≥ 2 señales entre esfuerzo medio ≥ 8.5 (3 sesiones), recuperación baja (2 de 3) y dolor al alza → *semana de descarga* (−40 % series, −10 % carga, editable). Una descarga reemplaza los aumentos de carga.
Mínimo de datos: 2 sesiones registradas del ejercicio; con menos, no hay propuesta (salvo alertas de seguridad).

## Cada propuesta incluye
1. Qué se propone cambiar (campo, valor actual → propuesto) · 2. Por qué · 3. Datos que lo respaldan · 4. Incertidumbre · 5. Qué debe comprobar el entrenador · además de severidad (info / precaución / profesional) y confianza (baja/media/alta).

## Decisiones
- **Aceptar:** se aplica a un **borrador** (se crea desde la versión vigente si no existe); nunca se publica ni toca la versión publicada. Las propuestas informativas (revisar técnica, mantener, solicitar evaluación) solo se registran como atendidas.
- **Modificar:** el entrenador cambia los valores; motivo obligatorio; se guardan el valor propuesto y el aplicado.
- **Rechazar:** motivo obligatorio; no cambia nada. Los mismos datos no vuelven a generar la misma propuesta (huella por contenido).
- Decisiones inmutables (una por propuesta). Si se publica una versión nueva del plan, las propuestas pendientes pasan a `stale` y no pueden decidirse. Si llegan datos nuevos, las pendientes se reemplazan (`superseded`), nunca se borran.
- Solo se pueden aplicar automáticamente: series, reps mín/máx, carga, descanso, ejercicio sustituto (de la biblioteca o propio) y descarga. Todo está validado en la base de datos y es atómico.
- Privacidad: solo el entrenador del alumno (con espacio vigente) ve propuestas y decisiones; el alumno no.

## Limitaciones conocidas
- No calcula incrementos reales por alumno (usa una tabla por equipamiento); el entrenador debe confirmarlo.
- RPE autorreportado; no hay calificación de técnica por el entrenador (solo molestias/notas).
- No hay notificación al entrenador (se ve en el panel y en la ficha del alumno).
- Ejercicios por duración no se evalúan.
- Los registros de entrenamiento finalizados son inmutables (incluso en cascada): el flujo de eliminación de cuenta deberá usar una ruta privilegiada y auditada.
- Los umbrales (50 %, 8.5, 10 %, 4 sesiones…) son criterios editoriales razonables, **no validados científicamente**; conviene revisarlos con un preparador físico.
