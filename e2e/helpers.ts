import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";

export const PASSWORD = "E2e-Local-Pass-12345";                 // local-only test credential for users these specs create
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL)) throw new Error(`E2E refuses to run against a non-local database: ${URL}`);
export const admin: SupabaseClient = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const run = `${Date.now()}`;
export type World = { trainerId: string; clientId: string; trainerEmail: string; clientEmail: string; clientName: string };

/** A trainer (trial active) with one linked client who has granted the consents needed to chat. Emails end in @x.co so the purge script removes them. */
export async function createWorld(tag: string): Promise<World> {
  const trainerEmail = `e2e-${tag}-t-${run}@x.co`, clientEmail = `e2e-${tag}-c-${run}@x.co`;
  const mk = async (email: string, name: string, client: boolean) => {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name }, app_metadata: client ? { role: "client" } : {} });
    if (error) throw error; return data.user.id;
  };
  const trainerId = await mk(trainerEmail, `Entrenadora ${tag}`, false);
  const clientName = `Alumno ${tag}`;
  const clientId = await mk(clientEmail, clientName, true);
  await admin.from("profiles").update({ full_name: `Entrenadora ${tag}` }).eq("id", trainerId);
  await admin.from("profiles").update({ full_name: clientName }).eq("id", clientId);
  const rel = await admin.from("trainer_client_relationships").insert({ trainer_id: trainerId, client_id: clientId }); if (rel.error) throw rel.error;
  const cons = await admin.from("consents").insert(["health_data", "share_with_trainer"].map((type) => ({ user_id: clientId, type }))); if (cons.error) throw cons.error;
  return { trainerId, clientId, trainerEmail, clientEmail, clientName };
}

export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));      // the session cookie is set before the redirect lands
}

/** Collects every CSP violation a page reports, so a spec can assert the flow ran under an enforced policy without any. */
export function watchCsp(page: Page): string[] {
  const out: string[] = [];
  page.on("console", (m) => { if (/Content Security Policy|violates the following/i.test(m.text())) out.push(m.text().slice(0, 200)); });
  return out;
}

/** A Supabase client signed in as a real user (RLS applies): lets specs set up data through the same RPCs the app uses. */
export async function asUser(email: string): Promise<SupabaseClient> {
  const c = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD }); if (error) throw error;
  return c;
}

export type PlanFixture = { planId: string; versionId: string; sessionId: string; sessionName: string; exercises: { prescribedId: string; exerciseId: string; name: string; sets: number }[] };

/** Published plan for the world's client: one session, two library exercises, 2 sets each. Built with the trainer's own session via the app's RPCs. */
export async function publishPlan(w: World): Promise<PlanFixture> {
  const T = await asUser(w.trainerEmail);
  const { data: lib } = await admin.from("exercises").select("id,name_es").is("owner_id", null).order("slug").limit(2);
  if (!lib || lib.length < 2) throw new Error("exercise library is empty: run npm run exercises:seed");
  const pid = await T.rpc("create_plan", { p_title: "Plan E2E", p_goal: null, p_level: "beginner", p_client: w.clientId }); if (pid.error) throw pid.error;
  const v = (await admin.from("plan_versions").select("id").eq("plan_id", pid.data).eq("status", "draft").single()).data!.id as string;
  const sess = await T.from("plan_sessions").insert({ version_id: v, position: 1, name: "Sesión E2E" }).select().single(); if (sess.error) throw sess.error;
  const exercises: PlanFixture["exercises"] = [];
  for (const [i, e] of lib.entries()) {
    const pe = await T.from("prescribed_exercises").insert({ session_id: sess.data.id, position: i + 1, exercise_id: e.id, sets: 2, reps_min: 8, reps_max: 10 }).select().single(); if (pe.error) throw pe.error;
    exercises.push({ prescribedId: pe.data.id, exerciseId: e.id, name: e.name_es, sets: 2 });
  }
  const pub = await T.rpc("publish_version", { p_version: v }); if (pub.error) throw pub.error;
  return { planId: pid.data as string, versionId: v, sessionId: sess.data.id, sessionName: "Sesión E2E", exercises };
}

/** App alerts only: Next injects its own empty `role=alert` route announcer on every page, which breaks strict locators. */
export const alerts = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');
