# Copiloto de IA

## Principio
La IA **propone**; las validaciones deterministas y el entrenador **deciden**. Nada generado por un modelo se publica ni se aplica sin revisión humana.

## Arquitectura
- `src/lib/ai/provider.ts`: contrato `AiProvider` (system + user + esquema zod → texto). Sin herramientas, sin acceso a datos. `anthropic.ts`, `openai.ts` y `gemini.ts` son los adaptadores (se elige con `AI_PROVIDER`); otro proveedor = un archivo nuevo con el mismo contrato; cambiar de proveedor = nuevo archivo que implemente la interfaz.
- `src/lib/ai/run.ts` (`runLlm`): única puerta. Orden: configuración → `AI_ALLOW_SENSITIVE` → `ai_reserve` (consentimiento, acceso, límites) → llamada → JSON → zod → validador propio → `ai_finish`. Se audita en cada camino; el prompt crudo nunca se guarda (solo un hash).
- Funciones deterministas (sin modelo): análisis de anamnesis, sustitutos de ejercicios, triaje de seguridad del chat del alumno, recuperación de FAQ.
- Funciones con LLM: borrador de plan de entrenamiento, **borrador de plan de alimentación** (`src/lib/ai/diet.ts`: solo alimentos de la biblioteca, cantidades acotadas y escaladas a las calorías objetivo por código, se guarda como borrador), texto de observaciones del informe, respuesta del asistente del alumno.

## Proveedores
| `AI_PROVIDER` | Clave | `AI_MODEL` | Estado |
|---|---|---|---|
| `anthropic` | `ANTHROPIC_API_KEY` | opcional (por defecto `claude-opus-5-5`) | el original; SDK oficial |
| `openai` | `OPENAI_API_KEY` | **obligatorio** | Chat Completions con salida estructurada estricta |
| `gemini` | `GEMINI_API_KEY` | **obligatorio** | `generateContent` con esquema JSON; la clave va en cabecera, no en la URL |

Los modelos de OpenAI y Gemini nunca se adivinan: el operador escribe el nombre exacto. La salida pasa siempre por el mismo esquema, validadores, límites y auditoría, sea cual sea el proveedor. **Recomendación:** empieza con Claude (el flujo completo se diseñó y probó con su formato) y compara con Gemini o GPT usando los mismos borradores antes de cambiar; el coste por borrador depende del modelo que elijas. Solo se usa **un** proveedor a la vez.

## Privacidad
- Consentimiento `ai_processing` del alumno (revocable en Privacidad). Sin él no se envía nada.
- Contexto minimizado: sin nombre, correo, fecha de nacimiento, peso ni medicación; solo banda de edad.
- `AI_ALLOW_SENSITIVE=true` es un interruptor del operador; apagado, las funciones que envían datos de salud no se ejecutan.
- Emergencias y preguntas médicas se responden con un mensaje estático y no llegan al modelo.
- Eliminar/cerrar cuenta borra `ai_interactions`.

## Límites de uso (tabla `ai_limits`, aplicados en SQL con bloqueo por usuario)
Entrenador: 5/min, 60/día, 2.000.000 tokens/mes. Alumno: 3/min, 20/día, 300.000 tokens/mes. El cliente no puede fijar los límites.

## Prompt injection
Defensa arquitectónica, no solo filtros: el modelo no tiene herramientas ni escritura; los datos van en bloques con frontera aleatoria marcados como DATOS; los campos de texto libre con patrones de inyección se omiten y se reportan; la salida debe cumplir un esquema; los códigos de ejercicio deben existir en los candidatos y cumplir nivel/equipo/articulaciones; las cifras deben estar en los datos; no se admiten enlaces, código ni diagnósticos; y el resultado queda como borrador.

## Limitaciones honestas
- **No se probó contra ningún proveedor real**: sin claves. Los adaptadores de OpenAI y Gemini se verificaron con `fetch` simulado (forma de la petición, errores tipados), no con las APIs reales: haz una prueba con tu clave y un alumno de demostración antes de depender de ellos. El de Anthropic se verificó con el SDK oficial sobre `fetch` simulado y con `scripts/dev/fake-anthropic.mjs`, un banco de pruebas (no un modelo).
- La función "explicar propuesta de progresión con LLM" no está implementada.
- Los patrones de inyección son heurísticos; la garantía real son los validadores y la revisión humana.
- La FAQ del asistente es lexical (sin embeddings).

## Pruebas
`npm test` (adaptador, sanitización, validadores, `runLlm`) y `npm run test:int` (límites, concurrencia, consentimiento, auditoría, borrado) contra Supabase local.

## Créditos y costo (migración 0032)
Los borradores (`diet_draft`, `plan_draft`) consumen créditos del entrenador: 3 gratis al mes y paquetes prepagados (ver `docs/BILLING.md`). Si no quedan, `ai_reserve` responde `no_credits` y la app lo explica. El asistente del alumno (`client_qa`) no consume créditos, pero tiene un tope diario bajo (10) y mensual (200.000 tokens).
