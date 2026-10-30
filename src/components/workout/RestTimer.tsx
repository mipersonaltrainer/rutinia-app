"use client";
import { useEffect, useState } from "react";

export const REST_EVENT = "rest:start";
export const startRest = (seconds: number) => window.dispatchEvent(new CustomEvent(REST_EVENT, { detail: seconds }));

/** Visual countdown only: it never blocks logging and can be skipped. */
export function RestTimer() {
  const [end, setEnd] = useState<number | null>(null);
  const [left, setLeft] = useState(0);
  useEffect(() => {
    const on = (e: Event) => setEnd(Date.now() + (e as CustomEvent<number>).detail * 1000);
    window.addEventListener(REST_EVENT, on); return () => window.removeEventListener(REST_EVENT, on);
  }, []);
  useEffect(() => {
    if (!end) return;
    const tick = () => { const s = Math.max(0, Math.ceil((end - Date.now()) / 1000)); setLeft(s); if (s === 0) { setEnd(null); try { navigator.vibrate?.(200); } catch { /* optional */ } } };
    tick(); const id = setInterval(tick, 250); return () => clearInterval(id);
  }, [end]);
  if (!end) return null;
  const m = Math.floor(left / 60), s = String(left % 60).padStart(2, "0");
  return (
    <div role="timer" aria-live="polite" className="fixed inset-x-0 bottom-0 z-10 flex items-center justify-center gap-4 border-t border-[var(--accent)] bg-[var(--surface)] p-3">
      <span className="text-sm text-[var(--muted)]">Descanso</span><span className="text-2xl font-semibold text-[var(--accent)]">{m}:{s}</span>
      <button onClick={() => setEnd((e) => (e ? e + 15000 : e))} className="rounded border border-[var(--border)] px-3 py-1 text-sm">+15 s</button>
      <button onClick={() => setEnd(null)} className="rounded border border-[var(--border)] px-3 py-1 text-sm">Saltar</button>
    </div>
  );
}
