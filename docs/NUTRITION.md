# Nutrición

## Qué hace
- **Calculadora automática** (`src/lib/nutrition/energy.ts`): % de grasa corporal, metabolismo basal, gasto diario y objetivo calórico con macros, a partir de lo que la plataforma ya tiene (evaluación inicial + última medición de cada dato). Los datos extra (cuello, cintura, cadera, % de grasa medido) son **opcionales** y solo suben la precisión; nunca se inventa un valor.
- **Sección de nutrición por alumno**: el entrenador decide (`trainer_client_relationships.nutrition_enabled`, apagado por defecto) quién la tiene. Un alumno sin ella no ve enlace ni página (404) y la base de datos rechaza crear o leer planes para él.
- **Planes de alimentación**: comidas → alimentos con cantidad en **gramos** (canónico) y su equivalente en **medidas caseras** (cucharadita, cucharada, cucharón, pocillo, taza, vaso, unidad, rebanada, puñado, porción) o en kg/L. Borrador → publicado → archivado; solo uno publicado por alumno.
- **Borrador con IA** (ver `docs/AI.md`): propone un día de alimentación con alimentos de la biblioteca; el sistema descarta lo desconocido, acota cantidades y las escala a las calorías objetivo.

## Fórmulas y salvaguardas
| Dato | Método | Precisión |
|---|---|---|
| % grasa | medido (si se registra) → US Navy (cuello, cintura[, cadera]) → Deurenberg (IMC, edad, sexo) | medida / ±3–4 pts / ±5–6 pts |
| Metabolismo basal | Mifflin-St Jeor (Katch-McArdle si hay % medido) | estimación |
| Gasto diario | × factor de actividad (+ ajuste si el plan tiene ≥ 3 sesiones/semana y se declaró sedentario) | estimación |
| Objetivo | pérdida de grasa −20 % (−10 % si IMC < 22; 0 si IMC < 18,5), recomposición −5 %, hipertrofia +10 %, fuerza +5 %, resto 0 % | punto de partida |
| Mínimo | nunca por debajo de 1200 kcal (mujer) / 1500 kcal (hombre) ni del metabolismo basal | — |
| Macros | proteína 1,6–2,0 g/kg (peso de referencia si IMC ≥ 30), grasa ≥ 25 % de las kcal, resto carbohidratos | — |

**Sin objetivo automático** (se explica por qué): menores de 18 años, embarazo/posparto, antecedentes de trastornos de la conducta alimentaria. La generación con IA además se niega si el cribado exige valoración profesional.

## Privacidad
Mismo modelo que los datos de entrenamiento: el entrenador ve el plan solo con suscripción activa y mientras el alumno mantenga los consentimientos de salud y de compartir; el alumno solo ve planes **publicados** y solo mientras la nutrición siga activada. Retirar permisos o desactivar la sección corta el acceso al instante. Borrar la cuenta del alumno elimina sus planes (cascada).

## Limitaciones honestas
- **Biblioteca de alimentos**: 94 alimentos con valores de referencia redondeados (estilo USDA), **no la tabla del ICBF**, todos en `draft`. Un nutricionista debe revisarlos y ampliarlos antes de usarlos con alumnos reales. Las medidas caseras son aproximadas (una cucharada de arroz no pesa lo mismo en todas las cocinas).
- Un plan es **un día tipo**; no hay menús semanales, intercambios por equivalencias ni lista de compras (siguientes pasos naturales).
- No es una prescripción dietética ni sustituye a un nutricionista; los textos de la app lo dicen.
- Biblioteca propia del entrenador: el esquema ya la soporta (`foods.owner_id`), pero la pantalla para crear alimentos propios no está hecha.
