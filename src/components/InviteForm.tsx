"use client";
import { useActionState, startTransition } from "react";
import { guardForm } from "@/lib/client/guard-action";
import { createInvitation } from "@/app/trainer/clients/actions";

export function InviteForm() {
  const [state, action, pending] = useActionState(guardForm(createInvitation), undefined);
  const f = "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-white outline-none focus:border-[var(--accent)]";
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => action(fd)); }} className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="font-semibold">Invitar alumno</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Nombre<input name="fullName" required className={f} /></label>
        <label className="text-sm">Correo<input name="email" type="email" required className={f} /></label>
      </div>
      <label className="block text-sm">Caduca en
        <select name="expiresDays" defaultValue="7" className={f}><option value="1">1 día</option><option value="7">7 días</option><option value="30">30 días</option><option value="0">Nunca</option></select>
      </label>
      {state?.error && <p role="alert" className="text-sm text-[var(--warn)]">{state.error}</p>}
      {state?.link && (<div className="text-sm"><p className="text-[var(--muted)]">Copia este enlace y envíalo al alumno. Solo se muestra una vez:</p><input readOnly value={state.link} onFocus={(e) => e.currentTarget.select()} className={f} /></div>)}
      <button disabled={pending} className="rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-black disabled:opacity-60">{pending ? "Creando…" : "Crear invitación"}</button>
    </form>
  );
}
