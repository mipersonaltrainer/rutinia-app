// Requires local Supabase. The banner/billing UI (describeAccess) and the database gate (trainer_has_access) must never disagree.
import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { describeAccess } from "@/lib/billing/access-status";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321", process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now(); let id: string;
const off = (d: number) => new Date(Date.now() + d * 86400e3).toISOString();
afterAll(async () => { if (id) await admin.auth.admin.deleteUser(id); });

describe("describeAccess agrees with trainer_has_access", () => {
  it("across every status and date combination", async () => {
    const { data, error } = await admin.auth.admin.createUser({ email: `par-${run}@x.co`, password: "Test-Pass-12345", email_confirm: true }); if (error) throw error; id = data.user.id;
    let n = 0;
    for (const status of ["trialing", "payment_required", "active", "past_due", "canceled", "suspended", "expired"]) for (const trial of [-2, 3]) for (const period of [null, -1, 10]) {
      const row = { status, trial_ends_at: off(trial), current_period_end: period === null ? null : off(period) };
      const u = await admin.from("trainer_subscriptions").update(row).eq("trainer_id", id); expect(u.error).toBeNull();
      const { data: gate } = await admin.rpc("trainer_has_access", { t: id });
      expect([status, trial, period, describeAccess(row).allowed]).toEqual([status, trial, period, gate]); n++;
    }
    expect(n).toBe(42);
  });
});
