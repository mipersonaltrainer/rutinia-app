export type Screen = { kind: "ok" } | { kind: "emergency" | "medical"; message: string };
const EMERGENCY = /(dolor (fuerte )?(de|en) (el )?(pecho|brazo izquierdo)|presi[oó]n en el pecho|no puedo respirar|me falta (mucho )?el aire|falta de aire (fuerte|intensa)|me desmay|desmayo|perd[ií] el conocimiento|palpitaciones fuertes|me quiero morir|quiero hacerme da[nñ]o|suicid)/i;
const MEDICAL = /(diagn[oó]stic|qu[eé] enfermedad|qu[eé] (tengo|me pasa)|medicament|pastilla|f[aá]rmaco|dosis|receta m[eé]dica|inyecci[oó]n|esteroide|anab[oó]lic|suplemento.{0,20}(dosis|cu[aá]nto tomar)|estoy embarazada|embarazo|posparto|cirug[ií]a|puedo entrenar (con|si tengo) (fiebre|infecci[oó]n))/i;

/** Deterministic pre-filter for the client assistant: these messages never reach a model. */
export function screenClientMessage(text: string): Screen {
  if (EMERGENCY.test(text)) return { kind: "emergency", message: "Si sientes dolor en el pecho, falta de aire, mareo intenso o desmayo, deja de entrenar ahora y busca atención médica urgente (en Colombia, llama al 123). Si estás pensando en hacerte daño, comunícate con la Línea 106 o con una persona de confianza. Esta herramienta no puede ayudarte con una emergencia." };
  if (MEDICAL.test(text)) return { kind: "medical", message: "Esa pregunta es médica y no puedo responderla ni diagnosticar. Consulta a un profesional de la salud y cuéntale a tu entrenador para que ajuste tu plan con esa información. Puedo ayudarte con dudas sobre tu rutina, la ejecución de un ejercicio o cómo usar la plataforma." };
  return { kind: "ok" };
}
