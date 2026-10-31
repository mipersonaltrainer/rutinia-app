import type { SupabaseClient } from "@supabase/supabase-js";
import { assessmentSchema } from "@/lib/assessment/schema";
import { figureFor, type FigureSex } from "./frames";

/** Which exercise figure to show a client: the sex they gave in their latest submitted assessment (read through the caller's session, so RLS applies). */
export async function clientFigure(supabase: SupabaseClient, clientId: string): Promise<FigureSex> {
  const { data } = await supabase.from("assessments").select("data").eq("client_id", clientId).eq("status", "submitted").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const parsed = assessmentSchema.safeParse(data?.data);
  return figureFor(parsed.success ? parsed.data.personal.sexForFormulas : null);
}
