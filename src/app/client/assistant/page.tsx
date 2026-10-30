import Link from "next/link";
import { requireUser } from "@/lib/session";
import { AssistantChat } from "@/components/ai/AssistantChat";
import { getAiConfig } from "@/lib/ai/provider";

export default async function Assistant() {
  const { supabase, profile } = await requireUser("client");
  const { data: c } = await supabase.from("consents").select("id").eq("user_id", profile.id).eq("type", "ai_processing").is("revoked_at", null).maybeSingle();
  const cfg = getAiConfig(); const aiOn = cfg.enabled && cfg.allowSensitive;
  return (
    <section className="space-y-5"><h1 className="text-2xl font-semibold">Asistente</h1>
      <p className="text-sm text-[var(--muted)]">Resuelve dudas sobre tu rutina, la ejecución de un ejercicio o cómo usar la plataforma. <b>No es médico</b>, no cambia tu plan y no diagnostica: ante dolor fuerte, mareo o falta de aire, detente y busca atención.</p>
      <p className="rounded-lg border border-[var(--border)] p-3 text-xs text-[var(--muted)]">{!aiOn ? "Las respuestas redactadas por IA no están disponibles en este entorno: verás las fuentes de tu plan y de la ayuda tal cual." : c ? "Asistente de IA activado: se envía a un proveedor externo un resumen sin tu nombre ni correo. Puedes retirarlo en Privacidad." : <>Para respuestas redactadas por IA activa el consentimiento en <Link href="/client/privacy" className="underline">Privacidad</Link>. Mientras tanto verás las fuentes tal cual.</>}</p>
      <AssistantChat />
    </section>
  );
}
