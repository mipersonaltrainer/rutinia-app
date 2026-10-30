import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireStaff } from "@/lib/support/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSales } from "@/lib/staff/data";
import { buildDaily, currentMonth, monthKey, parseMonth, salesStats, shiftMonth } from "@/lib/staff/sales";
import { SalesChart, fmtMoney } from "@/components/staff/SalesChart";
import { Stat } from "@/components/staff/Stat";

export const metadata = { title: "Ventas · Soporte" };
const KIND_LABEL = { subscription: "Suscripciones", slots: "Cupos de alumnos", ai: "Créditos de IA" } as const;
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export default async function Sales({ searchParams }: { searchParams: Promise<{ mes?: string; moneda?: string }> }) {
  const { mes, moneda } = await searchParams;
  await requireStaff();
  const now = new Date(); const mo = parseMonth(mes, now); const cur = moneda === "USD" ? "USD" : "COP";
  const rows = await loadSales(createAdminClient(), mo);                    // service role, only after requireStaff() passed
  const days = buildDaily(rows, mo, cur); const st = salesStats(days);
  const prev = shiftMonth(mo, -1), next = shiftMonth(mo, 1), isCurrent = monthKey(mo) === monthKey(currentMonth(now));
  const href = (m: typeof mo, c = cur) => `/staff/ventas?mes=${monthKey(m)}&moneda=${c}`;
  const byKind = (Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((k) => { const r = rows.filter((x) => x.kind === k && x.currency === cur); return { k, count: r.length, cents: r.reduce((n, x) => n + x.cents, 0) }; });
  const nav = "grid h-11 w-11 place-items-center rounded-full bg-[var(--surface-2)] hover:bg-white/10";
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl font-semibold">Ventas</h1><p className="text-sm text-[var(--muted)]">Pagos aprobados por día, en hora de Colombia. Suscripciones, cupos de alumnos y créditos de IA.</p></div>
        <div className="flex flex-wrap items-center gap-3">
          <nav aria-label="Moneda" className="flex gap-1 text-sm">{(["COP", "USD"] as const).map((c) => <Link key={c} href={href(mo, c)} aria-current={cur === c ? "page" : undefined} className={`rounded-full px-3 py-1 ${cur === c ? "bg-[var(--accent)] font-semibold text-black" : "bg-[var(--surface-2)]"}`}>{c === "COP" ? "Pesos (COP)" : "Dólares (USD)"}</Link>)}</nav>
          <nav aria-label="Mes" className="flex items-center gap-2 text-sm">
            <Link href={href(prev)} className={nav} aria-label="Mes anterior"><ChevronLeft size={18} aria-hidden /></Link>
            <span className="min-w-32 text-center font-medium capitalize">{MONTHS[mo.m - 1]} {mo.y}</span>
            {isCurrent ? <span className={`${nav} opacity-30`} aria-hidden><ChevronRight size={18} /></span> : <Link href={href(next)} className={nav} aria-label="Mes siguiente"><ChevronRight size={18} aria-hidden /></Link>}
          </nav>
        </div>
      </div>
      <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Ventas del mes" value={st.count} hint={`${st.activeDays} de ${days.length} días con ventas`} />
        <div className="lift rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"><p className="text-xs text-[var(--muted)]">Ingresos del mes</p><p className="mt-1 text-2xl font-semibold tracking-tight">{fmtMoney(st.cents, cur)} <span className="text-sm font-normal text-[var(--muted)]">{cur}</span></p></div>
        <div className="lift rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"><p className="text-xs text-[var(--muted)]">Promedio por día</p><p className="mt-1 text-2xl font-semibold tracking-tight">{fmtMoney(st.avgCents, cur)} <span className="text-sm font-normal text-[var(--muted)]">{cur}</span></p></div>
        <div className="lift rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"><p className="text-xs text-[var(--muted)]">Mejor día</p><p className="mt-1 text-2xl font-semibold tracking-tight">{st.bestDay ? `${st.bestDay.day} de ${MONTHS[mo.m - 1]}` : "—"}</p>{st.bestDay && <p className="text-xs text-[var(--muted)]">{fmtMoney(st.bestDay.cents, cur)} {cur} · {st.bestDay.count} venta{st.bestDay.count === 1 ? "" : "s"}</p>}</div>
      </div>
      <div className="lift rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 md:p-6">
        <SalesChart days={days} currency={cur} title={monthKey(mo)} totals={{ count: st.count, cents: st.cents }} />
        <p className="mt-2 text-center text-sm"><span className="text-[var(--warn-text)]">Número: {st.count}</span> · <span className="text-[var(--accent)]">Ingresos: {fmtMoney(st.cents, cur)} {cur}</span></p>
      </div>
      <div className="lift rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="mb-2 font-semibold">Por tipo de venta</h2>
        <ul className="stagger divide-y divide-[var(--border)] text-sm">{byKind.map((b) => <li key={b.k} className="flex justify-between gap-3 py-2"><span>{KIND_LABEL[b.k]}</span><span>{b.count} · {fmtMoney(b.cents, cur)} {cur}</span></li>)}</ul>
        <p className="mt-3 text-xs text-[var(--muted)]">Solo cuentan los pagos aprobados y verificados con el proveedor. Los reembolsos y los pagos pendientes no suman.</p>
      </div>
    </section>
  );
}
