"use client";
import { useActionState, startTransition } from "react";
import { requestPasswordReset } from "@/app/auth-actions";
import { guardForm } from "@/lib/client/guard-action";
import { BackToLogin, authButton, authCard, authField } from "./AuthShell";
import { AntibotFields } from "./AntibotFields";
import { Turnstile } from "./Turnstile";

export function ForgotPasswordForm({ token, captcha }: { token: string; captcha?: { siteKey: string; nonce?: string } }) {
  const [state, action, pending] = useActionState(guardForm(requestPasswordReset), undefined);
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => action(fd)); }} className={`${authCard} relative`}>
      <h1 className="text-2xl font-semibold">Recuperar contraseña</h1>
      <p className="text-sm text-[var(--muted)]">Escribe el correo de tu cuenta y te enviaremos un enlace para crear una contraseña nueva.</p>
      <label className="block text-sm">Correo<input name="email" type="email" required autoComplete="email" className={authField} /></label>
      <AntibotFields token={token} />
      {captcha && <Turnstile siteKey={captcha.siteKey} nonce={captcha.nonce} />}
      {state?.error && <p role="alert" className="text-sm text-[var(--warn-text)]">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-[var(--accent)]">{state.ok}</p>}
      <button disabled={pending} className={authButton}>{pending ? "Enviando…" : "Enviarme el enlace"}</button>
      <BackToLogin />
    </form>
  );
}
