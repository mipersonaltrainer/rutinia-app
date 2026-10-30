import { ActionForm, fieldCls } from "@/components/ActionForm";
import { EQUIPMENT_LABEL, LEVEL_LABEL, MUSCLE_LABEL, PATTERN_LABEL } from "@/lib/exercises/labels";
import { createCustomExercise } from "../actions";

const Sel = ({ name, label, o }: { name: string; label: string; o: Record<string, string> }) => <label className="text-sm">{label}<select name={name} className={fieldCls}>{Object.entries(o).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>;

export default function NewExercise() {
  return (
    <section className="max-w-2xl space-y-4"><h1 className="text-3xl font-semibold">Crear ejercicio propio</h1>
      <ActionForm action={createCustomExercise} submitLabel="Crear ejercicio">
        <label className="block text-sm">Nombre<input name="name_es" required className={fieldCls} /></label>
        <div className="grid gap-3 sm:grid-cols-2"><Sel name="primary_muscle" label="Músculo principal" o={MUSCLE_LABEL} /><Sel name="equipment" label="Equipamiento" o={EQUIPMENT_LABEL} /><Sel name="difficulty" label="Dificultad" o={LEVEL_LABEL} /><Sel name="movement_pattern" label="Patrón" o={PATTERN_LABEL} /></div>
        <label className="block text-sm">Instrucciones (un paso por línea)<textarea name="instructions" rows={4} required className={fieldCls} /></label>
        <label className="block text-sm">Indicaciones de seguridad (una por línea)<textarea name="safety_notes" rows={2} className={fieldCls} /></label>
      </ActionForm>
    </section>
  );
}
