import Link from "next/link";
import { requireUser } from "@/lib/session";
import { parseFilters } from "@/lib/exercises/filters";
import { searchExercises, type ExerciseRow } from "@/lib/exercises/search";
import { ANGLE_LABEL, EQUIPMENT_LABEL, GOAL_LABEL, JOINT_LABEL, LEVEL_LABEL, MUSCLE_LABEL, PATTERN_LABEL } from "@/lib/exercises/labels";
import { fieldCls } from "@/components/ActionForm";

const Select = ({ name, label, options, value }: { name: string; label: string; options: Record<string, string>; value?: string }) => (
  <label className="text-sm">{label}<select name={name} defaultValue={value ?? ""} className={fieldCls}><option value="">Todos</option>{Object.entries(options).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
);

function Cards({ rows }: { rows: ExerciseRow[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{rows.map((e) => (
      <li key={e.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
        <Link href={`/trainer/exercises/${e.id}`} className="font-semibold text-white underline">{e.name_es}</Link>
        <p className="mt-1 text-[var(--muted)]">{MUSCLE_LABEL[e.primary_muscle]} · {EQUIPMENT_LABEL[e.equipment]} · {LEVEL_LABEL[e.difficulty]}{e.bench_angle ? ` · ${ANGLE_LABEL[e.bench_angle]}` : ""}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">{e.owner_id ? "Propio · " : ""}{e.media_status === "pending" ? "Video pendiente" : "Con video"} · {e.review_status === "draft" ? "Borrador sin revisar" : "Revisado"}</p>
      </li>))}</ul>
  );
}

export default async function Exercises({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const f = parseFilters(sp);
  const { supabase, profile } = await requireUser("trainer");
  const res = await searchExercises(supabase, f, profile.id);
  const data = res.rows; const count = res.total; const pages = res.pages;
  const qs = (p: number) => { const u = new URLSearchParams(); for (const [k, v] of Object.entries(sp)) for (const x of ([] as string[]).concat(v ?? [])) if (k !== "page") u.append(k, x); u.set("page", String(p)); return u.toString(); };
  const without = (key: string) => { const u = new URLSearchParams(); for (const [k, v] of Object.entries(sp)) for (const x of ([] as string[]).concat(v ?? [])) if (k !== "page" && !(key === "q" ? k === "q" : key === "avoid" ? k === "avoid" : k === key)) u.append(k, x); return u.toString(); };
  return (
    <section className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between"><h1 className="text-3xl font-semibold">Biblioteca de ejercicios</h1><Link href="/trainer/exercises/new" className="rounded-lg border border-[var(--accent)] px-3 py-2 text-sm text-[var(--accent)]">Crear ejercicio propio</Link></div>
      <form method="get" className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <label className="block text-sm">Buscar<input name="q" defaultValue={sp.q as string} placeholder="p. ej. sentadilla, press, curl…" className={fieldCls} /></label>
        <div className="grid gap-3 sm:grid-cols-3">
          <Select name="muscle" label="Músculo" options={MUSCLE_LABEL} value={f.muscle} /><Select name="equipment" label="Equipamiento" options={EQUIPMENT_LABEL} value={f.equipment} />
          <Select name="level" label="Dificultad" options={LEVEL_LABEL} value={f.level} /><Select name="pattern" label="Patrón de movimiento" options={PATTERN_LABEL} value={f.pattern} />
          <Select name="angle" label="Inclinación del banco (plano / inclinado / declinado)" options={ANGLE_LABEL} value={f.angle} /><Select name="goal" label="Objetivo" options={GOAL_LABEL} value={f.goal} />
        </div>
        <fieldset><legend className="text-sm">Excluir ejercicios que cargan (restricciones del alumno)</legend>
          <div className="mt-1 flex flex-wrap gap-3 text-sm">{Object.entries(JOINT_LABEL).map(([k, v]) => <label key={k} className="flex gap-1"><input type="checkbox" name="avoid" value={k} defaultChecked={f.avoid.includes(k)} /> {v}</label>)}</div></fieldset>
        <div className="flex flex-wrap gap-4 text-sm"><label className="flex gap-1"><input type="checkbox" name="home" value="1" defaultChecked={f.home} /> Hechos en casa</label><label className="flex gap-1"><input type="checkbox" name="mine" value="1" defaultChecked={f.mine} /> Solo los míos</label></div>
        <div className="flex gap-3"><button className="rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-black">Filtrar</button><Link href="/trainer/exercises" className="py-2 text-sm text-[var(--muted)]">Limpiar</Link></div>
        <p className="text-xs text-[var(--muted)]">La exclusión por articulación es una heurística editorial: no sustituye la valoración profesional de las lesiones del alumno.</p>
      </form>
      <p className="text-sm text-[var(--muted)]">{count ?? 0} ejercicios · página {f.page} de {pages}</p>
      {data.length === 0 ? (
        <div className="space-y-4">
          <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">Con todos los filtros a la vez no hay ejercicios. {res.relaxations.length > 0 ? "Quita el que más estorba:" : "Prueba con otra palabra o limpia los filtros."}</p>
          {res.relaxations.length > 0 && <div className="flex flex-wrap gap-2">{res.relaxations.map((r) => <Link key={r.key} href={`/trainer/exercises?${without(r.key)}`} className="rounded-full border border-[var(--accent)] px-3 py-1 text-sm text-[var(--accent)]">Quitar «{r.label}» → {r.count} ejercicio{r.count === 1 ? "" : "s"}</Link>)}</div>}
          {res.suggested && (<div className="space-y-3"><h2 className="font-semibold">Resultados parecidos (sin «{res.suggested.label}») · {res.suggested.total}</h2><Cards rows={res.suggested.rows} /></div>)}
        </div>) : <Cards rows={data} />}
      <nav aria-label="Paginación" className="flex gap-4 text-sm">{f.page > 1 && <Link href={`/trainer/exercises?${qs(f.page - 1)}`}>← Anterior</Link>}{f.page < pages && <Link href={`/trainer/exercises?${qs(f.page + 1)}`}>Siguiente →</Link>}</nav>
    </section>
  );
}
