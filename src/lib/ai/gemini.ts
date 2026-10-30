import { AiError, type AiConfig, type AiProvider, type AiRequest, type AiResponse } from "./provider";
import { jsonSchemaOf, postJson } from "./http";

/** Adapter for Google Gemini (generateContent with a JSON response schema). The model name comes from AI_MODEL. */
export function createGeminiProvider(cfg: AiConfig, fetchImpl: typeof fetch = fetch): AiProvider {
  if (!cfg.apiKey) throw new AiError("not_configured", "GEMINI_API_KEY is missing");
  return {
    name: "gemini", model: cfg.model,
    async complete(req: AiRequest): Promise<AiResponse> {
      const j = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`, { "x-goog-api-key": cfg.apiKey! }, {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: "user", parts: [{ text: req.user }] }],
        generationConfig: { responseMimeType: "application/json", responseJsonSchema: jsonSchemaOf(req.schema), maxOutputTokens: req.maxTokens },
      }, req.timeoutMs, fetchImpl);
      if ((j.promptFeedback as { blockReason?: string } | undefined)?.blockReason) throw new AiError("refusal", "El proveedor rechazó la solicitud.");
      const cand = (j.candidates as { content?: { parts?: { text?: string }[] }; finishReason?: string }[] | undefined)?.[0];
      if (!cand) throw new AiError("invalid_output", "El proveedor no devolvió texto.");
      if (cand.finishReason === "MAX_TOKENS") throw new AiError("truncated", "La respuesta se cortó antes de terminar.");
      if (cand.finishReason && /SAFETY|PROHIBITED|BLOCKLIST|RECITATION/.test(cand.finishReason)) throw new AiError("refusal", "El proveedor rechazó la solicitud.");
      const text = (cand.content?.parts ?? []).map((p) => p.text ?? "").join(""); if (!text) throw new AiError("invalid_output", "El proveedor no devolvió texto.");
      const u = j.usageMetadata as { promptTokenCount?: number; candidatesTokenCount?: number } | undefined;
      return { text, model: String(j.modelVersion ?? cfg.model), inputTokens: u?.promptTokenCount ?? 0, outputTokens: u?.candidatesTokenCount ?? 0, stopReason: cand.finishReason ?? null };
    },
  };
}
