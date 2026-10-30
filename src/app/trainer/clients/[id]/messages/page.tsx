import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Conversation } from "@/components/messaging/Conversation";
import { markReadAction } from "@/app/messages-actions";

export default async function TrainerMessages({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profile } = await requireUser("trainer");
  const { data: rel } = await supabase.from("trainer_client_relationships").select("status, client:profiles!trainer_client_relationships_client_id_fkey(full_name)").eq("trainer_id", profile.id).eq("client_id", id).maybeSingle();
  if (!rel) notFound();
  const { data: can } = await supabase.rpc("can_message", { p_trainer: profile.id, p_client: id });
  const name = (rel.client as unknown as { full_name: string }).full_name;
  if (!can) return <section className="space-y-3"><Link href={`/trainer/clients/${id}`} className="text-sm underline">← {name}</Link><p className="rounded-lg border border-[var(--border)] p-4 text-sm">No puedes chatear con este alumno: la relación no está activa o retiró el consentimiento para compartir con su entrenador.</p></section>;
  await createAdminClient().from("access_audit").insert({ actor_id: profile.id, client_id: id, resource: "messages" });
  await markReadAction(id);
  return <section className="max-w-3xl space-y-4"><Link href={`/trainer/clients/${id}`} className="text-sm underline">← {name}</Link><h1 className="text-2xl font-semibold">Mensajes con {name}</h1><Conversation supabase={supabase} me={profile.id} peer={id} role="trainer" /></section>;
}
