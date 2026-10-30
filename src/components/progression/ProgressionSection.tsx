import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ActionForm, fieldCls } from "@/components/ActionForm";
import type { Change, DataPoint } from "@/lib/progression/engine";
import { analyzeProgress, decide } from "@/app/trainer/clients/[id]/progression-actions";

interface Rec { id: string; plan_id: string; type: string; severity: "info" | "caution" | "professional"; confidence: string; title: string; changes: Change[]; rationale: string[]; data_points: DataPoint[]; uncertainty: string[]; checks: string[]; engine_version: string; created_at: string }
const SEV: Record<string, [string, string]> = { professional: ["Requiere atención profesional", "border-[var(--warn)] text-[var(--warn)]"], caution: ["Precaución", "border-yellow-400/60 text-yellow-300"], info: ["Información", "border-[var(--accent)]/50 text-[var(--accent)]"] };
const CONF: Record<string, string> = { high: "alta", medium: "media", low: "baja" };
const TYPE: Record<string, string> = { maintain: "Mantener", increase_reps: "Subir repeticiones", increase_load: "Subir carga", reduce_load: "Bajar carga", reduce_volume: "Reducir volumen", substitute_exercise: "Sustituir ejercicio", review_technique: "Revisar técnica", deload: "Semana de descarga", request_reassessment: "Solicitar evaluación" };
const INFORMATIONAL = new Set(["request_reassessment", "review_technique", "maintain"]);
const DECISION: Record<string, string> = { accepted: "aceptada", modified: "modificada", rejected: "rechazada" };
const SEV_ORDER = { professional: 0, caution: 1, info: 2 };
const val = (v: Change["from"]) => (v === null || v === undefined ? "—" : String(v));

export async function ProgressionSection({ supabase, clientId, trainerId }: { supabase: SupabaseClient; clientId: string; trainerId: string }) {
  const [{ data: plans }, { data: recs }, { data: history }] = await Promise.all([
    supabase.from("training_plans").select("id,title").eq("client_id", clientId).eq("trainer_id", trainerId).not("current_version_id", "is", null),
    supabase.from("coach_recommendations").select("*").eq("client_id", clientId).eq("status", "pending").order("created_at", { ascending: false }),
    supabase.from("recommendation_decisions").select("id,decision,reason,created_at,applied:plan_versions(version_no,plan_id), rec:coach_recommendations(title,type,severity,client_id)").order("created_at", { ascending: false }).limit(30),
  ]);
  const pending = ((recs ?? []) as unknown as Rec[]).sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  const hist = ((history ?? []) as unknown as { id: string; decision: string; reason: string | null; created_at: string; applied: { version_no: number; plan_id: string } | null; rec: { title: string; type: string; severity: string; client_id: string } }[]).filter((h) => h.rec?.client_id === clientId);
  const card = "rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5";
  return (
    <section className="space-y-5" aria-labelledby="prog-h">
      <div><h2 id="prog-h" className="pt-4 text-2xl font-semibold">Propuestas de progresión</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Sugerencias calculadas con reglas explícitas a partir de los entrenamientos registrados. Nada se aplica solo: tú decides, y cada decisión queda registrada. No sustituyen tu criterio profesional.</p></div>
      {(plans ?? []).length === 0 ? <p className={`${card} text-sm text-[var(--muted)]`}>El alumno no tiene un plan publicado que analizar.</p> :
        (plans ?? []).map((p) => <ActionForm key={p.id} action={analyzeProgress.bind(null, p.id, clientId)} submitLabel="Analizar progreso ahora"><p className="text-sm">Plan: <b>{p.title}</b> (versión vigente)</p></ActionForm>)}

      {pending.length === 0 ? <p className={`${card} text-sm text-[var(--muted)]`}>No hay propuestas pendientes. Pulsa “Analizar progreso” después de que el alumno registre entrenamientos.</p> : pending.map((r) => {
        const [sevLabel, sevCls] = SEV[r.severity]; const info = INFORMATIONAL.has(r.type);
        return (
          <article key={r.id} className={`${card} space-y-4`}>
            <header className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${sevCls}`}>{sevLabel}</span><span className="rounded-full border border-[var(--border)] px-2.5 py-0.5 text-xs">{TYPE[r.type]}</span><span className="text-xs text-[var(--muted)]">Confianza {CONF[r.confidence]} · motor v{r.engine_version}</span></header>
            <h3 className="text-lg font-semibold tracking-[-0.02em]">{r.title}</h3>
            <div><h4 className="text-sm font-semibold">1. Qué se propone cambiar</h4><ul className="mt-1 space-y-1 text-sm">{r.changes.map((c) => <li key={c.field}>{c.label}: <span className="text-[var(--muted)]">{val(c.from)}</span> → <b className="text-[var(--accent)]">{val(c.to)}</b></li>)}</ul></div>
            <div><h4 className="text-sm font-semibold">2. Por qué</h4><ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{r.rationale.map((t) => <li key={t}>{t}</li>)}</ul></div>
            <div><h4 className="text-sm font-semibold">3. Datos que lo respaldan</h4><ul className="mt-1 space-y-1 text-sm text-[var(--muted)]">{r.data_points.map((d) => <li key={d.label + d.value}><b className="text-white">{d.label}</b>: {d.value}</li>)}</ul></div>
            <div><h4 className="text-sm font-semibold">4. Incertidumbre</h4><ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">{r.uncertainty.map((t) => <li key={t}>{t}</li>)}</ul></div>
            <div><h4 className="text-sm font-semibold">5. Qué debes comprobar</h4><ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{r.checks.map((t) => <li key={t}>{t}</li>)}</ul></div>
            <div className="space-y-3 border-t border-[var(--border)] pt-4">
              <ActionForm action={decide.bind(null, r.id, clientId, "accepted", r.changes)} submitLabel={info ? "Marcar como atendida" : "Aceptar y aplicar a un borrador"} className="border-0 bg-transparent p-0">
                {!info && <p className="text-xs text-[var(--muted)]">Se aplicará a un <b>borrador</b> del plan (no se publica). Podrás revisarlo antes de que el alumno lo vea.</p>}</ActionForm>
              {!info && <details className="text-sm"><summary className="cursor-pointer text-[var(--accent)]">Modificar y aceptar</summary>
                <ActionForm action={decide.bind(null, r.id, clientId, "modified", r.changes)} submitLabel="Aplicar con mis valores" className="mt-3 border-0 bg-transparent p-0">
                  <div className="grid gap-3 sm:grid-cols-2">{r.changes.map((c, i) => typeof c.to === "number" ? <label key={c.field} className="text-xs">{c.label}<input name={`to_${i}`} type="number" step="0.5" defaultValue={c.to} className={fieldCls} /></label> : null)}</div>
                  <label className="block text-xs">Motivo de la modificación (obligatorio)<textarea name="reason" rows={2} required minLength={5} maxLength={1000} className={fieldCls} /></label></ActionForm></details>}
              <details className="text-sm"><summary className="cursor-pointer text-[var(--warn)]">Rechazar</summary>
                <ActionForm action={decide.bind(null, r.id, clientId, "rejected", r.changes)} submitLabel="Rechazar propuesta" className="mt-3 border-0 bg-transparent p-0"><label className="block text-xs">Motivo (obligatorio)<textarea name="reason" rows={2} required minLength={5} maxLength={1000} className={fieldCls} /></label></ActionForm></details>
            </div>
          </article>);
      })}

      <div className={card}><h3 className="mb-3 font-semibold">Historial de decisiones</h3>
        {hist.length === 0 ? <p className="text-sm text-[var(--muted)]">Aún no hay decisiones.</p> : (
          <ul className="divide-y divide-[var(--border)] text-sm">{hist.map((h) => (
            <li key={h.id} className="py-2.5"><p><b>{h.rec.title}</b> <span className="text-[var(--muted)]">· {TYPE[h.rec.type]} · {DECISION[h.decision]} el {new Date(h.created_at).toLocaleString("es-CO")}</span></p>
              {h.reason && <p className="text-[var(--muted)]">Motivo: {h.reason}</p>}
              {h.applied && <p className="text-xs"><Link className="underline" href={`/trainer/plans/${h.applied.plan_id}?v=${h.applied.version_no}`}>Aplicada en el borrador v{h.applied.version_no}</Link></p>}</li>))}</ul>)}</div>
    </section>
  );
}
