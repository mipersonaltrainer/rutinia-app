"use client";
import { startTransition, useActionState } from "react";
import { fieldCls } from "@/components/ActionForm";
import { askAssistantAction, type AssistantResult } from "@/app/client/assistant/actions";
import { guardAction, NETWORK_ERROR } from "@/lib/client/guard-action";

const MODE: Record<string, string> = { ia: "Respuesta redactada por IA", sin_ia: "Modo sin IA (fuentes tal cual)", seguridad: "Mensaje de seguridad" };
export function AssistantChat() {
  const [res, action, pending] = useActionState(guardAction(askAssistantAction as (p: unknown, fd: FormData) => Promise<AssistantResult>, (): AssistantResult => ({ ok: false, message: NETWORK_ERROR })), undefined);
  return (
    <div className="space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => action(fd)); }} className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <label className="block text-sm">Tu pregunta<textarea name="question" rows={3} maxLength={500} required placeholder="p. ej. ¿Cómo hago la sentadilla goblet? ¿Qué significa RPE 8?" className={fieldCls} /></label>
        <button disabled={pending} className="rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-black disabled:opacity-60">{pending ? "Buscando…" : "Preguntar"}</button>
      </form>
      {res && !res.ok && <p role="alert" className="text-sm text-[var(--warn)]">{res.message}</p>}
      {res?.ok && (
        <div className={`space-y-3 rounded-xl border p-5 ${res.reply.mode === "seguridad" ? "border-[var(--warn)]" : "border-[var(--border)]"} bg-[var(--surface)]`} role="status">
          <p className="text-xs font-semibold text-[var(--accent)]">{MODE[res.reply.mode]}</p>
          <p className="whitespace-pre-line text-sm leading-6">{res.reply.answer}</p>
          {res.reply.sources.length > 0 && <p className="text-xs text-[var(--muted)]">Fuentes: {res.reply.sources.map((s) => s.title).join(" · ")}</p>}
          {res.reply.notes.map((n) => <p key={n} className="text-xs text-[var(--muted)]">{n}</p>)}
          {res.reply.remainingDay !== null && <p className="text-xs text-[var(--muted)]">Te quedan {res.reply.remainingDay} preguntas con IA hoy.</p>}
        </div>)}
    </div>
  );
}
