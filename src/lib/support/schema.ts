import { z } from "zod";

// Mirrors the CHECK constraints and limits of migration 0035 (support_threads / support_messages).
export { SUPPORT_EMAIL } from "@/lib/site";
import { SUPPORT_EMAIL } from "@/lib/site";
export const CATEGORIES = [
  { id: "pago", label: "Un pago o mi suscripción" },
  { id: "acceso", label: "No puedo entrar o mi cuenta" },
  { id: "permisos", label: "Permisos o alumnos" },
  { id: "error", label: "Algo no funciona (error)" },
  { id: "otro", label: "Otro tema" },
] as const;
export type Category = (typeof CATEGORIES)[number]["id"];
export const categoryLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? "Otro tema";
export const STATUS_LABEL = { open: "Abierta", answered: "Respondida", closed: "Cerrada" } as const;
export type ThreadStatus = keyof typeof STATUS_LABEL;

const body = z.string().trim().min(1, "Escribe tu mensaje").max(4000, "El mensaje es demasiado largo (máximo 4000 caracteres)");
export const openThreadSchema = z.object({
  category: z.enum(CATEGORIES.map((c) => c.id) as [Category, ...Category[]], { error: "Elige un tema" }),
  subject: z.string().trim().min(3, "Resume el tema en al menos 3 caracteres").max(120, "El asunto es demasiado largo (máximo 120 caracteres)"),
  body,
});
export const sendSchema = z.object({ body });

/** Maps the database's error codes (raised by the support_* functions) to something a person can act on. */
export function supportError(message: string | undefined): string {
  if (/rate limited/.test(message ?? "")) return "Estás escribiendo muy rápido. Espera un momento y vuelve a intentarlo.";
  if (/too many open/.test(message ?? "")) return "Ya tienes 5 conversaciones abiertas. Cierra alguna que ya esté resuelta o responde en una existente.";
  if (/forbidden/.test(message ?? "")) return "No tienes acceso a esta conversación.";
  return "No pudimos enviar el mensaje. Inténtalo de nuevo; si sigue fallando, escríbenos a " + SUPPORT_EMAIL + ".";
}
