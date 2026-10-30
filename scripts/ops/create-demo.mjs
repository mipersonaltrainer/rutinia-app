// Creates a DEMO workspace: one trainer with a long-lived subscription and four FICTITIOUS clients with an assessment,
// measurements, a published plan, four weeks of completed workouts and a short conversation.
//
//   DEMO_PASSWORD='...' node --env-file=.env.cloud scripts/ops/create-demo.mjs --confirm-production
//
// Safe by construction: every account uses @example.com (reserved, never delivers mail), nothing is charged (no provider is
// attached to the subscription), and it refuses to run twice (delete the demo users in Supabase → Authentication → Users first).
// The demo subscription lasts one year; rerun after deleting the demo users to renew it. Never use real people's data here.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY, pw = process.env.DEMO_PASSWORD;
if (!url || !key) { console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
if (!pw || pw.length < 10 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) { console.error("Set DEMO_PASSWORD: at least 10 characters with letters and numbers"); process.exit(1); }
const local = /127\.0\.0\.1|localhost/.test(url);
if (!local && !process.argv.includes("--confirm-production")) { console.error(`This targets ${new URL(url).host}. Add --confirm-production to create the demo there.`); process.exit(1); }

const a = createClient(url, key, { auth: { persistSession: false } });
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const DAY = 86400000, now = Date.now(), iso = (ms) => new Date(ms).toISOString();

const TRAINER = { email: "demo.entrenador@example.com", name: "Entrenador Demo" };
const CLIENTS = [
  { email: "demo.camila@example.com", name: "Camila Demo", sex: "female", birth: "1994-03-12", goals: ["fat_loss", "recomposition"], weight: [68.4, 66.9], height: 165, waist: [79, 76.5], neck: 32, hip: 100, level: "beginner", activity: "light", base: 12, msg: "Hola profe, hoy hice las sentadillas con más peso. Me sentí muy bien." },
  { email: "demo.andres@example.com", name: "Andrés Demo", sex: "male", birth: "1989-09-02", goals: ["hypertrophy"], weight: [77.2, 78.6], height: 178, waist: [84, 83], neck: 38, level: "intermediate", activity: "moderate", base: 40, msg: "Profe, el press de banca subió a 60 kg. ¿Subimos la próxima semana?" },
  { email: "demo.laura@example.com", name: "Laura Demo", sex: "female", birth: "1998-11-25", goals: ["strength"], weight: [59.0, 59.4], height: 160, waist: [70, 69], level: "intermediate", activity: "light", base: 25, msg: "Esta semana dormí poco y la sesión se sintió pesada, pero la terminé." },
  { email: "demo.sergio@example.com", name: "Sergio Demo", sex: "male", birth: "1980-06-18", goals: ["general_health", "fat_loss"], weight: [92.5, 90.1], height: 174, waist: [101, 98], level: "beginner", activity: "sedentary", base: 30, msg: "Buenas, ya llevo tres semanas seguidas entrenando. Gracias por el plan." },
];

const existing = must(await a.auth.admin.listUsers({ perPage: 1000 }), "listUsers").users.filter((u) => [TRAINER, ...CLIENTS].some((d) => d.email === u.email));
if (existing.length) { console.error(`Demo users already exist (${existing.map((u) => u.email).join(", ")}). Delete them in Supabase → Authentication → Users and rerun.`); process.exit(1); }

const mk = async (d, client) => must(await a.auth.admin.createUser({ email: d.email, password: pw, email_confirm: true, app_metadata: client ? { role: "client" } : {}, user_metadata: { full_name: d.name } }), `createUser ${d.email}`).user.id;

const slugs = ["sentadilla-trasera-con-barra", "press-de-banca-plano-con-barra", "remo-con-barra-inclinado", "peso-muerto-rumano-con-barra", "press-militar-con-barra-de-pie", "jalon-al-pecho-agarre-ancho", "hip-thrust-con-barra", "zancada-caminando-con-mancuernas", "plancha-con-toque-de-hombro", "curl-con-barra-z"];
const ex = must(await a.from("exercises").select("id,slug").is("owner_id", null).in("slug", slugs), "exercises");
const exId = new Map(ex.map((e) => [e.slug, e.id]));
if (exId.size < slugs.length) { console.error("The exercise library is not loaded yet. Run: npm run exercises:seed (with the production env) and retry."); process.exit(1); }

const t = await mk(TRAINER, false);
must(await a.from("trainer_subscriptions").update({ status: "active", trial_ends_at: iso(now), current_period_end: iso(now + 365 * DAY), updated_at: iso(now) }).eq("trainer_id", t), "subscription");

const DAYS = [
  { name: "Día A · Tren inferior", items: [["sentadilla-trasera-con-barra", 4, 6, 8], ["peso-muerto-rumano-con-barra", 3, 8, 10], ["zancada-caminando-con-mancuernas", 3, 10, 12], ["plancha-con-toque-de-hombro", 3, 10, 12]] },
  { name: "Día B · Tren superior", items: [["press-de-banca-plano-con-barra", 4, 6, 8], ["remo-con-barra-inclinado", 4, 8, 10], ["press-militar-con-barra-de-pie", 3, 8, 10], ["curl-con-barra-z", 3, 10, 12]] },
];

for (const [ci, c] of CLIENTS.entries()) {
  const id = await mk(c, true);
  must(await a.from("trainer_client_relationships").insert({ trainer_id: t, client_id: id }), "relationship");
  must(await a.from("consents").insert(["personal_data", "health_data", "share_with_trainer"].map((type) => ({ user_id: id, type }))), "consents");
  must(await a.from("assessments").insert({ client_id: id, status: "submitted", risk_level: "none", risk_reasons: [], submitted_at: iso(now - 30 * DAY), data: {
    personal: { birthDate: c.birth, sexForFormulas: c.sex, occupation: "Profesional", workType: "sedentary", sittingHours: 7, activityLevel: c.activity, sleepQuality: 4, stress: 3 },
    training: { experienceYears: c.level === "beginner" ? 0.5 : 3, weeklyFrequency: 3, sessionMinutes: 60, location: "gym", equipment: "", avoidExercises: "" },
    goals: { goals: c.goals, timeframe: "", motivation: "Datos ficticios de demostración" },
    health: { chestPainDuringExercise: false, dizzinessOrFainting: false, unusualBreathlessness: false, cardiovascularHistory: false, medicalRestriction: false, medicalClearance: true, pregnancyStatus: "not_applicable", eatingDisorderHistory: false, currentPain: 0, injuries: "", surgeries: "", conditions: "", medications: "" },
    habits: { sleepHours: 7, recovery: 4, barriers: "" } } }), "assessment");
  must(await a.from("anthropometric_measurements").insert([[30, 0], [2, 1]].map(([ago, k]) => ({ client_id: id, entered_by: id, taken_by: "self", method: "scale", measured_on: iso(now - ago * DAY).slice(0, 10), weight_kg: c.weight[k], height_cm: c.height, waist_cm: c.waist[k], ...(c.neck ? { neck_cm: c.neck, ...(c.hip ? { hip_cm: c.hip } : {}) } : {}) }))), "measurements");

  const plan = must(await a.from("training_plans").insert({ trainer_id: t, client_id: id, title: `Plan de 4 semanas · ${c.name}`, level: c.level }).select().single(), "plan");
  const ver = must(await a.from("plan_versions").insert({ plan_id: plan.id, version_no: 1, created_by: t }).select().single(), "version");
  const sessions = [];
  for (const [si, d] of DAYS.entries()) {
    const s = must(await a.from("plan_sessions").insert({ version_id: ver.id, position: si + 1, name: d.name }).select().single(), "session");
    const rows = d.items.map(([slug, sets, rmin, rmax], i) => slug.startsWith("plancha")
      ? { session_id: s.id, position: i + 1, exercise_id: exId.get(slug), sets, duration_sec: 30, rest_sec: 60 }
      : { session_id: s.id, position: i + 1, exercise_id: exId.get(slug), sets, reps_min: rmin, reps_max: rmax, load_kg: c.base + i * 2, rest_sec: 90 });
    const pes = must(await a.from("prescribed_exercises").insert(rows).select(), "prescribed");
    sessions.push({ s, pes, d });
  }
  must(await a.from("plan_versions").update({ status: "published", published_at: iso(now - 29 * DAY) }).eq("id", ver.id), "publish");
  must(await a.from("training_plans").update({ current_version_id: ver.id }).eq("id", plan.id), "current version");

  // four weeks, three sessions a week (A, B, A / B, A, B ...), the load creeping up every week
  let n = 0;
  for (let week = 0; week < 4; week++) for (const dow of [1, 3, 5]) {
    const when = now - (27 - week * 7 - dow) * DAY - 12 * 3600000;
    if (when > now - 3600000) continue;
    const { s, pes } = sessions[n++ % 2];
    const planned = pes.reduce((x, p) => x + p.sets, 0);
    const log = must(await a.from("workout_logs").insert({ client_id: id, plan_id: plan.id, version_id: ver.id, session_id: s.id, started_at: iso(when), planned_sets: planned }).select().single(), "log");
    const sets = pes.flatMap((p) => Array.from({ length: p.sets }, (_, k) => ({ log_id: log.id, prescribed_exercise_id: p.id, exercise_id: p.exercise_id, kind: "work", set_number: k + 1,
      reps: p.duration_sec ? null : Math.min(p.reps_max, p.reps_min + (k % 2)), duration_sec: p.duration_sec ?? null, load_kg: p.load_kg === null ? null : Math.round((p.load_kg + week * 2.5) * 2) / 2, rpe: 7 + (k > 2 ? 1 : 0) })));
    must(await a.from("logged_sets").insert(sets), "sets");
    must(await a.from("workout_logs").update({ status: "completed", finished_at: iso(when + 55 * 60000), session_rpe: 6 + (week % 3), pain_level: 0, logged_work_sets: sets.length }).eq("id", log.id), "finish");
  }

  const talk = [[t, "Hola " + c.name.split(" ")[0] + ", tu plan de esta semana ya está publicado. Cualquier duda me escribes por aquí.", 6], [id, c.msg, 2], [t, "Perfecto, lo revisamos en la próxima sesión. ¡Buen trabajo!", 1]];
  must(await a.from("messages").insert(talk.map(([from, body, ago], i) => ({ trainer_id: t, client_id: id, sender_id: from, body, created_at: iso(now - ago * DAY - i * 60000), read_at: iso(now - ago * DAY + 3600000) }))), "messages");
  console.log(`  cliente ${ci + 1}/${CLIENTS.length}: ${c.email}`);
}
console.log(`\nDemo listo (${local ? "local" : new URL(url).host}).\n  Entrenador: ${TRAINER.email}\n  Alumnos:    ${CLIENTS.map((c) => c.email).join(", ")}\n  Contraseña: la de DEMO_PASSWORD (la misma en todas las cuentas)\n  Suscripción del entrenador: activa por 365 días, sin proveedor de pago.`);
