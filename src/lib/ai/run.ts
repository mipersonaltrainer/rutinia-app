import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { AiError, getAiConfig, type AiConfig, type AiProvider } from "./provider";
import { createProvider } from "./anthropic";
import type { Violation } from "./validate-plan";
import { createAdminClient } from "@/lib/supabase/admin";

export type RunFail = { ok: false; code: string; message: string };
export type RunOk<T> = { ok: true; data: T; violations: Violation[]; flags: string[]; interactionId: string; remainingDay: number | null; model: string };
const REASON: Record<string, string> = {
  no_consent: "El alumno no ha activado el consentimiento del asistente de IA (Privacidad). No se envió ningún dato.",
  rate_limit_minute: "Demasiadas solicitudes seguidas. Espera un minuto.", rate_limit_day: "Alcanzaste el límite diario de uso del asistente.", budget_month: "Se agotó el presupuesto mensual de uso del asistente.",
  no_access: "No tienes acceso a este alumno.", no_credits: "Ya usaste tus 3 borradores gratis de este mes y no te quedan créditos. Compra un paquete en Facturación.", unauthenticated: "Sesión expirada.", unknown_user: "Usuario desconocido.",
};
const ERR: Record<string, string> = { auth: "El proveedor de IA rechazó las credenciales: avisa al administrador.", rate_limited_provider: "El proveedor de IA está saturado. Inténtalo en unos minutos.", timeout: "El proveedor de IA tardó demasiado. Inténtalo de nuevo.", refusal: "El proveedor de IA no pudo atender esta solicitud.", truncated: "La respuesta fue demasiado larga y se cortó. Inténtalo con menos restricciones.", invalid_output: "La respuesta de la IA no tuvo el formato esperado y se descartó.", provider_error: "No se pudo contactar al proveedor de IA." };

export interface RunOptions<T> {
  /** The caller's own session: used for the quota/consent/access gate (ai_reserve), which must see who is asking. */
  supabase: SupabaseClient;
  /** Writes the audit record (ai_finish). Server only — users cannot execute it, so the trail cannot be forged. Defaults to the service-role client. */
  finisher?: SupabaseClient; kind: string; clientId: string | null; sensitive: boolean;
  system: string; user: string; flags: string[]; digest: string; schema: z.ZodType<T>;
  effort?: "low" | "medium" | "high"; maxTokens?: number;
  /** Deterministic validation/repair of the model output. Returning `reject` discards everything. */
  post: (data: T) => { data: unknown; violations: Violation[]; reject?: string };
  cfg?: AiConfig; provider?: AiProvider | null;
}

/**
 * The single gate every model call goes through: configuration → legal switch → consent/access/rate limits (atomic, in the database)
 * → provider call with timeout → schema validation → deterministic post-validation → audit record. Nothing here can write to a plan.
 */
export async function runLlm<T, R = unknown>(o: RunOptions<T>): Promise<RunOk<R> | RunFail> {
  const cfg = o.cfg ?? getAiConfig();
  if (!cfg.enabled) return { ok: false, code: "not_configured", message: "El asistente de IA no está configurado en este entorno (falta proveedor o clave)." };
  if (o.sensitive && !cfg.allowSensitive) return { ok: false, code: "sensitive_disabled", message: "El envío de datos de salud a un proveedor externo no está habilitado por el administrador." };
  const provider = o.provider === undefined ? createProvider(cfg) : o.provider;
  if (!provider) return { ok: false, code: "not_configured", message: "El asistente de IA no está configurado en este entorno." };

  const { data: res, error } = await o.supabase.rpc("ai_reserve", { p_kind: o.kind, p_client: o.clientId, p_sensitive: o.sensitive });
  if (error) return { ok: false, code: "reserve_failed", message: "No se pudo iniciar la solicitud." };
  const r = res as { allowed: boolean; reason?: string; usage_id?: string; remaining_day?: number };
  if (!r.allowed || !r.usage_id) return { ok: false, code: r.reason ?? "blocked", message: REASON[r.reason ?? ""] ?? "Solicitud no permitida." };

  const usage = r.usage_id; const t0 = Date.now();
  let status: "ok" | "error" = "error"; let inter: "ok" | "rejected" | "error" = "error";
  let tokensIn = 0, tokensOut = 0, model = provider.model; let out: unknown = null; let violations: Violation[] = []; let fail: RunFail | null = null;
  try {
    const resp = await provider.complete({ system: o.system, user: o.user, schema: o.schema as z.ZodType, effort: o.effort ?? "medium", maxTokens: o.maxTokens ?? cfg.maxOutputTokens, timeoutMs: cfg.timeoutMs });
    tokensIn = resp.inputTokens; tokensOut = resp.outputTokens; model = resp.model;
    let json: unknown; try { json = JSON.parse(resp.text); } catch { throw new AiError("invalid_output", "not json"); }
    const parsed = o.schema.safeParse(json); if (!parsed.success) throw new AiError("invalid_output", "schema mismatch");
    const checked = o.post(parsed.data);
    violations = checked.violations;
    if (checked.reject) { inter = "rejected"; fail = { ok: false, code: "rejected", message: `La propuesta de la IA se descartó: ${checked.reject}` }; status = "ok"; }
    else { out = checked.data; inter = "ok"; status = "ok"; }
  } catch (e) {
    const code = e instanceof AiError ? e.code : "provider_error";
    console.error("[ai]", `${provider.name}/${provider.model}`, code, e instanceof AiError ? e.message : e instanceof Error ? e.name : "unknown");   // provider/model, codes and our own messages only: never provider text, prompts or personal data
    fail = { ok: false, code, message: ERR[code] ?? ERR.provider_error };
  }
  const { data: iid } = await (o.finisher ?? createAdminClient()).rpc("ai_finish", { p_usage: usage, p_status: status, p_provider: provider.name, p_model: model, p_in: tokensIn, p_out: tokensOut, p_ms: Date.now() - t0, p_client: o.clientId, p_digest: o.digest, p_output: out, p_violations: violations, p_flags: o.flags, p_inter_status: inter });
  if (fail) return fail;
  return { ok: true, data: out as R, violations, flags: o.flags, interactionId: iid as string, remainingDay: r.remaining_day ?? null, model };
}
