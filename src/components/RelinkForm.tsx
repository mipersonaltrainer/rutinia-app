"use client";
import { guardForm } from "@/lib/client/guard-action";
import { useActionState, startTransition } from "react";

/** For a client who already has an account: confirm the consents again and link with the inviting trainer. */
export function RelinkForm({ action, trainerName }: { action: (prev: unknown, form: FormData) => Promise<{ error?: string }>; trainerName: string }) {
  const [state, formAction, pending] = useActionState(guardForm(action), undefined);
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => formAction(fd)); }} className="w-full max-w-sm space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
      <h1 className="text-2xl font-semibold">Vincularte con {trainerName}</h1>
      <p className="text-sm text-[var(--muted)]">Ya tienes una cuenta con este correo y estás dentro de ella. Si aceptas, {trainerName} podrá ver tu evaluación, medidas, fotos y entrenamientos, y escribirte. Podrás terminar la relación cuando quieras desde Privacidad.</p>
      <fieldset className="space-y-2 text-sm">
        <legend className="mb-1 text-[var(--muted)]">Confirma tus consentimientos (ninguno viene marcado)</legend>
        <label className="flex gap-2"><input type="checkbox" name="personal_data" /> Autorizo el tratamiento de mis datos personales.</label>
        <label className="flex gap-2"><input type="checkbox" name="health_data" /> Autorizo el tratamiento de mis datos sensibles de salud.</label>
        <label className="flex gap-2"><input type="checkbox" name="share_with_trainer" /> Autorizo compartir mis datos con mi entrenador.</label>
      </fieldset>
      {state?.error && <p role="alert" className="text-sm text-[var(--warn)]">{state.error}</p>}
      <button disabled={pending} className="w-full rounded-lg bg-[var(--accent)] py-2.5 font-semibold text-black disabled:opacity-60">{pending ? "Procesando…" : `Vincularme con ${trainerName}`}</button>
    </form>
  );
}
