import Link from "next/link";
import { requireUser } from "@/lib/session";
import { InviteForm } from "@/components/InviteForm";
import { revokeInvitation, setClientStatus } from "./actions";
import { capacitySummary } from "@/lib/billing/pricing";

const INV_LABEL: Record<string, string> = { pending: "pendiente", accepted: "aceptada", expired: "caducada", revoked: "revocada" };

const AVISO: Record<string, string> = {
  terminada: "Este alumno terminó la relación contigo y no puedes reactivarla. Si quiere volver, debe aceptar una invitación nueva.",
  otro: "Este alumno ya tiene otro entrenador activo, por eso no se puede reactivar.",
  suscripcion: "Tu suscripción no está activa: renuévala para reactivar alumnos.",
  cupo: "No tienes cupos libres. Compra cupos adicionales o archiva a otro alumno.",
  error: "No se pudo completar la acción.",
};

export default async function Clients({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const { aviso } = await searchParams;
  const { supabase, profile } = await requireUser("trainer");
  const [{ data: rels }, { data: invs }, { data: cap }] = await Promise.all([
    supabase.from("trainer_client_relationships").select("id,client_id,status,created_at,client:profiles!trainer_client_relationships_client_id_fkey(full_name)").eq("trainer_id", profile.id).order("created_at"),
    supabase.from("invitations").select("id,email,full_name,status,expires_at").eq("trainer_id", profile.id).order("created_at", { ascending: false }),
    supabase.rpc("trainer_capacity", { t: profile.id }),
  ]);
  const active = (rels ?? []).filter((r) => r.status === "active").length;
  const c = capacitySummary(active, (cap ?? 20) - 20);
  const card = "rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5";
  return (
    <section className="max-w-3xl space-y-8">
      <h1 className="text-3xl font-semibold">Alumnos</h1>
      {aviso && AVISO[aviso] && <p role="alert" className="rounded-lg border border-[var(--warn)] p-3 text-sm">{AVISO[aviso]}</p>}
      <p className="text-sm text-[var(--muted)]">{c.activeClients} de {c.totalCapacity} cupos en uso · {c.remaining} libres. Las invitaciones pendientes no consumen cupo.</p>
      {c.remaining === 0 && <p role="alert" className="rounded-lg border border-[var(--warn)] p-3 text-sm">Alcanzaste tu límite. Compra cupos adicionales para aceptar más alumnos (pagos pendientes de configurar).</p>}
      <InviteForm />
      <div className={card}>
        <h2 className="mb-3 font-semibold">Alumnos</h2>
        {(rels ?? []).length === 0 ? <p className="text-sm text-[var(--muted)]">Todavía no tienes alumnos. Crea una invitación arriba.</p> : (
          <ul className="divide-y divide-[var(--border)]">
            {(rels ?? []).map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                <span><Link className="text-white underline" href={`/trainer/clients/${r.client_id}`}>{(r.client as unknown as { full_name: string } | null)?.full_name}</Link> <span className="text-[var(--muted)]">({r.status === "active" ? "activo" : "archivado"})</span></span>
                <form action={setClientStatus.bind(null, r.id, r.status === "active" ? "archived" : "active")}><button className="text-[var(--accent)]">{r.status === "active" ? "Archivar" : "Reactivar"}</button></form>
              </li>))}
          </ul>)}
      </div>
      <div className={card}>
        <h2 className="mb-3 font-semibold">Invitaciones</h2>
        {(invs ?? []).length === 0 ? <p className="text-sm text-[var(--muted)]">Sin invitaciones.</p> : (
          <ul className="divide-y divide-[var(--border)]">
            {(invs ?? []).map((i) => (
              <li key={i.id} className="flex items-center justify-between py-2 text-sm">
                <span>{i.full_name} · {i.email} <span className="text-[var(--muted)]">({INV_LABEL[i.status] ?? i.status})</span></span>
                {i.status === "pending" && <form action={revokeInvitation.bind(null, i.id)}><button className="text-[var(--warn)]">Revocar</button></form>}
              </li>))}
          </ul>)}
      </div>
    </section>
  );
}
