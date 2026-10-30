// Requires local Supabase (with the food library loaded: npm run foods:seed). Run: npm run test:int
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(); const pw = "Test-Pass-12345"; const created: string[] = [];
async function mk(email: string, client = false) { const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, app_metadata: client ? { role: "client" } : {} }); if (error) throw error; created.push(data.user.id); return data.user.id; }
async function login(email: string) { const c = createClient(URL, ANON, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email, password: pw }); if (error) throw error; return c; }

let t1: string, c1: string, c2: string, T1: SupabaseClient, T2: SupabaseClient, C1: SupabaseClient, C2: SupabaseClient, food: string;

beforeAll(async () => {
  t1 = await mk(`nt1-${run}@x.co`); await mk(`nt2-${run}@x.co`); c1 = await mk(`nc1-${run}@x.co`, true); c2 = await mk(`nc2-${run}@x.co`, true);
  await admin.from("trainer_client_relationships").insert([{ trainer_id: t1, client_id: c1 }, { trainer_id: t1, client_id: c2 }]);
  await admin.from("consents").insert([c1, c2].flatMap((u) => ["personal_data", "health_data", "share_with_trainer"].map((type) => ({ user_id: u, type }))));
  T1 = await login(`nt1-${run}@x.co`); T2 = await login(`nt2-${run}@x.co`); C1 = await login(`nc1-${run}@x.co`); C2 = await login(`nc2-${run}@x.co`);
  food = (await admin.from("foods").select("id").is("owner_id", null).limit(1).single()).data!.id;
});
afterAll(async () => { for (const id of created) await admin.auth.admin.deleteUser(id); });

const mkPlan = (T: SupabaseClient, trainer: string, client: string) => T.from("nutrition_plans").insert({ trainer_id: trainer, client_id: client, title: "Plan de prueba", kcal_target: 2000 }).select("id").single();

describe("nutrición: el entrenador decide quién la tiene", () => {
  it("por defecto ningún alumno tiene nutrición y no se puede crear un plan", async () => {
    const r = await mkPlan(T1, t1, c1); expect(r.error).not.toBeNull();
  });
  it("solo el entrenador del alumno puede activarla; otro entrenador recibe error", async () => {
    expect((await T2.rpc("set_client_nutrition", { p_client: c1, p_enabled: true })).error).not.toBeNull();
    expect((await C1.rpc("set_client_nutrition", { p_client: c1, p_enabled: true })).error).not.toBeNull();
    expect((await T1.rpc("set_client_nutrition", { p_client: c1, p_enabled: true })).error).toBeNull();
    const { data } = await admin.from("trainer_client_relationships").select("client_id,nutrition_enabled").eq("trainer_id", t1); expect(data!.find((r) => r.client_id === c1)!.nutrition_enabled).toBe(true); expect(data!.find((r) => r.client_id === c2)!.nutrition_enabled).toBe(false);
  });
  it("con nutrición activada se crea el plan solo para ese alumno; para el otro sigue bloqueado", async () => {
    expect((await mkPlan(T1, t1, c1)).error).toBeNull(); expect((await mkPlan(T1, t1, c2)).error).not.toBeNull();
  });
});

describe("nutrición: quién ve qué", () => {
  let plan: string, meal: string;
  beforeAll(async () => {
    plan = (await admin.from("nutrition_plans").select("id").eq("client_id", c1).single()).data!.id;
    meal = (await T1.from("nutrition_meals").insert({ plan_id: plan, position: 1, name: "Desayuno" }).select("id").single()).data!.id;
    expect((await T1.from("nutrition_items").insert({ meal_id: meal, food_id: food, grams: 120 })).error).toBeNull();
  });
  it("el alumno no ve un borrador; al publicarlo sí; otro alumno y otro entrenador nunca", async () => {
    expect((await C1.from("nutrition_plans").select("id")).data).toEqual([]);
    expect((await C1.from("nutrition_items").select("id")).data).toEqual([]);
    expect((await T1.from("nutrition_plans").update({ status: "published", published_at: new Date().toISOString() }).eq("id", plan)).error).toBeNull();
    expect((await C1.from("nutrition_plans").select("id")).data!.length).toBe(1);
    expect((await C1.from("nutrition_meals").select("id")).data!.length).toBe(1); expect((await C1.from("nutrition_items").select("id")).data!.length).toBe(1);
    expect((await C2.from("nutrition_plans").select("id")).data).toEqual([]); expect((await T2.from("nutrition_plans").select("id")).data).toEqual([]); expect((await T2.from("nutrition_items").select("id")).data).toEqual([]);
  });
  it("el alumno no puede modificar su plan", async () => {
    await C1.from("nutrition_items").update({ grams: 999 }).eq("meal_id", meal); await C1.from("nutrition_plans").update({ title: "hack" }).eq("id", plan);
    const { data } = await admin.from("nutrition_items").select("grams").eq("meal_id", meal).single(); expect(Number(data!.grams)).toBe(120);
    expect((await admin.from("nutrition_plans").select("title").eq("id", plan).single()).data!.title).toBe("Plan de prueba");
  });
  it("si el entrenador desactiva la nutrición, el alumno deja de ver el plan al instante", async () => {
    await T1.rpc("set_client_nutrition", { p_client: c1, p_enabled: false });
    expect((await C1.from("nutrition_plans").select("id")).data).toEqual([]); expect((await C1.from("nutrition_items").select("id")).data).toEqual([]);
    await T1.rpc("set_client_nutrition", { p_client: c1, p_enabled: true });
  });
  it("si el alumno retira el permiso de compartir, el entrenador deja de ver su plan", async () => {
    await admin.from("consents").update({ revoked_at: new Date().toISOString() }).eq("user_id", c1).eq("type", "share_with_trainer");
    expect((await T1.from("nutrition_plans").select("id").eq("client_id", c1)).data).toEqual([]);
    await admin.from("consents").update({ revoked_at: null }).eq("user_id", c1).eq("type", "share_with_trainer");
  });
  it("un solo plan publicado por alumno", async () => {
    const second = await T1.from("nutrition_plans").insert({ trainer_id: t1, client_id: c1, title: "Otro", status: "published" }); expect(second.error).not.toBeNull();
  });
  it("las cantidades absurdas se rechazan", async () => {
    expect((await T1.from("nutrition_items").insert({ meal_id: meal, food_id: food, grams: 99999 })).error).not.toBeNull();
    expect((await T1.from("nutrition_items").insert({ meal_id: meal, food_id: food, grams: 0 })).error).not.toBeNull();
  });
});

describe("alimentos", () => {
  it("la biblioteca global es legible por usuarios con sesión y no por anónimos", async () => {
    expect((await T1.from("foods").select("id", { count: "exact", head: true })).count).toBeGreaterThan(80);
    const anon = createClient(URL, ANON, { auth: { persistSession: false } }); expect((await anon.from("foods").select("id")).data ?? []).toEqual([]);
  });
  it("nadie puede alterar la biblioteca global; un entrenador tiene sus propios alimentos", async () => {
    await T1.from("foods").update({ kcal_100: 1 }).eq("id", food); expect(Number((await admin.from("foods").select("kcal_100").eq("id", food).single()).data!.kcal_100)).not.toBe(1);
    expect((await T1.from("foods").insert({ owner_id: t1, slug: `mio-${run}`, name_es: "Mi receta", category: "preparados", kcal_100: 100, protein_100: 5, carbs_100: 10, fat_100: 3 })).error).toBeNull();
    expect((await T2.from("foods").select("id").eq("slug", `mio-${run}`)).data).toEqual([]);
    expect((await T1.from("foods").insert({ owner_id: null, slug: `glob-${run}`, name_es: "Global falso", category: "otros", kcal_100: 1, protein_100: 0, carbs_100: 0, fat_100: 0 })).error).not.toBeNull();
  });
  it("las funciones nuevas no se pueden ejecutar de forma anónima", async () => {
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    expect((await anon.rpc("set_client_nutrition", { p_client: c1, p_enabled: true })).error).not.toBeNull();
  });
});
