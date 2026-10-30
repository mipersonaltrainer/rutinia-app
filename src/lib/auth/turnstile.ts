// Cloudflare Turnstile (CAPTCHA) for sign-up, sign-in and password recovery. The widget is only a source of a token: Supabase Auth checks it
// with the secret key (Authentication → Attack Protection), so turning the check on or off is done there, never in this code.
export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
export const TURNSTILE_SCRIPT = `${TURNSTILE_ORIGIN}/turnstile/v0/api.js?render=explicit`;
/** The site key is public by design (it ships to every browser). The secret key lives only in Supabase. */
const PRODUCTION_SITE_KEY = "0x4AAAAAAFqpCOvw5BzO-MQX";
export const CAPTCHA_FAILED = "No pudimos verificar que eres una persona. Recarga la página e inténtalo de nuevo.";

/** TURNSTILE_SITE_KEY overrides; in Vercel production the key above is used; everywhere else (laptops, CI, previews) there is no widget. */
export function turnstileSiteKey(env: Record<string, string | undefined> = process.env): string | undefined {
  return env.TURNSTILE_SITE_KEY || (env.VERCEL_ENV === "production" ? PRODUCTION_SITE_KEY : undefined);
}

/** The token the widget put in the form, if any (Supabase ignores it while its CAPTCHA check is off). */
export function captchaTokenOf(form: FormData): string | undefined {
  const t = form.get("cf-turnstile-response");
  return typeof t === "string" && t.length > 0 && t.length <= 4096 ? t : undefined;
}
export const isCaptchaError = (e: { code?: string } | null | undefined) => e?.code === "captcha_failed";
