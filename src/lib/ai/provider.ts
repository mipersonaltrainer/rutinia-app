import type { z } from "zod";

export type AiErrorCode = "not_configured" | "sensitive_disabled" | "auth" | "rate_limited_provider" | "timeout" | "refusal" | "truncated" | "invalid_output" | "provider_error";
export class AiError extends Error { constructor(public code: AiErrorCode, message: string, public retryable = false) { super(message); this.name = "AiError"; } }

export interface AiRequest { system: string; user: string; schema: z.ZodType; effort: "low" | "medium" | "high"; maxTokens: number; timeoutMs: number }
export interface AiResponse { text: string; model: string; inputTokens: number; outputTokens: number; stopReason: string | null }
/** The ONLY surface the rest of the app knows about: a provider turns (system, user, output schema) into JSON text. No tools, no browsing, no writes. */
export interface AiProvider { readonly name: string; readonly model: string; complete(req: AiRequest): Promise<AiResponse> }

export type AiProviderName = "anthropic" | "openai" | "gemini";
export const AI_PROVIDERS: AiProviderName[] = ["anthropic", "openai", "gemini"];
export const KEY_VAR: Record<AiProviderName, string> = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY", gemini: "GEMINI_API_KEY" };

export interface AiConfig { enabled: boolean; provider: AiProviderName | "none"; model: string; allowSensitive: boolean; maxOutputTokens: number; timeoutMs: number; apiKey: string | null }
const int = (v: string | undefined, d: number, min: number, max: number) => { const n = Number.parseInt(v ?? "", 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };

export function getAiConfig(env: Record<string, string | undefined> = process.env): AiConfig {
  const named = env.AI_PROVIDER?.trim().toLowerCase();
  const provider = (AI_PROVIDERS as string[]).includes(named ?? "") ? (named as AiProviderName) : "none";
  const apiKey = provider === "none" ? null : env[KEY_VAR[provider]]?.trim() || null;
  // Claude has a built-in default model; for the other providers the operator names the model explicitly (model names change often and are never guessed).
  const model = env.AI_MODEL?.trim() || (provider === "anthropic" ? "claude-opus-5-5" : "");
  return {
    provider, apiKey, model, enabled: provider !== "none" && !!apiKey && !!model && env.AI_ENABLED !== "false",
    allowSensitive: env.AI_ALLOW_SENSITIVE === "true",          // operator attests a legal basis / DPA with the provider exists
    maxOutputTokens: int(env.AI_MAX_OUTPUT_TOKENS, 4096, 256, 16000), timeoutMs: int(env.AI_TIMEOUT_MS, 60000, 5000, 180000),
  };
}
