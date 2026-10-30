"use client";
import { useActionState, startTransition, useEffect, useRef } from "react";
import { guardForm } from "@/lib/client/guard-action";
import { BoldCheckout } from "./BoldCheckout";
import type { BoldButtonParams } from "@/lib/billing/bold-shared";

export type FormState = { error?: string; ok?: string; bold?: BoldButtonParams } | undefined;

/** Server-action form that keeps typed values after an error (no automatic reset). */
export function ActionForm({ action, submitLabel, children, className = "", resetOnOk = false }: {
  action: (prev: FormState, form: FormData) => Promise<FormState>; submitLabel: string; children: React.ReactNode; className?: string; resetOnOk?: boolean;
}) {
  const [state, formAction, pending] = useActionState(guardForm(action), undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (resetOnOk && state?.ok) ref.current?.reset(); }, [state, resetOnOk]);
  return (
    <form ref={ref} onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => formAction(fd)); }}
      className={`space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 ${className}`}>
      {children}
      {state?.error && <p role="alert" className="text-sm text-[var(--warn)]">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-[var(--accent)]">{state.ok}</p>}
      {state?.bold && <BoldCheckout params={state.bold} />}
      <button disabled={pending} className="rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-black disabled:opacity-60">{pending ? "Guardando…" : submitLabel}</button>
    </form>
  );
}

export const fieldCls = "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-white outline-none focus:border-[var(--accent)]";
