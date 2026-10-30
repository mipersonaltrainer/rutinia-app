import { z } from "zod";

// Mirrors the CHECK constraints of migration 0037 (marketing_campaigns / marketing_settings).
export const KINDS = [
  { id: "comunicado", label: "Comunicado", hint: "Aviso del servicio (mantenimiento, cambios importantes). En la plataforma llega a todos, aunque hayan desactivado las novedades." },
  { id: "campana", label: "Campaña", hint: "Promoción o novedad comercial. Respeta a quien desactivó las novedades." },
  { id: "cumple", label: "Felicitación", hint: "Saludo por cumpleaños u otra fecha. Respeta a quien desactivó las novedades." },
] as const;
export type Kind = (typeof KINDS)[number]["id"];
export const AUDIENCES = [
  { id: "todos", label: "Todos los entrenadores" }, { id: "pagando", label: "Entrenadores que están pagando" },
  { id: "prueba", label: "Entrenadores en prueba gratis" }, { id: "bloqueados", label: "Entrenadores bloqueados (prueba o pago vencido)" },
  { id: "cumple_hoy", label: "Cumpleañeros de hoy" }, { id: "uno", label: "Un entrenador (prueba)" },
] as const;
export type Audience = (typeof AUDIENCES)[number]["id"];
export const CHANNELS = [{ id: "in_app", label: "En la plataforma (campana)" }, { id: "push", label: "Push al celular o navegador" }, { id: "email", label: "Correo" }] as const;
export type Channel = (typeof CHANNELS)[number]["id"];
export const kindLabel = (k: string) => KINDS.find((x) => x.id === k)?.label ?? k;
export const audienceLabel = (a: string) => AUDIENCES.find((x) => x.id === a)?.label ?? a;
export const STATUS_LABEL = { draft: "Borrador", scheduled: "Programada", sending: "Enviando", sent: "Enviada", canceled: "Cancelada", failed: "Con errores" } as const;
export type CampaignStatus = keyof typeof STATUS_LABEL;

/** Internal path (starts with one "/") or an https address. Never `javascript:`, `//host`, or anything with spaces. Same rule as the database. */
export const isSafeLink = (l: string) => l.length <= 300 && !l.startsWith("//") && (/^\/[A-Za-z0-9/_?=&%.#-]*$/.test(l) || /^https:\/\/[^\s]+$/.test(l));

const ids = <T extends readonly { id: string }[]>(list: T) => list.map((x) => x.id) as [T[number]["id"], ...T[number]["id"][]];
const text = (min: number, max: number, what: string) => z.string().trim().min(min, `${what}: mínimo ${min} caracteres`).max(max, `${what}: máximo ${max} caracteres`);
export const campaignSchema = z.object({
  kind: z.enum(ids(KINDS), { error: "Elige el tipo de mensaje" }),
  title: text(3, 80, "El título"),
  body: text(1, 600, "El mensaje"),
  link: z.string().trim().max(300).optional().transform((v) => (v ? v : undefined)).refine((v) => v === undefined || isSafeLink(v), "El enlace debe empezar con / (una página de Rutinia) o con https://"),
  audience: z.enum(ids(AUDIENCES), { error: "Elige a quién se envía" }),
  audienceEmail: z.string().trim().optional(),
  channels: z.array(z.enum(ids(CHANNELS))).min(1, "Elige al menos un canal"),
  scheduledAt: z.string().trim().optional(),
});

/** `{nombre}` becomes the first name; anything else stays as written. Plain text only: nothing is ever rendered as HTML. */
export const firstName = (full: string) => (full.trim().split(/\s+/)[0] || "").slice(0, 40);
export const render = (t: string, nombre: string) => t.replace(/\{nombre\}/gi, nombre || "").replace(/\s+([,.!¡¿?])/g, "$1").replace(/ {2,}/g, " ").trim();
