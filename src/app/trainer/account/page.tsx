import { requireUser } from "@/lib/session";
import { ActionForm, fieldCls } from "@/components/ActionForm";
import { CLOSE_CONFIRM_WORD } from "@/lib/privacy/consents";
import { closeMyAccount, savePreferences } from "./actions";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { PushToggle } from "@/components/PushToggle";
import { pushConfig } from "@/lib/marketing/push";

export default async function Account() {
  const { profile, supabase } = await requireUser("trainer");
  const { data: pref } = await supabase.from("profiles").select("birth_date,marketing_in_app,marketing_email").eq("id", profile.id).single();
  const vapid = pushConfig()?.publicKey ?? null;
  const card = "rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5";
  return (
    <section className="max-w-2xl space-y-6"><h1 className="text-3xl font-semibold">Mi cuenta</h1><p className="text-sm text-[var(--muted)]">{profile.full_name}</p>
      <ChangePasswordForm />
      <ActionForm action={savePreferences} submitLabel="Guardar preferencias" className="scroll-mt-6">
        <h2 id="novedades" className="font-semibold">Novedades y cumpleaños</h2>
        <p className="text-sm text-[var(--muted)]">El equipo de Rutinia puede escribirte con novedades, comunicados y un saludo en tu cumpleaños. Los avisos de tu cuenta (pagos, soporte) siempre te llegan.</p>
        <label className="block text-sm">Fecha de nacimiento (opcional)<input name="birthDate" type="date" defaultValue={pref?.birth_date ?? ""} className={fieldCls} /></label>
        <p className="text-xs text-[var(--muted)]">La usamos solo para felicitarte. Puedes borrarla cuando quieras.</p>
        <label className="flex gap-2 text-sm"><input type="checkbox" name="marketingInApp" defaultChecked={pref?.marketing_in_app ?? true} /> Recibir novedades en la plataforma (campana)</label>
        <label className="flex gap-2 text-sm"><input type="checkbox" name="marketingEmail" defaultChecked={pref?.marketing_email ?? true} /> Recibir novedades por correo</label>
      </ActionForm>
      {vapid && <div className={card}><h2 className="mb-1 font-semibold">Avisos en este dispositivo</h2><p className="mb-3 text-sm text-[var(--muted)]">Activa los avisos push para enterarte de respuestas de soporte y novedades aunque no tengas Rutinia abierta.</p><PushToggle publicKey={vapid} /></div>}
      <div className={card}><h2 className="mb-1 font-semibold">Exportar mis datos</h2><p className="mb-3 text-sm text-[var(--muted)]">Descarga tu perfil, suscripción, pagos, planes, ejercicios propios, invitaciones y propuestas de progresión. Los datos de salud de tus alumnos les pertenecen a ellos y no se incluyen.</p><a href="/api/export" className="inline-block rounded-lg border border-[var(--accent)] px-4 py-2 text-sm text-[var(--accent)]">Descargar mis datos</a></div>
      <ActionForm action={closeMyAccount} submitLabel="Cerrar mi cuenta" className="border-[var(--warn)]/60">
        <h2 className="font-semibold text-[var(--warn)]">Cerrar mi cuenta</h2>
        <p className="text-sm text-[var(--muted)]">Se cancela tu suscripción, tus alumnos quedan archivados (y verán que tu espacio no está disponible), se eliminan tus propuestas, invitaciones pendientes y notificaciones, y no podrás volver a entrar con esta cuenta. Por obligaciones contables <b>se conserva el historial de pagos</b>. Descarga tus datos antes: <b>no se puede deshacer.</b></p>
        <label className="block text-sm">Tu contraseña<input name="password" type="password" required autoComplete="current-password" className={fieldCls} /></label>
        <label className="block text-sm">Escribe {CLOSE_CONFIRM_WORD} para confirmar<input name="confirm" required autoComplete="off" className={fieldCls} /></label></ActionForm>
    </section>
  );
}
