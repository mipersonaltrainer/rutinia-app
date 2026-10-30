import type { SupabaseClient } from "@supabase/supabase-js";
import { fxRateStatus, fxMaxAgeHours, type FxRateStatus } from "./fx";

// PostgREST returns numeric columns as JSON numbers, hence string | number.
export type FxRow = { rate: string | number; effective_at: string; source: string };

/** Newest USD→COP rate that is already in effect (a future-dated row is ignored until its time comes). */
export async function latestRate(supabase: SupabaseClient, now: Date = new Date()): Promise<FxRow | null> {
  const { data } = await supabase.from("fx_rates").select("rate,effective_at,source").eq("base", "USD").eq("quote", "COP").lte("effective_at", now.toISOString()).order("effective_at", { ascending: false }).limit(1).maybeSingle();
  return (data as FxRow | null) ?? null;
}

/**
 * The rate to charge Wompi with, or why there is none. Freshness is judged on the newest rate only: an old
 * rate never "wins" over a missing one, and registering a new rate immediately re-enables Wompi.
 */
export async function usableRate(supabase: SupabaseClient, env: Record<string, string | undefined> = process.env, now: Date = new Date()): Promise<{ rate: FxRow; status: FxRateStatus } | { rate: null; status: FxRateStatus }> {
  const rate = await latestRate(supabase, now);
  const status = fxRateStatus(rate, now, fxMaxAgeHours(env.FX_MAX_AGE_HOURS));
  return status.usable && rate ? { rate, status } : { rate: null, status };
}
