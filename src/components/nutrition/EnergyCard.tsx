import { computeEnergy, type EnergyInput } from "@/lib/nutrition/energy";

const PREC: Record<string, string> = { medido: "medido", media: "precisión media", baja: "precisión baja" };
const chip = "rounded-full border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)]";

/** Body-fat and daily-energy estimates, computed on the server from data the platform already has. Optional data only improves it. */
export function EnergyCard({ input, audience, hasAssessment }: { input: EnergyInput; audience: "trainer" | "client"; hasAssessment: boolean }) {
  const e = computeEnergy(input);
  return (
    <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 text-sm">
      <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">Grasa corporal y calorías</h2><span className={chip}>estimación · v{e.formulaVersion}</span><span className={chip}>{PREC[e.precision]}</span></div>
      {e.blocked && <p role="alert" className="rounded-lg border border-[var(--warn)] p-3">{e.blocked}</p>}
      {!e.blocked && !e.bmr && <p className="text-[var(--muted)]">{hasAssessment ? "Faltan datos para calcular:" : "Falta la evaluación inicial y una medición para calcular:"} {e.missing.join(" · ")}.</p>}
      {e.bodyFat && (
        <div><p className="text-[var(--muted)]">% de grasa corporal estimado</p>
          <p className="text-2xl font-semibold">{String(e.bodyFat.pct).replace(".", ",")} % <span className="text-sm font-normal text-[var(--muted)]">(rango probable {String(e.bodyFat.low).replace(".", ",")}–{String(e.bodyFat.high).replace(".", ",")} %)</span></p>
          <p className="text-xs text-[var(--muted)]">{e.bodyFat.method}. {e.bodyFat.note}</p></div>)}
      {e.bmr && e.tdee && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div><p className="text-[var(--muted)]">Metabolismo basal</p><p className="text-xl font-semibold">{e.bmr.kcal} kcal</p><p className="text-xs text-[var(--muted)]">{e.bmr.formula}</p></div>
          <div><p className="text-[var(--muted)]">Gasto diario estimado</p><p className="text-xl font-semibold">{e.tdee.kcal} kcal</p><p className="text-xs text-[var(--muted)]">× {String(e.tdee.factor).replace(".", ",")} de actividad{e.tdee.note ? ` · ${e.tdee.note}` : ""}</p></div>
          {e.target && <div><p className="text-[var(--muted)]">Objetivo según su meta</p><p className="text-xl font-semibold text-[var(--accent)]">{e.target.kcal} kcal</p><p className="text-xs text-[var(--muted)]">{e.goal?.label}{e.goal && e.goal.adjustmentPct !== 0 ? ` (${e.goal.adjustmentPct > 0 ? "+" : ""}${e.goal.adjustmentPct} %)` : ""}</p></div>}
        </div>)}
      {e.target && (
        <div><p className="mb-1 text-[var(--muted)]">Reparto sugerido de macronutrientes</p>
          <p><b>Proteína</b> {e.target.macros.proteinG} g · <b>Carbohidratos</b> {e.target.macros.carbsG} g · <b>Grasa</b> {e.target.macros.fatG} g</p></div>)}
      {e.notes.length > 0 && <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--muted)]">{e.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
      {e.bmr && e.missing.length > 0 && (
        <details className="text-xs"><summary className="cursor-pointer text-[var(--accent)]">Para más precisión (opcional)</summary>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-[var(--muted)]">{e.missing.map((m) => <li key={m}>{m}</li>)}</ul>
          <p className="mt-1 text-[var(--muted)]">{audience === "trainer" ? "Regístralos en «Registrar medición»." : "Puedes registrarlos en «Medidas»."} Con lo que ya hay, el cálculo funciona.</p></details>)}
      <p className="text-xs text-[var(--muted)]">Son estimaciones con fórmulas poblacionales, no mediciones clínicas ni una prescripción dietética. No sustituyen la valoración de un nutricionista o médico.</p>
    </div>
  );
}
