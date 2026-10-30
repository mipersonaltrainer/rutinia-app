// Requires local Supabase. Run: npm run test:int
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseFilters } from "@/lib/exercises/filters";
import { searchExercises } from "@/lib/exercises/search";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(); const pw = "Test-Pass-12345"; let uid = ""; let T: SupabaseClient;

beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({ email: `search-${run}@x.co`, password: pw, email_confirm: true }); if (error) throw error; uid = data.user.id;
  T = createClient(URL, ANON, { auth: { persistSession: false } }); await T.auth.signInWithPassword({ email: `search-${run}@x.co`, password: pw });
});
afterAll(async () => { await admin.auth.admin.deleteUser(uid); });
const find = (sp: Record<string, string>) => searchExercises(T, parseFilters(sp), uid);

describe("buscador de ejercicios contra la biblioteca real", () => {
  it("«press» devuelve muchos ejercicios, los de nombre más relevante primero", async () => {
    const r = await find({ q: "press" }); expect(r.total).toBeGreaterThan(40); expect(r.rows[0].name_es.toLowerCase()).toContain("press");
  });
  it("buscar por músculo, equipo o plural en lenguaje natural funciona sin filtros", async () => {
    expect((await find({ q: "biceps" })).total).toBeGreaterThan(10); expect((await find({ q: "mancuernas" })).total).toBeGreaterThan(30); expect((await find({ q: "pecho" })).total).toBeGreaterThan(20);
    expect((await find({ q: "chest" })).total).toBeGreaterThan(20);                 // English terms too
  });
  it("las variantes de inclinación existen y se filtran", async () => {
    for (const a of ["flat", "incline", "decline"]) { const r = await find({ q: "press", angle: a }); expect(r.total, a).toBeGreaterThanOrEqual(3); expect(r.rows.every((x) => x.bench_angle === a), a).toBe(true); }
    expect((await find({ angle: "decline" })).total).toBeGreaterThanOrEqual(8);
  });
  it("la combinación del caso real (press + pecho + máquina + avanzado + empuje horizontal) no deja al entrenador sin salida", async () => {
    const r = await find({ q: "press", muscle: "chest", equipment: "machine", level: "advanced", pattern: "push_horizontal" });
    expect(r.total).toBe(0); expect(r.relaxations.length).toBeGreaterThan(0); expect(r.relaxations[0].count).toBeGreaterThan(0);
    expect(r.suggested?.rows.length).toBeGreaterThan(0);
  });
  it("sin filtros activos y sin texto no hay nada que relajar", async () => { const r = await find({}); expect(r.total).toBeGreaterThan(600); expect(r.suggested).toBeNull(); });
});
