import { describe, it, expect } from "vitest";
import { agoEs, buildSummary, type DLog } from "@/lib/dashboard/summary";

const now = new Date("2026-10-21T15:00:00Z");       // a Wednesday in Bogotá
const iso = (daysAgo: number, h = 0) => new Date(now.getTime() - daysAgo * 86400000 - h * 3600000).toISOString();
const log = (client: string, session: string, daysAgo: number, extra: Partial<DLog> = {}): DLog => ({ client_id: client, session_id: session, session_name: `Sesión ${session}`, finished_at: iso(daysAgo), pain_level: 0, session_rpe: 6, ...extra });
const base = { now, clients: [{ id: "a", name: "Ana" }, { id: "b", name: "Beto" }, { id: "c", name: "Carla" }, { id: "d", name: "Dani" }], plans: [{ client_id: "a", version_id: "va" }, { client_id: "b", version_id: "vb" }, { client_id: "d", version_id: "vd" }], sessionsPerVersion: { va: 3, vb: 2, vd: 2 }, proRecommendationClients: new Set<string>() };

describe("resumen del panel del entrenador", () => {
  it("adherencia semanal = sesiones distintas completadas ÷ sesiones planeadas, con tope por alumno", () => {
    const s = buildSummary({ ...base, logs: [log("a", "s1", 0, {}), log("a", "s1", 0, {}), log("a", "s2", 1), log("b", "t1", 1), log("b", "t2", 0), log("b", "t3", 0)] });
    expect(s.adherence).toEqual({ pct: 57, completed: 4, planned: 7 });   // a: 2 of 3, b: 3 sessions done but capped at its 2 planned, d: 0 of 2
  });
  it("sin planes no hay porcentaje inventado", () => { expect(buildSummary({ ...base, plans: [], sessionsPerVersion: {}, logs: [] }).adherence.pct).toBeNull(); });
  it("clasifica a cada alumno y pone primero a quien hay que revisar", () => {
    const s = buildSummary({ ...base, logs: [log("a", "s1", 2, { pain_level: 7 }), log("b", "t1", 1), log("d", "x", 20)], proRecommendationClients: new Set() });
    const by = Object.fromEntries(s.clients.map((c) => [c.name, c.status]));
    expect(by).toEqual({ Ana: "review", Beto: "ok", Carla: "no_plan", Dani: "inactive" });
    expect(s.clients[0].name).toBe("Ana"); expect(s.clients.at(-1)!.name).toBe("Beto");
    expect(s.clients.find((c) => c.name === "Ana")!.reason).toMatch(/Dolor 7\/10/);
  });
  it("una propuesta profesional pendiente marca revisión aunque entrene", () => {
    expect(buildSummary({ ...base, logs: [log("b", "t1", 1)], proRecommendationClients: new Set(["b"]) }).clients.find((c) => c.name === "Beto")!.status).toBe("review");
  });
  it("serie de 8 semanas, actividad de hoy y recientes ordenados", () => {
    const s = buildSummary({ ...base, logs: [log("a", "s1", 0, { }), log("a", "s2", 9), log("b", "t1", 30)] });
    expect(s.weekly).toHaveLength(8); expect(s.weekly[7].count).toBe(1); expect(s.weekly.reduce((a, w) => a + w.count, 0)).toBe(3);
    expect(s.today.count).toBe(1); expect(s.today.recent[0].client).toBe("Ana");
  });
  it("hace cuánto", () => { expect(agoEs(iso(0, 0.5), now)).toBe("hace 30 min"); expect(agoEs(iso(0, 5), now)).toBe("hace 5 h"); expect(agoEs(iso(3), now)).toBe("hace 3 d"); });
});
