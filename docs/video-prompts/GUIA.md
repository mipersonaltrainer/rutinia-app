# Guía de videos de ejercicios (maniquí gris)

Un prompt por ejercicio, todos con el mismo estilo: **maniquí gris mate, sin rostro, plano, con la musculatura definida**, cámara fija, fondo gris claro, 4–5 segundos, una sola repetición en bucle.

## Qué hay aquí
| Archivo | Para qué sirve |
|---|---|
| `PROMPTS_EJERCICIOS.csv` | Los 649 prompts en una hoja de cálculo (ábrelo en Excel/Sheets). Columnas: archivo, nombre, músculo, equipo, inclinación, prompt, revisar. |
| `PRIMEROS_50.md` | **Empieza aquí:** los 50 movimientos más usados, con la técnica escrita a mano, en el orden sugerido. |
| `01-pecho.md` … `08-cuerpo-completo-cardio-movilidad.md` | Los mismos prompts por grupo muscular, listos para copiar y pegar. |
| Esta guía | Estilo, flujo de trabajo y ahorro de créditos. |

Se regeneran con `npm run videos:build` a partir de la biblioteca de ejercicios (si añades ejercicios nuevos, vuelve a ejecutarlo).

## Estado honesto
- Los prompts salen de **plantillas por patrón de movimiento + el nombre del ejercicio**; no los he probado en Flow ni en ningún generador de video. Los que dicen **«revisar»** (≈ 47 %) usan una descripción genérica del movimiento: mira el video generado y ajusta una frase si la técnica no se ve bien.
- No he verificado los límites actuales de Flow (duración de clip, relación de aspecto, créditos por clip). Si Flow solo genera clips más largos (p. ej. 8 s), **recórtalos a 4–5 s**: cada prompt describe una única repetición fluida, así que recortar el final funciona.
- Un maniquí «anatómico» puede salir con detalles de más (cara, piel, ropa). Por eso cada prompt trae esas prohibiciones, y abajo hay un *prompt negativo* por si la herramienta lo admite.

## Cómo conseguir que todos los videos parezcan del mismo maniquí
1. **Crea primero una imagen de referencia** del maniquí (una sola vez), con este texto:
   > A faceless, featureless matte-gray anatomical mannequin with sculpted, clearly defined muscles (smooth uniform gray surface like a 3D écorché figure; no face, no hair, no skin texture, no clothing), standing in a neutral A-pose, full body, plain light-gray seamless studio background, soft even studio lighting.
2. Elige la mejor y úsala como **imagen de partida / ingrediente** en cada video (la opción de «imagen a video» o «ingredients» de Flow, según tu versión). Así el cuerpo, el gris y la iluminación son idénticos en los 649.
3. Guarda también una imagen de referencia del **banco** y de la **barra/mancuernas/máquina** y reutilízalas: es lo que más cambia entre clips.

## Prompt negativo (si la herramienta lo permite)
`face, eyes, hair, skin texture, clothing, text, subtitles, logo, watermark, extra limbs, distorted hands, extra fingers, blur, fast cuts, camera shake, zoom, people in the background`

## Ahorrar créditos
- **Empieza por los 40–60 ejercicios que más usas** (sentadilla, peso muerto, press de banca plano/inclinado/declinado, remos, dominadas, curl, extensión de tríceps, elevaciones laterales, puente de glúteo, plancha…). Los demás pueden esperar.
- Prueba **1 prompt por grupo** en el modelo más barato/rápido de Flow para validar el estilo antes de lanzar el resto.
- **Un video para variantes casi idénticas**: «con barra» y «con barra Z», o izquierda/derecha, a veces se resuelven con un solo clip.
- Genera en lote por grupo (los archivos `.md` están ordenados para eso) y revisa al final de cada lote.

## Nombres de archivo y cómo se conectan a la app
- Guarda cada video como **`<slug>.mp4`** (la columna «archivo» del CSV), p. ej. `press-de-banca-inclinado-con-barra.mp4`.
- Pon todos los `.mp4` (o `.webm`, máx. 15 MB cada uno) en una carpeta y súbelos con:
  ```bash
  node --env-file=.env.cloud scripts/upload-exercise-videos.mjs ~/Videos/rutinia --dry-run   # simulacro: no sube nada
  node --env-file=.env.cloud scripts/upload-exercise-videos.mjs ~/Videos/rutinia
  ```
  El script valida el nombre y el contenido, es repetible (lo ya subido no se repite) y reemplaza un clip si cambias el archivo. Al subirse, el ejercicio pasa a «Con video», que se reproduce en su ficha y en «Cómo se hace» durante el entrenamiento del alumno (carga solo al pulsar play).
- Recomendación de tamaño: 720p, ~1–2 MB por clip, sin audio (el video se muestra silenciado).
