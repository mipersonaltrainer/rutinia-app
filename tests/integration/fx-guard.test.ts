// Requires local Supabase. Run: npm run test:int
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { usableRate } from "@/lib/billing/rate";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321", process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const TAG = `fxguard-${Date.now()}`;
const NOW = new Date();
const at = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString();
const put = (rate: string, hoursAgo: number) => admin.from("fx_rates").insert({ rate, source: `${TAG} test`, effective_at: at(hoursAgo) });
let saved: unknown[] = []; let captured = false;

// The table is shared with whatever rate the developer set locally: park it, test in isolation, restore.
beforeEach(async () => {
  if (!captured) { saved = (await admin.from("fx_rates").select("*")).data ?? []; captured = true; }
  await admin.from("fx_rates").delete().not("id", "is", null);
});
afterAll(async () => { await admin.from("fx_rates").delete().not("id", "is", null); if (saved.length) await admin.from("fx_rates").insert(saved as never[]); });

describe("usableRate (what the Wompi purchase actions call)", () => {
  it("no rows → refused with a clear reason", async () => { const r = await usableRate(admin, {}, NOW); expect(r.rate).toBeNull(); expect(r.status).toMatchObject({ usable: false, state: "missing" }); });
  it("a fresh rate is returned and is the one that will be stored on the payment", async () => { await put("3950.5000", 5); const r = await usableRate(admin, {}, NOW); expect(Number(r.rate?.rate)).toBe(3950.5); expect(r.status.usable).toBe(true); });
  it("a rate older than the default 7 days is refused", async () => { await put("3950.5000", 24 * 8); const r = await usableRate(admin, {}, NOW); expect(r.rate).toBeNull(); expect(r.status).toMatchObject({ state: "stale" }); });
  it("FX_MAX_AGE_HOURS tightens and loosens the limit", async () => {
    await put("3950.5000", 30);
    expect((await usableRate(admin, { FX_MAX_AGE_HOURS: "24" }, NOW)).rate).toBeNull();
    expect((await usableRate(admin, { FX_MAX_AGE_HOURS: "48" }, NOW)).rate).not.toBeNull();
    expect((await usableRate(admin, { FX_MAX_AGE_HOURS: "garbage" }, NOW)).rate).not.toBeNull();     // garbage → default 168, not "no limit"
  });
  it("the newest rate decides: registering a fresh one re-enables Wompi; an older fresh-looking row cannot rescue a stale newest", async () => {
    await put("3900.0000", 24 * 20); const stale = await usableRate(admin, {}, NOW); expect(stale.rate).toBeNull();
    await put("4010.2500", 1); const fresh = await usableRate(admin, {}, NOW); expect(Number(fresh.rate?.rate)).toBe(4010.25);
  });
  it("a future-dated rate is ignored until its time; the previous fresh one keeps serving", async () => {
    await put("3950.5000", 10); await admin.from("fx_rates").insert({ rate: "9999.0000", source: `${TAG} future`, effective_at: new Date(NOW.getTime() + 3_600_000).toISOString() });
    expect(Number((await usableRate(admin, {}, NOW)).rate?.rate)).toBe(3950.5);
  });
  it("only a future-dated rate exists → missing, never used", async () => {
    await admin.from("fx_rates").insert({ rate: "9999.0000", source: `${TAG} future`, effective_at: new Date(NOW.getTime() + 3_600_000).toISOString() });
    expect((await usableRate(admin, {}, NOW)).rate).toBeNull();
  });
});
