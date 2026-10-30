"use client";
import { PASSWORD_MIN } from "@/lib/auth/password";
import { guardForm } from "@/lib/client/guard-action";
import { useActionState, startTransition } from "react";

export function InviteAcceptForm({ action }: { action: (prev: unknown, form: FormData) => Promise<{ error?: string }> }) {
  const [state, formAction, pending] = useActionState(guardForm(action), undefined);
  const f = "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-white outline-none focus:border-[var(--accent)]";
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => formAction(fd)); }} className="w-full max-w-sm space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8">
      <h1 className="text-2xl font-semibold">Acepta tu invitación</h1>
      <label className="block text-sm">Crea una contraseña<input name="password" type="password" minLength={PASSWORD_MIN} required autoComplete="new-password" className={f} /></label>
      <fieldset className="space-y-2 text-sm">
        <legend className="mb-1 text-[var(--muted)]">Consentimientos (ninguno viene marcado)</legend>
        <label className="flex gap-2"><input type="checkbox" name="personal_data" /> Autorizo el tratamiento de mis datos personales.</label>
        <label className="flex gap-2"><input type="checkbox" name="health_data" /> Autorizo el tratamiento de mis datos sensibles de salud.</label>
        <label className="flex gap-2"><input type="checkbox" name="share_with_trainer" /> Autorizo compartir mis datos con mi entrenador.</label>
      </fieldset>
      {state?.error && <p role="alert" className="text-sm text-[var(--warn)]">{state.error}</p>}
      <button disabled={pending} className="w-full rounded-lg bg-[var(--accent)] py-2.5 font-semibold text-black disabled:opacity-60">{pending ? "Procesando…" : "Crear mi cuenta"}</button>
    </form>
  );
}
