"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { evaluatePlan, type Change } from "@/lib/progression/engine";
import { loadPlanInputs } from "@/lib/progression/inputs";

type State = { error?: string; ok?: string } | undefined;
const friendly = (m: string) =>
  /stale/.test(m) ? "El plan cambió después de generar esta propuesta. Vuelve a analizar el progreso." :
  /already resolved/.test(m) ? "Esta propuesta ya fue resuelta." :
  /reason/.test(m) ? "Escribe el motivo (mínimo 5 caracteres)." :
  /draft no longer matches/.test(m) ? "El borrador ya no coincide con este ejercicio; aplica el cambio manualmente en el plan." :
  /out of range|cannot be applied|invalid/.test(m) ? "Algún valor propuesto no es válido." : "No se pudo completar la acción.";

export async function analyzeProgress(planId: string, clientId: string, _: State): Promise<State> {
  void _;
  const supabase = await createClient();
  const inputs = await loadPlanInputs(supabase, planId);
  if (!inputs) return { error: "Este plan no tiene una versión publicada con ejercicios." };
  const proposals = evaluatePlan(inputs.exercises, inputs.ctx);
  const { data, error } = await supabase.rpc("save_recommendations", { p_plan: planId, p_items: proposals });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/trainer/clients/${clientId}`);
  const r = data as { inserted: number; superseded: number };
  return { ok: proposals.length === 0 ? "No hay propuestas: faltan datos o no se requieren cambios." : `${r.inserted} propuesta(s) nueva(s)${r.superseded ? `, ${r.superseded} reemplazada(s)` : ""}.` };
}

export async function decide(recId: string, clientId: string, decision: "accepted" | "modified" | "rejected", original: Change[], _: State, fd: FormData): Promise<State> {
  const reason = String(fd.get("reason") ?? "").trim();
  let changes: Change[] | null = null;
  if (decision === "modified") {
    changes = original.map((c, i) => {
      const raw = fd.get(`to_${i}`); if (raw === null || raw === "") return c;
      const num = Number(raw);
      return { ...c, to: z.number().finite().safeParse(num).success && typeof c.to === "number" ? num : c.to };
    });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("decide_recommendation", { p_rec: recId, p_decision: decision, p_reason: reason || null, p_changes: changes });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/trainer/clients/${clientId}`);
  const d = data as { draft_version_id: string | null };
  return { ok: decision === "rejected" ? "Propuesta rechazada y registrada." : d.draft_version_id ? "Aplicada a un borrador del plan. Revísalo y publícalo cuando quieras." : "Decisión registrada." };
}

export async function goToDraft(planId: string) { redirect(`/trainer/plans/${planId}`); }
