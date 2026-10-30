"use client";
import { useActionState, useState, useTransition } from "react";
import { startMfaEnrollment, verifyMfa, type MfaState } from "@/app/staff-mfa-actions";

const field = "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-center text-xl tracking-[0.4em] text-white outline-none focus:border-[var(--accent)]";

/** `factorId` set: the person already has an authenticator and only types a code. Otherwise they first activate one (QR + code). */
export function MfaForm({ factorId }: { factorId: string | null }) {
  const [enroll, setEnroll] = useState<MfaState>();
  const [starting, start] = useTransition();
  const [state, action, pending] = useActionState(verifyMfa, undefined);
  const id = factorId ?? enroll?.factorId ?? null;
  return (
    <div className="hero-in relative w-full max-w-sm space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
      <h1 className="text-2xl font-semibold">Verificación en dos pasos</h1>
      {!id && (<>
        <p className="text-sm text-[var(--muted)]">El equipo de soporte necesita un segundo factor. Instala una app de autenticación (Google Authenticator, Authy, 1Password…) y vincúlala a esta cuenta.</p>
        {enroll?.error && <p role="alert" className="text-sm text-[var(--warn-text)]">{enroll.error}</p>}
        <button type="button" disabled={starting} onClick={() => start(async () => setEnroll(await startMfaEnrollment()))} className="w-full rounded-lg bg-[var(--accent)] py-2.5 font-semibold text-black disabled:opacity-60">
          {starting ? "Preparando…" : "Activar"}
        </button>
      </>)}
      {!factorId && enroll?.qr && (<div className="space-y-2">
        <p className="text-sm">1. Escanea este código con la app:</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={enroll.qr} alt="Código QR para la app de autenticación" width={200} height={200} className="mx-auto rounded-lg bg-white p-2" />
        <p className="text-xs text-[var(--muted)]">¿No puedes escanear? Escribe esta clave en la app: <span className="select-all break-all font-mono text-white">{enroll.secret}</span></p>
        <p className="text-sm">2. Escribe el código de 6 dígitos que muestra:</p>
      </div>)}
      {id && (
        <form action={action} className="space-y-3">
          {factorId && <p className="text-sm text-[var(--muted)]">Escribe el código de 6 dígitos de tu app de autenticación.</p>}
          <input type="hidden" name="factorId" value={id} />
          <label className="block text-sm"><span className="sr-only">Código de 6 dígitos</span>
            <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus className={field} placeholder="······" /></label>
          {state?.error && <p role="alert" className="text-sm text-[var(--warn-text)]">{state.error}</p>}
          <button disabled={pending} className="w-full rounded-lg bg-[var(--accent)] py-2.5 font-semibold text-black disabled:opacity-60">{pending ? "Verificando…" : "Verificar y entrar"}</button>
        </form>
      )}
    </div>
  );
}
