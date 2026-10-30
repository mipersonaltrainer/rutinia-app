import { AiError, type AiConfig, type AiProvider, type AiRequest, type AiResponse } from "./provider";
import { jsonSchemaOf, postJson } from "./http";

/** Adapter for OpenAI Chat Completions with strict structured outputs. The model name comes from AI_MODEL. */
export function createOpenAiProvider(cfg: AiConfig, fetchImpl: typeof fetch = fetch): AiProvider {
  if (!cfg.apiKey) throw new AiError("not_configured", "OPENAI_API_KEY is missing");
  return {
    name: "openai", model: cfg.model,
    async complete(req: AiRequest): Promise<AiResponse> {
      const j = await postJson("https://api.openai.com/v1/chat/completions", { authorization: `Bearer ${cfg.apiKey}` }, {
        model: cfg.model, max_completion_tokens: req.maxTokens,
        messages: [{ role: "system", content: req.system }, { role: "user", content: req.user }],
        response_format: { type: "json_schema", json_schema: { name: "respuesta", strict: true, schema: jsonSchemaOf(req.schema) } },
      }, req.timeoutMs, fetchImpl);
      const choice = (j.choices as { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[] | undefined)?.[0];
      if (!choice) throw new AiError("invalid_output", "El proveedor no devolvió texto.");
      if (choice.message?.refusal || choice.finish_reason === "content_filter") throw new AiError("refusal", "El proveedor rechazó la solicitud.");
      if (choice.finish_reason === "length") throw new AiError("truncated", "La respuesta se cortó antes de terminar.");
      const text = choice.message?.content ?? ""; if (!text) throw new AiError("invalid_output", "El proveedor no devolvió texto.");
      const u = j.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
      return { text, model: String(j.model ?? cfg.model), inputTokens: u?.prompt_tokens ?? 0, outputTokens: u?.completion_tokens ?? 0, stopReason: choice.finish_reason ?? null };
    },
  };
}
