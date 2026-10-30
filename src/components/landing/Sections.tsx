import Link from "next/link";
import { ArrowUpRight, Calculator, Check, ClipboardList, Dumbbell, Layers, LineChart, Lock, Minus, Play, Plus, Quote, ShieldCheck, X } from "lucide-react";
import { AI_PACKS, BASE_PRICE_CENTS, BASE_PRICE_COP_CENTS, COP_SLOT_TIERS, FREE_MONTHLY_DRAFTS, INCLUDED_CLIENTS, MAX_SLOTS_PER_PURCHASE, formatMoney } from "@/lib/billing/pricing";
import { Reveal, Rise } from "./Reveal";
import { SITE_TAGLINE, SUPPORT_EMAIL } from "@/lib/site";
import { Logo, LogoMark } from "./Logo";
import { ChipsMock, ConsentMock, DashboardMock, IsoStack, PhoneMock } from "./Mockups";

const wrap = "mx-auto w-full max-w-[1000px] px-5";
const Arrow = () => <ArrowUpRight size={16} aria-hidden />;

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-[128px] md:pt-[150px]">
      <div className="hero-glow" aria-hidden />
      <div className="relative mx-auto flex max-w-[900px] flex-col items-center px-5 text-center">
        <Rise><span className="pill">{SITE_TAGLINE}</span></Rise>
        <Rise delay={80}><h1 className="lp-h1 mt-5">Todo el entrenamiento personalizado, en un solo lugar</h1></Rise>
        <Rise delay={160}><p className="lp-muted mx-auto mt-5 max-w-[540px] text-[16px] leading-[1.5] md:text-[18px]">Rutinia es el software para entrenadores personales: evalúa, planifica, registra y mide el progreso de tus alumnos sin PDFs, hojas de cálculo ni seguimientos perdidos en el chat.</p></Rise>
        <Rise delay={240}><div className="mt-8 flex flex-col items-center gap-3 sm:flex-row"><Link href="/signup" className="btn btn-primary">Prueba gratis 7 días <Arrow /></Link><a href="#como-funciona" className="btn btn-secondary">Ver cómo funciona</a></div></Rise>
        <p className="mt-4 text-[13px] text-white/60">Sin tarjeta para empezar. Desde {formatMoney(BASE_PRICE_COP_CENTS, "COP")}/mes.</p>
      </div>
      <div className="relative mx-auto mt-14 w-full max-w-[1040px] px-4 md:mt-[72px]">
        <div className="hero-line -top-px" aria-hidden />
        <Rise delay={200}><DashboardMock /></Rise>
        <p className="mt-3 text-center text-[12px] text-white/55">Vista ilustrativa con datos de ejemplo.</p>
      </div>
    </section>
  );
}

const STEPS = [
  { kind: "invite" as const, t: "Invita a tus alumnos", d: "Envía un enlace único, revocable y con caducidad. Tu alumno acepta, da sus consentimientos y completa su evaluación inicial." },
  { kind: "plan" as const, t: "Diseña su plan", d: "Arma sesiones desde una biblioteca de más de 600 ejercicios. Cada cambio publicado crea una versión nueva y la anterior se conserva." },
  { kind: "progress" as const, t: "Mide y ajusta", d: "Tu alumno registra series, esfuerzo y molestias desde el celular. Tú ves cargas, adherencia y alertas para decidir el siguiente paso." },
];

export function HowItWorks() {
  return (
    <section id="como-funciona" className={`${wrap} py-[70px] md:py-[110px]`}>
      <Reveal><span className="inline-flex items-center gap-2 text-[15px] font-medium text-[var(--accent)]"><span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--accent)] text-black"><Play size={10} fill="currentColor" /></span>Así funciona</span>
        <h2 className="lp-h2 mt-3 max-w-[600px]">Cómo funciona Rutinia</h2></Reveal>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <Reveal key={s.t} delay={i * 100}>
            <article className="card flex h-full flex-col gap-5 p-2.5 pb-[30px]">
              <IsoStack kind={s.kind} />
              <div className="flex flex-col gap-3 px-3.5"><span className="tag w-fit">Paso {i + 1}</span><h3 className="lp-h4">{s.t}</h3><p className="lp-muted text-[16px] leading-6">{s.d}</p></div>
            </article>
          </Reveal>))}
      </div>
    </section>
  );
}

export function Features() {
  return (
    <section id="funciones" className={`${wrap} py-[70px] md:py-[110px]`}>
      <Reveal><div className="grid gap-6 md:grid-cols-[1.1fr_1fr] md:items-end"><h2 className="lp-h2 max-w-[500px]">Planifica, ejecuta y mide con claridad.</h2>
        <p className="lp-muted max-w-[380px] text-[16px] leading-6">Rutinia reúne evaluación, planes, registro de entrenamientos y progreso en visuales simples sobre los que puedes actuar al instante.</p></div></Reveal>
      <div className="mt-10 grid gap-5 md:grid-cols-[1.35fr_1fr]">
        <Reveal><article className="card flex h-full flex-col gap-6 p-2.5 pb-[30px]"><div className="tile overflow-hidden px-5 pt-6"><div className="mx-auto max-w-[520px]"><DashboardMock compact /></div></div><div className="px-3.5"><h3 className="lp-h4">Panel del entrenador</h3><p className="lp-muted mt-3 text-[16px] leading-6">Alumnos activos, sesiones de hoy, adherencia y alertas en una sola vista, con los cupos que te quedan.</p></div></article></Reveal>
        <Reveal delay={100}><article className="card flex h-full flex-col gap-6 p-2.5 pb-[30px]"><PhoneMock /><div className="px-3.5"><h3 className="lp-h4">Registro en el celular</h3><p className="lp-muted mt-3 text-[16px] leading-6">Series, carga y esfuerzo se guardan al instante: si cierran la app, retoman donde se quedaron.</p></div></article></Reveal>
      </div>
      <div className="mt-5 grid gap-5 md:grid-cols-3">
        <Reveal><article className="card flex h-full flex-col gap-6 p-2.5 pb-[30px]"><ChipsMock /><div className="px-3.5"><h3 className="lp-h4">Biblioteca con filtros</h3><p className="lp-muted mt-3 text-[16px] leading-6">Filtra por músculo, equipo, nivel y por las articulaciones que tu alumno debe evitar.</p></div></article></Reveal>
        <Reveal delay={100}><article className="card flex h-full flex-col gap-6 p-2.5 pb-[30px]"><ConsentMock /><div className="px-3.5"><h3 className="lp-h4">Privacidad por diseño</h3><p className="lp-muted mt-3 text-[16px] leading-6">Datos de salud visibles solo con consentimiento vigente. Cada consulta queda registrada.</p></div></article></Reveal>
        <Reveal delay={200}><article className="card flex h-full flex-col justify-between gap-6 p-7"><div className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--bg)] text-[var(--accent)]"><ShieldCheck size={24} /></div><div><h3 className="lp-h3">Seguridad primero</h3><p className="lp-muted mt-3 text-[16px] leading-6">Si el cribado detecta señales de alarma, el sistema pide valoración profesional antes de publicar un plan estándar. No diagnostica ni reemplaza a un profesional de la salud.</p></div></article></Reveal>
      </div>
    </section>
  );
}

const GRID = [
  [ClipboardList, "Evaluación inicial", "Anamnesis estructurada con cribado de riesgo y medidas con método y fecha."],
  [Layers, "Planes con versiones", "Publica, ajusta y vuelve atrás: nada se sobrescribe y el historial se conserva."],
  [Dumbbell, "Registro de entrenos", "Series reales, esfuerzo percibido, molestias y descansos con temporizador."],
  [Calculator, "Cálculos documentados", "IMC, metabolismo basal y % de grasa con fórmula, unidades y límites visibles."],
  [LineChart, "Progreso y adherencia", "Historial de cargas, récords con reglas claras y adherencia semanal."],
  [Lock, "Datos protegidos", "Aislamiento por entrenador, consentimientos revocables y trazabilidad de accesos."],
] as const;

export function FeatureGrid() {
  return (
    <section className={`${wrap} py-[70px] text-center md:py-[110px]`}>
      <Reveal><span className="inline-flex items-center gap-2 text-[15px] font-medium text-[var(--accent)]"><i className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />Funciones</span>
        <h2 className="lp-h2 mx-auto mt-3 max-w-[600px]">Pensado para el trabajo real de un entrenador</h2></Reveal>
      <div className="mt-10 grid gap-5 text-left sm:grid-cols-2 md:grid-cols-3">
        {GRID.map(([I, t, d], i) => (
          <Reveal key={t} delay={(i % 3) * 90}><article className="card flex h-full flex-col gap-10 px-5 py-[30px]"><span className="grid h-11 w-11 place-items-center rounded-[10px] bg-[var(--bg)] text-[var(--accent)] shadow-[inset_0_0_0_1px_rgba(140,255,46,.12)]"><I size={22} aria-hidden /></span>
            <div><h3 className="text-[18px] font-semibold tracking-[-0.03em]">{t}</h3><p className="lp-muted mt-1.5 text-[15px] leading-[22px]">{d}</p></div></article></Reveal>))}
      </div>
      <Reveal><Link href="/signup" className="btn-ghost mt-10">Empezar ahora <Arrow /></Link></Reveal>
    </section>
  );
}

const OTHER = ["PDFs y hojas de cálculo dispersas", "Seguimiento por mensajes sueltos", "Evaluaciones en papel", "Progreso sin datos comparables", "Planes genéricos sin historial"];
const OURS = ["Alumnos, planes y evaluaciones en un solo lugar", "Registro de series desde el celular", "Medidas y cálculos con fórmula y fecha", "Versiones de plan que nunca se pierden", "Alertas claras: profesionales vs. recordatorios"];

export function Compare() {
  return (
    <section className={`${wrap} py-[70px] md:py-[110px]`}>
      <Reveal><h2 className="lp-h2 mx-auto max-w-[600px] text-center">Hay una forma más ordenada de gestionar alumnos</h2></Reveal>
      <Reveal delay={100}>
        <div className="card mx-auto mt-10 grid max-w-[760px] gap-2.5 p-2.5 md:grid-cols-2">
          <div className="p-6 md:p-7"><p className="text-[18px] font-semibold tracking-[-0.03em]">Otras herramientas</p><ul className="mt-6 space-y-4">{OTHER.map((t) => <li key={t} className="flex items-start gap-3 text-[15px] text-white/70"><X size={16} className="mt-0.5 shrink-0 text-[var(--warn)]" aria-hidden /><span><span className="sr-only">No: </span>{t}</span></li>)}</ul></div>
          <div className="rounded-[24px] bg-[var(--bg)] p-6 shadow-[0_0_0_1px_rgba(140,255,46,.35),0_0_40px_rgba(140,255,46,.18)] md:p-7"><p className="flex items-center gap-2 text-[18px] font-semibold tracking-[-0.03em]"><LogoMark className="h-4 w-auto text-white" />Rutinia</p><ul className="mt-6 space-y-4">{OURS.map((t) => <li key={t} className="flex items-start gap-3 text-[15px] text-white/90"><Check size={16} className="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden /><span><span className="sr-only">Sí: </span>{t}</span></li>)}</ul></div>
        </div>
      </Reveal>
    </section>
  );
}

const PRINCIPLES = [
  ["Sin métricas inventadas", "Si falta un dato, el sistema lo dice. Masa muscular, ósea y agua no se estiman sin dispositivo."],
  ["Cálculos con límites visibles", "Cada resultado muestra fórmula, versión y que es una estimación, no una medición clínica."],
  ["Consentimiento real", "Nada viene premarcado y puedes retirar el acceso a tus datos de salud cuando quieras."],
  ["Versiones, no sobrescrituras", "Un plan publicado es inmutable. Los cambios crean una versión nueva."],
  ["Más volumen no es siempre mejor", "No se celebra un aumento de volumen si subieron el esfuerzo, el dolor o las molestias."],
  ["Seguridad antes que velocidad", "Señales de alarma en la evaluación frenan la publicación de un plan estándar."],
  ["Tus alumnos no pagan", "La suscripción es del entrenador; el alumno solo se registra con tu invitación."],
  ["Pagos verificados", "Los cupos se activan solo cuando el servidor confirma el pago con el proveedor."],
] as const;

export function Principles() {
  const rowA = PRINCIPLES.slice(0, 4), rowB = PRINCIPLES.slice(4);
  const card = ([t, d]: readonly [string, string], k: string) => (
    <article key={k} className="card w-[300px] shrink-0 rounded-[24px] p-6"><Quote size={22} className="text-[var(--accent)]" aria-hidden /><h3 className="mt-2 text-[18px] font-semibold tracking-[-0.03em]">{t}</h3><p className="lp-muted mt-2 text-[15px] leading-[22px]">{d}</p></article>);
  return (
    <section className="py-[70px] md:py-[110px]">
      <div className={wrap}><Reveal><div className="grid gap-6 md:grid-cols-[1.1fr_1fr] md:items-end"><h2 className="lp-h2 max-w-[500px]">Hecho con criterio profesional</h2><p className="lp-muted max-w-[380px] text-[16px] leading-6">Estos son los principios que guían el producto, y que puedes comprobar al usarlo.</p></div></Reveal></div>
      <div className="mt-10 space-y-5">
        <div className="marquee-wrap"><div className="marquee">{rowA.map((p, i) => card(p, `a${i}`))}<div className="marquee-dup" aria-hidden>{[...rowA, ...rowA, ...rowA].map((p, i) => card(p, `a-dup${i}`))}</div></div></div>
        <div className="marquee-wrap"><div className="marquee rev">{rowB.map((p, i) => card(p, `b${i}`))}<div className="marquee-dup" aria-hidden>{[...rowB, ...rowB, ...rowB].map((p, i) => card(p, `b-dup${i}`))}</div></div></div>
      </div>
    </section>
  );
}

const SUB = [`Hasta ${INCLUDED_CLIENTS} alumnos activos incluidos`, "7 días de prueba gratis, sin cobro automático", "Evaluación, planes, registro de entrenos y progreso", "Biblioteca de más de 600 ejercicios", "Tus alumnos no pagan"];
const SLOTS = [`De 1 a ${MAX_SLOTS_PER_PURCHASE} cupos por compra: cuantos más, menos cuesta cada uno`, "Pago único: no se renueva", "Se activan al confirmarse el pago", "Los cupos sin usar se conservan"];
const AI = [`${FREE_MONTHLY_DRAFTS} borradores gratis cada mes`, `${AI_PACKS.p20.label}: ${formatMoney(AI_PACKS.p20.cents.COP, "COP")}`, `${AI_PACKS.p100.label}: ${formatMoney(AI_PACKS.p100.cents.COP, "COP")}`, "Si un borrador falla, el crédito se devuelve"];

export function Pricing() {
  const li = (t: string) => <li key={t} className="flex items-start gap-3 text-[15px]"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[rgba(140,255,46,.14)] text-[var(--accent)]"><Check size={12} aria-hidden /></span>{t}</li>;
  return (
    <section id="precios" className={`${wrap} py-[70px] text-center md:py-[110px]`}>
      <Reveal><span className="inline-flex items-center gap-2 text-[15px] font-medium text-[var(--accent)]"><i className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />Precios</span>
        <h2 className="lp-h2 mt-3">Precios simples.</h2><p className="lp-muted mx-auto mt-3 max-w-[420px] text-[16px] leading-6">Una suscripción para ti, sin cobros ocultos. Si creces, compras cupos solo cuando los necesites.</p></Reveal>
      <div className="mx-auto mt-10 grid max-w-[1000px] gap-5 text-left md:grid-cols-3">
        <Reveal><article className="relative flex h-full flex-col gap-5 rounded-[20px] bg-[var(--surface)] p-[30px] shadow-[0_0_0_1px_rgba(140,255,46,.3),0_0_50px_rgba(140,255,46,.1)]"><span className="absolute right-5 top-5 rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--accent)]">Principal</span>
          <h3 className="lp-h4">Suscripción</h3><p><span className="lp-h2">{formatMoney(BASE_PRICE_COP_CENTS, "COP").replace(" COP", "")}</span><span className="lp-muted ml-1 text-[15px]">COP / mes</span></p>
          <p className="lp-muted text-[15px] leading-[22px]">Todo lo que necesitas para trabajar con hasta {INCLUDED_CLIENTS} alumnos activos.</p>
          <Link href="/signup" className="btn btn-primary w-full">Empezar prueba gratis <Arrow /></Link><ul className="space-y-3.5">{SUB.map(li)}</ul></article></Reveal>
        <Reveal delay={100}><article className="flex h-full flex-col gap-5 rounded-[20px] bg-[var(--surface)] p-[30px]"><h3 className="lp-h4">Cupos adicionales</h3><p><span className="lp-muted text-[15px]">desde </span><span className="lp-h2">{formatMoney(COP_SLOT_TIERS[COP_SLOT_TIERS.length - 1].unitCents, "COP").replace(" COP", "")}</span><span className="lp-muted ml-1 text-[15px]">COP / cupo · pago único</span></p>
          <p className="lp-muted text-[15px] leading-[22px]">¿Más de {INCLUDED_CLIENTS} alumnos? Amplía tu capacidad cuando la necesites, sin cambiar tu suscripción.</p>
          <Link href="/signup" className="btn btn-secondary w-full">Ver en tu panel <Arrow /></Link><ul className="space-y-3.5">{SLOTS.map(li)}</ul></article></Reveal>
        <Reveal delay={200}><article className="flex h-full flex-col gap-5 rounded-[20px] bg-[var(--surface)] p-[30px]"><h3 className="lp-h4">Borradores con IA</h3><p><span className="lp-muted text-[15px]">desde </span><span className="lp-h2">{formatMoney(AI_PACKS.p100.cents.COP / AI_PACKS.p100.credits, "COP").replace(" COP", "")}</span><span className="lp-muted ml-1 text-[15px]">COP / borrador</span></p>
          <p className="lp-muted text-[15px] leading-[22px]">La IA propone dietas y planes que tú revisas y publicas. Pagas solo los que uses.</p>
          <Link href="/signup" className="btn btn-secondary w-full">Probar gratis <Arrow /></Link><ul className="space-y-3.5">{AI.map(li)}</ul></article></Reveal>
      </div>
      <Reveal><p className="lp-muted mx-auto mt-6 max-w-[620px] text-[13px] leading-5">Precios en pesos colombianos (COP) con Bold, sin conversión de moneda. Desde fuera de Colombia puedes pagar en dólares con PayPal: suscripción {formatMoney(BASE_PRICE_CENTS, "USD")} al mes, cupos USD 0.75 y paquetes de IA USD 6 y USD 20. Precios antes de impuestos y comisiones del procesador. Los cupos y los paquetes de IA son pagos independientes de la suscripción mensual.</p></Reveal>
    </section>
  );
}

const FAQ = [
  ["¿Qué incluye la prueba gratis?", "Siete días con todas las funciones del entrenador: invitar alumnos, evaluaciones, planes y registro de entrenamientos. No se cobra nada automáticamente al terminar: tú decides si te suscribes."],
  ["¿Qué pasa con mis datos si no me suscribo?", "Se conservan. Tu espacio de trabajo se bloquea hasta que pagues, pero no se borra ningún perfil, evaluación, plan ni registro. Siempre podrás acceder a la página de facturación."],
  ["¿Cuántos alumnos puedo tener?", "Hasta 20 alumnos activos con la suscripción. Para más, compras cupos adicionales en pago único (de 1 a 10 por compra): $2.500 COP cada uno, y hasta $2.000 si compras 10 de una vez. Las invitaciones pendientes y los alumnos archivados no cuentan."],
  ["¿Mis alumnos tienen que pagar?", "No. La suscripción es del entrenador. Tus alumnos se registran con tu invitación y aceptan sus consentimientos."],
  ["¿Cómo se protege la información de salud?", "Cada entrenador solo ve a sus propios alumnos, y los datos de salud solo son visibles mientras el alumno mantenga su consentimiento. Los accesos a la ficha del alumno quedan registrados."],
  ["¿Los cálculos reemplazan una evaluación profesional?", "No. IMC, metabolismo basal y % de grasa son estimaciones con fórmula y límites visibles. Rutinia no diagnostica y, ante señales de alarma, pide una valoración profesional."],
] as const;

export function Faq() {
  return (
    <section id="preguntas" className={`${wrap} py-[70px] md:py-[110px]`}>
      <Reveal><div className="grid gap-6 md:grid-cols-[1.1fr_1fr] md:items-end"><h2 className="lp-h2 max-w-[500px]">¿Tienes preguntas? Tenemos respuestas.</h2>
        <div className="max-w-[380px]"><p className="lp-muted text-[16px] leading-6">Esto es lo que suelen preguntar los entrenadores antes de empezar.</p></div></div></Reveal>
      <div className="mt-10 space-y-3.5">
        {FAQ.map(([q, a], i) => (
          <Reveal key={q} delay={i * 40}>
            <details name="faq" className="faq rounded-[20px] bg-[var(--surface)] px-5 md:px-[30px]" open={i === 0}>
              <summary className="flex items-center gap-4 py-6"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-[var(--bg)] text-[13px] font-medium text-[var(--accent)] shadow-[inset_0_0_0_1px_rgba(140,255,46,.2)]">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="flex-1 text-[17px] font-semibold leading-[1.3] tracking-[-0.02em] md:text-[20px]">{q}</h3>
                <Plus className="i-plus shrink-0 text-[var(--accent)]" size={20} aria-hidden /><Minus className="i-minus shrink-0 text-[var(--accent)]" size={20} aria-hidden /></summary>
              <div className="faq-body"><div><p className="lp-muted pb-6 pl-12 pr-2 text-[16px] leading-6 md:pl-[48px]">{a}</p></div></div>
            </details>
          </Reveal>))}
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className={`${wrap} py-[70px] md:py-[110px]`}>
      <Reveal>
        <div className="card relative grid overflow-hidden rounded-[30px] md:grid-cols-[1.1fr_1fr]">
          <div className="absolute -right-10 top-0 h-full w-[60%] bg-[radial-gradient(ellipse_at_70%_60%,rgba(140,255,46,.22),transparent_65%)]" aria-hidden />
          <div className="relative z-10 flex flex-col items-start gap-5 p-8 md:p-12"><h2 className="lp-h2 max-w-[444px]">¿Listo para ordenar tu entrenamiento?</h2><p className="lp-muted max-w-[360px] text-[16px] leading-6">Crea tu cuenta, invita a tu primer alumno y arma su plan hoy mismo. Son 7 días gratis.</p><Link href="/signup" className="btn btn-primary">Empezar prueba gratis <Arrow /></Link></div>
          <div className="relative hidden items-end justify-center md:flex"><div className="w-[240px] translate-y-6 rotate-3 [&_.tile]:bg-transparent"><PhoneMock /></div></div>
        </div>
      </Reveal>
    </section>
  );
}

export function Footer() {
  const col = (title: string, items: [string, string][]) => (
    <div><p className="text-[14px] font-semibold text-white">{title}</p><ul className="mt-4 space-y-2.5">{items.map(([l, h]) => <li key={l}>{h.startsWith("#") ? <a href={h} className="text-[14px] text-white/60 hover:text-[var(--accent)]">{l}</a> : <Link href={h} className="text-[14px] text-white/60 hover:text-[var(--accent)]">{l}</Link>}</li>)}</ul></div>);
  return (
    <footer className="mt-10 bg-[var(--surface)] px-5 pb-10 pt-[70px] md:px-10 md:pt-20">
      <div className="mx-auto flex max-w-[1100px] flex-col justify-between gap-12 md:flex-row">
        <div className="max-w-[320px]"><Logo /><p className="lp-muted mt-5 text-[14px] leading-[21px]">{SITE_TAGLINE}. Software para entrenadores personales: evalúa, planifica, ejecuta, mide y mejora.</p><p className="mt-5 text-[13px] text-white/60">© {new Date().getFullYear()} Rutinia.</p><p className="mt-2 text-[13px] text-white/60">Soporte: <a href={`mailto:${SUPPORT_EMAIL}`} className="underline hover:text-[var(--accent)]">{SUPPORT_EMAIL}</a></p></div>
        <div className="flex gap-16">{col("Menú rápido", [["Cómo funciona", "#como-funciona"], ["Funciones", "#funciones"], ["Precios", "#precios"], ["Preguntas", "#preguntas"]])}{col("Información", [["Iniciar sesión", "/login"], ["Crear cuenta", "/signup"], ["Términos", "/terminos"], ["Privacidad", "/privacidad"]])}</div>
      </div>
    </footer>
  );
}
