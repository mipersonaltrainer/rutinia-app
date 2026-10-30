// Requires local Supabase. Run: npm run test:int
import { describe, it, expect, beforeAll } from "vitest";
import { GET } from "@/app/api/health/route";

const SECRET = "t".repeat(40);
const call = (auth?: string) => GET(new Request("http://x/api/health", { headers: auth ? { authorization: auth } : {} }));
beforeAll(() => { process.env.CRON_SECRET = SECRET; });

describe("/api/health", () => {
  it("anonymous callers learn only ok/not ok", async () => {
    const r = await call(); expect(r.status).toBe(200); expect(await r.json()).toEqual({ ok: true });
    expect((await call("Bearer wrong-secret-of-the-wrong-length")).status).toBe(200);
    expect(await (await call("Bearer " + "x".repeat(40))).json()).toEqual({ ok: true });      // same length, wrong value: still no detail
  });
  it("the operator sees detail but never secret values", async () => {
    const r = await call(`Bearer ${SECRET}`); const j = await r.json();
    expect(j).toMatchObject({ ok: true, db: { ok: true }, webhooksStuck: expect.any(Number), providers: expect.any(Object), problems: expect.any(Array) });
    expect(JSON.stringify(j)).not.toContain(SECRET); expect(JSON.stringify(j)).not.toContain(process.env.SUPABASE_SERVICE_ROLE_KEY!);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
});
