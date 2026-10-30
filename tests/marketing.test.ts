import { describe, it, expect, vi } from "vitest";
import { campaignSchema, firstName, isSafeLink, render } from "@/lib/marketing/schema";
import { ageOn, celebrationDay, colombiaToday, daysUntilBirthday, isBirthdayToday } from "@/lib/marketing/birthday";
import { inAudience, reach, type Candidate } from "@/lib/marketing/audience";
import { emailConfig, renderEmail, sendEmail } from "@/lib/marketing/email";
import { pushConfig, sendPush } from "@/lib/marketing/push";
import { validBirthDate } from "@/lib/marketing/birth-date";

describe("marketing: links are internal paths or https, nothing else (same rule as the database)", () => {
  it("accepts", () => { for (const l of ["/trainer/billing", "/trainer/support?x=1#a", "https://rutinia.company/promo", "https://x.co/a?b=c&d=e"]) expect(isSafeLink(l), l).toBe(true); });
  it("rejects scheme tricks, protocol-relative links, plain http and spaces", () => {
    for (const l of ["javascript:alert(1)", "//evil.example.com", "http://x.co", "/a b", "data:text/html,hi", "https://x.co/a b", "mailto:a@b.co", "trainer/billing", "/" + "a".repeat(300)]) expect(isSafeLink(l), l).toBe(false);
  });
});

describe("marketing: the campaign form", () => {
  const ok = { kind: "campana", title: "Nueva sección de nutrición", body: "Hola {nombre}, ya puedes crear planes de alimentación.", audience: "todos", channels: ["in_app"] };
  it("accepts a complete campaign and turns an empty link into none", () => { const p = campaignSchema.parse({ ...ok, link: "" }); expect(p.link).toBeUndefined(); expect(p.channels).toEqual(["in_app"]); });
  it("rejects bad type, audience, channel, empty channels, long text and unsafe links", () => {
    for (const bad of [{ kind: "spam" }, { audience: "mundo" }, { channels: [] }, { channels: ["sms"] }, { title: "ab" }, { title: "x".repeat(81) }, { body: "" }, { body: "x".repeat(601) }, { link: "javascript:alert(1)" }]) expect(campaignSchema.safeParse({ ...ok, ...bad }).success, JSON.stringify(bad)).toBe(false);
  });
  it("personalises with the first name only and tidies the spacing", () => {
    expect(firstName("  Camila  Ñáñez Pérez")).toBe("Camila"); expect(firstName("")).toBe("");
    expect(render("¡Feliz cumpleaños, {nombre}! 🎂", "Camila")).toBe("¡Feliz cumpleaños, Camila! 🎂"); expect(render("Hola {NOMBRE}, bienvenido", "Ana")).toBe("Hola Ana, bienvenido");
    expect(render("Hola {nombre}, ya", "")).toBe("Hola, ya");
  });
});

describe("marketing: birthdays (Colombian calendar)", () => {
  it("the day changes at Colombian midnight, not at UTC midnight", () => {
    expect(colombiaToday(new Date("2026-03-15T04:59:00Z"))).toEqual({ y: 2026, m: 3, d: 14 }); expect(colombiaToday(new Date("2026-03-15T05:00:00Z"))).toEqual({ y: 2026, m: 3, d: 15 });
    expect(isBirthdayToday("1990-03-15", new Date("2026-03-15T04:59:00Z"))).toBe(false); expect(isBirthdayToday("1990-03-15", new Date("2026-03-15T05:00:00Z"))).toBe(true);
    expect(isBirthdayToday(null, new Date())).toBe(false); expect(isBirthdayToday("basura", new Date())).toBe(false);
  });
  it("someone born on 29 February is celebrated on the 28th in years without one", () => {
    expect(celebrationDay("1992-02-29", 2027)).toEqual({ m: 2, d: 28 }); expect(celebrationDay("1992-02-29", 2028)).toEqual({ m: 2, d: 29 }); expect(celebrationDay("1992-02-29", 2100)).toEqual({ m: 2, d: 28 });
    expect(isBirthdayToday("1992-02-29", new Date("2027-02-28T15:00:00Z"))).toBe(true); expect(isBirthdayToday("1992-02-29", new Date("2028-02-28T15:00:00Z"))).toBe(false);
  });
  it("counts the days to the next celebration, across the new year", () => {
    const now = new Date("2026-12-30T15:00:00Z");
    expect(daysUntilBirthday("1990-12-30", now)).toBe(0); expect(daysUntilBirthday("1990-01-02", now)).toBe(3); expect(daysUntilBirthday("1990-12-29", now)).toBe(364);
    expect(ageOn("1990-12-30", now)).toBe(36);
  });
  it("a plausible adult birth date only: real date, at least 16 years ago, not before 1900", () => {
    const today = new Date("2026-10-28T12:00:00Z");
    expect(validBirthDate("1990-05-10", today)).toBe(true); expect(validBirthDate("2010-10-28", today)).toBe(true); expect(validBirthDate("2010-10-29", today)).toBe(false);
    for (const bad of ["", "1990-02-30", "1899-12-31", "2030-01-01", "10/05/1990", "1990-5-1"]) expect(validBirthDate(bad, today), bad).toBe(false);
  });
});

describe("marketing: who receives what", () => {
  const now = new Date("2026-10-28T15:00:00Z"), in2d = new Date(now.getTime() + 2 * 86400000).toISOString(), ago2d = new Date(now.getTime() - 2 * 86400000).toISOString();
  const mk = (id: string, over: Partial<Candidate> = {}): Candidate => ({ id, name: id, birth_date: null, marketing_in_app: true, marketing_email: true, sub: { status: "active", trial_ends_at: null, current_period_end: in2d }, ...over });
  const all = [mk("pays"), mk("trial", { sub: { status: "trialing", trial_ends_at: in2d, current_period_end: null } }), mk("blocked", { sub: { status: "payment_required", trial_ends_at: ago2d, current_period_end: null } }), mk("optout", { marketing_in_app: false, marketing_email: false }), mk("bday", { birth_date: "1990-10-28" })];
  it("audiences follow the same subscription rule as the product", () => {
    const ids = (a: Parameters<typeof inAudience>[1]) => all.filter((c) => inAudience(c, a, now)).map((c) => c.id);
    expect(ids("todos")).toHaveLength(5); expect(ids("prueba")).toEqual(["trial"]); expect(ids("bloqueados")).toEqual(["blocked"]); expect(ids("cumple_hoy")).toEqual(["bday"]); expect(ids("pagando")).toEqual(["pays", "optout", "bday"]);
    expect(all.filter((c) => inAudience(c, "uno", now, "pays")).map((c) => c.id)).toEqual(["pays"]); expect(all.filter((c) => inAudience(c, "uno", now, null))).toEqual([]);
  });
  it("opt-outs: campaigns respect them, a service notice still reaches the bell, e-mail always respects them, a one-person test ignores them", () => {
    expect(reach(all, "campana", "todos", now).inApp.map((c) => c.id)).not.toContain("optout");
    expect(reach(all, "comunicado", "todos", now).inApp.map((c) => c.id)).toContain("optout");
    expect(reach(all, "comunicado", "todos", now).email.map((c) => c.id)).not.toContain("optout");
    expect(reach(all, "campana", "uno", now, "optout").inApp.map((c) => c.id)).toEqual(["optout"]);
  });
});

describe("marketing: e-mail", () => {
  const env = { EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_test", EMAIL_FROM: "Rutinia <no-responder@rutinia.company>" };
  it("is on only with the provider, the key and a valid sender", () => {
    expect(emailConfig(env)).toEqual({ apiKey: "re_test", from: "Rutinia <no-responder@rutinia.company>" });
    for (const bad of [{}, { ...env, EMAIL_PROVIDER: "otro" }, { ...env, RESEND_API_KEY: "" }, { ...env, EMAIL_FROM: "no-es-un-correo" }]) expect(emailConfig(bad)).toBeNull();
  });
  it("escapes everything the team types and turns an internal link into an absolute one", () => {
    const { html, text } = renderEmail({ to: "a@b.co", subject: "x", text: "<script>alert(1)</script> & \"hola\"", link: "/trainer/billing" }, "https://app.example.com/");
    expect(html).not.toContain("<script>"); expect(html).toContain("&lt;script&gt;"); expect(html).toContain('href="https://app.example.com/trainer/billing"'); expect(text).toContain("https://app.example.com/trainer/billing");
  });
  it("posts to the provider with the key and reports failures without throwing", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    expect((await sendEmail({ apiKey: "re_test", from: "a@b.co" }, { to: "x@y.co", subject: "Hola", text: "t" }, "https://app.example.com", f as unknown as typeof fetch)).ok).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe("https://api.resend.com/emails"); expect(init.headers.Authorization).toBe("Bearer re_test"); expect(JSON.parse(init.body).to).toEqual(["x@y.co"]);
    expect((await sendEmail({ apiKey: "k", from: "a@b.co" }, { to: "x@y.co", subject: "s", text: "t" }, "https://a.co", (async () => new Response("", { status: 422 })) as unknown as typeof fetch)).ok).toBe(false);
    expect((await sendEmail({ apiKey: "k", from: "a@b.co" }, { to: "x@y.co", subject: "s", text: "t" }, "https://a.co", (async () => { throw new Error("down"); }) as unknown as typeof fetch)).ok).toBe(false);
  });
});

describe("marketing: web push", () => {
  it("needs the three VAPID values and a mailto:/https subject", () => {
    expect(pushConfig({ VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "prv", VAPID_SUBJECT: "mailto:support@rutinia.company" })).toEqual({ publicKey: "pub", privateKey: "prv", subject: "mailto:support@rutinia.company" });
    for (const bad of [{}, { VAPID_PUBLIC_KEY: "p", VAPID_PRIVATE_KEY: "k" }, { VAPID_PUBLIC_KEY: "p", VAPID_PRIVATE_KEY: "k", VAPID_SUBJECT: "ftp://x" }]) expect(pushConfig(bad)).toBeNull();
  });
  it("sends the payload, and tells a dead subscription (404/410) from a temporary failure", async () => {
    const cfg = { publicKey: "pub", privateKey: "prv", subject: "mailto:a@b.co" }, sub = { endpoint: "https://push.example/1", p256dh: "k".repeat(30), auth: "a".repeat(12) };
    const ok = { sendNotification: vi.fn(async (...args: unknown[]) => { void args; return {}; }) }; expect(await sendPush(cfg, sub, { title: "t", body: "b" }, ok as never)).toEqual({ ok: true });
    expect(JSON.parse(String(ok.sendNotification.mock.calls[0][1]))).toEqual({ title: "t", body: "b" });
    const gone = { sendNotification: vi.fn(async () => { throw Object.assign(new Error("gone"), { statusCode: 410 }); }) }; expect(await sendPush(cfg, sub, { title: "t", body: "b" }, gone as never)).toEqual({ ok: false, gone: true, status: 410 });
    const down = { sendNotification: vi.fn(async () => { throw Object.assign(new Error("busy"), { statusCode: 503 }); }) }; expect(await sendPush(cfg, sub, { title: "t", body: "b" }, down as never)).toMatchObject({ ok: false, gone: false });
  });
});
