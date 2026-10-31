"use server";
import { normalizeReferralCode } from "@/lib/billing/referrals";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { homeFor } from "@/lib/session";
import { validBirthDate } from "@/lib/marketing/birth-date";

import { createAdminClient } from "@/lib/supabase/admin";
import { checkPassword } from "@/lib/auth/password";
import { honeypotFilled, verifyFormToken, retryMessage } from "@/lib/auth/antibot";
import { blockedMessage, clear, hit, rulesFor } from "@/lib/auth/throttle";
import { appOrigin, authSecret, MIN_FILL_MS_ENV, requestIp } from "@/lib/auth/server";
import { inviteReturnPath } from "@/lib/auth/return-path";
import { CAPTCHA_FAILED, captchaTokenOf, isCaptchaError } from "@/lib/auth/turnstile";

// Login only asks for *something*: accounts created under an older, weaker rule must still be able to sign in.
const loginSchema = z.object({ email: z.email("Escribe un correo válido."), password: z.string().min(1, "Escribe tu contraseña.").max(200) });
const CHECK_EMAIL = "Te enviamos un correo para confirmar tu cuenta. Ábrelo y vuelve a iniciar sesión.";

export async function signIn(_: unknown, form: FormData) {
  const parsed = loginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const rules = rulesFor("login", { ip: await requestIp(), email: parsed.data.email });
  const admin = createAdminClient(); const secret = authSecret();
  const limited = await hit(admin, secret, rules);
  if (!limited.allowed) return { error: blockedMessage(limited) };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ ...parsed.data, options: { captchaToken: captchaTokenOf(form) } });
  if (isCaptchaError(error)) return { error: CAPTCHA_FAILED };
  if (error) return { error: "Credenciales inválidas" };
  await clear(admin, secret, rules.slice(0, 1));                           // a correct sign-in resets the per-account counter, not the per-IP one
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = user ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle() : { data: null };
  redirect(inviteReturnPath(String(form.get("next") ?? "")) ?? homeFor(me?.role));   // only a return to an invitation page is honoured; otherwise each kind of account goes to its own home
}

export async function signUpTrainer(_: unknown, form: FormData) {
  const parsed = z.object({ fullName: z.string().trim().min(2, "Nombre requerido").max(120), email: z.email("Escribe un correo válido."), password: z.string().max(200), birthDate: z.string().trim().max(10).optional(), refCode: z.string().trim().max(20).optional() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { fullName, email, password } = parsed.data;
  const birthDate = parsed.data.birthDate || undefined;
  const refCode = normalizeReferralCode(parsed.data.refCode);
  if (birthDate && !validBirthDate(birthDate)) return { error: "Revisa la fecha de nacimiento (déjala vacía si prefieres no darla)." };
  const pw = checkPassword(password, { email, fullName }); if (!pw.ok) return { error: pw.error };
  const secret = authSecret();
  const token = verifyFormToken(secret, form.get("ft"), Date.now(), { minMs: MIN_FILL_MS_ENV() });
  const honey = honeypotFilled(form.get("website"));
  const bot = honey || !token.ok;
  const limited = await hit(createAdminClient(), secret, rulesFor("signup", { ip: await requestIp(), email }));
  if (!limited.allowed) return { error: blockedMessage(limited) };
  if (!honey && retryMessage(token)) return { error: retryMessage(token)! };       // a person who was too quick, or left the page open: tell them
  if (bot) return { ok: CHECK_EMAIL };                                     // a script gets the same answer as a person who must confirm by e-mail
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password, options: { captchaToken: captchaTokenOf(form), data: { full_name: fullName, ...(birthDate ? { birth_date: birthDate } : {}), ...(refCode ? { ref_code: refCode } : {}) }, emailRedirectTo: `${await appOrigin()}/auth/confirm?next=/trainer` } });
  if (isCaptchaError(error)) return { error: CAPTCHA_FAILED };
  if (error) return { error: "No se pudo crear la cuenta. Si ya tienes una, inicia sesión o recupera tu contraseña." };   // same text whatever the reason: no account enumeration
  if (!data.session) return { ok: CHECK_EMAIL };                           // e-mail confirmation is on: there is no session until the link is opened
  redirect("/trainer");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
