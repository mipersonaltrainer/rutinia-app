import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { EnergyCard } from "@/components/nutrition/EnergyCard";
import { MealList, PlanTotalsBar, type ViewMeal } from "@/components/nutrition/PlanView";
import { loadEnergyInput } from "@/lib/nutrition/load";

export const metadata = { title: "Mi nutrición" };

export default async function ClientNutrition() {
  const { supabase, profile } = await requireUser("client");
  const { data: rel } = await supabase.from("trainer_client_relationships").select("nutrition_enabled").eq("client_id", profile.id).eq("status", "active").maybeSingle();
  if (!rel?.nutrition_enabled) notFound();       // clients whose trainer did not agree a nutrition plan have no such section
  const [{ input, hasAssessment }, { data: plan }] = await Promise.all([
    loadEnergyInput(supabase, profile.id),
    supabase.from("nutrition_plans").select("id,title,notes,kcal_target,protein_g,carbs_g,fat_g,published_at").eq("client_id", profile.id).eq("status", "published").maybeSingle(),
  ]);
  const { data: meals } = plan ? await supabase.from("nutrition_meals").select("id,name,note,position, items:nutrition_items(id,grams,created_at, food:foods(name_es,kcal_100,protein_100,carbs_100,fat_100,is_liquid,measures))").eq("plan_id", plan.id).order("position") : { data: [] };
  const view: ViewMeal[] = (meals ?? []).map((m) => ({ id: m.id, name: m.name, note: m.note, items: ([...((m.items ?? []) as unknown as { id: string; grams: number; created_at: string; food: ViewMeal["items"][number]["food"] }[])]).sort((a, b) => a.created_at.localeCompare(b.created_at)).map((i) => ({ id: i.id, grams: Number(i.grams), food: { ...i.food, kcal_100: Number(i.food.kcal_100), protein_100: Number(i.food.protein_100), carbs_100: Number(i.food.carbs_100), fat_100: Number(i.food.fat_100) } })) }));
  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-semibold">Mi nutrición</h1>
      {plan ? (<>
        <div><h2 className="text-xl font-semibold">{plan.title}</h2><p className="text-xs text-[var(--muted)]">Publicado por tu entrenador el {new Date(plan.published_at!).toLocaleDateString("es-CO")}.</p></div>
        <PlanTotalsBar meals={view} plan={plan} />
        <p className="text-xs text-[var(--muted)]">¿Tienes gramera? Usa los gramos exactos. Si no, la medida casera es una guía aproximada (cucharada sopera, pocillo de tinto, vaso…).</p>
        <MealList meals={view} />
        {plan.notes && <div className="whitespace-pre-line rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm"><h3 className="mb-1 font-semibold">Notas de tu entrenador</h3>{plan.notes}</div>}
      </>) : <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">Tu entrenador aún no ha publicado tu plan de alimentación. Mientras tanto, esta es tu estimación de energía.</p>}
      <EnergyCard input={input} audience="client" hasAssessment={hasAssessment} />
      <p className="text-xs text-[var(--muted)]">Si tienes una condición médica, estás embarazada o tienes antecedentes de trastornos de la conducta alimentaria, consulta a un profesional de la salud antes de seguir cualquier plan de alimentación.</p>
    </section>
  );
}
