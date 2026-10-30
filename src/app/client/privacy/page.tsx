import { requireUser } from "@/lib/session";
import { ActionForm, fieldCls } from "@/components/ActionForm";
import { CONSENTS, DELETE_CONFIRM_WORD } from "@/lib/privacy/consents";
import { deleteMyAccount, endMyRelationship, setConsent } from "./actions";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";

export default async function Privacy() {
  const { supabase, profile } = await requireUser("client");
  const { data: rows } = await supabase.from("consents").select("type,granted_at,revoked_at").eq("user_id", profile.id);
  const by = new Map((rows ?? []).map((r) => [r.type, r]));
  const card = "rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5";
  return (
    <section className="space-y-6"><h1 className="text-2xl font-semibold">Privacidad y datos</h1>
      <div className={card}><h2 className="mb-1 font-semibold">Mis consentimientos</h2><p className="mb-4 text-sm text-[var(--muted)]">Puedes dar o retirar cada permiso cuando quieras. Retirarlo tiene efecto inmediato.</p>
        <ul className="divide-y divide-[var(--border)]">{CONSENTS.map((c) => { const r = by.get(c.type); const on = !!r && !r.revoked_at; return (
          <li key={c.type} className="flex flex-wrap items-start justify-between gap-3 py-3"><div className="max-w-[560px]"><p className="font-medium">{c.title} <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${on ? "bg-[var(--accent)] text-black" : "border border-[var(--border)] text-[var(--muted)]"}`}>{on ? "Activo" : "Inactivo"}</span></p><p className="mt-1 text-sm text-[var(--muted)]">{c.description}</p>{r && <p className="mt-1 text-xs text-[var(--muted)]">{r.revoked_at ? `Retirado el ${new Date(r.revoked_at).toLocaleDateString("es-CO")}` : `Otorgado el ${new Date(r.granted_at).toLocaleDateString("es-CO")}`}</p>}</div>
            {c.revocable || !on ? <form action={setConsent.bind(null, c.type, !on)}><button className={`rounded-lg border px-3 py-1.5 text-sm ${on ? "border-[var(--warn)] text-[var(--warn)]" : "border-[var(--accent)] text-[var(--accent)]"}`}>{on ? "Retirar" : "Activar"}</button></form> : <span className="text-xs text-[var(--muted)]">Necesario para el servicio</span>}</li>); })}</ul></div>
      <ChangePasswordForm />
      <div className={card}><h2 className="mb-1 font-semibold">Exportar mis datos</h2><p className="mb-3 text-sm text-[var(--muted)]">Descarga un archivo JSON con tu evaluación, medidas, entrenamientos, consentimientos y enlaces temporales a tus fotos.</p><a href="/api/export" className="inline-block rounded-lg border border-[var(--accent)] px-4 py-2 text-sm text-[var(--accent)]">Descargar mis datos</a></div>
      <ActionForm action={endMyRelationship} submitLabel="Terminar la relación con mi entrenador">
        <h2 className="font-semibold">Terminar la relación con mi entrenador</h2>
        <p className="text-sm text-[var(--muted)]">Tu entrenador dejará de ver tus datos, fotos y planes y no podrá escribirte, y <b>no puede volver a activarla por su cuenta</b>. Tus datos siguen siendo tuyos: puedes exportarlos o eliminarlos aquí abajo. Si luego quieres volver con un entrenador, necesitarás una invitación nueva.</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirm" /> Entiendo y quiero terminarla</label></ActionForm>
      <ActionForm action={deleteMyAccount} submitLabel="Eliminar mi cuenta y mis datos" className="border-[var(--warn)]/60">
        <h2 className="font-semibold text-[var(--warn)]">Eliminar mi cuenta</h2>
        <p className="text-sm text-[var(--muted)]">Se borran de forma definitiva tu evaluación, medidas, entrenamientos, planes asignados, fotos y consentimientos. <b>No se puede deshacer.</b> Te recomendamos descargar tus datos antes.</p>
        <label className="block text-sm">Tu contraseña<input name="password" type="password" required autoComplete="current-password" className={fieldCls} /></label>
        <label className="block text-sm">Escribe {DELETE_CONFIRM_WORD} para confirmar<input name="confirm" required autoComplete="off" className={fieldCls} /></label></ActionForm>
    </section>
  );
}
