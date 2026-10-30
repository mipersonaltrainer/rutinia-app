import { ActionForm, fieldCls } from "./ActionForm";
import { updatePrescription } from "@/app/trainer/plans/actions";

type P = { id: string; sets: number; warmup_sets: number; reps_min: number | null; reps_max: number | null; duration_sec: number | null; load_kg: number | null; rpe: number | null; rir: number | null; rest_sec: number | null; tempo: string | null; superset_group: string | null; progression: string; alternative_exercise_id: string | null; client_notes: string | null; private?: { note: string } | null };
const N = ({ n, l, v, step = "1", w = "" }: { n: string; l: string; v: unknown; step?: string; w?: string }) => <label className={`text-xs ${w}`}>{l}<input name={n} type="number" step={step} min="0" defaultValue={(v as number | null) ?? ""} className={fieldCls} /></label>;

export function PrescriptionForm({ p, planId, alternatives }: { p: P; planId: string; alternatives: { id: string; name: string }[] }) {
  return (
    <ActionForm action={updatePrescription.bind(null, p.id, planId)} submitLabel="Guardar prescripción" className="border-0 bg-transparent p-0">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        <N n="sets" l="Series" v={p.sets} /><N n="warmup_sets" l="Aprox." v={p.warmup_sets} /><N n="reps_min" l="Reps mín" v={p.reps_min} /><N n="reps_max" l="Reps máx" v={p.reps_max} />
        <N n="duration_sec" l="Duración (s)" v={p.duration_sec} /><N n="load_kg" l="Carga kg" v={p.load_kg} step="0.5" />
        <N n="rpe" l="RPE" v={p.rpe} step="0.5" /><N n="rir" l="RIR" v={p.rir} /><N n="rest_sec" l="Descanso (s)" v={p.rest_sec} />
        <label className="text-xs">Tempo<input name="tempo" defaultValue={p.tempo ?? ""} placeholder="3010" className={fieldCls} /></label>
        <label className="text-xs">Superserie/circuito<input name="superset_group" defaultValue={p.superset_group ?? ""} maxLength={3} placeholder="A" className={fieldCls} /></label>
        <label className="text-xs">Progresión<select name="progression" defaultValue={p.progression} className={fieldCls}><option value="none">Sin regla</option><option value="double_progression">Doble progresión</option><option value="linear_load">Carga lineal</option><option value="rpe_based">Según RPE</option></select></label>
      </div>
      <label className="block text-xs">Alternativa de ejercicio<select name="alternative_exercise_id" defaultValue={p.alternative_exercise_id ?? ""} className={fieldCls}><option value="">Ninguna</option>{alternatives.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label className="block text-xs">Nota para el alumno<input name="client_notes" defaultValue={p.client_notes ?? ""} maxLength={500} className={fieldCls} /></label>
      <label className="block text-xs">Nota privada (solo tú)<input name="private_note" defaultValue={p.private?.note ?? ""} maxLength={1000} className={fieldCls} /></label>
    </ActionForm>
  );
}
