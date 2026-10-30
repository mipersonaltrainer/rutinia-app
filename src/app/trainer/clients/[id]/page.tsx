import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ActionForm } from "@/components/ActionForm";
import { MeasurementFields } from "@/components/MeasurementFields";
import { MeasurementsView } from "@/components/MeasurementsView";
import { RiskBanner } from "@/components/RiskBanner";
import { CopilotPanel } from "@/components/ai/CopilotPanel";
import { aiStatus } from "./ai-actions";
import { TrainerPhotos } from "@/components/photos/TrainerPhotos";
import { ReportForm } from "@/components/ReportForm";
import { ProgressionSection } from "@/components/progression/ProgressionSection";
import { ProgressPanel } from "@/components/workout/ProgressPanel";
import { addMeasurementForClient } from "./actions";
import { assessmentSchema } from "@/lib/assessment/schema";
import { EnergyCard } from "@/components/nutrition/EnergyCard";
import { loadEnergyInput } from "@/lib/nutrition/load";

const reportNow = () => Date.now();

export default async function ClientDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ex?: string; a?: string; b?: string }> }) {
  const { id } = await params;
  const { ex, a: pa, b: pb } = await searchParams;
  const { supabase, profile } = await requireUser("trainer");
  const { data: rel } = await supabase.from("trainer_client_relationships").select("status, nutrition_enabled, client:profiles!trainer_client_relationships_client_id_fkey(full_name)").eq("trainer_id", profile.id).eq("client_id", id).maybeSingle();
  if (!rel) notFound();
  const [{ data: a }, { data: rows }, { data: results }] = await Promise.all([
    supabase.from("assessments").select("*").eq("client_id", id).eq("status", "submitted").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("anthropometric_measurements").select("*").eq("client_id", id).order("measured_on", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("calculation_results").select("*").eq("client_id", id),
  ]);
  const { count: unreadMsgs } = await supabase.from("messages").select("id", { count: "exact", head: true }).eq("trainer_id", profile.id).eq("client_id", id).neq("sender_id", profile.id).is("read_at", null);
  // Sensitive access is logged (server-side, service role).
  await createAdminClient().from("access_audit").insert({ actor_id: profile.id, client_id: id, resource: "client_detail" });
  const name = (rel.client as unknown as { full_name: string }).full_name;
  const { data: cp } = await supabase.from("training_plans").select("current_version_id").eq("client_id", id).eq("trainer_id", profile.id).not("current_version_id", "is", null);
  const [{ input: energyInput, hasAssessment }, { data: myPlans }] = await Promise.all([
    loadEnergyInput(supabase, id),
    supabase.from("training_plans").select("id,title,archived_at,plan_versions!plan_versions_plan_id_fkey(version_no,status)").eq("client_id", id).eq("trainer_id", profile.id).order("created_at", { ascending: false }),
  ]);
  const versionIds = (cp ?? []).map((p) => p.current_version_id as string);
  const { data: pex } = versionIds.length ? await supabase.from("prescribed_exercises").select("id, exercise:exercises!prescribed_exercises_exercise_id_fkey(name_es), session:plan_sessions!inner(version_id, name)").in("session.version_id", versionIds) : { data: [] };
  const planExercises = ((pex ?? []) as unknown as { id: string; exercise: { name_es: string }; session: { name: string } }[]).map((e) => ({ id: e.id, name: `${e.exercise.name_es} (${e.session.name})` }));
  const parsedAssessment = assessmentSchema.safeParse(a?.data); const d = parsedAssessment.success ? parsedAssessment.data : undefined;      // never trust stored JSON blindly
  return (
    <section className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between"><h1 className="text-3xl font-semibold">{name}</h1><Link href={`/trainer/clients/${id}/messages`} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm">Mensajes y videollamada{(unreadMsgs ?? 0) > 0 && <span className="ml-1.5 rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-semibold text-black">{unreadMsgs}</span>}</Link></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 text-sm">
          <h2 className="font-semibold">Plan de entrenamiento</h2>
          {(myPlans ?? []).length === 0 ? <p className="text-[var(--muted)]">{name} aún no tiene plan de entrenamiento.</p> : <ul className="space-y-1">{(myPlans ?? []).filter((p) => !p.archived_at).map((p) => { const vs = p.plan_versions ?? []; const pub = vs.filter((v) => v.status === "published"); return <li key={p.id}><Link className="underline" href={`/trainer/plans/${p.id}`}>{p.title}</Link> <span className="text-[var(--muted)]">· {pub.length ? `v${Math.max(...pub.map((v) => v.version_no))} publicada` : "sin publicar"}{vs.some((v) => v.status === "draft") ? " · borrador en edición" : ""}</span></li>; })}</ul>}
          <Link href={`/trainer/plans/new?client=${id}`} className="inline-block rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-black">+ Crear plan de entrenamiento</Link>
          <p className="text-xs text-[var(--muted)]">Eliges ejercicios, series, repeticiones, descansos y frecuencia semanal, y lo publicas cuando esté listo. </p>
          <a href="#copiloto" className="inline-block text-xs text-[var(--accent)] underline">O pídele un borrador de plan a la IA (Copiloto, más abajo)</a>
        </div>
        <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 text-sm">
          <h2 className="font-semibold">Nutrición</h2>
          <p className="text-[var(--muted)]">{rel.nutrition_enabled ? "Activada: el alumno verá su plan de alimentación cuando lo publiques." : "No activada: el alumno no ve nada de nutrición."}</p>
          <Link href={`/trainer/clients/${id}/nutrition`} className="inline-block rounded-lg border border-[var(--accent)] px-4 py-2 font-semibold text-[var(--accent)]">{rel.nutrition_enabled ? "Abrir nutrición" : "Ver cálculo y activar"}</Link>
        </div>
      </div>
      <EnergyCard input={energyInput} audience="trainer" hasAssessment={hasAssessment} />
      {!a && <p className="rounded-lg border border-[var(--border)] p-4 text-sm text-[var(--muted)]">Sin evaluación visible. Puede que el alumno aún no la haya enviado o que haya retirado su consentimiento para compartir datos de salud.</p>}
      {a && !d && <p role="alert" className="rounded-lg border border-[var(--warn)] p-4 text-sm">La evaluación enviada no tiene el formato esperado y no se puede mostrar. Pídele al alumno que la envíe de nuevo.</p>}
      {a && d && (
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 text-sm">
          <h2 className="font-semibold">Evaluación ({a.kind === "initial" ? "inicial" : "reevaluación"}, {new Date(a.submitted_at).toLocaleDateString("es-CO")})</h2>
          <RiskBanner level={a.risk_level} reasons={a.risk_reasons} audience="trainer" />
          <p>Objetivos: {d.goals.goals.join(", ")}</p>
          <p>Entrenamiento actual: {d.training.weeklyFrequency} días/sem · {d.training.sessionMinutes} min · {d.training.location}</p>
          <p>Dolor actual: {d.health.currentPain}/10 · Lesiones: {d.health.injuries || "ninguna declarada"}</p>
        </div>)}
      <ActionForm action={addMeasurementForClient.bind(null, id)} submitLabel="Guardar medición"><h2 className="font-semibold">Registrar medición (tomada por ti)</h2><MeasurementFields /></ActionForm>
      <MeasurementsView rows={(rows ?? []) as never} results={(results ?? []) as never} />
      <h2 className="pt-4 text-2xl font-semibold">Entrenamientos</h2>
      <ProgressPanel supabase={supabase} clientId={id} ex={ex} basePath={`/trainer/clients/${id}`} audience="trainer" />
      <ProgressionSection supabase={supabase} clientId={id} trainerId={profile.id} />
      <TrainerPhotos supabase={supabase} clientId={id} trainerId={profile.id} a={pa} b={pb} />
      <ReportForm clientId={id} trainer now={reportNow()} />
      <CopilotPanel clientId={id} ai={await aiStatus()} exercises={planExercises} />
    </section>
  );
}