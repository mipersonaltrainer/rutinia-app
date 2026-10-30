import { AuthForm } from "@/components/AuthForm";
import { signIn } from "@/app/actions";
import { NOINDEX } from "@/lib/site";
import { inviteReturnPath } from "@/lib/auth/return-path";
import { googleEnabled } from "@/lib/auth/google";
import { captchaProps } from "@/lib/auth/captcha-props";

export const metadata = { title: "Iniciar sesión", ...NOINDEX };

const NOTICES: Record<string, { tone: "ok" | "warn"; text: string }> = {
  "reset:ok": { tone: "ok", text: "Contraseña actualizada. Inicia sesión con la nueva." },
  "error:confirm": { tone: "ok", text: "Tu correo ya quedó confirmado, pero desde este navegador no pudimos abrir tu sesión automáticamente. Entra con tu correo y contraseña." },
  "error:google": { tone: "warn", text: "No pudimos iniciar sesión con Google (puede que lo hayas cancelado). Inténtalo de nuevo o entra con tu correo y contraseña." },
  "error:link": { tone: "warn", text: "El enlace no es válido o ya venció. Pide uno nuevo desde «¿Olvidaste tu contraseña?»." },
};
export default async function Page({ searchParams }: { searchParams: Promise<{ reset?: string; error?: string; next?: string }> }) {
  const q = await searchParams;
  const notice = q.reset === "ok" ? NOTICES["reset:ok"] : q.error === "link" ? NOTICES["error:link"] : q.error === "confirm" ? NOTICES["error:confirm"] : q.error === "google" ? NOTICES["error:google"] : undefined;
  return <main className="grid min-h-[calc(100dvh-72px)] place-items-center p-4"><AuthForm mode="login" action={signIn} google={googleEnabled()} captcha={await captchaProps()} notice={notice} next={inviteReturnPath(q.next) ?? undefined} /></main>;
}
