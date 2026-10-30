import { fieldCls } from "./ActionForm";

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Plain HTML form: the PDF is generated on the server from recorded data and downloads as a file. */
export function ReportForm({ clientId, trainer, now }: { clientId?: string; trainer: boolean; now: number }) {
  const to = iso(new Date(now)), from = iso(new Date(now - 28 * 86400000));
  return (
    <form method="post" action="/api/reports/progress" className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="font-semibold">Informe de progreso (PDF)</h2>
      <p className="text-xs text-[var(--muted)]">Resume el periodo con datos reales registrados: sesiones, adherencia, medidas, rendimiento y cambios del plan.</p>
      {clientId && <input type="hidden" name="client_id" value={clientId} />}
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Desde<input name="from" type="date" defaultValue={from} required className={fieldCls} /></label><label className="text-sm">Hasta<input name="to" type="date" defaultValue={to} required className={fieldCls} /></label></div>
      {trainer && <><label className="block text-sm">Observaciones del entrenador<textarea name="observations" rows={3} maxLength={3000} className={fieldCls} /></label><label className="block text-sm">Próximos objetivos<textarea name="next_goals" rows={2} maxLength={2000} className={fieldCls} /></label></>}
      <button className="rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-black">Generar y descargar PDF</button>
    </form>
  );
}
