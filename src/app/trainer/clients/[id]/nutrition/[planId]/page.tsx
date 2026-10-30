import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { ActionForm, fieldCls } from "@/components/ActionForm";
import { FoodFields, type FoodOption } from "@/components/nutrition/FoodFields";
import { MealList, PlanTotalsBar, type ViewMeal } from "@/components/nutrition/PlanView";
import { addItem, addMeal, deleteItem, deleteMeal, deleteNutritionDraft, publishNutritionPlan, unpublishNutritionPlan, setItemGrams, updatePlanTargets } from "../actions";

const small = "rounded border border-[var(--border)] px-2 py-1 text-xs";

export default async function NutritionPlanEditor({ params }: { params: Promise<{ id: string; planId: string }> }) {
  const { id, planId } = await params;
  const { supabase, profile } = await requireUser("trainer");
  const { data: plan } = await supabase.from("nutrition_plans").select("*").eq("id", planId).eq("client_id", id).eq("trainer_id", profile.id).maybeSingle();
  if (!plan) notFound();
  const [{ data: meals }, { data: foods }] = await Promise.all([
    supabase.from("nutrition_meals").select("id,name,note,position, items:nutrition_items(id,grams,created_at, food:foods(name_es,kcal_100,protein_100,carbs_100,fat_100,is_liquid,measures))").eq("plan_id", planId).order("position"),
    supabase.from("foods").select("id,name_es,category,is_liquid,measures,kcal_100").order("name_es"),
  ]);
  const view: ViewMeal[] = (meals ?? []).map((m) => ({ id: m.id, name: m.name, note: m.note, items: ([...((m.items ?? []) as unknown as { id: string; grams: number; created_at: string; food: ViewMeal["items"][number]["food"] }[])]).sort((a, b) => a.created_at.localeCompare(b.created_at)).map((i) => ({ id: i.id, grams: Number(i.grams), food: { ...i.food, kcal_100: Number(i.food.kcal_100), protein_100: Number(i.food.protein_100), carbs_100: Number(i.food.carbs_100), fat_100: Number(i.food.fat_100) } })) }));
  const options = (foods ?? []).map((f) => ({ ...f, kcal_100: Number(f.kcal_100), measures: f.measures as Record<string, number> })) as FoodOption[];
  const ready = view.some((m) => m.items.length > 0);
  return (
    <section className="max-w-3xl space-y-6">
      <div><Link href={`/trainer/clients/${id}/nutrition`} className="text-sm text-[var(--muted)]">← Nutrición</Link>
        <h1 className="text-3xl font-semibold">{plan.title}</h1>
        <p className="text-sm text-[var(--muted)]">{plan.status === "published" ? "Publicado: el alumno lo ve ahora mismo. Los cambios que hagas se reflejan al instante." : plan.status === "draft" ? "Borrador: el alumno aún no lo ve." : "Archivado: el alumno ya no lo ve."}{plan.ai_generated ? " · Generado con IA: revísalo antes de publicar." : ""}</p></div>
      <PlanTotalsBar meals={view} plan={plan} trainerView />
      <MealList meals={view}
        renderItemActions={(i) => (<span className="flex items-center gap-2">
          <form action={setItemGrams.bind(null, id, planId, i.id)} className="flex items-center gap-1"><label className="sr-only" htmlFor={`g-${i.id}`}>Gramos</label><input id={`g-${i.id}`} name="grams" type="number" step="0.5" min="0.5" max="3000" defaultValue={i.grams} className={`${fieldCls} w-20 py-1 text-xs`} /><span className="text-xs text-[var(--muted)]">{i.food.is_liquid ? "ml" : "g"}</span><button className={small}>Cambiar</button></form>
          <form action={deleteItem.bind(null, id, planId, i.id)}><button className={small} aria-label={`Quitar ${i.food.name_es}`}>Quitar</button></form></span>)}
        renderMealActions={(m) => (<div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
          <ActionForm action={addItem.bind(null, id, planId, m.id)} submitLabel="Añadir alimento" resetOnOk className="border-0 bg-transparent p-0"><FoodFields foods={options} /></ActionForm>
          <form action={deleteMeal.bind(null, id, planId, m.id)}><button className="text-xs text-[var(--warn)]">Eliminar esta comida</button></form></div>)} />
      <ActionForm action={addMeal.bind(null, id, planId)} submitLabel="Añadir comida" resetOnOk><label className="block text-sm">Nueva comida<input name="name" required maxLength={60} placeholder="Media mañana, Merienda…" className={fieldCls} /></label></ActionForm>
      <ActionForm action={updatePlanTargets.bind(null, id, planId)} submitLabel="Guardar objetivos y notas">
        <h2 className="font-semibold">Objetivos y notas</h2>
        <label className="block text-sm">Título<input name="title" required defaultValue={plan.title} maxLength={120} className={fieldCls} /></label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="text-sm">Calorías<input name="kcal" type="number" min="800" max="6000" defaultValue={plan.kcal_target ?? ""} className={fieldCls} /></label>
          <label className="text-sm">Proteína (g)<input name="protein" type="number" min="0" defaultValue={plan.protein_g ?? ""} className={fieldCls} /></label>
          <label className="text-sm">Carbohidratos (g)<input name="carbs" type="number" min="0" defaultValue={plan.carbs_g ?? ""} className={fieldCls} /></label>
          <label className="text-sm">Grasa (g)<input name="fat" type="number" min="0" defaultValue={plan.fat_g ?? ""} className={fieldCls} /></label>
        </div>
        <label className="block text-sm">Notas para el alumno (hidratación, horarios, sustituciones…)<textarea name="notes" rows={3} maxLength={2000} defaultValue={plan.notes ?? ""} className={fieldCls} /></label>
      </ActionForm>
      <div className="flex flex-wrap gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
        {plan.status !== "published" && <form action={publishNutritionPlan.bind(null, id, planId)}><button disabled={!ready} className="rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-black disabled:opacity-50">Publicar para el alumno</button></form>}
        {plan.status === "published" && <form action={unpublishNutritionPlan.bind(null, id, planId)}><button className="rounded-lg border border-[var(--border)] px-4 py-2">Retirar (archivar)</button></form>}
        {plan.status === "draft" && <form action={deleteNutritionDraft.bind(null, id, planId)}><button className="rounded-lg border border-[var(--warn)] px-4 py-2 text-[var(--warn)]">Eliminar borrador</button></form>}
        {!ready && <p className="self-center text-xs text-[var(--muted)]">Añade al menos un alimento para poder publicar. Publicar este plan archiva el que estuviera publicado.</p>}
      </div>
      <p className="text-xs text-[var(--muted)]">Los valores nutricionales de la biblioteca son de referencia (no la tabla del ICBF) y están marcados como borrador: revísalos con un profesional de la nutrición antes de usarlos con alumnos reales.</p>
    </section>
  );
}
