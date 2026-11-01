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
  if (!res.ok) {
    // Only Google's fixed error labels (e.g. INVALID_ARGUMENT, API_KEY_INVALID) are kept: they name the cause without echoing prompts, keys or any provider prose.
    const err = await res.json().then((j) => (j as { error?: { status?: unknown; details?: { reason?: unknown }[] } }).error, () => undefined);
    const label = [err?.status, err?.details?.find((d) => typeof d?.reason === "string")?.reason].filter((v): v is string => typeof v === "string" && /^[A-Z][A-Z0-9_]{2,40}$/.test(v)).join(" ");
    throw new AiError("provider_error", `Error del proveedor (${res.status}${label ? ` ${label}` : ""}).`, res.status >= 500);
  }
  try { return (await res.json()) as Record<string, unknown>; } catch { throw new AiError("invalid_output", "Respuesta del proveedor ilegible."); }
}
