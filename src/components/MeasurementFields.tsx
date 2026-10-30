import { fieldCls } from "./ActionForm";

const today = () => new Date().toISOString().slice(0, 10);
const num = (name: string, label: string) => (
  <label className="text-sm">{label}<input name={name} type="number" step="0.1" min="0" className={fieldCls} /></label>
);

export function MeasurementFields({ fixedMethod }: { fixedMethod?: boolean }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">Fecha<input name="measured_on" type="date" defaultValue={today()} max={today()} required className={fieldCls} /></label>
        <label className="text-sm">Unidad de peso<select name="weightUnit" className={fieldCls}><option value="kg">kg</option><option value="lb">lb</option></select></label>
        <label className="text-sm">Unidad de longitud<select name="lengthUnit" className={fieldCls}><option value="cm">cm</option><option value="in">pulgadas</option></select></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {num("weight", "Peso")}{num("height", "Estatura")}{num("waist", "Cintura")}{num("hip", "Cadera")}
        {num("neck", "Cuello")}{num("arm", "Brazo")}{num("thigh", "Muslo")}{num("calf", "Pantorrilla")}
      </div>
      <label className="block text-sm">Método
        <select name="method" defaultValue="tape" className={fieldCls}><option value="tape">Cinta métrica</option><option value="scale">Báscula</option><option value="bioimpedance">Bioimpedancia</option><option value="other">Otro</option></select>
      </label>
      {fixedMethod ? null : null}
      <label className="block text-sm">Observaciones (opcional)<input name="notes" maxLength={500} className={fieldCls} /></label>
    </>
  );
}
