import { parseAlertUrl } from "@/lib/ops/alerts";
import { modelLooksLikeKey } from "@/lib/ai/provider";

// Production configuration check. Pure (takes the env as an argument) so every rule is testable.
// Errors stop a production server from starting; warnings are logged. Values are never echoed, only variable names.
export type EnvReport = { errors: string[]; warnings: string[] };
type Env = Record<string, string | undefined>;

const PLACEHOLDER = /^(your-|server-only|long-random|changeme|xxx|test_|pub_test|prv_test|replace)/i;
const isLocalHost = (u: string) => { try { const h = new URL(u).hostname; return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".localhost"); } catch { return false; } };
const val = (env: Env, k: string) => env[k]?.trim() ?? "";

export function checkEnv(env: Env): EnvReport {
  const errors: string[] = [], warnings: string[] = [];
  const need = (k: string) => { const v = val(env, k); if (!v) errors.push(`${k} falta`); else if (PLACEHOLDER.test(v)) errors.push(`${k} parece un valor de ejemplo`); return v; };

  const supa = need("NEXT_PUBLIC_SUPABASE_URL"); need("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"); need("SUPABASE_SERVICE_ROLE_KEY");
  const base = need("APPLICATION_BASE_URL");
  const allowLocal = val(env, "ALLOW_LOCAL_PRODUCTION") === "1";                       // only for running `next start` on a laptop
  if (!allowLocal) {
    if (supa && isLocalHost(supa)) errors.push("NEXT_PUBLIC_SUPABASE_URL apunta a localhost");
    if (base && isLocalHost(base)) errors.push("APPLICATION_BASE_URL apunta a localhost (los retornos de pago y los enlaces saldrían rotos)");
    if (base && !isLocalHost(base) && !base.startsWith("https://")) errors.push("APPLICATION_BASE_URL debe ser https en producción");
  }
  if (base.endsWith("/")) warnings.push("APPLICATION_BASE_URL termina en «/»");

  const cron = val(env, "CRON_SECRET");
  if (!cron) errors.push("CRON_SECRET falta (el cron de vencimientos y recordatorios devolverá 401)");
  else if (PLACEHOLDER.test(cron) || cron.length < 32) errors.push("CRON_SECRET debe tener al menos 32 caracteres aleatorios");

  // Billing: a provider is either fully configured or not at all; a half-configured one silently disables itself.
  const group = (name: string, keys: string[], optional: string[] = []) => {
    const set = keys.filter((k) => val(env, k)); const on = set.length === keys.length;
    if (set.length > 0 && !on) errors.push(`${name}: configuración incompleta (faltan ${keys.filter((k) => !val(env, k)).join(", ")})`);
    for (const k of set) if (PLACEHOLDER.test(val(env, k))) errors.push(`${k} parece un valor de ejemplo`);
    for (const k of optional) if (on && !val(env, k)) warnings.push(`${name}: ${k} falta`);
    return on;
  };
  const bold = group("Bold", ["BOLD_IDENTITY_KEY", "BOLD_SECRET_KEY"]);
  const wompi = group("Wompi", ["WOMPI_PUBLIC_KEY", "WOMPI_PRIVATE_KEY", "WOMPI_EVENTS_SECRET", "WOMPI_INTEGRITY_SECRET"]);
  group("Push web (marketing)", ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"]);      // each marketing channel is all-or-nothing, like the payment providers
  group("Correo de marketing", ["RESEND_API_KEY", "EMAIL_FROM"]);
  const paypal = group("PayPal", ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID"], ["PAYPAL_PLAN_ID"]);
  if (!bold && !wompi && !paypal) errors.push("Ningún proveedor de pago está configurado: nadie podría suscribirse");
  if (wompi && val(env, "WOMPI_ENVIRONMENT") !== "production") warnings.push("Wompi está en sandbox: los pagos no son reales");
  if (wompi && val(env, "WOMPI_ENVIRONMENT") === "production" && /_test_/.test(val(env, "WOMPI_PUBLIC_KEY"))) errors.push("WOMPI_ENVIRONMENT=production con llaves de prueba");
  if (paypal && val(env, "PAYPAL_ENVIRONMENT") !== "production") warnings.push("PayPal está en sandbox: los pagos no son reales");

  const fxAge = val(env, "FX_MAX_AGE_HOURS");
  if (fxAge && !/^\d+$/.test(fxAge)) warnings.push("FX_MAX_AGE_HOURS no es un número entero de horas: se usará el valor por defecto (168)");
  else if (fxAge && (Number(fxAge) < 1 || Number(fxAge) > 1440)) warnings.push("FX_MAX_AGE_HOURS fuera de 1–1440: se usará el valor por defecto (168)");
  else if (wompi && fxAge && Number(fxAge) > 168) warnings.push("FX_MAX_AGE_HOURS > 168: aceptas cobrar en pesos con una tasa de más de 7 días");

  const warnH = val(env, "FX_WARN_HOURS");
  if (warnH && !/^\d+$/.test(warnH)) warnings.push("FX_WARN_HOURS no es un número entero de horas: se usará 24");
  const supportHook = val(env, "SUPPORT_ALERT_WEBHOOK_URL");
  if (supportHook && !parseAlertUrl(supportHook)) errors.push("SUPPORT_ALERT_WEBHOOK_URL debe ser https (sin usuario/contraseña en la URL)");
  const hook = val(env, "ADMIN_ALERT_WEBHOOK_URL");
  if (hook && !parseAlertUrl(hook)) errors.push("ADMIN_ALERT_WEBHOOK_URL debe ser https (sin usuario/contraseña en la URL)");
  else if (!hook && wompi && val(env, "FX_MONITORING") === "on") warnings.push("ADMIN_ALERT_WEBHOOK_URL no está configurada: nadie recibirá aviso cuando la tasa USD→COP esté por vencer (solo /api/health y los logs)");

  for (const [k, v] of Object.entries(env)) if (k.startsWith("AUTH_LIMIT_") && v !== undefined && v !== "" && !/^[1-9]\d*$/.test(v)) warnings.push(`${k} no es un entero positivo: se usará el límite por defecto`);
  const fill = val(env, "AUTH_MIN_FILL_MS");
  if (fill && (!/^\d+$/.test(fill) || Number(fill) < 1000)) warnings.push("AUTH_MIN_FILL_MS debería ser un entero ≥ 1000: con menos, el filtro de envíos instantáneos pierde sentido");

  // AI is optional, but a half-set configuration would silently fall back to "no AI".
  const named = val(env, "AI_PROVIDER");
  const known = ["anthropic", "openai", "gemini"] as const; const keyVar = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY", gemini: "GEMINI_API_KEY" } as const;
  const aiOn = (known as readonly string[]).includes(named ?? "");
  if (named && !aiOn) errors.push(`AI_PROVIDER=${named} no es válido (anthropic, openai o gemini)`);
  if (aiOn) {
    const p = named as (typeof known)[number];
    if (!val(env, keyVar[p])) errors.push(`AI_PROVIDER=${p} sin ${keyVar[p]}`);
    if (p !== "anthropic" && !val(env, "AI_MODEL")) errors.push(`AI_PROVIDER=${p} requiere AI_MODEL (el nombre exacto del modelo)`);
  }
  if (modelLooksLikeKey(val(env, "AI_MODEL"), env)) errors.push("AI_MODEL no parece un nombre de modelo (¿se pegó una clave de API aquí?): corrígela y rota esa clave");
  for (const p of known) if (val(env, keyVar[p]) && named !== p) warnings.push(`${keyVar[p]} definida pero AI_PROVIDER ${aiOn ? `es «${named}»: esa clave no se usa` : "no está configurado: la IA queda apagada"}`);
  if (aiOn && val(env, "AI_ALLOW_SENSITIVE") === "true") warnings.push("AI_ALLOW_SENSITIVE=true: se enviará contexto de salud minimizado a un proveedor externo; confirma contrato/DPA y aviso de privacidad");
  if (val(env, "ANTHROPIC_BASE_URL")) errors.push("ANTHROPIC_BASE_URL está definida: solo debe usarse con el servidor de pruebas local");
  return { errors, warnings };
}
