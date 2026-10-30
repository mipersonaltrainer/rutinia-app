import { randomBytes } from "node:crypto";

export const MAX_FIELD = 400;

/** Control characters (except newline/tab) and bidi/zero-width tricks are removed before anything is sent to a model. */
export function stripControl(s: string): string {
  return s.normalize("NFKC").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, "");
}

/** Minimisation: obvious personal identifiers inside free text never leave the platform. */
export function redactPII(s: string): string {
  return s
    .replace(/https?:\/\/\S+/gi, "[enlace]")
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[correo]")
    .replace(/(\+?\d[\d\s().-]{6,}\d)/g, (m) => (m.replace(/\D/g, "").length >= 7 ? "[número]" : m));
}

const INJECTION: [string, RegExp][] = [
  ["ignore_instructions", /\b(ignor[ae]r?|olvid[ae]r?|omit[ae]r?|descart[ae]r?)\b.{0,40}\b(instruccion|regla|indicacion|prompt|anterior)/i],
  ["ignore_instructions_en", /\b(ignore|disregard|forget|override)\b.{0,40}\b(instruction|rule|prompt|previous|above|system)/i],
  ["role_change", /\b(ahora eres|a partir de ahora|act[uú]a como|finge (ser|que)|you are now|pretend to be|act as)\b/i],
  ["reveal_prompt", /\b(revela|muestra|imprime|repite|reveal|show|print|repeat)\b.{0,40}\b(prompt|instrucciones del sistema|system prompt|configuraci[oó]n|clave|api[ _-]?key|contrase[nñ]a|secret)/i],
  ["fake_tags", /<\/?\s*(system|assistant|user|instructions?|datos_no_confiables|tool|function)\b|<<<\s*(FIN_)?DATOS|\[\/?INST\]|<\|im_(start|end)\|>/i],
  ["tool_or_exfil", /\b(fetch|curl|http|webhook|exfiltr|enviar a|send (this|it|the data) to)\b.{0,40}(https?:|\.com|\.co\b|\.net)/i],
  ["jailbreak", /\b(jailbreak|DAN mode|developer mode|modo desarrollador|sin restricciones|no (tienes|hay) restricciones)\b/i],
  ["output_hijack", /\b(responde (solo|únicamente) con|respond only with|devuelve (todos|todas)|return (all|every))\b/i],
];
export function detectInjection(s: string): string[] { return INJECTION.filter(([, re]) => re.test(s)).map(([n]) => n); }

export interface Cleaned { text: string; flags: string[] }
/**
 * Cleans one untrusted free-text field. Text that looks like an instruction aimed at the model is DROPPED (not "defused"):
 * the primary defence is architectural (no tools, schema-validated output, deterministic validation, human approval), this just
 * keeps obvious attacks out of the prompt and tells the trainer.
 */
export function cleanUntrusted(raw: string | null | undefined, field: string, max = MAX_FIELD): Cleaned {
  const base = stripControl(String(raw ?? "")).trim();
  if (!base) return { text: "", flags: [] };
  const hits = detectInjection(base);
  if (hits.length) return { text: "[texto omitido: contenido sospechoso]", flags: [`injection_suspected:${field}`] };
  return { text: redactPII(base).slice(0, max), flags: [] };
}

export const newBoundary = () => randomBytes(9).toString("hex");

/** Untrusted/derived data is passed as ONE JSON blob inside a delimiter that carries a per-request random token the data cannot know. */
export function wrapData(label: string, data: unknown, boundary: string): string {
  const json = JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return `<<<DATOS:${boundary}:${label}>>>\n${json}\n<<<FIN_DATOS:${boundary}>>>`;
}

/** Output-side text rules shared by every feature: no links/markup (exfiltration channels), no code, no instruction echoes, no diagnosis. */
export function checkFreeText(text: string, max: number): string[] {
  const v: string[] = [];
  if (text.length > max) v.push(`texto demasiado largo (${text.length} > ${max})`);
  if (/https?:\/\/|www\.|\]\(|!\[/i.test(text)) v.push("contiene enlaces o markdown de imagen/enlace");
  if (/<[a-z/!][^>]*>|```/i.test(text)) v.push("contiene etiquetas o bloques de código");
  if (detectInjection(text).length) v.push("repite instrucciones sospechosas");
  if (/\b(tienes|padeces|sufres de|presentas)\s+(un|una|unos|unas)?\s*\w{0,20}\s*(hernia|tendinitis|desgarro|lesi[oó]n|artrosis|diabetes|hipertensi[oó]n|cardiopat[ií]a|depresi[oó]n|trastorno)/i.test(text) || /\b(te diagnostico|mi diagn[oó]stico|el diagn[oó]stico es)\b/i.test(text)) v.push("parece un diagnóstico médico");
  if (/\b(toma|tomar|suspende|suspender|deja de tomar|aumenta la dosis)\b.{0,30}\b(medicament|pastilla|f[aá]rmaco|tratamiento|dosis)/i.test(text)) v.push("da indicaciones sobre medicación");
  return v;
}

/** Every non-trivial number the model writes must exist in the data it was given (anti-invention). */
export function collectNumbers(data: unknown): Set<string> {
  const out = new Set<string>();
  const add = (n: string) => { out.add(n.replace(",", ".")); const f = Number(n.replace(",", ".")); if (Number.isFinite(f)) { out.add(String(f)); out.add(f.toFixed(1)); out.add(String(Math.round(f))); } };
  for (const m of JSON.stringify(data).matchAll(/-?\d+(?:[.,]\d+)?/g)) add(m[0].replace("-", ""));
  return out;
}
export function ungroundedNumbers(text: string, allowed: Set<string>): string[] {
  const bad: string[] = [];
  for (const m of text.matchAll(/\d+(?:[.,]\d+)?/g)) {
    const raw = m[0].replace(",", "."); const f = Number(raw);
    if (Number.isInteger(f) && f <= 12) continue;                 // small counts, weeks, ordinals
    if (/^(19|20)\d\d$/.test(raw)) continue;                      // years
    if (!allowed.has(raw) && !allowed.has(String(f)) && !allowed.has(f.toFixed(1))) bad.push(m[0]);
  }
  return [...new Set(bad)];
}
