import { ActionForm, fieldCls } from "./ActionForm";
import { updateSession } from "@/app/trainer/plans/actions";

export function SessionHeaderForm({ s, planId }: { s: { id: string; name: string; weekday: number | null; warmup_notes: string | null }; planId: string }) {
  return (
    <ActionForm action={updateSession.bind(null, s.id, planId)} submitLabel="Guardar sesión" className="border-0 bg-transparent p-0">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs">Nombre<input name="name" defaultValue={s.name} required className={fieldCls} /></label>
        <label className="text-xs">Día de la semana<select name="weekday" defaultValue={s.weekday ?? ""} className={fieldCls}><option value="">Sin día fijo</option>{["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></label>
        <label className="text-xs">Calentamiento<input name="warmup_notes" defaultValue={s.warmup_notes ?? ""} maxLength={500} className={fieldCls} /></label>
      </div>
    </ActionForm>
  );
}
