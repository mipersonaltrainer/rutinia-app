import { z } from "zod";
import { AiError } from "./provider";

/** JSON Schema for a zod schema, in the form chat APIs accept (no $schema key). */
export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const { $schema, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>; void $schema; return rest;
}

/** POST JSON with a hard timeout; HTTP failures become typed AiErrors that never carry provider text. */
export async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number, fetchImpl: typeof fetch = fetch): Promise<Record<string, unknown>> {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res: Response;
  try { res = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal: ctl.signal }); }
  catch (e) { if ((e as { name?: string }).name === "AbortError") throw new AiError("timeout", "El proveedor tardó demasiado.", true); throw new AiError("provider_error", "No se pudo contactar al proveedor.", true); }
  finally { clearTimeout(timer); }
  if (res.status === 401 || res.status === 403) throw new AiError("auth", "Credenciales del proveedor inválidas.");
  if (res.status === 429) throw new AiError("rate_limited_provider", "El proveedor está limitando las solicitudes.", true);
  if (!res.ok) throw new AiError("provider_error", `Error del proveedor (${res.status}).`, res.status >= 500);
  try { return (await res.json()) as Record<string, unknown>; } catch { throw new AiError("invalid_output", "Respuesta del proveedor ilegible."); }
}
