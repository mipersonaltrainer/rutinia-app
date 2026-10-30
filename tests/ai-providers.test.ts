import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { AiError, getAiConfig, type AiConfig, type AiRequest } from "@/lib/ai/provider";
import { createOpenAiProvider } from "@/lib/ai/openai";
import { createGeminiProvider } from "@/lib/ai/gemini";
import { createProvider } from "@/lib/ai/anthropic";
import { checkEnv } from "@/lib/env";

const schema = z.object({ answer: z.string(), n: z.number().nullable() });
const req: AiRequest = { system: "sys", user: "hola", schema, effort: "medium", maxTokens: 500, timeoutMs: 5000 };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const cfgOf = (provider: "openai" | "gemini", model: string): AiConfig => ({ enabled: true, provider, model, allowSensitive: true, maxOutputTokens: 4096, timeoutMs: 5000, apiKey: "k-test" });
const rig = (resp: () => Response | Promise<Response>) => { const calls: { url: string; body: Record<string, unknown>; headers: Headers }[] = []; const f = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => { calls.push({ url: String(url), body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) }); return resp(); }); return { calls, f: f as unknown as typeof fetch }; };

describe("configuración multi-proveedor", () => {
  it("elige el proveedor y su clave; los modelos de OpenAI y Gemini no se adivinan", () => {
    expect(getAiConfig({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k" })).toMatchObject({ enabled: true, provider: "anthropic", model: "claude-opus-5-5" });
    expect(getAiConfig({ AI_PROVIDER: "openai", OPENAI_API_KEY: "k" }).enabled).toBe(false);                       // sin AI_MODEL
    expect(getAiConfig({ AI_PROVIDER: "openai", OPENAI_API_KEY: "k", AI_MODEL: "m1" })).toMatchObject({ enabled: true, provider: "openai", model: "m1", apiKey: "k" });
    expect(getAiConfig({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "g", AI_MODEL: "m2" })).toMatchObject({ enabled: true, provider: "gemini" });
    expect(getAiConfig({ AI_PROVIDER: "openai", ANTHROPIC_API_KEY: "k", AI_MODEL: "m" }).enabled).toBe(false);     // la clave de otro proveedor no sirve
    expect(getAiConfig({ AI_PROVIDER: "otro", ANTHROPIC_API_KEY: "k" }).enabled).toBe(false);
    expect(getAiConfig({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "g", AI_MODEL: "m", AI_ENABLED: "false" }).enabled).toBe(false);
  });
  it("la fábrica devuelve el adaptador correcto", () => {
    expect(createProvider(cfgOf("openai", "m"))?.name).toBe("openai"); expect(createProvider(cfgOf("gemini", "m"))?.name).toBe("gemini");
  });
  it("la validación de arranque exige modelo y clave del proveedor elegido", () => {
    const e = (env: Record<string, string>) => checkEnv({ NODE_ENV: "production", ...env } as never);
    expect(e({ AI_PROVIDER: "openai", OPENAI_API_KEY: "k" }).errors.join()).toMatch(/AI_MODEL/);
    expect(e({ AI_PROVIDER: "gemini", AI_MODEL: "m" }).errors.join()).toMatch(/GEMINI_API_KEY/);
    expect(e({ AI_PROVIDER: "foo" }).errors.join()).toMatch(/no es válido/);
    expect(e({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "g", AI_MODEL: "m", OPENAI_API_KEY: "x" }).warnings.join()).toMatch(/OPENAI_API_KEY/);
  });
});

describe("OpenAI", () => {
  const ok = { model: "m1", choices: [{ message: { content: '{"answer":"hola","n":null}' }, finish_reason: "stop" }], usage: { prompt_tokens: 11, completion_tokens: 7 } };
  it("envía el esquema estricto, la clave en la cabecera y devuelve texto y tokens", async () => {
    const { calls, f } = rig(() => json(ok)); const r = await createOpenAiProvider(cfgOf("openai", "m1"), f).complete(req);
    expect(r).toMatchObject({ text: '{"answer":"hola","n":null}', inputTokens: 11, outputTokens: 7 });
    expect(calls[0].url).toBe("https://api.openai.com/v1/chat/completions"); expect(calls[0].headers.get("authorization")).toBe("Bearer k-test");
    const b = calls[0].body as { response_format: { json_schema: { strict: boolean; schema: Record<string, unknown> } }; messages: { role: string }[] };
    expect(b.response_format.json_schema.strict).toBe(true); expect(b.response_format.json_schema.schema).not.toHaveProperty("$schema"); expect(b.response_format.json_schema.schema.additionalProperties).toBe(false);
    expect(b.messages.map((m) => m.role)).toEqual(["system", "user"]);
  });
  it("traduce rechazos, cortes y errores HTTP a errores tipados sin filtrar texto del proveedor", async () => {
    const code = async (r: () => Response) => { try { await createOpenAiProvider(cfgOf("openai", "m"), rig(r).f).complete(req); return "no error"; } catch (e) { expect(e).toBeInstanceOf(AiError); expect((e as AiError).message).not.toMatch(/secret|detalle/i); return (e as AiError).code; } };
    expect(await code(() => json({ choices: [{ message: { content: null, refusal: "no" }, finish_reason: "stop" }] }))).toBe("refusal");
    expect(await code(() => json({ choices: [{ message: { content: "{" }, finish_reason: "length" }] }))).toBe("truncated");
    expect(await code(() => json({ choices: [{ message: { content: "" }, finish_reason: "stop" }] }))).toBe("invalid_output");
    expect(await code(() => json({ error: { message: "secret detalle" } }, 401))).toBe("auth"); expect(await code(() => json({}, 429))).toBe("rate_limited_provider"); expect(await code(() => json({}, 500))).toBe("provider_error");
    expect(await code(() => { throw new TypeError("fetch failed"); })).toBe("provider_error");
  });
});

describe("Gemini", () => {
  const ok = { modelVersion: "m2", candidates: [{ content: { parts: [{ text: '{"answer":"hola","n":3}' }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 4 } };
  it("usa la clave por cabecera (no en la URL), pide JSON con esquema y devuelve texto y tokens", async () => {
    const { calls, f } = rig(() => json(ok)); const r = await createGeminiProvider(cfgOf("gemini", "m2"), f).complete(req);
    expect(r).toMatchObject({ text: '{"answer":"hola","n":3}', inputTokens: 9, outputTokens: 4 });
    expect(calls[0].url).toBe("https://generativelanguage.googleapis.com/v1beta/models/m2:generateContent"); expect(calls[0].url).not.toContain("k-test"); expect(calls[0].headers.get("x-goog-api-key")).toBe("k-test");
    const g = (calls[0].body as { generationConfig: { responseMimeType: string; responseJsonSchema: Record<string, unknown>; maxOutputTokens: number } }).generationConfig;
    expect(g.responseMimeType).toBe("application/json"); expect(g.responseJsonSchema).not.toHaveProperty("$schema"); expect(g.maxOutputTokens).toBe(500);
  });
  it("traduce bloqueos, cortes y errores HTTP", async () => {
    const code = async (r: () => Response) => { try { await createGeminiProvider(cfgOf("gemini", "m"), rig(r).f).complete(req); return "no error"; } catch (e) { return (e as AiError).code; } };
    expect(await code(() => json({ promptFeedback: { blockReason: "SAFETY" } }))).toBe("refusal");
    expect(await code(() => json({ candidates: [{ finishReason: "SAFETY" }] }))).toBe("refusal");
    expect(await code(() => json({ candidates: [{ content: { parts: [{ text: "{" }] }, finishReason: "MAX_TOKENS" }] }))).toBe("truncated");
    expect(await code(() => json({ candidates: [] }))).toBe("invalid_output"); expect(await code(() => json({}, 403))).toBe("auth"); expect(await code(() => json({}, 429))).toBe("rate_limited_provider");
  });
  it("un modelo con caracteres raros no puede alterar la URL", async () => {
    const { calls, f } = rig(() => json(ok)); await createGeminiProvider(cfgOf("gemini", "x/../evil?k=1"), f).complete(req);
    expect(new URL(calls[0].url).pathname).toBe("/v1beta/models/x%2F..%2Fevil%3Fk%3D1:generateContent");
  });
});
