import { niceAxis, type DayPoint } from "@/lib/staff/sales";

const W = 1000, H = 330, L = 64, R = 18, T = 44, B = 262;   // plot: x from L to W-R, y from T (top) to B (baseline)
export const fmtMoney = (cents: number, cur: "COP" | "USD") => (cur === "COP" ? Math.round(cents / 100).toLocaleString("es-CO") : (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const compact = (cents: number, cur: "COP" | "USD") => { const v = cents / 100; if (cur === "USD") return v.toLocaleString("en-US"); return v >= 1_000_000 ? `${(v / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M` : v >= 1000 ? `${Math.round(v / 1000)} k` : String(v); };

/**
 * Sales per day: the amount as a line (one point per calendar day of the month, so February has 28 or 29 and the long months 31) and,
 * on the baseline, how many sales each day had. Plain SVG (no chart library); the same data is also offered as a table for screen readers.
 */
export function SalesChart({ days, currency, title, totals }: { days: DayPoint[]; currency: "COP" | "USD"; title: string; totals: { count: number; cents: number } }) {
  const n = days.length; const axis = niceAxis(Math.max(0, ...days.map((d) => d.cents)));
  const x = (i: number) => L + (i * (W - L - R)) / (n - 1), y = (c: number) => B - (c / axis.max) * (B - T);
  const line = days.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(d.cents).toFixed(1)}`).join(" ");
  const label = `Ventas de ${title}: ${totals.count} ventas por ${fmtMoney(totals.cents, currency)} ${currency}, un punto por cada uno de los ${n} días del mes.`;
  return (
    <figure>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[760px] w-full" role="img" aria-label={label}>
          <text x={W / 2} y="22" textAnchor="middle" fill="#fff" fontSize="22" fontWeight="500">{title}</text>
          {axis.ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,.12)" /><text x={L - 8} y={y(t) + 4} textAnchor="end" fill="rgba(255,255,255,.65)" fontSize="12">{t === 0 ? "0" : compact(t, currency)}</text></g>)}
          <path className="chart-area" d={`${line} L${x(n - 1)} ${B} L${x(0)} ${B}Z`} fill="var(--accent)" fillOpacity=".1" />
          <path className="chart-line" pathLength={1} d={line} fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
          {days.map((d, i) => (
            <g key={d.day}>
              {d.cents > 0 && <><circle className="chart-dot" style={{ ["--i" as string]: Math.min(i, 12) }} cx={x(i)} cy={y(d.cents)} r="3.6" fill="var(--accent)"><title>{`Día ${d.day}: ${fmtMoney(d.cents, currency)} ${currency} · ${d.count} venta${d.count === 1 ? "" : "s"}`}</title></circle>
                <text x={x(i)} y={y(d.cents) - 9} textAnchor="middle" fill="#fff" fontSize="10.5" fontWeight="500">{compact(d.cents, currency)}</text></>}
              <circle cx={x(i)} cy={B} r="3" fill="var(--warn)" /><text x={x(i)} y={B - 9} textAnchor="middle" fill="var(--warn-text)" fontSize="11" fontWeight="600">{d.count}</text>
              <text x={x(i)} y={B + 20} textAnchor="middle" fill="rgba(255,255,255,.65)" fontSize="11.5">{d.day}</text>
            </g>))}
          <line x1={L} x2={W - R} y1={B} y2={B} stroke="rgba(255,255,255,.35)" />
          <g transform={`translate(${W / 2 - 110} ${H - 20})`} fontSize="13" fill="#fff" fontWeight="600"><circle cx="0" cy="-4" r="5" fill="var(--warn)" /><text x="12" y="0">Número de ventas</text><circle cx="165" cy="-4" r="5" fill="var(--accent)" /><text x="177" y="0">Ingresos ({currency})</text></g>
        </svg>
      </div>
      <figcaption className="sr-only">{label}</figcaption>
      <table className="sr-only"><caption>Ventas por día de {title}</caption><thead><tr><th>Día</th><th>Ventas</th><th>Ingresos ({currency})</th></tr></thead>
        <tbody>{days.map((d) => <tr key={d.day}><td>{d.day}</td><td>{d.count}</td><td>{fmtMoney(d.cents, currency)}</td></tr>)}</tbody></table>
    </figure>
  );
}
