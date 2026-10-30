# Revisión profesional de la biblioteca de alimentos

La biblioteca (`data/foods.source.mjs`, 94 alimentos) tiene valores de referencia redondeados, **no** tomados de la Tabla de Composición de Alimentos Colombianos (ICBF). Todos están en `draft`. Un nutricionista-dietista debe revisarla antes de usar los planes con alumnos reales.

## Cómo hacerlo
1. Entrega `REVISION_ALIMENTOS.csv` (ábrelo con Excel o Google Sheets; separador «;», con acentos correctos).
2. Para cada fila, la persona revisora compara con su fuente (idealmente la TCAC del ICBF) y llena, **solo si algo difiere**, las columnas `*_correcta`, y marca `aprobado` con SI o NO. En `FUENTE_QUE_USARON` anota la fuente.
3. Revisa también:
   - **Medidas caseras:** ¿cuánto pesa realmente una cucharada, un cucharón o un pocillo de ese alimento cocinado a la colombiana?
   - **Alimentos que faltan** (arepa de choclo, ajiaco, sancocho, buñuelo, chicharrón, jugos con panela, etc.) y preparaciones típicas.
   - **Equivalencias de intercambio** y porciones máximas razonables.
4. Devuelve el archivo; se actualiza `data/foods.source.mjs`, se regenera (`npm run foods:review`) y se marcan como `reviewed` los aprobados.

## Qué NO se debe usar con alumnos reales hasta entonces
Planes de alimentación generados o editados con esta biblioteca. La calculadora de energía no depende de ella y puede usarse como orientación.

## Fuera de alcance de esta revisión
Prescripción para enfermedades (diabetes, renal, etc.), embarazo, menores de edad y trastornos de la conducta alimentaria: la plataforma no genera objetivos automáticos en esos casos y requieren un profesional.
