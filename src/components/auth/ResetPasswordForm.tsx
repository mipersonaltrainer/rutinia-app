"use client";
import { useActionState, startTransition } from "react";
import { resetPassword } from "@/app/auth-actions";
import { guardForm } from "@/lib/client/guard-action";
import { PASSWORD_MIN } from "@/lib/auth/password";
import { authButton, authCard, authField } from "./AuthShell";

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(guardForm(resetPassword), undefined);
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => action(fd)); }} className={authCard}>
      <h1 className="text-2xl font-semibold">Crea tu contraseña nueva</h1>
      <p className="text-sm text-[var(--muted)]">Al guardarla cerraremos tu sesión en todos los dispositivos; entrarás de nuevo con la contraseña nueva.</p>
      <label className="block text-sm">Contraseña nueva<input name="password" type="password" required minLength={PASSWORD_MIN} autoComplete="new-password" className={authField} /></label>
      <label className="block text-sm">Repítela<input name="confirm" type="password" required minLength={PASSWORD_MIN} autoComplete="new-password" className={authField} /></label>
      <p className="text-xs text-[var(--muted)]">Mínimo {PASSWORD_MIN} caracteres, con letras y números. No uses tu nombre ni tu correo.</p>
      {state?.error && <p role="alert" className="text-sm text-[var(--warn-text)]">{state.error}</p>}
      <button disabled={pending} className={authButton}>{pending ? "Guardando…" : "Guardar contraseña"}</button>
    </form>
  );
}
