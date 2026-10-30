"use client";
import dynamic from "next/dynamic";

// recharts is ~100 KB gzipped. It is fetched only when there are at least two weights to draw, after the page is interactive,
// so a new user (no data yet) never downloads it and nobody pays for it in the first load of the page.
const Impl = dynamic(() => import("./WeightChartImpl").then((m) => m.WeightChartImpl), {
  ssr: false,
  loading: () => <div className="h-56 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)]" role="status" aria-label="Cargando gráfica" />,
});

export function WeightChart({ data }: { data: { date: string; kg: number }[] }) {
  if (data.length < 2) return <p className="text-sm text-[var(--muted)]">Registra al menos dos pesos para ver la tendencia. Las variaciones diarias de peso no indican por sí solas un cambio de grasa.</p>;
  return <Impl data={data} />;
}
