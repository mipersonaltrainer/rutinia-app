import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { ActionForm, fieldCls } from "@/components/ActionForm";
import { PrescriptionForm } from "@/components/PrescriptionForm";
import { SessionHeaderForm } from "@/components/SessionHeaderForm";
import { parseFilters } from "@/lib/exercises/filters";
import { searchExercises, type SearchResult } from "@/lib/exercises/search";
import { ANGLE_LABEL, EQUIPMENT_LABEL, LEVEL_LABEL, MUSCLE_LABEL, PATTERN_LABEL } from "@/lib/exercises/labels";
import { describePrescription } from "@/lib/plans/prescription";
import { addExercise, addSession, deleteExercise, deleteSession, duplicateSession, moveExercise, moveSession, newDraft, publish } from "../actions";

type Ex = { id: string; position: number; exercise_id: string; sets: number; warmup_sets: number; reps_min: number | null; reps_max: number | null; duration_sec: number | null; load_kg: number | null; rpe: number | null; rir: number | null; rest_sec: number | null; tempo: string | null; superset_group: string | null; progression: string; alternative_exercise_id: string | null; client_notes: string | null; exercise: { name_es: string; primary_muscle: string; equipment: string }; private: { note: string } | null };
type Sess = { id: string; position: number; name: string; weekday: number | null; warmup_notes: string | null; prescribed_exercises: Ex[] };
const btn = "rounded border border-[var(--border)] px-2 py-1 text-xs";

export default async function PlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params; const sp = await searchParams;
  const { supabase, profile } = await requireUser("trainer");
  const { data: plan } = await supabase.from("training_plans").select("*, client:profiles!training_plans_client_id_fkey(full_name)").eq("id", id).maybeSingle();
  if (!plan) notFound();
  const { data: versions } = await supabase.from("plan_versions").select("id,version_no,status,change_note,published_at,risk_override_reason").eq("plan_id", id).order("version_no", { ascending: false });
  const wanted = Number(Array.isArray(sp.v) ? sp.v[0] : sp.v);
  const view = (versions ?? []).find((v) => v.version_no === wanted) ?? (versions ?? []).find((v) => v.status === "draft") ?? (versions ?? [])[0];
  const draft = (versions ?? []).find((v) => v.status === "draft");
  const editable = view?.status === "draft";
  const { data: sessions } = await supabase.from("plan_sessions").select("id,position,name,weekday,warmup_notes, prescribed_exercises(id,position,exercise_id,sets,warmup_sets,reps_min,reps_max,duration_sec,load_kg,rpe,rir,rest_sec,tempo,superset_group,progression,alternative_exercise_id,client_notes, exercise:exercises!prescribed_exercises_exercise_id_fkey(name_es,primary_muscle,equipment), private:prescribed_private_notes(note))").eq("version_id", view.id).order("position").order("position", { referencedTable: "prescribed_exercises" });
  const sess = (sessions ?? []) as unknown as Sess[];
  const exIds = sess.flatMap((s) => s.prescribed_exercises.map((e) => e.exercise_id));
  const { data: rels } = exIds.length ? await supabase.from("exercise_relations").select("exercise_id, related:exercises!exercise_relations_related_id_fkey(id,name_es)").eq("kind", "alternative").in("exercise_id", exIds) : { data: [] };
  const altsFor = (exId: string) => ((rels ?? []) as unknown as { exercise_id: string; related: { id: string; name_es: string } }[]).filter((r) => r.exercise_id === exId).map((r) => ({ id: r.related.id, name: r.related.name_es }));
  const { data: risk } = plan.client_id ? await supabase.from("assessments").select("risk_level,risk_reasons").eq("client_id", plan.client_id).eq("status", "submitted").order("created_at", { ascending: false }).limit(1).maybeSingle() : { data: null };
  const pick = (Array.isArray(sp.pick) ? sp.pick[0] : sp.pick);
  const f = parseFilters(sp);
  let found: SearchResult | null = null;
  if (editable && pick) found = await searchExercises(supabase, { ...f, page: 1 }, profile.id);
  const results = found ? (found.total > 0 ? found.rows : (found.suggested?.rows ?? [])) : [];
  const clientName = (plan.client as unknown as { full_name: string } | null)?.full_name;

  return (
    <section className="max-w-4xl space-y-6">
      <Link href="/trainer/plans" className="text-sm text-[var(--muted)]">← Planes</Link>
      <div><h1 className="text-3xl font-semibold">{plan.title}</h1><p className="text-sm text-[var(--muted)]">{plan.is_template ? "Plantilla" : `Alumno: ${clientName}`}{plan.goal ? ` · ${plan.goal}` : ""}</p></div>
      <div className="flex flex-wrap items-center gap-2 text-sm">Versiones:{(versions ?? []).map((v) => <Link key={v.id} href={`/trainer/plans/${id}?v=${v.version_no}`} className={`rounded-full border px-3 py-1 ${v.id === view.id ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)]"}`}>v{v.version_no} {v.status === "draft" ? "(borrador)" : plan.current_version_id === v.id ? "(vigente)" : ""}</Link>)}</div>
      {view.change_note && <p className="text-sm text-[var(--muted)]">Nota de la versión: {view.change_note}</p>}
      {view.risk_override_reason && <p className="rounded-lg border border-[var(--warn)] p-3 text-sm">Publicada con excepción de seguridad documentada: {view.risk_override_reason}</p>}
      {!editable && <div className="rounded-lg border border-[var(--border)] p-3 text-sm">Esta versión está publicada y es de solo lectura.{" "}
        {!draft && <ActionForm action={newDraft.bind(null, id)} submitLabel="Crear nueva versión para editar" className="mt-3 border-0 bg-transparent p-0"><label className="block text-xs">¿Qué vas a cambiar?<input name="note" maxLength={300} className={fieldCls} /></label></ActionForm>}
        {draft && <Link className="underline" href={`/trainer/plans/${id}?v=${draft.version_no}`}>Ir al borrador v{draft.version_no}</Link>}</div>}

      {sess.map((s, si) => (
        <div key={s.id} className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          {editable ? (<>
            <SessionHeaderForm s={s} planId={id} />
            <div className="flex flex-wrap gap-2">
              {si > 0 && <form action={moveSession.bind(null, s.id, -1, id)}><button className={btn}>↑ Subir</button></form>}
              {si < sess.length - 1 && <form action={moveSession.bind(null, s.id, 1, id)}><button className={btn}>↓ Bajar</button></form>}
              <form action={duplicateSession.bind(null, s.id, id)}><button className={btn}>Duplicar sesión</button></form>
              <form action={deleteSession.bind(null, s.id, id)}><button className={`${btn} text-[var(--warn)]`}>Eliminar sesión</button></form>
              <Link className={btn} href={`/trainer/plans/${id}?v=${view.version_no}&pick=${s.id}`}>+ Añadir ejercicio</Link>
            </div></>) : <h2 className="font-semibold">{s.name}{s.weekday ? ` · ${["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"][s.weekday]}` : ""}</h2>}
          {s.warmup_notes && !editable && <p className="text-xs text-[var(--muted)]">Calentamiento: {s.warmup_notes}</p>}
          <ol className="space-y-3">
            {s.prescribed_exercises.map((e, ei) => (
              <li key={e.id} className="rounded-lg border border-[var(--border)] p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><b>{e.superset_group ? `[${e.superset_group}] ` : ""}{e.exercise.name_es}</b> <span className="text-[var(--muted)]">{MUSCLE_LABEL[e.exercise.primary_muscle]} · {EQUIPMENT_LABEL[e.exercise.equipment]}</span></span>
                  <span className="text-[var(--accent)]">{describePrescription(e)}{e.load_kg ? ` @ ${e.load_kg} kg` : ""}{e.rpe ? ` · RPE ${e.rpe}` : e.rir !== null ? ` · RIR ${e.rir}` : ""}{e.rest_sec ? ` · ${e.rest_sec}s` : ""}</span>
                </div>
                {editable ? (<>
                  <div className="my-2 flex gap-2">
                    {ei > 0 && <form action={moveExercise.bind(null, e.id, -1, id)}><button className={btn}>↑</button></form>}
                    {ei < s.prescribed_exercises.length - 1 && <form action={moveExercise.bind(null, e.id, 1, id)}><button className={btn}>↓</button></form>}
                    <form action={deleteExercise.bind(null, e.id, id)}><button className={`${btn} text-[var(--warn)]`}>Quitar</button></form>
                  </div>
                  <PrescriptionForm p={{ ...e, private: e.private }} planId={id} alternatives={altsFor(e.exercise_id)} />
                </>) : (<>{e.client_notes && <p className="mt-1 text-xs text-[var(--muted)]">Para el alumno: {e.client_notes}</p>}{e.private && <p className="mt-1 text-xs text-[var(--muted)]">Nota privada: {e.private.note}</p>}</>)}
              </li>))}
          </ol>
          {editable && pick === s.id && (
            <div className="space-y-3 rounded-lg border border-[var(--accent)]/50 p-3">
              <form method="get" className="flex flex-wrap items-end gap-2"><input type="hidden" name="v" value={view.version_no} /><input type="hidden" name="pick" value={s.id} />
                <label className="text-xs">Buscar<input name="q" defaultValue={f.q} className={fieldCls} /></label>
                <label className="text-xs">Músculo<select name="muscle" defaultValue={f.muscle ?? ""} className={fieldCls}><option value="">Todos</option>{Object.entries(MUSCLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label className="text-xs">Equipo<select name="equipment" defaultValue={f.equipment ?? ""} className={fieldCls}><option value="">Todos</option>{Object.entries(EQUIPMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label className="text-xs">Inclinación<select name="angle" defaultValue={f.angle ?? ""} className={fieldCls}><option value="">Cualquiera</option>{Object.entries(ANGLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label className="text-xs">Patrón<select name="pattern" defaultValue={f.pattern ?? ""} className={fieldCls}><option value="">Todos</option>{Object.entries(PATTERN_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label className="text-xs">Nivel<select name="level" defaultValue={f.level ?? ""} className={fieldCls}><option value="">Todos</option>{Object.entries(LEVEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <button className={btn}>Buscar</button></form>
              {found && found.total === 0 && <p className="text-xs text-[var(--muted)]">{found.suggested ? `Con todos esos filtros no hay resultados; te muestro ${found.suggested.total} sin «${found.suggested.label}»:` : "Sin resultados: prueba con otra palabra o quita filtros."}</p>}
              {found && found.total > 0 && <p className="text-xs text-[var(--muted)]">{found.total} ejercicios{found.total > results.length ? ` (se muestran ${results.length})` : ""}</p>}
              <ul className="max-h-72 space-y-1 overflow-auto text-sm">{results.map((r) => <li key={r.id} className="flex items-center justify-between gap-2"><span>{r.name_es} <span className="text-xs text-[var(--muted)]">{MUSCLE_LABEL[r.primary_muscle]} · {EQUIPMENT_LABEL[r.equipment]}</span></span><form action={addExercise.bind(null, s.id, r.id, id)}><button className={btn}>Añadir</button></form></li>)}</ul>
            </div>)}
        </div>))}
      {editable && <form action={addSession.bind(null, view.id, id)}><button className="rounded-lg border border-[var(--accent)] px-4 py-2 text-[var(--accent)]">+ Añadir sesión</button></form>}
      {sess.length === 0 && !editable && <p className="text-sm text-[var(--muted)]">Esta versión no tiene sesiones.</p>}

      {editable && (
        <ActionForm action={publish.bind(null, view.id, id)} submitLabel={`Publicar v${view.version_no}`}>
          <h2 className="font-semibold">Publicar</h2>
          <p className="text-xs text-[var(--muted)]">Al publicar, esta versión queda inmutable y {plan.is_template ? "disponible para asignar" : "visible para el alumno"}. Las versiones anteriores se conservan.</p>
          {risk && risk.risk_level && risk.risk_level !== "none" && (
            <div role="alert" className="rounded-lg border border-[var(--warn)] p-3 text-sm"><b>Cribado del alumno: {risk.risk_level === "professional_evaluation" ? "requiere valoración profesional" : "requiere revisión"}</b><ul className="mt-1 list-disc pl-5">{risk.risk_reasons.map((r: string) => <li key={r}>{r}</li>)}</ul></div>)}
          <label className="block text-xs">Nota de cambios<input name="note" maxLength={300} defaultValue={view.change_note ?? ""} className={fieldCls} /></label>
          {risk?.risk_level === "professional_evaluation" && <label className="block text-xs">Excepción documentada (obligatoria para publicar, mín. 15 caracteres)<textarea name="override" rows={2} className={fieldCls} /></label>}
        </ActionForm>)}
    </section>
  );
}
