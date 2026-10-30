export const PAGE_SIZE = 48;
export interface ExerciseFilters { q: string; muscle?: string; equipment?: string; level?: string; pattern?: string; goal?: string; angle?: string; home: boolean; mine: boolean; avoid: string[]; page: number }

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
export const ANGLES = ["flat", "incline", "decline"] as const;
/** Plurals match their singular («mancuernas» → «mancuerna»), so a plural never hides results; «press» keeps its double s. */
export const stem = (w: string) => (w.length > 5 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const stripAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function parseFilters(sp: Record<string, string | string[] | undefined>): ExerciseFilters {
  const avoid = ([] as string[]).concat(sp.avoid ?? []).filter((a) => /^[a-z_]+$/.test(a));
  const page = Math.max(1, Number.parseInt(one(sp.page) ?? "1", 10) || 1);
  return { q: stripAccents((one(sp.q) ?? "").trim()).replace(/[%,()*]/g, " ").trim(), muscle: one(sp.muscle), equipment: one(sp.equipment), level: one(sp.level), pattern: one(sp.pattern), goal: one(sp.goal), angle: (ANGLES as readonly string[]).includes(one(sp.angle) ?? "") ? one(sp.angle) : undefined, home: one(sp.home) === "1", mine: one(sp.mine) === "1", avoid, page };
}

// Minimal structural type so this stays testable without the Supabase client.
export interface QueryLike<T> { eq(c: string, v: unknown): T; ilike(c: string, p: string): T; contains(c: string, v: unknown): T; not(c: string, op: string, v: unknown): T; range(a: number, b: number): T }

/** Every criterion, without pagination (callers choose the range, or none for counts). */
export function applyCriteria<T extends QueryLike<T>>(query: T, f: ExerciseFilters, userId: string): T {
  let q = query;
  if (f.q) for (const w of f.q.split(/\s+/).filter(Boolean)) q = q.ilike("search_text", `%${stem(w)}%`);
  if (f.muscle) q = q.eq("primary_muscle", f.muscle);
  if (f.equipment) q = q.eq("equipment", f.equipment);
  if (f.level) q = q.eq("difficulty", f.level);
  if (f.pattern) q = q.eq("movement_pattern", f.pattern);
  if (f.goal) q = q.contains("goals", [f.goal]);
  if (f.angle) q = q.eq("bench_angle", f.angle);
  if (f.home) q = q.eq("home_friendly", true);
  if (f.mine) q = q.eq("owner_id", userId);
  if (f.avoid.length) q = q.not("joint_stress", "ov", `{${f.avoid.join(",")}}`);
  return q;
}

export function applyFilters<T extends QueryLike<T>>(query: T, f: ExerciseFilters, userId: string): T {
  return applyCriteria(query, f, userId).range((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE - 1);
}
