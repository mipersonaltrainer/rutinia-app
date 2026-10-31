import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { EQUIPMENT_LABEL, GOAL_LABEL, JOINT_LABEL, LEVEL_LABEL, MUSCLE_LABEL, PATTERN_LABEL, REL_LABEL } from "@/lib/exercises/labels";
import { ActionForm, fieldCls } from "@/components/ActionForm";
import { ExerciseVideo } from "@/components/ExerciseVideo";
import { ExerciseFrames } from "@/components/ExerciseFrames";
import { addExerciseMedia } from "../actions";

const List = ({ title, items }: { title: string; items: string[] }) => items.length ? (<div><h3 className="font-semibold">{title}</h3><ul className="mt-1 list-disc pl-5 text-sm">{items.map((i) => <li key={i}>{i}</li>)}</ul></div>) : null;

export default async function ExerciseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profile } = await requireUser("trainer");
  const { data: e } = await supabase.from("exercises").select("*").eq("id", id).maybeSingle();
  if (!e) notFound();
  const [{ data: rels }, { data: media }] = await Promise.all([
    supabase.from("exercise_relations").select("kind, related:exercises!exercise_relations_related_id_fkey(id,name_es,difficulty,equipment)").eq("exercise_id", id),
    supabase.from("exercise_media").select("id,kind,url,provenance").eq("exercise_id", id),
  ]);
  const groups = (rels ?? []).reduce<Record<string, { id: string; name_es: string; difficulty: string; equipment: string }[]>>((m, r) => { (m[r.kind] ??= []).push(r.related as never); return m; }, {});
  return (
    <section className="max-w-3xl space-y-6">
      <Link href="/trainer/exercises" className="text-sm text-[var(--muted)]">← Biblioteca</Link>
      <h1 className="text-3xl font-semibold">{e.name_es}</h1>
      {e.alt_names.length > 0 && <p className="text-sm text-[var(--muted)]">También: {e.alt_names.join(", ")}</p>}
      <p className="text-sm">{MUSCLE_LABEL[e.primary_muscle]}{e.secondary_muscles.length ? ` · secundarios: ${e.secondary_muscles.map((m: string) => MUSCLE_LABEL[m]).join(", ")}` : ""} · {PATTERN_LABEL[e.movement_pattern]} · {EQUIPMENT_LABEL[e.equipment]} · {LEVEL_LABEL[e.difficulty]}</p>
      <p className="text-xs text-[var(--muted)]">Objetivos: {e.goals.map((g: string) => GOAL_LABEL[g]).join(", ")} · Carga articular: {e.joint_stress.map((j: string) => JOINT_LABEL[j]).join(", ") || "baja"}</p>
      <ExerciseFrames slug={e.slug} name={e.name_es} sex="male" picker />
      {e.video_path && <ExerciseVideo path={e.video_path} name={e.name_es} />}
      <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <List title="Requisitos técnicos" items={e.requirements} />
        <div><h3 className="font-semibold">Instrucciones</h3><ol className="mt-1 list-decimal pl-5 text-sm">{e.instructions.map((s: string) => <li key={s}>{s}</li>)}</ol></div>
        <List title="Errores frecuentes" items={e.common_errors} /><List title="Indicaciones de seguridad" items={e.safety_notes} />
        <p className="text-xs text-[var(--muted)]">Fuente: {e.source}. Estado de revisión: {e.review_status === "draft" ? "borrador sin revisión profesional" : "revisado"}.</p>
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h3 className="font-semibold">Video y multimedia</h3>
        {(media ?? []).length === 0 ? <p className="mt-1 text-sm text-[var(--muted)]">Video pendiente: aún no hay material audiovisual con licencia para este ejercicio.</p> :
          <ul className="mt-1 space-y-1 text-sm">{(media ?? []).map((m) => <li key={m.id}><a className="underline" href={m.url} target="_blank" rel="noopener noreferrer">{m.kind === "video" ? "Ver video" : "Ver imagen"}</a> <span className="text-[var(--muted)]">· procedencia: {m.provenance}</span></li>)}</ul>}
        {e.owner_id === profile.id && (
          <ActionForm action={addExerciseMedia.bind(null, e.id)} submitLabel="Añadir enlace" className="mt-4 border-0 bg-transparent p-0">
            <label className="block text-sm">URL (https) del video o imagen<input name="url" type="url" required className={fieldCls} /></label>
            <label className="block text-sm">Procedencia y licencia (obligatorio)<input name="provenance" required minLength={3} placeholder="Grabado por mí / licencia CC-BY…" className={fieldCls} /></label>
          </ActionForm>)}
      </div>
      {Object.entries(REL_LABEL).map(([k, label]) => groups[k]?.length ? (
        <div key={k}><h3 className="font-semibold">{label}</h3><ul className="mt-1 flex flex-wrap gap-2 text-sm">{groups[k].map((r) => <li key={r.id}><Link href={`/trainer/exercises/${r.id}`} className="rounded-full border border-[var(--border)] px-3 py-1">{r.name_es}</Link></li>)}</ul></div>) : null)}
    </section>
  );
}
