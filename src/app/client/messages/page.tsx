import { requireUser } from "@/lib/session";
import { Conversation } from "@/components/messaging/Conversation";
import { markReadAction } from "@/app/messages-actions";

export default async function ClientMessages() {
  const { supabase, profile } = await requireUser("client");
  const { data: rel } = await supabase.from("trainer_client_relationships").select("trainer_id, trainer:profiles!trainer_client_relationships_trainer_id_fkey(full_name)").eq("client_id", profile.id).eq("status", "active").limit(1).maybeSingle();
  if (!rel) return <p className="text-sm text-[var(--muted)]">No tienes un entrenador asignado.</p>;
  const { data: share } = await supabase.from("consents").select("id").eq("user_id", profile.id).eq("type", "share_with_trainer").is("revoked_at", null).limit(1);
  if (!share?.length) return <p className="rounded-lg border border-[var(--border)] p-4 text-sm">Para chatear con tu entrenador activa «compartir con mi entrenador» en Privacidad.</p>;
  await markReadAction(rel.trainer_id);
  const name = (rel.trainer as unknown as { full_name: string } | null)?.full_name ?? "tu entrenador";
  return <section className="space-y-4"><h1 className="text-2xl font-semibold">Mensajes con {name}</h1><Conversation supabase={supabase} me={profile.id} peer={rel.trainer_id} role="client" /></section>;
}
