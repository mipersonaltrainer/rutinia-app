"use client";
import dynamic from "next/dynamic";

// Same idea as WeightChart: the charting library is loaded on demand, and not at all when there is nothing to chart.
const Impl = dynamic(() => import("./LoadChartImpl").then((m) => m.LoadChartImpl), {
  ssr: false,
  loading: () => <div className="h-60 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)]" role="status" aria-label="Cargando gráfica" />,
});

export function LoadChart({ data }: { data: { date: string; topLoad: number | null; e1rm: number | null }[] }) {
  if (data.length < 2) return <p className="text-sm text-[var(--muted)]">Se necesitan al menos dos sesiones con carga para ver la tendencia.</p>;
  return <Impl data={data} />;
}
