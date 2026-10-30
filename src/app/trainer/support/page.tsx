import Link from "next/link";
import { LifeBuoy, Mail } from "lucide-react";
import { requireUser } from "@/lib/session";
import { ActionForm, fieldCls } from "@/components/ActionForm";
import { openSupportThread } from "@/app/support-actions";
import { CATEGORIES, STATUS_LABEL, SUPPORT_EMAIL, categoryLabel, type ThreadStatus } from "@/lib/support/schema";

export const metadata = { title: "Soporte" };
const card = "rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5";
const CHIP: Record<ThreadStatus, string> = { open: "bg-[var(--warn)]/20 text-[var(--warn-text)]", answered: "bg-[var(--accent)]/15 text-[var(--accent)]", closed: "bg-white/10 text-[var(--muted)]" };
const fmt = (s: string) => new Date(s).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" });

export default async function SupportPage() {
  const { supabase, profile } = await requireUser("trainer");     // no subscription gate: a blocked workspace is exactly when support is needed
  const { data: threads } = await supabase.from("support_threads").select("id,category,subject,status,last_message_at,trainer_unread").eq("trainer_id", profile.id).order("last_message_at", { ascending: false }).limit(50);
  return (
    <section className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-semibold">Soporte</h1>
      <div className={`${card} flex flex-wrap items-start gap-4`}>
        <LifeBuoy className="mt-1 shrink-0 text-[var(--accent)]" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1 text-sm">
          <p className="font-semibold">¿Algo no funciona con un pago, tu acceso, los permisos o la plataforma?</p>
          <p className="text-[var(--muted)]">Escríbenos aquí y te respondemos en esta misma pantalla (te avisamos en Notificaciones), o por correo.</p>
          <p className="flex items-center gap-2 pt-1"><Mail size={16} aria-hidden /><a className="text-[var(--accent)] underline" href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Soporte Rutinia")}`}>{SUPPORT_EMAIL}</a></p>
        </div>
      </div>

      <ActionForm action={openSupportThread} submitLabel="Enviar a soporte">
        <h2 className="font-semibold">Nueva consulta</h2>
        <label className="block text-sm">¿Sobre qué es?
          <select name="category" required defaultValue="" className={fieldCls}><option value="" disabled>Elige un tema</option>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
        <label className="block text-sm">Asunto<input name="subject" required minLength={3} maxLength={120} className={fieldCls} placeholder="Ej.: Pagué un cupo y no se activó" /></label>
        <label className="block text-sm">Cuéntanos qué pasa<textarea name="body" required maxLength={4000} rows={5} className={fieldCls} /></label>
        <p className="text-xs text-[var(--muted)]">Para pagos, incluye la fecha y el monto. No escribas contraseñas ni datos completos de tu tarjeta: nunca te los pediremos.</p>
      </ActionForm>

      <div className={card}>
        <h2 className="mb-3 font-semibold">Tus conversaciones</h2>
        {(threads ?? []).length === 0 ? <p className="text-sm text-[var(--muted)]">Aún no has escrito a soporte.</p> : (
          <ul className="stagger divide-y divide-[var(--border)] text-sm">
            {(threads ?? []).map((t) => (
              <li key={t.id}><Link href={`/trainer/support/${t.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-[var(--accent)]">
                <span className="min-w-0"><span className="block truncate font-medium">{t.subject}</span><span className="text-xs text-[var(--muted)]">{categoryLabel(t.category)} · {fmt(t.last_message_at)}</span></span>
                <span className="flex shrink-0 items-center gap-2">
                  {t.trainer_unread > 0 && <span className="rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-semibold text-black">{t.trainer_unread} nuevo{t.trainer_unread === 1 ? "" : "s"}</span>}
                  <span className={`rounded-full px-2 py-0.5 text-xs ${CHIP[t.status as ThreadStatus]}`}>{STATUS_LABEL[t.status as ThreadStatus]}</span>
                </span></Link></li>))}
          </ul>)}
      </div>
    </section>
  );
}
