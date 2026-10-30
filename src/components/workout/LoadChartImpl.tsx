"use client";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function LoadChartImpl({ data }: { data: { date: string; topLoad: number | null; e1rm: number | null }[] }) {
  return (
    <div className="h-60 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3" role="img" aria-label="Evolución de la carga máxima por sesión">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}><CartesianGrid stroke="#2f2f2f" /><XAxis dataKey="date" stroke="#999" fontSize={11} /><YAxis domain={["auto", "auto"]} stroke="#999" fontSize={11} width={40} />
          <Tooltip contentStyle={{ background: "#171717", border: "1px solid #2f2f2f" }} />
          <Line name="Carga máxima (kg)" type="monotone" dataKey="topLoad" stroke="#8cff2e" strokeWidth={2} dot connectNulls />
          <Line name="1RM estimado (kg)" type="monotone" dataKey="e1rm" stroke="#ff541c" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls /></LineChart>
      </ResponsiveContainer>
    </div>
  );
}
