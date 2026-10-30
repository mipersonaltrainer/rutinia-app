import { compareMeasurements, type Measure } from "@/lib/calculations/compare";
import { WeightChart } from "./WeightChart";

type M = Measure & { id: string; weight_kg: number | null; waist_cm: number | null; hip_cm: number | null };
type R = { measurement_id: string; indicator: string; value: number; unit: string; formula: string; formula_version: string; provenance: string };

const NAMES: Record<string, string> = { bmi: "IMC", bmr: "Metabolismo basal (Mifflin-St Jeor)", tdee: "Gasto energético diario estimado", body_fat_navy: "% grasa (método US Navy)", waist_to_height: "Cintura/estatura", waist_to_hip: "Cintura/cadera" };
const TAKEN: Record<string, string> = { self: "alumno", trainer: "entrenador", device: "dispositivo" };

export function MeasurementsView({ rows, results }: { rows: M[]; results: R[] }) {
  if (rows.length === 0) return <p className="text-sm text-[var(--muted)]">Aún no hay mediciones.</p>;
  const [latest, prev] = rows; // ordered newest first
  const latestRes = results.filter((r) => r.measurement_id === latest.id);
  const cmp = prev ? compareMeasurements(prev, latest) : null;
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h3 className="mb-3 font-semibold">Indicadores de la última medición ({latest.measured_on})</h3>
        {latestRes.length === 0 ? <p className="text-sm text-[var(--muted)]">No hay datos suficientes para calcular indicadores (faltan medidas o datos de la anamnesis).</p> : (
          <ul className="space-y-2 text-sm">{latestRes.map((r) => (
            <li key={r.indicator}><b>{NAMES[r.indicator] ?? r.indicator}:</b> {r.value} {r.unit} <span className="text-[var(--muted)]">· estimación · {r.formula} v{r.formula_version}</span></li>))}
          </ul>)}
        <p className="mt-3 text-xs text-[var(--muted)]">Son estimaciones antropométricas, no mediciones clínicas. El IMC no distingue masa muscular de grasa. Masa muscular, ósea y agua corporal no se estiman sin un dispositivo.</p>
      </div>
      {cmp && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h3 className="mb-3 font-semibold">Cambio vs. {prev.measured_on}</h3>
          <p className="text-sm">{Object.entries(cmp.deltas).map(([k, v]) => `${k.replace("_cm", "").replace("_kg", "")}: ${v > 0 ? "+" : ""}${v}`).join(" · ") || "Sin medidas comparables"}</p>
          {cmp.warnings.map((w) => <p key={w} className="mt-1 text-xs text-[var(--warn)]">{w}</p>)}
        </div>)}
      <WeightChart data={[...rows].reverse().filter((r) => r.weight_kg !== null).map((r) => ({ date: r.measured_on, kg: r.weight_kg as number }))} />
      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full text-left text-sm"><thead className="text-[var(--muted)]"><tr><th className="p-3">Fecha</th><th>Peso kg</th><th>Cintura</th><th>Cadera</th><th>Método</th><th>Tomada por</th></tr></thead>
          <tbody>{rows.map((r) => (<tr key={r.id} className="border-t border-[var(--border)]"><td className="p-3">{r.measured_on}</td><td>{r.weight_kg ?? "—"}</td><td>{r.waist_cm ?? "—"}</td><td>{r.hip_cm ?? "—"}</td><td>{r.method}</td><td>{TAKEN[r.taken_by]}</td></tr>))}</tbody></table>
      </div>
    </div>
  );
}
