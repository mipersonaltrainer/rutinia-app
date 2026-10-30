import type { SupabaseClient } from "@supabase/supabase-js";
import { assessmentSchema, type AssessmentData } from "@/lib/assessment/schema";
import type { Candidate, PlanConstraints } from "./validate-plan";

const RANK = { beginner: 0, intermediate: 1, advanced: 2 } as const;
const COMPOUND = ["squat", "hinge", "push_horizontal", "push_vertical", "pull_horizontal", "pull_vertical", "lunge"];
const MAIN = ["quadriceps", "hamstrings", "glutes", "chest", "back", "shoulders", "core", "biceps", "triceps", "calves"];
export const PER_MUSCLE = 10;

export async function loadLatestAssessment(supabase: SupabaseClient, clientId: string): Promise<{ data: AssessmentData; risk: string | null } | null> {
  const { data } = await supabase.from("assessments").select("data,risk_level").eq("client_id", clientId).eq("status", "submitted").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  const parsed = assessmentSchema.safeParse(data.data);
  return parsed.success ? { data: parsed.data, risk: data.risk_level } : null;
}

/** Library candidates are pre-filtered in SQL by the trainer's hard constraints, so the model never even sees an exercise it must not use. */
export async function loadCandidates(supabase: SupabaseClient, c: PlanConstraints): Promise<Candidate[]> {
  const levels = (Object.keys(RANK) as (keyof typeof RANK)[]).filter((l) => RANK[l] <= RANK[c.level]);
  let q = supabase.from("exercises").select("id,name_es,primary_muscle,equipment,difficulty,exercise_type,joint_stress,movement_pattern").in("equipment", c.equipment).in("difficulty", levels).in("exercise_type", ["strength", "isometric", "stability"]).limit(900);
  if (c.avoidJoints.length) q = q.not("joint_stress", "ov", `{${c.avoidJoints.join(",")}}`);
  const { data } = await q;
  const rows = (data ?? []) as { id: string; name_es: string; primary_muscle: string; equipment: string; difficulty: Candidate["difficulty"]; exercise_type: string; joint_stress: string[]; movement_pattern: string }[];
  const excluded = c.excludedNames.map((n) => n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")).filter((n) => n.length >= 3);
  const ok = rows.filter((r) => { const nm = r.name_es.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); return !excluded.some((e) => nm.includes(e)); });
  const picked: typeof rows = [];
  for (const m of MAIN) picked.push(...ok.filter((r) => r.primary_muscle === m).sort((a, b) => (COMPOUND.includes(b.movement_pattern) ? 1 : 0) - (COMPOUND.includes(a.movement_pattern) ? 1 : 0) || a.name_es.localeCompare(b.name_es)).slice(0, PER_MUSCLE));
  return picked.map((r, i) => ({ code: `E${String(i + 1).padStart(3, "0")}`, id: r.id, name: r.name_es, primary_muscle: r.primary_muscle, equipment: r.equipment, difficulty: r.difficulty, exercise_type: r.exercise_type, joint_stress: r.joint_stress, movement_pattern: r.movement_pattern }));
}
