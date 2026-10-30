export type ConsentType = "personal_data" | "health_data" | "photos" | "share_with_trainer" | "communications" | "anonymized_analytics" | "ai_processing";
export const CONSENTS: { type: ConsentType; title: string; description: string; revocable: boolean }[] = [
  { type: "personal_data", title: "Datos personales", description: "Tratamiento de tu nombre, correo y fecha de nacimiento para prestarte el servicio. Si lo retiras no podemos mantener tu cuenta: puedes eliminarla.", revocable: false },
  { type: "health_data", title: "Datos de salud", description: "Tratamiento de la información de salud que aportas (lesiones, dolor, antecedentes). Es un dato sensible. Si lo retiras, tu entrenador deja de ver tu evaluación, medidas y entrenamientos.", revocable: true },
  { type: "share_with_trainer", title: "Compartir con mi entrenador", description: "Permite que tu entrenador vea tus datos. Si lo retiras, deja de ver tus datos y fotos de inmediato.", revocable: true },
  { type: "photos", title: "Fotos de progreso", description: "Permite guardar tus fotos en un espacio privado. Solo tú y tu entrenador (si además compartes con él) pueden verlas; nunca se usan en publicidad ni para entrenar modelos.", revocable: true },
  { type: "communications", title: "Recordatorios y comunicaciones", description: "Permite enviarte recordatorios (por ejemplo, cuándo subir una foto de progreso).", revocable: true },
  { type: "ai_processing", title: "Asistente de IA (envío a un proveedor externo)", description: "Permite que tu entrenador use un asistente de IA con tus datos, y que tú uses el asistente del alumno. Para ello se envía un resumen minimizado y sin tu nombre ni correo a un proveedor externo de modelos de IA. La IA nunca decide por ti: todo pasa por revisión humana. Puedes retirarlo cuando quieras.", revocable: true },
  { type: "anonymized_analytics", title: "Mejora del producto (opcional)", description: "Uso de datos anonimizados para mejorar la plataforma. Hoy no se usa para nada; queda registrado tu deseo.", revocable: true },
];
export const DELETE_CONFIRM_WORD = "ELIMINAR";
export const CLOSE_CONFIRM_WORD = "CERRAR";
