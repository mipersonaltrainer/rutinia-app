"use client";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";

export function WeightChartImpl({ data }: { data: { date: string; kg: number }[] }) {
  return (
    <div className="h-56 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3" role="img" aria-label="Evolución del peso en kilogramos">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}><CartesianGrid stroke="#2f2f2f" /><XAxis dataKey="date" stroke="#999" fontSize={12} /><YAxis domain={["auto", "auto"]} stroke="#999" fontSize={12} width={40} />
          <Tooltip contentStyle={{ background: "#171717", border: "1px solid #2f2f2f" }} /><Line type="monotone" dataKey="kg" stroke="#8cff2e" strokeWidth={2} dot /></LineChart>
      </ResponsiveContainer>
    </div>
  );
}
