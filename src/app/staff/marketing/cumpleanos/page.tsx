import Link from "next/link";
import { Cake } from "lucide-react";
import { requireStaff } from "@/lib/support/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { ActionForm, fieldCls } from "@/components/ActionForm";
import { greetBirthdaysNow, saveBirthdaySettings } from "@/app/marketing-actions";
import { loadCandidates } from "@/lib/marketing/send";
import { colombiaToday, daysUntilBirthday, isBirthdayToday } from "@/lib/marketing/birthday";
import { pushConfig } from "@/lib/marketing/push";
import { emailConfig } from "@/lib/marketing/email";
import { CHANNELS } from "@/lib/marketing/schema";

export const metadata = { title: "Cumpleaños · Soporte" };
const card = "lift rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5";
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const fmt = (birth: string) => { const [, m, d] = birth.split("-").map(Number); return `${d} de ${MONTHS[m - 1]}`; };

export default async function Birthdays() {
  await requireStaff();
  const admin = createAdminClient(); const now = new Date(); const year = colombiaToday(now).y;     // service role, only after requireStaff() passed
  const [cands, { data: st }, { data: done }] = await Promise.all([loadCandidates(admin), admin.from("marketing_settings").select("birthday_auto,birthday_title,birthday_body,birthday_channels").eq("id", true).single(), admin.from("birthday_greetings").select("user_id").eq("year", year)]);
  const greeted = new Set((done ?? []).map((d) => d.user_id as string));
  const withDate = cands.filter((c) => c.birth_date);
  const today = withDate.filter((c) => isBirthdayToday(c.birth_date, now));
  const soon = withDate.map((c) => ({ c, n: daysUntilBirthday(c.birth_date!, now) })).filter((x) => x.n !== null && x.n > 0 && x.n <= 30).sort((a, b) => a.n! - b.n!);
  const on: Record<string, boolean> = { in_app: true, push: !!pushConfig(), email: !!emailConfig() };
  const pending = today.filter((c) => !greeted.has(c.id)).length;
  return (
    <section className="max-w-4xl space-y-5">
      <p className="text-sm"><Link href="/staff/marketing" className="text-[var(--accent)] underline">← Marketing</Link></p>
      <div><h1 className="flex items-center gap-2 text-3xl font-semibold"><Cake aria-hidden className="text-[var(--accent)]" /> Cumpleaños</h1><p className="text-sm text-[var(--muted)]">{withDate.length} de {cands.length} entrenadores dejaron su fecha de nacimiento. Solo se felicita a quien la dio.</p></div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className={card}>
          <h2 className="mb-2 font-semibold">Hoy</h2>
          {today.length === 0 ? <p className="text-sm text-[var(--muted)]">Hoy no cumple años nadie con fecha registrada.</p> : <ul className="stagger divide-y divide-[var(--border)] text-sm">{today.map((c) => <li key={c.id} className="flex justify-between gap-3 py-2"><span>{c.name}</span><span className={greeted.has(c.id) ? "text-[var(--accent)]" : "text-[var(--warn-text)]"}>{greeted.has(c.id) ? "Felicitado" : "Pendiente"}</span></li>)}</ul>}
          {today.length > 0 && <div className="mt-3"><ActionForm action={greetBirthdaysNow} submitLabel={pending ? `Felicitar a ${pending} ahora` : "Todos felicitados"} className="!border-0 !bg-transparent !p-0"><label className="flex gap-2 text-sm"><input type="checkbox" name="confirm" /> Confirmo el envío del saludo a quienes aún no lo recibieron este año.</label></ActionForm></div>}
        </div>
        <div className={card}>
          <h2 className="mb-2 font-semibold">Próximos 30 días</h2>
          {soon.length === 0 ? <p className="text-sm text-[var(--muted)]">No hay cumpleaños próximos con fecha registrada.</p> : <ul className="stagger divide-y divide-[var(--border)] text-sm">{soon.slice(0, 12).map(({ c, n }) => <li key={c.id} className="flex justify-between gap-3 py-2"><span>{c.name}</span><span className="text-[var(--muted)]">{fmt(c.birth_date!)} · en {n} día{n === 1 ? "" : "s"}</span></li>)}</ul>}
        </div>
      </div>
      <ActionForm action={saveBirthdaySettings} submitLabel="Guardar saludo automático">
        <h2 className="font-semibold">Saludo automático</h2>
        <label className="flex gap-2 text-sm"><input type="checkbox" name="auto" defaultChecked={st?.birthday_auto ?? false} /> Felicitar automáticamente a cada cumpleañero (una vez al año, en la ejecución diaria de las 9:00 a. m. hora de Colombia).</label>
        <label className="block text-sm">Título. Usa {"{nombre}"}<input name="title" required maxLength={80} defaultValue={st?.birthday_title} className={fieldCls} /></label>
        <label className="block text-sm">Mensaje<textarea name="body" required maxLength={600} rows={4} defaultValue={st?.birthday_body} className={fieldCls} /></label>
        <fieldset className="space-y-1 text-sm"><legend className="font-semibold">Canales</legend>{CHANNELS.map((c) => <label key={c.id} className="flex gap-2"><input type="checkbox" name="channels" value={c.id} defaultChecked={(st?.birthday_channels ?? ["in_app"]).includes(c.id)} /> {c.label}{!on[c.id] && <span className="text-xs text-[var(--warn-text)]"> — todavía no está configurado (se omite)</span>}</label>)}</fieldset>
      </ActionForm>
    </section>
  );
}
