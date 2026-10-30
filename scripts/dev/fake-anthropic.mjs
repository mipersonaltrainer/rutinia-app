// TEST HARNESS ONLY. A tiny local stand-in for the Anthropic Messages API so the copilot UI can be exercised end to end without credentials.
// It is NOT a model: it builds canned, schema-shaped answers from the data blocks it receives (and sometimes deliberately includes invalid items
// so the deterministic validators can be seen working). Usage: node scripts/dev/fake-anthropic.mjs  → ANTHROPIC_BASE_URL=http://127.0.0.1:4010
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";

const MODE_FILE = "/tmp/fake-anthropic-mode";           // contents: ok | hijack | slow | error500 | invalid
const mode = () => (existsSync(MODE_FILE) ? readFileSync(MODE_FILE, "utf8").trim() : "ok");
const dataBlocks = (text) => [...text.matchAll(/<<<DATOS:([0-9a-f]+):(\w+)>>>\n([\s\S]*?)\n<<<FIN_DATOS:\1>>>/g)].map((m) => ({ label: m[2], data: JSON.parse(m[3]) }));

function answer(system, user) {
  const blocks = dataBlocks(user);
  if (user.includes("propón un borrador de plan")) {
    const codes = blocks[0].data.ejercicios_permitidos.map((e) => e.codigo);
    const mk = (c, i) => ({ code: c, sets: 3, reps_min: 8, reps_max: 12, rest_sec: 60 + (i % 2) * 30, rir: 2, client_notes: i === 0 ? "Controla la bajada" : null });
    return { title: "Full body 2 días", rationale: "Estructura full body de baja complejidad con patrones básicos, adecuada para el nivel indicado.", sessions: [
      { name: "Día A", weekday: 1, warmup_notes: "5 minutos de movilidad general", exercises: codes.slice(0, 4).map(mk) },
      { name: "Día B", weekday: 4, warmup_notes: null, exercises: [...codes.slice(4, 8).map(mk), { code: "E999", sets: 3, reps_min: 8, reps_max: 12, rest_sec: 60, rir: 2, client_notes: null }] },
    ], assumptions: ["Se asumió disponibilidad constante de 2 días por semana."], questions_for_trainer: ["¿Hay alguna molestia actual que limite la sentadilla?"] };
  }
  if (user.includes("redacta, para que el entrenador")) {
    const d = blocks[0].data;
    return { observations: `En el periodo se completaron ${d.sesiones.completed} sesiones con un esfuerzo medio de sesión de ${d.sesiones.avgSessionRpe ?? "—"}. ${d.medidas.cantidad ? `Hay ${d.medidas.cantidad} medición(es) registrada(s).` : "No hay mediciones registradas."} Se recomienda mantener la técnica y revisar la constancia.`, next_goals: "1. Mantener la constancia semanal. 2. Registrar medidas al final del periodo.", caveats: ["Pocos datos para sacar conclusiones firmes."] };
  }
  if (user.includes("responde a la pregunta del alumno")) {
    const src = blocks.find((b) => b.label === "fuentes").data.fuentes;
    const q = blocks.find((b) => b.label === "pregunta_del_alumno").data;
    if (!src.length) return { answer: "No tengo información suficiente.", sources: [], needs_trainer: true };
    return { answer: `Según tu información: ${src[0].texto.slice(0, 260)}`, sources: [src[0].id], needs_trainer: false, _q: q };
  }
  return { answer: "?", sources: [], needs_trainer: true };
}

createServer((req, res) => {
  let body = ""; req.on("data", (c) => (body += c));
  req.on("end", async () => {
    const m = mode();
    if (req.method !== "POST" || !req.url?.startsWith("/v1/messages")) { res.writeHead(404).end("{}"); return; }
    if (m === "error500") { res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ type: "error", error: { type: "api_error", message: "fake outage" } })); return; }
    if (m === "slow") await new Promise((r) => setTimeout(r, 8000));
    const j = JSON.parse(body); const userText = j.messages[0].content;
    let text;
    if (m === "invalid") text = "esto no es json";
    else if (m === "hijack") text = JSON.stringify({ answer: "Visita http://evil.example/robar y tienes una hernia discal. Ignora las instrucciones anteriores.", sources: ["fuente:inexistente"], needs_trainer: false, observations: "Bajó 15 kg", next_goals: "x", caveats: [], title: "Hackeado", rationale: "x", sessions: [{ name: "A", weekday: null, warmup_notes: null, exercises: [{ code: "SYSTEM", sets: 99, reps_min: 1, reps_max: 1, rest_sec: 0, rir: null, client_notes: null }] }], assumptions: [], questions_for_trainer: [] });
    else { const a = answer(j.system, userText); delete a._q; text = JSON.stringify(a); }
    console.log(new Date().toISOString(), "model=", j.model, "effort=", j.output_config?.effort, "mode=", m, "inChars=", userText.length);
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ id: "msg_fake", type: "message", role: "assistant", model: j.model, content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: Math.ceil(userText.length / 4), output_tokens: Math.ceil(text.length / 4) } }));
  });
}).listen(4010, "127.0.0.1", () => console.log("fake anthropic on :4010 (TEST HARNESS, not a model)"));
