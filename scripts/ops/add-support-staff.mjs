// Adds (or removes) a member of the support team. The person must already have an account (register at /signup first).
// Adding converts the account into a support account: no trainer trial, no subscription, its own panel (/staff). It refuses accounts
// that already hold trainer data (students, plans, approved payments).
//   node --env-file=.env.cloud scripts/ops/add-support-staff.mjs persona@correo.co          (add)
//   node --env-file=.env.cloud scripts/ops/add-support-staff.mjs --remove persona@correo.co
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2); const remove = args.includes("--remove"); const email = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase();
if (!email) { console.error("Uso: add-support-staff.mjs [--remove] <correo>"); process.exit(1); }
const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let user; for (let page = 1; !user; page++) {
  const { data, error } = await a.auth.admin.listUsers({ page, perPage: 200 }); if (error) throw error;
  user = data.users.find((u) => u.email?.toLowerCase() === email); if (data.users.length < 200) break;
}
if (!user) { console.error(`No existe una cuenta con ${email}. Debe registrarse primero.`); process.exit(1); }

if (remove) { const { error } = await a.rpc("remove_support_staff", { p_user: user.id }); if (error) throw error; console.log(`${email} ya no es parte del equipo de soporte (la cuenta queda sin acceso a ningún panel).`); }
else {
  const { data, error } = await a.rpc("make_support_staff", { p_user: user.id });
  if (error) { console.error(/trainer data/.test(error.message) ? `${email} ya tiene alumnos, planes o pagos como entrenador: no se convierte. Usa una cuenta nueva.` : /client/.test(error.message) ? `${email} es una cuenta de alumno.` : error.message); process.exit(1); }
  console.log(`${email} ahora es parte del equipo de soporte: cuenta sin prueba ni suscripción, con acceso al panel /staff${data?.was === "trainer" ? " (antes era una cuenta de entrenador)" : ""}.`);
}
