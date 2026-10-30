import Link from "next/link";
import { requireStaff } from "@/lib/support/staff";
import { ActionForm, fieldCls } from "@/components/ActionForm";
import { createCampaign } from "@/app/marketing-actions";
import { pushConfig } from "@/lib/marketing/push";
import { emailConfig } from "@/lib/marketing/email";
import { AUDIENCES, CHANNELS, KINDS } from "@/lib/marketing/schema";

export const metadata = { title: "Nueva campaña · Soporte" };

export default async function NewCampaign() {
  await requireStaff();
  const on: Record<string, boolean> = { in_app: true, push: !!pushConfig(), email: !!emailConfig() };
  return (
    <section className="max-w-3xl space-y-5">
      <p className="text-sm"><Link href="/staff/marketing" className="text-[var(--accent)] underline">← Marketing</Link></p>
      <h1 className="text-3xl font-semibold">Nueva campaña</h1>
      <p className="text-sm text-[var(--muted)]">Guardas un borrador y en la siguiente pantalla ves la vista previa y a cuántas personas llegaría. Nada se envía hasta que lo confirmes.</p>
      <ActionForm action={createCampaign} submitLabel="Guardar borrador y ver vista previa">
        <fieldset className="space-y-2 text-sm"><legend className="font-semibold">Tipo de mensaje</legend>
          {KINDS.map((k, i) => <label key={k.id} className="flex gap-2"><input type="radio" name="kind" value={k.id} defaultChecked={i === 0} className="mt-1" /><span><b>{k.label}</b><span className="block text-xs text-[var(--muted)]">{k.hint}</span></span></label>)}</fieldset>
        <label className="block text-sm">Título (máx. 80)<input name="title" required minLength={3} maxLength={80} className={fieldCls} placeholder="Ej.: Nueva sección de nutrición" /></label>
        <label className="block text-sm">Mensaje (máx. 600). Usa {"{nombre}"} para el nombre de pila<textarea name="body" required maxLength={600} rows={5} className={fieldCls} placeholder="Hola {nombre}, ya puedes crear planes de alimentación…" /></label>
        <label className="block text-sm">Enlace (opcional)<input name="link" maxLength={300} className={fieldCls} placeholder="/trainer/billing  o  https://…" /></label>
        <label className="block text-sm">¿A quién se envía?
          <select name="audience" defaultValue="todos" className={fieldCls}>{AUDIENCES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
        <label className="block text-sm">Si elegiste «Un entrenador», su correo<input name="audienceEmail" type="email" className={fieldCls} placeholder="entrenador@correo.com" /></label>
        <fieldset className="space-y-1 text-sm"><legend className="font-semibold">Canales</legend>
          {CHANNELS.map((c) => <label key={c.id} className={`flex gap-2 ${on[c.id] ? "" : "opacity-60"}`}><input type="checkbox" name="channels" value={c.id} defaultChecked={c.id === "in_app"} disabled={!on[c.id]} /> {c.label}{!on[c.id] && <span className="text-xs text-[var(--warn-text)]"> — todavía no está configurado</span>}</label>)}</fieldset>
        <label className="block text-sm">Programar para (hora de Colombia, opcional)<input name="scheduledAt" type="datetime-local" className={fieldCls} /></label>
        <p className="text-xs text-[var(--muted)]">Las campañas programadas salen en la ejecución diaria de las 9:00 a. m. (hora de Colombia): se envían ese día si la fecha ya llegó. Para enviar al instante, usa «Enviar ahora» en la vista previa.</p>
      </ActionForm>
    </section>
  );
}
