"use client";
import { useActionState, startTransition } from "react";
import Link from "next/link";
import { guardForm } from "@/lib/client/guard-action";
import { AntibotFields } from "@/components/auth/AntibotFields";
import { Turnstile } from "@/components/auth/Turnstile";
import { PASSWORD_MIN } from "@/lib/auth/password";

type Action = (prev: unknown, form: FormData) => Promise<{ error?: string; ok?: string } | void>;

export function AuthForm({ action, mode, token, notice, next, google, captcha, refCode }: { action: Action; mode: "login" | "signup"; token?: string; notice?: { tone: "ok" | "warn"; text: string }; next?: string; google?: boolean; captcha?: { siteKey: string; nonce?: string }; refCode?: string }) {
  const [state, formAction, pending] = useActionState(guardForm(action), undefined);
  const field = "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-white outline-none focus:border-[var(--accent)]";
  const signup = mode === "signup";
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => formAction(fd)); }} className="hero-in relative w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-[var(--surface)]/95 p-6 shadow-2xl shadow-black/50 sm:p-8 md:bg-[var(--surface)]/80 md:backdrop-blur-xl">
      <h1 className="text-2xl font-semibold">{signup ? "Crea tu cuenta de entrenador" : "Iniciar sesión"}</h1>
      {notice && <p role="status" className={`text-sm ${notice.tone === "ok" ? "text-[var(--accent)]" : "text-[var(--warn-text)]"}`}>{notice.text}</p>}
      {google && !next && (<>
        <a href="/auth/google" className="flex min-h-11 w-full items-center justify-center gap-3 rounded-lg bg-white px-4 py-2.5 text-[15px] font-semibold text-[#1f1f1f] transition hover:bg-white/90">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.5 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
          {signup ? "Registrarme con Google" : "Continuar con Google"}
        </a>
        {signup && <p className="-mt-1 text-center text-xs text-[var(--muted)]">Al continuar aceptas los <Link className="underline" href="/terminos">Términos</Link> y la <Link className="underline" href="/privacidad">Política de privacidad</Link>, y autorizas el tratamiento de tus datos como allí se describe.</p>}
        <div className="flex items-center gap-3 text-xs text-[var(--muted)]" aria-hidden="true"><span className="h-px flex-1 bg-white/15" />o con tu correo<span className="h-px flex-1 bg-white/15" /></div>
      </>)}
      {next && <input type="hidden" name="next" value={next} />}
      {signup && (<label className="block text-sm">Nombre completo<input name="fullName" required maxLength={120} className={field} /></label>)}
      {signup && (<><label className="block text-sm">Fecha de nacimiento (opcional)<input name="birthDate" type="date" autoComplete="bday" className={field} /></label><p className="-mt-2 text-xs text-[var(--muted)]">La usamos solo para felicitarte en tu cumpleaños. Puedes cambiarla o borrarla en Mi cuenta.</p></>)}
      {signup && (<label className="block text-sm">Código de referido (opcional)<input name="refCode" defaultValue={refCode} maxLength={20} autoCapitalize="characters" autoComplete="off" className={field} /></label>)}
      {signup && <p className="-mt-2 text-xs text-[var(--muted)]">Si un colega te recomendó Rutinia, con su código tu prueba gratis es de 10 días en vez de 7.</p>}
      <label className="block text-sm">Correo<input name="email" type="email" required autoComplete="email" className={field} /></label>
      <label className="block text-sm">Contraseña<input name="password" type="password" required minLength={signup ? PASSWORD_MIN : undefined} autoComplete={signup ? "new-password" : "current-password"} className={field} /></label>
      {signup && <p className="text-xs text-[var(--muted)]">Mínimo {PASSWORD_MIN} caracteres, con letras y números. No uses tu nombre ni tu correo.</p>}
      {signup && token && <AntibotFields token={token} />}
      {captcha && <Turnstile siteKey={captcha.siteKey} nonce={captcha.nonce} />}
      {state?.error && <p role="alert" className="text-sm text-[var(--warn-text)]">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-[var(--accent)]">{state.ok}</p>}
      <button disabled={pending} className="w-full rounded-lg bg-[var(--accent)] py-2.5 font-semibold text-black disabled:opacity-60">
        {pending ? "Procesando…" : signup ? (refCode ? "Empezar prueba gratis de 10 días" : "Empezar prueba gratis de 7 días") : "Entrar"}
      </button>
      {!signup && <p className="text-center text-sm"><Link className="text-[var(--accent)] underline" href="/forgot-password">¿Olvidaste tu contraseña?</Link></p>}
      <p className="text-center text-sm text-[var(--muted)]">
        {signup ? <>¿Ya tienes cuenta? <Link className="text-[var(--accent)] underline" href="/login">Entra</Link></> : <>¿Eres entrenador nuevo? <Link className="text-[var(--accent)] underline" href="/signup">Regístrate</Link></>}
      </p>
    </form>
  );
}
