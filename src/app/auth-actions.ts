"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPassword } from "@/lib/privacy/reauth";
import { checkPassword } from "@/lib/auth/password";
import { honeypotFilled, verifyFormToken, retryMessage } from "@/lib/auth/antibot";
import { RECOVERY_COOKIE, verifyRecoveryMarker } from "@/lib/auth/recovery";
import { blockedMessage, clear, hit, rulesFor } from "@/lib/auth/throttle";
import { appOrigin, authSecret, MIN_FILL_MS_ENV, requestIp } from "@/lib/auth/server";
import { CAPTCHA_FAILED, captchaTokenOf, isCaptchaError } from "@/lib/auth/turnstile";

type State = { error?: string; ok?: string } | undefined;
const NEUTRAL_RESET = "Si ese correo tiene una cuenta, te enviamos un enlace para crear una contraseña nueva. Revisa tu bandeja (y el spam); el enlace vence en 1 hora. Si no llega, espera un minuto antes de pedirlo otra vez.";

const emailSchema = z.email("Escribe un correo válido.");

/** Step 1: ask for the link. The answer never reveals whether the address has an account. */
export async function requestPasswordReset(_: unknown, form: FormData): Promise<State> {
  const email = emailSchema.safeParse(String(form.get("email") ?? "").trim());
  if (!email.success) return { error: email.error.issues[0].message };
  const secret = authSecret();
  const token = verifyFormToken(secret, form.get("ft"), Date.now(), { minMs: MIN_FILL_MS_ENV() });
  const honey = honeypotFilled(form.get("website"));
  const bot = honey || !token.ok;
  const limited = await hit(createAdminClient(), secret, rulesFor("reset", { ip: await requestIp(), email: email.data }));
  if (!limited.allowed) return { error: blockedMessage(limited) };
  if (!honey && retryMessage(token)) return { error: retryMessage(token)! };       // a person who was too quick, or left the page open: tell them
  if (bot) return { ok: NEUTRAL_RESET };                                   // looks like a script: say the same thing, send nothing
  const supabase = await createClient();                                   // the server client stores the PKCE verifier cookie this link needs
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, { captchaToken: captchaTokenOf(form), redirectTo: `${await appOrigin()}/auth/confirm?next=/reset-password` });
  if (isCaptchaError(error)) return { error: CAPTCHA_FAILED };
  if (error) console.warn("[auth] resetPasswordForEmail failed:", error.status ?? "", error.code ?? "");   // logged for the operator, invisible to the visitor
  return { ok: NEUTRAL_RESET };
}

/** Step 2: set the new password. Only valid right after a recovery link (signed marker), never for an ordinary session. */
export async function resetPassword(_: unknown, form: FormData): Promise<State> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const jar = await cookies();
  if (!user?.email || !verifyRecoveryMarker(authSecret(), user.id, jar.get(RECOVERY_COOKIE)?.value)) return { error: "El enlace no es válido o ya venció. Pide uno nuevo." };
  const pw = String(form.get("password") ?? ""), again = String(form.get("confirm") ?? "");
  if (pw !== again) return { error: "Las contraseñas no coinciden." };
  const name = (user.user_metadata as { full_name?: string } | null)?.full_name;
  const check = checkPassword(pw, { email: user.email, fullName: name }); if (!check.ok) return { error: check.error };
  const limited = await hit(createAdminClient(), authSecret(), rulesFor("change", { ip: await requestIp(), email: user.email, userId: user.id }));
  if (!limited.allowed) return { error: blockedMessage(limited) };
  const { error } = await supabase.auth.updateUser({ password: pw });
  if (error) return { error: /same|different/i.test(error.message) ? "Elige una contraseña distinta a la anterior." : "No se pudo cambiar la contraseña. Inténtalo de nuevo." };
  jar.delete(RECOVERY_COOKIE);
  await supabase.auth.signOut({ scope: "global" });                       // every device, this one included: they sign in again with the new password
  redirect("/login?reset=ok");
}

/** Signed-in change: needs the current password and ends every other session. */
export async function changePassword(_: unknown, form: FormData): Promise<State> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Sesión expirada." };
  const current = String(form.get("current") ?? ""), pw = String(form.get("password") ?? ""), again = String(form.get("confirm") ?? "");
  const limited = await hit(createAdminClient(), authSecret(), rulesFor("change", { ip: await requestIp(), email: user.email, userId: user.id }));
  if (!limited.allowed) return { error: blockedMessage(limited) };
  if (!(await verifyPassword(user.email, current))) return { error: "La contraseña actual no es correcta." };
  if (pw !== again) return { error: "Las contraseñas nuevas no coinciden." };
  if (pw === current) return { error: "La contraseña nueva debe ser distinta a la actual." };
  const name = (user.user_metadata as { full_name?: string } | null)?.full_name;
  const check = checkPassword(pw, { email: user.email, fullName: name }); if (!check.ok) return { error: check.error };
  const { error } = await supabase.auth.updateUser({ password: pw });
  if (error) return { error: "No se pudo cambiar la contraseña. Inténtalo de nuevo." };
  await supabase.auth.signOut({ scope: "others" });                       // a stolen or forgotten session stops working now
  await clear(createAdminClient(), authSecret(), rulesFor("change", { ip: "", email: user.email, userId: user.id }));
  return { ok: "Contraseña actualizada. Cerramos tu sesión en los demás dispositivos." };
}
