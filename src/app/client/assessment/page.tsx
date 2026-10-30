import { requireUser } from "@/lib/session";
import { AssessmentForm } from "@/components/AssessmentForm";
import { RiskBanner } from "@/components/RiskBanner";

export default async function AssessmentPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { profile, supabase } = await requireUser("client");
  const { new: isNew } = await searchParams;
  const { data: last } = await supabase.from("assessments").select("kind,submitted_at,risk_level,risk_reasons").eq("client_id", profile.id).eq("status", "submitted").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (last && !isNew) return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Tu evaluación</h1>
      <p className="text-sm text-[var(--muted)]">Enviada el {new Date(last.submitted_at).toLocaleDateString("es-CO")}.</p>
      <RiskBanner level={last.risk_level} reasons={last.risk_reasons} audience="client" />
      <a href="/client/assessment?new=1" className="inline-block rounded-lg border border-[var(--accent)] px-4 py-2 text-[var(--accent)]">Hacer una reevaluación</a>
    </section>);
  return (<section className="space-y-4"><h1 className="text-2xl font-semibold">{last ? "Reevaluación" : "Evaluación inicial"}</h1><AssessmentForm /></section>);
}
