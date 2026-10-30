/** Sessions completed per week (all clients), as a plain SVG: no chart library needed on the home screen. */
export function WeeklyChart({ data }: { data: { label: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count)); const w = 320, h = 110, pad = 6;
  const x = (i: number) => pad + (i * (w - 2 * pad)) / (data.length - 1), y = (v: number) => h - pad - (v / max) * (h - 2 * pad);
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(d.count).toFixed(1)}`).join(" ");
  const total = data.reduce((a, d) => a + d.count, 0);
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-28 w-full" role="img" aria-label={`Sesiones completadas por semana en las últimas 8 semanas: ${data.map((d) => `${d.label}: ${d.count}`).join(", ")}`} preserveAspectRatio="none">
        <defs><linearGradient id="wk" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".35" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
        <path className="chart-area" d={`${line} L${x(data.length - 1)} ${h} L${x(0)} ${h}Z`} fill="url(#wk)" />
        <path className="chart-line" pathLength={1} d={line} fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {data.map((d, i) => <circle key={d.label + i} className="chart-dot" style={{ ["--i" as string]: i }} cx={x(i)} cy={y(d.count)} r="2.6" fill="var(--accent)" vectorEffect="non-scaling-stroke" />)}
      </svg>
      <figcaption className="mt-1 flex justify-between text-[11px] text-[var(--muted)]"><span>{data[0].label}</span><span>{total} sesiones en 8 semanas</span><span>{data[data.length - 1].label}</span></figcaption>
    </figure>
  );
}
