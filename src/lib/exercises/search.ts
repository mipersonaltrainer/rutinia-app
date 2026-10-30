import type { SupabaseClient } from "@supabase/supabase-js";
import { EQUIPMENT_LABEL, GOAL_LABEL, LEVEL_LABEL, MUSCLE_LABEL, PATTERN_LABEL, ANGLE_LABEL, JOINT_LABEL } from "./labels";
import { applyCriteria, PAGE_SIZE, stem, type ExerciseFilters } from "./filters";

export interface ExerciseRow { id: string; name_es: string; primary_muscle: string; equipment: string; difficulty: string; movement_pattern: string; media_status: string; owner_id: string | null; review_status: string; bench_angle: string | null }
export const SELECT = "id,name_es,primary_muscle,equipment,difficulty,movement_pattern,media_status,owner_id,review_status,bench_angle";
const RANK_WINDOW = 300;     // with a text query, up to this many matches are fetched and ranked by relevance; the library has ~600

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Lower is better: every word starts the name, then every word in the name, then matches found only in muscle/equipment/aliases. */
export function relevance(name: string, q: string): number {
  const n = norm(name); const words = q.split(/\s+/).filter(Boolean).map(stem);
  if (!words.length) return 0;
  const starts = n.startsWith(words[0]) ? 0 : 1;
  const inName = words.every((w) => n.includes(w)) ? 0 : 2;
  const pos = Math.min(...words.map((w) => { const i = n.indexOf(w); return i < 0 ? 99 : i; }));
  return starts + inName + Math.min(pos, 99) / 100 + n.length / 10000;
}

export type Relaxation = { key: string; label: string; count: number };
export interface SearchResult { rows: ExerciseRow[]; total: number; pages: number; page: number; relaxations: Relaxation[]; suggested: { label: string; key: string; rows: ExerciseRow[]; total: number } | null }

type Active = { key: string; label: string; clear: (f: ExerciseFilters) => ExerciseFilters };
function activeFilters(f: ExerciseFilters): Active[] {
  const a: Active[] = [];
  if (f.q) a.push({ key: "q", label: `Texto «${f.q}»`, clear: (x) => ({ ...x, q: "" }) });
  if (f.muscle) a.push({ key: "muscle", label: `Músculo: ${MUSCLE_LABEL[f.muscle] ?? f.muscle}`, clear: (x) => ({ ...x, muscle: undefined }) });
  if (f.equipment) a.push({ key: "equipment", label: `Equipamiento: ${EQUIPMENT_LABEL[f.equipment] ?? f.equipment}`, clear: (x) => ({ ...x, equipment: undefined }) });
  if (f.level) a.push({ key: "level", label: `Dificultad: ${LEVEL_LABEL[f.level] ?? f.level}`, clear: (x) => ({ ...x, level: undefined }) });
  if (f.pattern) a.push({ key: "pattern", label: `Patrón: ${PATTERN_LABEL[f.pattern] ?? f.pattern}`, clear: (x) => ({ ...x, pattern: undefined }) });
  if (f.angle) a.push({ key: "angle", label: `Inclinación: ${ANGLE_LABEL[f.angle] ?? f.angle}`, clear: (x) => ({ ...x, angle: undefined }) });
  if (f.goal) a.push({ key: "goal", label: `Objetivo: ${GOAL_LABEL[f.goal] ?? f.goal}`, clear: (x) => ({ ...x, goal: undefined }) });
  if (f.home) a.push({ key: "home", label: "Hechos en casa", clear: (x) => ({ ...x, home: false }) });
  if (f.mine) a.push({ key: "mine", label: "Solo los míos", clear: (x) => ({ ...x, mine: false }) });
  if (f.avoid.length) a.push({ key: "avoid", label: `Excluir: ${f.avoid.map((j) => JOINT_LABEL[j] ?? j).join(", ")}`, clear: (x) => ({ ...x, avoid: [] }) });
  return a;
}

/**
 * Strict search first (every filter applies). With a text query the matches are ranked by relevance. When nothing matches, each
 * active filter is tried in turn without it, so the trainer sees which one is the obstacle and how many results lie beyond it;
 * the most productive relaxation is shown straight away as «similar results».
 */
export async function searchExercises(supabase: SupabaseClient, f: ExerciseFilters, userId: string): Promise<SearchResult> {
  const list = (x: ExerciseFilters) => applyCriteria(supabase.from("exercises").select(SELECT, { count: "exact" }).order("name_es") as never, x, userId) as unknown as { range(a: number, b: number): PromiseLike<{ data: ExerciseRow[] | null; count: number | null }> };
  const window = async (x: ExerciseFilters) => {
    if (x.q) {                                                          // ranked: take the whole window and page it here
      const { data, count } = await list(x).range(0, RANK_WINDOW - 1);
      const rows = [...(data ?? [])].sort((a, b) => relevance(a.name_es, x.q) - relevance(b.name_es, x.q) || a.name_es.localeCompare(b.name_es));
      return { rows, total: count ?? rows.length };
    }
    const { data, count } = await list(x).range((x.page - 1) * PAGE_SIZE, x.page * PAGE_SIZE - 1);
    return { rows: data ?? [], total: count ?? 0 };
  };

  const strict = await window(f);
  const pages = Math.max(1, Math.ceil(strict.total / PAGE_SIZE));
  if (strict.total > 0) return { rows: f.q ? strict.rows.slice((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE) : strict.rows, total: strict.total, pages, page: f.page, relaxations: [], suggested: null };

  const act = activeFilters(f);
  const none: SearchResult = { rows: [], total: 0, pages: 1, page: 1, relaxations: [], suggested: null };
  if (act.length < 1) return none;
  const counts = await Promise.all(act.map(async (a) => {
    const { count } = await (applyCriteria(supabase.from("exercises").select("id", { count: "exact", head: true }) as never, a.clear(f), userId) as unknown as PromiseLike<{ count: number | null }>);
    return { key: a.key, label: a.label, count: count ?? 0 };
  }));
  const relaxations = counts.filter((c) => c.count > 0).sort((a, b) => b.count - a.count);
  if (!relaxations.length) return { ...none, relaxations };
  const best = act.find((a) => a.key === relaxations[0].key)!;
  const w = await window({ ...best.clear(f), page: 1 });
  return { ...none, relaxations, suggested: { label: best.label, key: best.key, rows: w.rows.slice(0, 24), total: w.total } };
}
