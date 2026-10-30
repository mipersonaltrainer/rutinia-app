"use client";
import { useState, useTransition } from "react";
import { saveSet, deleteSet } from "@/app/client/workout/actions";
import { guardAction, NETWORK_ERROR } from "@/lib/client/guard-action";

const netErr = () => ({ error: NETWORK_ERROR });
const saveSetSafe = guardAction(saveSet, netErr), deleteSetSafe = guardAction(deleteSet, netErr);
import { startRest } from "./RestTimer";
import { fieldCls } from "@/components/ActionForm";

export interface Saved { kind: "warmup" | "work"; set_number: number; reps: number | null; load_kg: number | null; duration_sec: number | null; rpe: number | null }
interface Props { logId: string; prescribedId: string; exerciseId: string; planned: number; warmups: number; restSec: number | null; durationBased: boolean; defaults: { load: number | null; reps: number | null }; saved: Saved[]; locked: boolean }

function Row({ p, kind, n, saved, locked }: { p: Props; kind: "warmup" | "work"; n: number; saved?: Saved; locked: boolean }) {
  const [state, setState] = useState<{ error?: string; ok?: boolean }>({ ok: !!saved });
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget); const g = (k: string) => String(f.get(k) ?? "");
    start(async () => {
      const r = await saveSetSafe({ logId: p.logId, prescribedId: p.prescribedId, exerciseId: p.exerciseId, kind, setNumber: n, reps: g("reps"), load_kg: g("load_kg"), duration_sec: g("duration_sec"), rpe: g("rpe") });
      if (r?.error) setState({ error: r.error }); else { setState({ ok: true }); setDirty(false); if (kind === "work" && p.restSec) startRest(p.restSec); }
    });
  };
  const remove = () => start(async () => { const r = await deleteSetSafe(p.logId, p.prescribedId, kind, n); if (r?.error) setState({ error: r.error }); else setState({ ok: false }); });
  return (
    <form onSubmit={submit} onChange={() => setDirty(true)} className="grid grid-cols-[3rem_1fr_1fr_1fr_auto] items-end gap-2">
      <span className="pb-2 text-xs text-[var(--muted)]">{kind === "warmup" ? `Aprox. ${n}` : `Serie ${n}`}</span>
      <label className="text-xs">kg<input name="load_kg" type="number" step="0.5" min="0" inputMode="decimal" defaultValue={saved?.load_kg ?? p.defaults.load ?? ""} disabled={locked} className={fieldCls} /></label>
      {p.durationBased ? <label className="text-xs">seg<input name="duration_sec" type="number" min="1" inputMode="numeric" defaultValue={saved?.duration_sec ?? ""} disabled={locked} className={fieldCls} /></label>
        : <label className="text-xs">reps<input name="reps" type="number" min="0" max="200" inputMode="numeric" defaultValue={saved?.reps ?? p.defaults.reps ?? ""} disabled={locked} className={fieldCls} /></label>}
      <label className="text-xs">RPE<select name="rpe" defaultValue={saved?.rpe ?? ""} disabled={locked} className={fieldCls}><option value="">—</option>{[5, 6, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
      {!locked && <div className="flex gap-1 pb-0.5"><button disabled={pending} className="rounded bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-black disabled:opacity-60">{state.ok && !dirty ? "✓" : "Guardar"}</button>
        {saved && state.ok && <button type="button" onClick={remove} aria-label="Quitar serie" className="rounded border border-[var(--border)] px-2 text-xs">✕</button>}</div>}
      {state.error && <p role="alert" className="col-span-5 text-xs text-[var(--warn)]">{state.error}</p>}
    </form>
  );
}

export function ExerciseSets(p: Props) {
  const maxSaved = Math.max(0, ...p.saved.filter((s) => s.kind === "work").map((s) => s.set_number));
  const [extra, setExtra] = useState(Math.max(0, maxSaved - p.planned));
  const get = (k: "warmup" | "work", n: number) => p.saved.find((s) => s.kind === k && s.set_number === n);
  return (
    <div className="space-y-2">
      {Array.from({ length: p.warmups }, (_, i) => <Row key={`w${i}`} p={p} kind="warmup" n={i + 1} saved={get("warmup", i + 1)} locked={p.locked} />)}
      {Array.from({ length: p.planned + extra }, (_, i) => <Row key={`s${i}`} p={p} kind="work" n={i + 1} saved={get("work", i + 1)} locked={p.locked} />)}
      {!p.locked && <button type="button" onClick={() => setExtra((e) => e + 1)} className="text-xs text-[var(--accent)]">+ Serie extra</button>}
    </div>
  );
}
