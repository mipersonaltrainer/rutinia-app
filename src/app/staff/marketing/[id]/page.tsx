import Link from "next/link";
import { notFound } from "next/navigation";
import { Bell } from "lucide-react";
import { requireStaff } from "@/lib/support/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { ActionForm } from "@/components/ActionForm";
import { cancelCampaign, scheduleCampaign, sendCampaignNow } from "@/app/marketing-actions";
import { previewReach, type CampaignRow, type SendStats } from "@/lib/marketing/send";
import { STATUS_LABEL, audienceLabel, kindLabel, render, type CampaignStatus } from "@/lib/marketing/schema";

export const metadata = { title: "Campaña · Soporte" };
const card = "lift rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5";
const when = (s: string | null) => (s ? new Date(s).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" }) : "—");
const CH = { in_app: "En la plataforma", push: "Push", email: "Correo" } as const;

export default async function CampaignDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireStaff();
  const admin = createAdminClient();                                   // service role, only after requireStaff() passed
  const { data } = await admin.from("marketing_campaigns").select("id,kind,title,body,link,channels,audience,audience_user,status,scheduled_at,sent_at,stats,created_at").eq("id", id).maybeSingle();
  if (!data) notFound();
  const c = data as unknown as CampaignRow & { sent_at: string | null; stats: SendStats & { error?: string } };
  const status = c.status as CampaignStatus; const editable = status === "draft" || status === "scheduled";
  const reachNow = editable ? await previewReach(admin, c) : null;
  const sample = render(c.title, "Camila"), sampleBody = render(c.body, "Camila");
  const s = c.stats ?? ({} as SendStats);
  return (
    <section className="max-w-4xl space-y-5">
      <p className="text-sm"><Link href="/staff/marketing" className="text-[var(--accent)] underline">← Marketing</Link></p>
      <div><h1 className="text-3xl font-semibold">{c.title}</h1><p className="text-sm text-[var(--muted)]">{kindLabel(c.kind)} · {audienceLabel(c.audience)} · {c.channels.map((x) => CH[x]).join(", ")} · <b>{STATUS_LABEL[status]}</b></p></div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className={card}>
          <h2 className="mb-3 font-semibold">Así lo verán (ejemplo con el nombre «Camila»)</h2>
          <div className="rounded-xl bg-[var(--surface-2)] p-4 text-sm"><p className="flex items-center gap-2 font-semibold"><Bell size={15} className="text-[var(--accent)]" aria-hidden /> {sample}</p><p className="mt-1 whitespace-pre-wrap text-[var(--muted)]">{sampleBody}</p>{c.link && <p className="mt-2 text-xs text-[var(--accent)]">Abre: {c.link}</p>}</div>
          <p className="mt-3 text-xs text-[var(--muted)]">Todo es texto plano: no se interpreta HTML.</p>
        </div>
        <div className={card}>
          {editable && reachNow ? (<>
            <h2 className="mb-2 font-semibold">A cuántas personas llegaría</h2>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-[var(--muted)]">Personas en total</dt><dd className="text-xl font-semibold">{reachNow.recipients}</dd></div>
              {c.channels.includes("in_app") && <div className="flex justify-between"><dt className="text-[var(--muted)]">En la plataforma</dt><dd>{reachNow.in_app}</dd></div>}
              {c.channels.includes("push") && <div className="flex justify-between"><dt className="text-[var(--muted)]">Push (con el aviso activado)</dt><dd>{reachNow.push}</dd></div>}
              {c.channels.includes("email") && <div className="flex justify-between"><dt className="text-[var(--muted)]">Correo</dt><dd>{reachNow.email}</dd></div>}
            </dl>
            <p className="mt-2 text-xs text-[var(--muted)]">Ya descuenta a quien desactivó las novedades (los comunicados siguen llegando a la campana).</p>
            {c.scheduled_at && <p className="mt-3 text-sm">Programada para <b>{when(c.scheduled_at)}</b>{status === "scheduled" ? " · se enviará en la ejecución diaria." : "."}</p>}
          </>) : (<>
            <h2 className="mb-2 font-semibold">Resultado</h2>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-[var(--muted)]">Enviada</dt><dd>{when(c.sent_at)}</dd></div>
              <div className="flex justify-between"><dt className="text-[var(--muted)]">Personas</dt><dd className="font-semibold">{s.recipients ?? 0}</dd></div>
              {s.in_app != null && <div className="flex justify-between"><dt className="text-[var(--muted)]">Notificaciones en la plataforma</dt><dd>{s.in_app}</dd></div>}
              {(s.push_sent != null || s.push_skipped) && <div className="flex justify-between"><dt className="text-[var(--muted)]">Push</dt><dd>{s.push_skipped ? "No configurado" : `${s.push_sent} enviados · ${s.push_failed} fallidos · ${s.push_removed} dispositivos retirados`}</dd></div>}
              {(s.email_sent != null || s.email_skipped) && <div className="flex justify-between"><dt className="text-[var(--muted)]">Correo</dt><dd>{s.email_skipped ? "No configurado" : `${s.email_sent} enviados · ${s.email_failed} fallidos`}</dd></div>}
              {s.error && <p className="text-[var(--warn-text)]">Error: {s.error}</p>}
            </dl>
          </>)}
        </div>
      </div>
      {editable && reachNow && (
        <div className="grid gap-5 lg:grid-cols-2">
          <ActionForm action={sendCampaignNow.bind(null, id)} submitLabel="Enviar ahora">
            <h2 className="font-semibold">Enviar ahora</h2>
            <label className="flex gap-2 text-sm"><input type="checkbox" name="confirm" /> Confirmo que se enviará a {reachNow.recipients} persona{reachNow.recipients === 1 ? "" : "s"} y que no se puede deshacer.</label>
            {reachNow.recipients === 0 && <p className="text-sm text-[var(--warn-text)]">Con esta configuración no llegaría a nadie.</p>}
          </ActionForm>
          <div className={`${card} space-y-3`}>
            <h2 className="font-semibold">Otras acciones</h2>
            {status === "draft" && c.scheduled_at && new Date(c.scheduled_at) > new Date() && <form action={scheduleCampaign.bind(null, id)}><button className="btn btn-secondary">Programar para {when(c.scheduled_at)}</button></form>}
            <form action={cancelCampaign.bind(null, id)}><button className="btn btn-secondary">Cancelar campaña</button></form>
          </div>
        </div>)}
    </section>
  );
}
