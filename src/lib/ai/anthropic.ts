import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createOpenAiProvider } from "./openai";
import { createGeminiProvider } from "./gemini";
import { AiError, type AiConfig, type AiProvider, type AiRequest, type AiResponse } from "./provider";

/** Adapter for Anthropic's Messages API through the official SDK. Honors ANTHROPIC_BASE_URL (used only to point tests at a local fake server). */
export function createAnthropicProvider(cfg: AiConfig, client?: Anthropic): AiProvider {
  if (!cfg.apiKey && !client) throw new AiError("not_configured", "ANTHROPIC_API_KEY is missing");
  const sdk = client ?? new Anthropic({ apiKey: cfg.apiKey!, maxRetries: 1 });
  return {
    name: "anthropic", model: cfg.model,
    async complete(req: AiRequest): Promise<AiResponse> {
      try {
        const msg = await sdk.messages.create({
          model: cfg.model, max_tokens: req.maxTokens, system: req.system,
          messages: [{ role: "user", content: req.user }],
          output_config: { effort: req.effort, format: zodOutputFormat(req.schema as never) },
        }, { timeout: req.timeoutMs });
        if (msg.stop_reason === "refusal") throw new AiError("refusal", "El proveedor rechazó la solicitud.");
        if (msg.stop_reason === "max_tokens") throw new AiError("truncated", "La respuesta se cortó antes de terminar.");
        const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
        if (!text) throw new AiError("invalid_output", "El proveedor no devolvió texto.");
        return { text, model: msg.model, inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens, stopReason: msg.stop_reason };
      } catch (e) {
        if (e instanceof AiError) throw e;
        if (e instanceof Anthropic.APIConnectionTimeoutError) throw new AiError("timeout", "El proveedor tardó demasiado.", true);
        if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new AiError("auth", "Credenciales del proveedor inválidas.");
        if (e instanceof Anthropic.RateLimitError) throw new AiError("rate_limited_provider", "El proveedor está limitando las solicitudes.", true);
        if (e instanceof Anthropic.APIError) throw new AiError("provider_error", `Error del proveedor (${e.status ?? "red"}).`, (e.status ?? 500) >= 500);
        throw new AiError("provider_error", "No se pudo contactar al proveedor.", true);
      }
    },
  };
}

export function createProvider(cfg: AiConfig): AiProvider | null {
  if (!cfg.enabled) return null;
  if (cfg.provider === "anthropic") return createAnthropicProvider(cfg);
  if (cfg.provider === "openai") return createOpenAiProvider(cfg);
  if (cfg.provider === "gemini") return createGeminiProvider(cfg);
  return null;
}
