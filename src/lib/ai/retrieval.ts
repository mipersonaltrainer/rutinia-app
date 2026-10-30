import type { Source } from "./faq";

const STOP = new Set(["el", "la", "los", "las", "de", "del", "en", "un", "una", "y", "o", "que", "como", "para", "por", "con", "mi", "mis", "me", "es", "se", "al", "lo", "a", "esta", "este", "puedo", "hago", "debo", "cual", "cuales", "cuando", "donde"]);
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9ñ ]+/g, " ");
export const tokens = (s: string) => new Set(norm(s).split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t)));

/** Deterministic lexical retrieval over trusted sources; the model (if any) only gets what this returns. */
export function retrieve(question: string, sources: (Source & { keywords?: string[] })[], limit = 4): Source[] {
  const q = tokens(question); if (!q.size) return [];
  const scored = sources.map((s) => {
    const title = tokens(s.title), body = tokens(s.text), kw = new Set((s.keywords ?? []).map((k) => norm(k).trim()));
    let score = 0; for (const t of q) { if (title.has(t)) score += 3; if (kw.has(t)) score += 3; if (body.has(t)) score += 1; for (const k of kw) if (k.length > 3 && (t.startsWith(k) || k.startsWith(t)) && t !== k) score += 1; }
    return { s, score };
  }).filter((x) => x.score >= 2).sort((a, b) => b.score - a.score || a.s.id.localeCompare(b.s.id));
  return scored.slice(0, limit).map(({ s }) => ({ id: s.id, kind: s.kind, title: s.title, text: s.text }));
}
