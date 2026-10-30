import Link from "next/link";
import { Award, CalendarCheck, Check, Dumbbell, Flame, MessageCircle, Salad, Sparkles, Target, TrendingUp } from "lucide-react";
import { ActionForm, fieldCls } from "@/components/ActionForm";
import { CountUp } from "@/components/CountUp";
import { startWorkout } from "@/app/client/workout/actions";
import type { ClientHomeData } from "@/lib/dashboard/client-home-data";
import type { HSession } from "@/lib/dashboard/client-home";

const card = "lift rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5";
const WEEKDAY = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

function Bar({ value, target, label }: { value: number; target: number; label: string }) {
  const pct = target > 0 ? Math.round((Math.min(value, target) / target) * 100) : 0;
  return <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-2 overflow-hidden rounded-full bg-black/40"><div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} /></div>;
}

function Preview({ session }: { session: HSession }) {
  const total = session.exercises.reduce((a, e) => a + e.sets, 0);
  return (
    <>
      <p className="text-sm text-[var(--muted)]">{session.exercises.length} ejercicios · {total} series</p>
      <ul className="mt-2 space-y-1 text-sm">{session.exercises.slice(0, 5).map((e, i) => <li key={`${e.name}-${i}`} className="flex justify-between gap-3"><span>{e.name}</span><span className="text-[var(--muted)]">{e.sets} series</span></li>)}</ul>
      {session.exercises.length > 5 && <p className="mt-1 text-xs text-[var(--muted)]">y {session.exercises.length - 5} más</p>}
    </>
  );
}

export function Hero({ h }: { h: ClientHomeData }) {
  return (
    <header>
      <p className="text-sm text-[var(--muted)]">{h.dateLabel}</p>
      <h1 className="text-3xl font-semibold">Hola, {h.firstName}</h1>
      <p className="mt-2 flex items-start gap-2 text-[var(--muted)]"><Sparkles size={16} className="mt-1 shrink-0 text-[var(--accent)]" aria-hidden />{h.message}</p>
    </header>
  );
}

export function TodayCard({ h }: { h: ClientHomeData }) {
  const t = h.today;
  const head = (title: string) => <h2 className="flex items-center gap-2 text-lg font-semibold"><Dumbbell size={18} className="text-[var(--accent)]" aria-hidden />{title}</h2>;
  if (t.kind === "in_progress") return (
    <section className={`${card} border-[var(--accent)]/50`}>{head("Entrenamiento en curso")}
      <p className="mt-1 font-medium">{t.session?.name ?? "Tu entrenamiento"}</p><p className="text-sm text-[var(--muted)]">Lo que ya registraste está guardado.</p>
      <Link href={`/client/workout/${t.logId}`} className="mt-4 inline-block rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-black">Continuar entrenamiento</Link></section>);
  if (t.kind === "ready") return (
    <section className={`${card} border-[var(--accent)]/50`}>{head("Tu entrenamiento de hoy")}
      <p className="mt-1 font-medium">{t.session.name}</p><Preview session={t.session} />
      <ActionForm action={startWorkout.bind(null, t.session.id)} submitLabel="Empezar entrenamiento" className="mt-4 flex flex-wrap items-end gap-3 border-0 bg-transparent p-0">
        <label className="text-xs">¿Cómo te sientes hoy? (1–5)<select name="recovery" defaultValue="" className={fieldCls}><option value="">—</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
      </ActionForm>
      <Link href="/client/plan" className="mt-2 inline-block text-sm text-[var(--accent)] underline">Ver todo mi plan</Link></section>);
  if (t.kind === "done_today") return (
    <section className={card}>{head("¡Entrenamiento de hoy completado!")}
      <p className="mt-1 text-sm text-[var(--muted)]">Buen trabajo. Hidrátate, come bien y descansa.</p>
      {t.next && <p className="mt-3 text-sm">Lo que sigue: <b>{t.next.name}</b>{t.next.weekday ? ` (${WEEKDAY[t.next.weekday]})` : ""}</p>}
      <Link href="/client/progress" className="mt-3 inline-block text-sm text-[var(--accent)] underline">Ver cómo voy</Link></section>);
  if (t.kind === "rest") return (
    <section className={card}>{head("Hoy toca descansar")}
      <p className="mt-1 text-sm text-[var(--muted)]">Descansar es parte del plan: ahí es donde tu cuerpo se adapta.</p>
      <p className="mt-3 text-sm">Próximo entrenamiento: <b>{t.next.name}</b>{t.next.weekday ? ` · ${WEEKDAY[t.next.weekday]}` : ""}</p><Preview session={t.next} /></section>);
  return (
    <section className={card}>{head("Tu rutina de hoy")}
      <p className="mt-1 text-sm text-[var(--muted)]">Aparecerá aquí cuando tu entrenador publique un plan.</p></section>);
}

export function Onboarding({ h }: { h: ClientHomeData }) {
  return (
    <section className={card} aria-labelledby="empezar"><h2 id="empezar" className="text-lg font-semibold">Mientras tu entrenador prepara tu plan</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">Estos pasos le dan a {h.trainer ?? "tu entrenador"} lo que necesita para hacerte un plan a tu medida.</p>
      <ol className="mt-3 space-y-2">{h.onboarding.map((s) => (
        <li key={s.id} className="flex items-start gap-3 text-sm">
          <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${s.done ? "border-[var(--accent)] bg-[var(--accent)] text-black" : "border-[var(--border)]"}`}>{s.done && <Check size={12} aria-label="Hecho" />}</span>
          <span>{s.done ? <span className="text-[var(--muted)] line-through">{s.title}</span> : <Link href={s.href} className="font-medium underline">{s.title}</Link>}<br /><span className="text-xs text-[var(--muted)]">{s.detail}</span></span>
        </li>))}</ol></section>);
}

export function WeekCard({ h }: { h: ClientHomeData }) {
  const a = h.adherence;
  return (
    <section className={card} aria-labelledby="semana"><h2 id="semana" className="flex items-center gap-2 font-semibold"><CalendarCheck size={16} className="text-[var(--accent)]" aria-hidden />Tu semana</h2>
      <ul className="mt-3 flex justify-between" aria-label="Días de la semana">{h.strip.map((d) => (
        <li key={d.date} className="flex flex-col items-center gap-1 text-xs">
          <span className={d.today ? "font-semibold text-[var(--accent)]" : "text-[var(--muted)]"}>{d.label}</span>
          <span className={`grid h-8 w-8 place-items-center rounded-full border ${d.trained ? "border-[var(--accent)] bg-[var(--accent)] text-black" : d.today ? "border-[var(--accent)]" : "border-[var(--border)]"}`}>{d.trained && <Check size={14} aria-hidden />}<span className="sr-only">{`${d.date}: ${d.trained ? "entrenaste" : d.future ? "por venir" : "sin entrenamiento"}${d.today ? " (hoy)" : ""}`}</span></span>
        </li>))}</ul>
      {a.scheduled > 0 && <div className="mt-4"><div className="mb-1 flex justify-between text-sm"><span>Sesiones de la semana</span><b>{a.completed} de {a.scheduled}</b></div><Bar value={a.completed} target={a.scheduled} label="Sesiones completadas esta semana" /></div>}
    </section>);
}

export function StreakCard({ h }: { h: ClientHomeData }) {
  return (
    <section className={card} aria-labelledby="racha"><h2 id="racha" className="flex items-center gap-2 font-semibold"><Flame size={16} className="text-[var(--accent)]" aria-hidden />Tu racha</h2>
      <p className="mt-3"><span className="text-4xl font-semibold"><CountUp value={h.streak} /></span> <span className="text-[var(--muted)]">{h.streak === 1 ? "semana seguida" : "semanas seguidas"}</span></p>
      <p className="mt-2 text-xs text-[var(--muted)]">{h.streak === 0 ? "Un entrenamiento esta semana empieza tu racha." : "Cuenta cada semana con al menos un entrenamiento. Si esta semana aún no entrenas, tu racha sigue viva."}</p>
      <p className="mt-3 text-sm text-[var(--muted)]">{h.completed} {h.completed === 1 ? "entrenamiento completado" : "entrenamientos completados"} en total</p></section>);
}

export function Challenges({ h }: { h: ClientHomeData }) {
  return (
    <section className={card} aria-labelledby="retos"><h2 id="retos" className="flex items-center gap-2 font-semibold"><Target size={16} className="text-[var(--accent)]" aria-hidden />Retos de la semana</h2>
      <ul className="mt-3 space-y-4">{h.challenges.map((c) => (
        <li key={c.id}>
          <div className="flex items-start gap-3 text-sm">
            <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${c.done ? "border-[var(--accent)] bg-[var(--accent)] text-black" : "border-[var(--border)]"}`}>{c.done && <Check size={12} aria-label="Cumplido" />}</span>
            <div className="min-w-0 flex-1"><p className="font-medium">{c.href && !c.done ? <Link href={c.href} className="underline">{c.title}</Link> : c.title}</p><p className="text-xs text-[var(--muted)]">{c.detail}</p>
              {c.progress && <div className="mt-1.5"><Bar value={c.progress.value} target={c.progress.target} label={c.title} /></div>}</div>
          </div></li>))}</ul></section>);
}

export function Achievements({ h }: { h: ClientHomeData }) {
  const unlocked = h.achievements.filter((a) => a.unlocked).length;
  return (
    <section className={card} aria-labelledby="logros"><h2 id="logros" className="flex items-center gap-2 font-semibold"><Award size={16} className="text-[var(--accent)]" aria-hidden />Tus logros <span className="text-xs font-normal text-[var(--muted)]">{unlocked} de {h.achievements.length}</span></h2>
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{h.achievements.map((a) => (
        <li key={a.id} className={`rounded-lg border p-3 text-sm ${a.unlocked ? "border-[var(--accent)]/60" : "border-[var(--border)] opacity-80"}`}>
          <p className={`font-medium ${a.unlocked ? "" : "text-[var(--muted)]"}`}>{a.title}</p>
          <p className="text-xs text-[var(--muted)]">{a.unlocked ? "Conseguido" : `${a.progress.value} de ${a.progress.target}`}</p></li>))}</ul></section>);
}

const kg = (n: number) => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(n);
export function ProgressCard({ h }: { h: ClientHomeData }) {
  const v = h.weekVolume;
  return (
    <section className={card} aria-labelledby="progreso"><h2 id="progreso" className="flex items-center gap-2 font-semibold"><TrendingUp size={16} className="text-[var(--accent)]" aria-hidden />Tu progreso</h2>
      {v.this === 0 && v.last === 0 && h.records.length === 0 && !h.weight ? <p className="mt-3 text-sm text-[var(--muted)]">Aquí verás tu carga, tus marcas y tu peso en cuanto registres tu primer entrenamiento o medida.</p> : <dl className="mt-3 space-y-3 text-sm">
        {(v.this > 0 || v.last > 0) && <div><dt className="text-[var(--muted)]">Carga levantada esta semana</dt><dd><b>{kg(v.this)} kg</b>{v.last > 0 && <span className="text-[var(--muted)]"> · la semana pasada {kg(v.last)} kg</span>}</dd></div>}
        {h.records.length > 0 && <div><dt className="text-[var(--muted)]">Marcas personales recientes</dt><dd><ul className="mt-1 space-y-1">{h.records.map((r) => <li key={`${r.exercise}-${r.date}`}><b>{r.exercise}</b> · {r.detail}</li>)}</ul></dd></div>}
        {h.weight && <div><dt className="text-[var(--muted)]">Peso registrado</dt><dd><b>{kg(h.weight.last)} kg</b>{h.weight.delta !== null && <span className="text-[var(--muted)]"> · desde que empezaste: {h.weight.delta > 0 ? "+" : ""}{kg(h.weight.delta)} kg</span>}</dd></div>}
      </dl>}
      <Link href="/client/progress" className="mt-3 inline-block text-sm text-[var(--accent)] underline">Ver mi progreso completo</Link></section>);
}

export function QuickLinks({ h }: { h: ClientHomeData }) {
  const item = "flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm hover:border-[var(--accent)]/60";
  return (
    <section aria-label="Accesos rápidos" className="grid gap-3 sm:grid-cols-2">
      <Link href="/client/messages" className={item}><MessageCircle size={18} className="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden /><span><b>{h.trainer ? `Habla con ${h.trainer}` : "Habla con tu entrenador"}</b><br /><span className="text-[var(--muted)]">{h.unreadMessage ? `Nuevo: ${h.unreadMessage.body.length > 80 ? `${h.unreadMessage.body.slice(0, 80)}…` : h.unreadMessage.body}` : "Escríbele a tu entrenador"}</span></span></Link>
      {h.nutritionEnabled && <Link href="/client/nutrition" className={item}><Salad size={18} className="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden /><span><b>Tu alimentación</b><br /><span className="text-[var(--muted)]">El plan de comidas que preparó tu entrenador</span></span></Link>}
      {h.notifications.map((n) => <Link key={n.id} href={n.link && n.link.startsWith("/client") ? n.link : "/client/notifications"} className={item}><span aria-hidden className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" /><span><b>{n.title}</b><br /><span className="text-[var(--muted)]">Aviso nuevo</span></span></Link>)}
    </section>);
}
