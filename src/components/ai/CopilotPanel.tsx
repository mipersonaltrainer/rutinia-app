"use client";
import { startTransition, useActionState, useState } from "react";
import { fieldCls } from "@/components/ActionForm";
import type { Analysis } from "@/lib/ai/assessment-analysis";
import type { Suggestion } from "@/lib/ai/substitutes";
import { analyzeAssessmentAction, applyPlanDraftAction, planDraftAction, reportTextAction, substitutesAction, type AiStatus, type PlanDraftResult, type Res } from "@/app/trainer/clients/[id]/ai-actions";
import { guardAction, NETWORK_ERROR } from "@/lib/client/guard-action";

const netErr = <T,>(): Res<T> => ({ ok: false, message: NETWORK_ERROR });
import { EQUIPMENT_LABEL, JOINT_LABEL, LEVEL_LABEL } from "@/lib/exercises/labels";

type Opt = { id: string; name: string };
const card = "space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5";
const Err = ({ r }: { r: Res<unknown> | undefined }) => (r && !r.ok ? <p role="alert" className="text-sm text-[var(--warn)]">{r.message}</p> : null);
const Btn = ({ pending, children }: { pending: boolean; children: React.ReactNode }) => <button disabled={pending} className="rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-black disabled:opacity-60">{pending ? "Procesando…" : children}</button>;
const Checks = ({ name, options, defaults = [] }: { name: string; options: Record<string, string>; defaults?: string[] }) => <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">{Object.entries(options).map(([k, v]) => <label key={k} className="flex gap-1"><input type="checkbox" name={name} value={k} defaultChecked={defaults.includes(k)} /> {v}</label>)}</div>;
const EQ = Object.fromEntries(Object.entries(EQUIPMENT_LABEL).filter(([k]) => k !== "cardio_machine"));
const today = () => new Date().toISOString().slice(0, 10);

const List = ({ t, items, cls = "" }: { t: string; items: string[]; cls?: string }) => items.length ? <div><h4 className="text-sm font-semibold">{t}</h4><ul className={`mt-1 list-disc space-y-1 pl-5 text-sm ${cls}`}>{items.map((i) => <li key={i}>{i}</li>)}</ul></div> : null;

function Analyze({ clientId }: { clientId: string }) {
  const [res, setRes] = useState<Res<Analysis>>(); const [pending, setPending] = useState(false);
  return (
    <div className={card}><h3 className="font-semibold">Analizar la evaluación <span className="ml-2 rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-normal text-[var(--muted)]">Sin IA generativa · no sale ningún dato</span></h3>
      <p className="text-xs text-[var(--muted)]">Resume lo registrado, señala datos faltantes e inconsistencias y propone preguntas para la próxima revisión. Solo usa reglas: no inventa nada.</p>
      <button disabled={pending} onClick={() => { setPending(true); startTransition(async () => { setRes(await guardAction(analyzeAssessmentAction, () => netErr<Analysis>())(clientId)); setPending(false); }); }} className="rounded-lg border border-[var(--accent)] px-4 py-2 text-sm text-[var(--accent)] disabled:opacity-60">{pending ? "Analizando…" : "Analizar evaluación"}</button>
      <Err r={res} />
      {res?.ok && <div className="space-y-3"><List t="Resumen" items={res.data.summary} /><List t="Datos faltantes" items={res.data.missing} cls="text-[var(--muted)]" /><List t="Posibles inconsistencias" items={res.data.inconsistencies} cls="text-[var(--warn)]" /><List t="Preguntas para la próxima revisión" items={res.data.questions} /></div>}
    </div>
  );
}

function Substitutes({ clientId, options }: { clientId: string; options: Opt[] }) {
  const [res, action, pending] = useActionState(guardAction(substitutesAction.bind(null, clientId) as (p: unknown, fd: FormData) => Promise<Res<Suggestion[]>>, () => netErr<Suggestion[]>()), undefined);
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => action(fd)); }} className={card}>
      <h3 className="font-semibold">Buscar sustitutos en la biblioteca <span className="ml-2 rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-normal text-[var(--muted)]">Sin IA generativa</span></h3>
      {options.length === 0 ? <p className="text-sm text-[var(--muted)]">El alumno no tiene un plan publicado con ejercicios.</p> : (<>
        <label className="block text-sm">Ejercicio del plan vigente<select name="prescribedId" className={fieldCls}>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
        <fieldset><legend className="text-sm">Equipamiento disponible</legend><Checks name="equipment" options={EQ} defaults={["bodyweight", "dumbbell", "band"]} /></fieldset>
        <fieldset><legend className="text-sm">Articulaciones a evitar</legend><Checks name="avoid" options={JOINT_LABEL} /></fieldset>
        <label className="block text-sm">Nivel máximo<select name="maxDifficulty" defaultValue="intermediate" className={fieldCls}>{Object.entries(LEVEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <Btn pending={pending}>Buscar sustitutos</Btn><Err r={res} />
        {res?.ok && (res.data.length === 0 ? <p className="text-sm text-[var(--muted)]">No hay sustitutos que cumplan esas condiciones.</p> : <ul className="space-y-2 text-sm">{res.data.map((s) => <li key={s.exercise.id} className="rounded-lg border border-[var(--border)] p-3"><b>{s.exercise.name_es}</b><ul className="mt-1 list-disc pl-5 text-xs text-[var(--muted)]">{s.reasons.map((r) => <li key={r}>{r}</li>)}</ul></li>)}</ul>)}</>)}
    </form>
  );
}

function PlanDraft({ clientId, ai }: { clientId: string; ai: AiStatus }) {
  const [res, action, pending] = useActionState(guardAction(planDraftAction.bind(null, clientId) as (p: unknown, fd: FormData) => Promise<Res<PlanDraftResult>>, () => netErr<PlanDraftResult>()), undefined);
  const d = res?.ok ? res.data : null;
  return (
    <div className={card}>
      <h3 className="font-semibold">Borrador de plan con IA <span className="ml-2 rounded-full border border-[var(--warn)]/60 px-2 py-0.5 text-[10px] font-normal text-[var(--warn)]">Envía un resumen minimizado a un proveedor externo</span></h3>
      {!ai.available ? <p className="text-sm text-[var(--muted)]">La IA generativa no está configurada en este entorno. Las demás herramientas funcionan sin ella.</p> : !ai.sensitiveAllowed ? <p className="text-sm text-[var(--muted)]">El administrador no habilitó el envío de datos de salud a proveedores externos.</p> : (
        <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => action(fd)); }} className="space-y-3">
          <p className="text-xs text-[var(--muted)]">Requiere que el alumno haya activado el asistente de IA en Privacidad. El modelo solo puede elegir entre ejercicios de la biblioteca que cumplan tus restricciones; todo se vuelve a validar y queda como <b>borrador</b> sin publicar.</p>
          <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">Días por semana<input name="frequency" type="number" min="1" max="7" defaultValue="3" className={fieldCls} /></label><label className="text-sm">Minutos por sesión<input name="minutes" type="number" min="20" max="180" defaultValue="60" className={fieldCls} /></label><label className="text-sm">Nivel del alumno<select name="level" defaultValue="beginner" className={fieldCls}>{Object.entries(LEVEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></div>
          <fieldset><legend className="text-sm">Equipamiento disponible</legend><Checks name="equipment" options={EQ} defaults={["bodyweight", "dumbbell", "band"]} /></fieldset>
          <fieldset><legend className="text-sm">Articulaciones a evitar (restricciones)</legend><Checks name="avoid" options={JOINT_LABEL} /></fieldset>
          <label className="block text-sm">Ejercicios a excluir (separados por coma)<input name="excluded" maxLength={300} className={fieldCls} /></label>
          <Btn pending={pending}>Generar borrador</Btn></form>)}
      <Err r={res} />
      {d && (<div className="space-y-3 text-sm">
        <p className="text-xs text-[var(--muted)]">Generado con {d.model}{d.remainingDay !== null ? ` · te quedan ${d.remainingDay} solicitudes hoy` : ""}. Es una propuesta: revísala antes de usarla.</p>
        {d.flags.length > 0 && <p role="alert" className="rounded-lg border border-[var(--warn)] p-2 text-xs">Se omitió texto sospechoso de la ficha del alumno ({d.flags.map((f) => f.split(":")[1]).join(", ")}). Revisa esos campos.</p>}
        <h4 className="font-semibold">{d.plan.title}</h4>{d.plan.rationale && <p className="text-[var(--muted)]">{d.plan.rationale}</p>}
        {d.plan.sessions.map((s, i) => <div key={i} className="rounded-lg border border-[var(--border)] p-3"><p className="font-medium">{s.name} <span className="text-xs text-[var(--muted)]">· ~{s.estimatedMinutes} min</span></p><ul className="mt-1 space-y-0.5 text-xs">{s.exercises.map((e) => <li key={e.exercise_id}>{e.name}: {e.sets} × {e.reps_min}-{e.reps_max}, descanso {e.rest_sec}s{e.rir !== null ? `, RIR ${e.rir}` : ""}</li>)}</ul></div>)}
        {d.violations.length > 0 && <div><h4 className="font-semibold">Validaciones deterministas</h4><ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-[var(--muted)]">{d.violations.map((v, i) => <li key={i}><b>{v.severity === "warning" ? "Aviso" : "Descartado"} · {v.rule}:</b> {v.detail}</li>)}</ul></div>}
        {d.plan.assumptions.length > 0 && <div><h4 className="font-semibold">Supuestos de la IA</h4><ul className="mt-1 list-disc pl-5 text-xs text-[var(--muted)]">{d.plan.assumptions.map((a) => <li key={a}>{a}</li>)}</ul></div>}
        {d.plan.questions.length > 0 && <div><h4 className="font-semibold">Preguntas para ti</h4><ul className="mt-1 list-disc pl-5 text-xs">{d.plan.questions.map((a) => <li key={a}>{a}</li>)}</ul></div>}
        <form action={applyPlanDraftAction.bind(null, clientId, d.interactionId)}><button className="rounded-lg border border-[var(--accent)] px-4 py-2 text-[var(--accent)]">Crear como borrador en Planes (sin publicar)</button></form></div>)}
    </div>
  );
}

function ReportText({ clientId, ai }: { clientId: string; ai: AiStatus }) {
  const [res, action, pending] = useActionState(guardAction(reportTextAction.bind(null, clientId) as (p: unknown, fd: FormData) => Promise<Res<{ observations: string; next_goals: string; caveats: string[]; flags: string[] }>>, () => netErr<{ observations: string; next_goals: string; caveats: string[]; flags: string[] }>()), undefined);
  const [{ from, to }] = useState(() => ({ to: today(), from: new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10) }));
  return (
    <div className={card}>
      <h3 className="font-semibold">Redactar observaciones del informe con IA <span className="ml-2 rounded-full border border-[var(--warn)]/60 px-2 py-0.5 text-[10px] font-normal text-[var(--warn)]">Envía datos agregados a un proveedor externo</span></h3>
      {!ai.available || !ai.sensitiveAllowed ? <p className="text-sm text-[var(--muted)]">{!ai.available ? "La IA generativa no está configurada en este entorno." : "El administrador no habilitó el envío de datos de salud a proveedores externos."}</p> : (
        <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => action(fd)); }} className="space-y-3">
          <p className="text-xs text-[var(--muted)]">Solo usa cifras que ya están en los datos del periodo; si inventa una cifra, el texto se descarta. Cópialo y edítalo en el formulario del informe.</p>
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Desde<input name="from" type="date" defaultValue={from} className={fieldCls} /></label><label className="text-sm">Hasta<input name="to" type="date" defaultValue={to} className={fieldCls} /></label></div>
          <Btn pending={pending}>Redactar borrador</Btn></form>)}
      <Err r={res} />
      {res?.ok && <div className="space-y-2 text-sm"><label className="block text-xs">Observaciones (editable, cópialo al informe)<textarea readOnly rows={4} value={res.data.observations} className={fieldCls} /></label><label className="block text-xs">Próximos objetivos<textarea readOnly rows={3} value={res.data.next_goals} className={fieldCls} /></label>{res.data.caveats.length > 0 && <ul className="list-disc pl-5 text-xs text-[var(--muted)]">{res.data.caveats.map((c) => <li key={c}>{c}</li>)}</ul>}</div>}
    </div>
  );
}

export function CopilotPanel({ clientId, ai, exercises }: { clientId: string; ai: AiStatus; exercises: Opt[] }) {
  return (
    <section id="copiloto" className="space-y-4" aria-labelledby="copiloto-h">
      <div><h2 id="copiloto-h" className="pt-4 text-2xl font-semibold">Copiloto</h2><p className="mt-1 text-sm text-[var(--muted)]">Ayudas para ahorrar tiempo. Proponen, no deciden: nada se publica ni cambia el plan del alumno sin tu aprobación, y no sustituyen tu criterio profesional ni diagnostican.</p></div>
      <Analyze clientId={clientId} /><Substitutes clientId={clientId} options={exercises} /><PlanDraft clientId={clientId} ai={ai} /><ReportText clientId={clientId} ai={ai} />
    </section>
  );
}
