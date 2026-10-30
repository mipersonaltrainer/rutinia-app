import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAiConfig } from "@/lib/ai/provider";
import { ActionForm, fieldCls } from "@/components/ActionForm";
import { EnergyCard } from "@/components/nutrition/EnergyCard";
import { loadEnergyInput } from "@/lib/nutrition/load";
import { createNutritionPlan, generateDietAction, setNutritionEnabled } from "./actions";

const STATUS: Record<string, string> = { draft: "Borrador", published: "Publicado (lo ve el alumno)", archived: "Archivado" };

export default async function NutritionHome({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profile } = await requireUser("trainer");
  const { data: rel } = await supabase.from("trainer_client_relationships").select("status, nutrition_enabled, client:profiles!trainer_client_relationships_client_id_fkey(full_name)").eq("trainer_id", profile.id).eq("client_id", id).maybeSingle();
  if (!rel) notFound();
  await createAdminClient().from("access_audit").insert({ actor_id: profile.id, client_id: id, resource: "nutrition" });
  const name = (rel.client as unknown as { full_name: string }).full_name;
  const [{ input, hasAssessment }, { data: plans }] = await Promise.all([
    loadEnergyInput(supabase, id),
    supabase.from("nutrition_plans").select("id,title,status,kcal_target,ai_generated,updated_at").eq("client_id", id).eq("trainer_id", profile.id).order("updated_at", { ascending: false }),
  ]);
  const ai = getAiConfig();
  const { data: cr } = await supabase.rpc("my_ai_credits"); const credits = cr as { free_left: number; paid_left: number } | null;
  return (
    <section className="max-w-3xl space-y-6">
      <div><Link href={`/trainer/clients/${id}`} className="text-sm text-[var(--muted)]">← {name}</Link><h1 className="text-3xl font-semibold">Nutrición de {name}</h1></div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
        <p>{rel.nutrition_enabled ? "Este alumno tiene la sección de nutrición activada: la ve en su espacio cuando publiques un plan." : "Este alumno NO tiene nutrición contratada: no ve ninguna sección de nutrición."}</p>
        <form action={setNutritionEnabled.bind(null, id, !rel.nutrition_enabled)}><button className={`rounded-lg px-3 py-1.5 font-semibold ${rel.nutrition_enabled ? "border border-[var(--border)]" : "bg-[var(--accent)] text-black"}`}>{rel.nutrition_enabled ? "Desactivar nutrición" : "Activar nutrición para este alumno"}</button></form>
      </div>
      <EnergyCard input={input} audience="trainer" hasAssessment={hasAssessment} />
      {rel.nutrition_enabled && (<>
        <ActionForm action={createNutritionPlan.bind(null, id)} submitLabel="Crear plan en blanco">
          <h2 className="font-semibold">Crear plan de alimentación</h2>
          <p className="text-xs text-[var(--muted)]">Se crea con 3 comidas vacías y con los objetivos calculados arriba (puedes cambiarlos). Después añades alimentos en gramos o en medidas caseras.</p>
          <label className="block text-sm">Título<input name="title" required minLength={2} defaultValue={`Plan de alimentación de ${name.split(" ")[0]}`} className={fieldCls} /></label>
        </ActionForm>
        <ActionForm action={generateDietAction.bind(null, id)} submitLabel="Generar borrador con IA">
          <h2 className="font-semibold">Generar con IA</h2>
          {!ai.enabled ? <p role="status" className="rounded-lg border border-[var(--border)] p-3 text-sm text-[var(--muted)]">La IA no está configurada en este entorno (falta proveedor y clave). Puedes crear el plan a mano.</p> : <p className="text-xs text-[var(--muted)]">La IA propone un día de alimentación con alimentos de la biblioteca; el sistema valida los alimentos y ajusta las cantidades a las calorías objetivo. Queda como borrador: tú lo revisas y lo publicas. Requiere que el alumno haya activado el consentimiento de IA.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Comidas al día<select name="meals" defaultValue="4" className={fieldCls}>{[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
            <label className="text-sm">Tipo de dieta<select name="diet" className={fieldCls}><option value="omnivora">Omnívora</option><option value="vegetariana">Vegetariana (con huevo y lácteos)</option><option value="vegana">Vegana</option></select></label>
          </div>
          <label className="block text-sm">Alimentos a evitar (alergias, intolerancias, gustos), separados por coma<input name="excluded" maxLength={300} placeholder="maní, camarón, queso…" className={fieldCls} /></label>
          <label className="block text-sm">Notas para la IA (opcional)<input name="notes" maxLength={400} placeholder="p. ej. almuerza fuera de casa, poco tiempo para cocinar" className={fieldCls} /></label>
          {credits && <p className="text-xs text-[var(--muted)]">Cada borrador usa 1 crédito. Te quedan <b>{credits.free_left}</b> gratis este mes y <b>{credits.paid_left}</b> comprados. {credits.free_left + credits.paid_left === 0 && <Link href="/trainer/billing" className="underline">Comprar créditos</Link>}</p>}
        </ActionForm>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"><h2 className="mb-3 font-semibold">Planes de alimentación</h2>
          {(plans ?? []).length === 0 ? <p className="text-sm text-[var(--muted)]">Aún no hay planes.</p> : <ul className="divide-y divide-[var(--border)] text-sm">{(plans ?? []).map((p) => <li key={p.id} className="py-2"><Link className="underline" href={`/trainer/clients/${id}/nutrition/${p.id}`}>{p.title}</Link> <span className="text-[var(--muted)]">· {STATUS[p.status]}{p.kcal_target ? ` · ${p.kcal_target} kcal` : ""}{p.ai_generated ? " · con IA" : ""}</span></li>)}</ul>}</div>
      </>)}
    </section>
  );
}
