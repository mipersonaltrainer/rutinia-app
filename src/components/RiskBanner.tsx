export function RiskBanner({ level, reasons, audience }: { level: string | null; reasons: string[]; audience: "client" | "trainer" }) {
  if (!level || level === "none") return <p className="rounded-lg border border-[var(--border)] p-3 text-sm">Sin alertas en el cribado inicial.</p>;
  const stop = level === "professional_evaluation";
  return (
    <div role="alert" className={`rounded-lg border p-4 text-sm ${stop ? "border-[var(--warn)]" : "border-[var(--accent)]/50"}`}>
      <p className="font-semibold">{stop ? "Se requiere valoración profesional antes de iniciar un plan estándar" : "Requiere revisión del entrenador"}</p>
      {audience === "trainer" && <ul className="mt-2 list-disc pl-5">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
      {audience === "client" && stop && <p className="mt-1 text-[var(--muted)]">Tu entrenador se pondrá en contacto contigo. Esto no es un diagnóstico; no suspendas ningún tratamiento médico.</p>}
    </div>
  );
}
