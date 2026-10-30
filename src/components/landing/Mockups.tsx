import { Bell, CalendarDays, ClipboardList, Dumbbell, LayoutGrid, MessageSquare, Users } from "lucide-react";

/** All mockups are illustrations with example data (not real customers or metrics). */
const panel = "rounded-2xl bg-gradient-to-b from-[#f6f6f6] to-[#dcdcdc] text-[#0d0d0d] shadow-[0_18px_40px_rgba(0,0,0,.5)]";

function LineChart({ className = "", stroke = "#0d0d0d" }: { className?: string; stroke?: string }) {
  return (
    <svg viewBox="0 0 200 70" className={className} aria-hidden="true" preserveAspectRatio="none">
      <defs><linearGradient id="lc" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#8cff2e" stopOpacity=".5" /><stop offset="1" stopColor="#8cff2e" stopOpacity="0" /></linearGradient></defs>
      <path d="M0 58 L25 50 L50 54 L75 40 L100 44 L125 28 L150 32 L175 14 L200 8 L200 70 L0 70Z" fill="url(#lc)" />
      <path d="M0 58 L25 50 L50 54 L75 40 L100 44 L125 28 L150 32 L175 14 L200 8" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function DashboardMock({ compact = false }: { compact?: boolean }) {
  const nav = [LayoutGrid, Users, ClipboardList, Dumbbell, MessageSquare];
  return (
    <div className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[0_40px_120px_rgba(0,0,0,.6)] md:rounded-[36px] md:p-2.5" role="img" aria-label="Ilustración del panel del entrenador con alumnos, adherencia y progreso de cargas (datos de ejemplo)">
      <div className="flex overflow-hidden rounded-[22px] bg-[#ececec] text-[#0d0d0d] md:rounded-[28px]">
        <div className="hidden w-[68px] shrink-0 flex-col items-center gap-4 bg-[#0d0d0d] py-5 sm:flex">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--accent)] text-black"><LayoutGrid size={16} /></span>
          {nav.slice(1).map((I, i) => <I key={i} size={18} className="text-white/60" />)}
        </div>
        <div className="min-w-0 flex-1 p-3 sm:p-5">
          <div className="flex items-center justify-between"><p className="text-[18px] font-semibold tracking-[-0.03em] sm:text-[22px]">Panel</p>
            <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-full bg-white"><MessageSquare size={14} /></span><span className="relative grid h-8 w-8 place-items-center rounded-full bg-white"><Bell size={14} /><i className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#ff541c]" /></span><span className="h-8 w-8 rounded-full bg-gradient-to-br from-[#8cff2e] to-[#2b6b00]" /></div></div>
          <div className={`mt-3 grid grid-cols-2 gap-2.5 sm:mt-4 sm:gap-3 ${compact ? "" : "sm:grid-cols-[1.15fr_.9fr_1fr]"}`}>
            <div className={`rounded-2xl bg-[#0d0d0d] p-4 text-white ${compact ? "" : "col-span-2 sm:col-span-1"}`}>
              <p className="text-[11px] text-white/60">Hoy</p><p className="mt-1 text-[15px] font-semibold tracking-[-0.02em]">3 sesiones programadas</p>
              <ul className="mt-3 space-y-2 text-[11px]">{[["Ana M.", "Fullbody A", "7:00"], ["Luis P.", "Torso/pierna", "9:30"], ["Carla R.", "Reevaluación", "17:00"]].map(([n, s, t]) => <li key={n} className="flex items-center justify-between"><span className="flex items-center gap-2"><i className="h-5 w-5 rounded-full bg-white/15 text-center text-[9px] leading-5 not-italic">{n[0]}</i>{n}<span className="text-white/55">{s}</span></span><span className="text-[var(--accent)]">{t}</span></li>)}</ul>
            </div>
            <div className={`grid-cols-2 gap-2 rounded-2xl bg-white p-2.5 text-[11px] font-medium ${compact ? "hidden" : "grid"}`}><span className="grid place-items-center rounded-xl bg-[#f2f2f2] p-2 text-center">Invitar alumno</span><span className="grid place-items-center rounded-xl bg-[#f2f2f2] p-2 text-center">Nuevo plan</span><span className="grid place-items-center rounded-xl bg-[#f2f2f2] p-2 text-center">Medidas</span><span className="grid place-items-center rounded-xl bg-[#f2f2f2] p-2 text-center">Mensajes</span></div>
            <div className={`rounded-2xl bg-white p-4 ${compact ? "" : "col-span-2 sm:col-span-1"}`}><div className="flex items-center justify-between text-[12px] font-semibold"><span>Adherencia semanal</span><CalendarDays size={14} className="text-black/60" /></div>
              <p className="mt-2 text-[26px] font-semibold tracking-[-0.04em]">82%</p><p className="text-[10px] text-black/60">sesiones completadas / programadas</p>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#e4e4e4]"><div className="h-full w-[82%] rounded-full bg-[var(--accent)]" /></div></div>
          </div>
          {!compact && (
            <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:mt-3 sm:grid-cols-[1fr_1.2fr_1fr] sm:gap-3">
              <div className="rounded-2xl bg-white p-4 text-[12px]"><p className="font-semibold">Alumnos</p><p className="mt-1 text-[10px] text-black/60">12 de 20 cupos en uso</p>
                <ul className="mt-2 space-y-1.5">{["Ana M.", "Luis P.", "Carla R.", "Diego T."].map((n, i) => <li key={n} className="flex items-center justify-between"><span>{n}</span><span className={`rounded-full px-2 py-0.5 text-[9px] ${i === 2 ? "bg-[#ffe3d8] text-[#b23a12]" : "bg-[#e7ffd0] text-[#2b6b00]"}`}>{i === 2 ? "Revisar" : "Al día"}</span></li>)}</ul></div>
              <div className="rounded-2xl bg-white p-4"><div className="flex items-center justify-between text-[12px] font-semibold"><span>Carga · Sentadilla goblet</span><span className="text-[10px] font-normal text-black/60">Últimas 8 sem.</span></div><LineChart className="mt-2 h-20 w-full" /></div>
              <div className="hidden rounded-2xl bg-white p-4 text-[12px] sm:block"><p className="font-semibold">Alertas</p><ul className="mt-2 space-y-2 text-[10px]"><li className="rounded-lg bg-[#ffe3d8] p-2 text-[#8a2a08]">Molestia 7/10 reportada: requiere atención profesional</li><li className="rounded-lg bg-[#f2f2f2] p-2">Reevaluación vence en 5 días</li></ul></div>
            </div>)}
        </div>
      </div>
    </div>
  );
}

/** Tilted stack of light cards, the "isometric" tile look of the reference. */
export function IsoStack({ kind }: { kind: "invite" | "plan" | "progress" }) {
  return (
    <div className="tile grid h-[210px] place-items-center sm:h-[230px]" role="img" aria-label={{ invite: "Ilustración: invitación a un alumno", plan: "Ilustración: plan de entrenamiento con ejercicios", progress: "Ilustración: gráfico de progreso" }[kind]}>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_100%,rgba(140,255,46,.08),transparent_60%)]" />
      <div className="iso relative h-[120px] w-[190px]">
        <div className={`${panel} absolute -left-3 top-6 h-[110px] w-[180px] opacity-60`} />
        <div className={`${panel} absolute left-0 top-0 h-[120px] w-[190px] p-3.5`}>
          {kind === "invite" && (<><p className="text-[10px] font-semibold text-black/60">Nueva invitación</p><div className="mt-2 rounded-lg bg-white px-2 py-1.5 text-[10px] text-black/60">alumno@correo.com</div><div className="mt-2 flex items-center justify-between"><span className="rounded-full bg-[#e7ffd0] px-2 py-0.5 text-[9px] font-medium text-[#2b6b00]">Pendiente</span><span className="rounded-full bg-[#0d0d0d] px-3 py-1 text-[9px] font-semibold text-[var(--accent)]">Enviar</span></div><p className="mt-2 text-[9px] text-black/60">Caduca en 7 días · revocable</p></>)}
          {kind === "plan" && (<><div className="flex justify-between text-[10px] font-semibold"><span>Fullbody A</span><span className="text-black/60">v2</span></div><ul className="mt-2 space-y-1.5 text-[9px]">{[["Sentadilla goblet", "4×8-10"], ["Remo en polea", "3×10-12"], ["Press inclinado", "3×8-10"]].map(([n, s]) => <li key={n} className="flex items-center justify-between rounded-md bg-white px-2 py-1"><span className="flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full bg-[#2fa800]" />{n}</span><b>{s}</b></li>)}</ul></>)}
          {kind === "progress" && (<><div className="flex justify-between text-[10px] font-semibold"><span>Carga máxima</span><span className="text-[#2b6b00]">+12%</span></div><LineChart className="mt-1 h-[70px] w-full" /><p className="text-[9px] text-black/60">Sentadilla goblet · kg por sesión</p></>)}
        </div>
      </div>
    </div>
  );
}

export function PhoneMock() {
  return (
    <div className="tile grid h-full min-h-[250px] place-items-end justify-center overflow-hidden" role="img" aria-label="Ilustración: registro de series en el celular">
      <div className="mb-[-40px] w-[190px] rounded-[30px] border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[0_20px_60px_rgba(0,0,0,.6)]">
        <div className="rounded-[24px] bg-[#ececec] p-3 text-[#0d0d0d]">
          <p className="text-[11px] font-semibold">Sentadilla goblet</p><p className="text-[9px] text-black/60">Objetivo 4 × 8-10 · 90 s</p>
          {[["1", "22.5", "10", true], ["2", "22.5", "9", true], ["3", "22.5", "", false]].map(([n, kg, r, done]) => (
            <div key={String(n)} className="mt-1.5 flex items-center gap-1.5 text-[9px]"><span className="w-3 text-black/60">{n}</span><span className="flex-1 rounded-md bg-white px-1.5 py-1">{kg} kg</span><span className="w-9 rounded-md bg-white px-1.5 py-1">{r || "—"}</span><span className={`grid h-5 w-5 place-items-center rounded-full ${done ? "bg-[var(--accent)]" : "bg-black/10"}`}>{done ? "✓" : ""}</span></div>))}
          <div className="mt-2 rounded-lg bg-[#0d0d0d] p-2 text-center text-[10px] text-white">Descanso <b className="text-[var(--accent)]">1:12</b></div>
        </div>
      </div>
    </div>
  );
}

export function ChipsMock() {
  return (
    <div className="tile grid h-full min-h-[210px] place-items-center p-5" role="img" aria-label="Ilustración: filtros de la biblioteca de ejercicios">
      <div className={`${panel} w-full max-w-[250px] p-3.5`}>
        <div className="rounded-lg bg-white px-2.5 py-1.5 text-[10px] text-black/60">Buscar: sentadilla…</div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[9px]">{["Cuádriceps", "Mancuernas", "Principiante", "Sin carga en rodilla", "En casa"].map((c, i) => <span key={c} className={`rounded-full px-2 py-1 ${i === 1 ? "bg-[#0d0d0d] text-[var(--accent)]" : "bg-white"}`}>{c}</span>)}</div>
        <div className="mt-2 space-y-1 text-[9px]">{["Sentadilla goblet", "Sentadilla búlgara", "Step-up al cajón"].map((n) => <div key={n} className="flex justify-between rounded-md bg-white px-2 py-1"><span>{n}</span><span className="text-black/60">→</span></div>)}</div>
      </div>
    </div>
  );
}

export function ConsentMock() {
  return (
    <div className="tile grid h-full min-h-[210px] place-items-center p-5" role="img" aria-label="Ilustración: consentimientos del alumno">
      <div className={`${panel} w-full max-w-[250px] space-y-2 p-3.5 text-[10px]`}>
        <p className="font-semibold">Consentimientos</p>
        {[["Datos personales", true], ["Datos de salud", true], ["Compartir con mi entrenador", true], ["Fotos de progreso", false]].map(([l, on]) => (
          <div key={String(l)} className="flex items-center justify-between rounded-md bg-white px-2 py-1.5"><span>{l}</span><span className={`relative h-4 w-7 rounded-full ${on ? "bg-[#2fa800]" : "bg-black/20"}`}><i className={`absolute top-0.5 h-3 w-3 rounded-full bg-white ${on ? "right-0.5" : "left-0.5"}`} /></span></div>))}
        <p className="text-[9px] text-black/60">Puedes retirarlos cuando quieras.</p>
      </div>
    </div>
  );
}
