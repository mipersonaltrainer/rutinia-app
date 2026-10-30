import { describe, it, expect, vi } from "vitest";
import { CATEGORIES, categoryLabel, openThreadSchema, sendSchema, supportError, SUPPORT_EMAIL } from "@/lib/support/schema";
import { notifySupportTeam } from "@/lib/support/alert";
import { subscriptionsFor } from "@/lib/messaging/realtime";

describe("support validation (mirrors the database limits)", () => {
  const ok = { category: "pago", subject: "Pagué y no se activó", body: "Hola, pagué un cupo ayer." };
  it("accepts a complete request and trims it", () => {
    expect(openThreadSchema.parse({ ...ok, subject: "  Pagué y no se activó  " }).subject).toBe("Pagué y no se activó");
  });
  it("rejects an unknown topic, a short subject and an empty or oversized message", () => {
    expect(openThreadSchema.safeParse({ ...ok, category: "hack" }).success).toBe(false);
    expect(openThreadSchema.safeParse({ ...ok, subject: "ab" }).success).toBe(false);
    expect(openThreadSchema.safeParse({ ...ok, subject: "x".repeat(121) }).success).toBe(false);
    expect(openThreadSchema.safeParse({ ...ok, body: "   " }).success).toBe(false);
    expect(openThreadSchema.safeParse({ ...ok, body: "x".repeat(4001) }).success).toBe(false);
    expect(sendSchema.safeParse({ body: "x".repeat(4000) }).success).toBe(true);
    expect(sendSchema.safeParse({ body: "" }).success).toBe(false);
  });
  it("knows the five topics and names them", () => {
    expect(CATEGORIES.map((c) => c.id)).toEqual(["pago", "acceso", "permisos", "error", "otro"]);
    expect(categoryLabel("pago")).toMatch(/pago/i); expect(categoryLabel("desconocido")).toBe("Otro tema");
  });
  it("turns database errors into something a person can act on, and points to the email when nothing else helps", () => {
    expect(supportError("rate limited")).toMatch(/rápido/);
    expect(supportError("too many open")).toMatch(/5 conversaciones/);
    expect(supportError("forbidden")).toMatch(/No tienes acceso/);
    expect(supportError("boom")).toContain(SUPPORT_EMAIL);
  });
});

describe("support team alert", () => {
  const t = { threadId: "th-1", trainerName: "Ana\nPérez", category: "pago", subject: "No se activó\r\nmi cupo", reply: false };
  const env = { SUPPORT_ALERT_WEBHOOK_URL: "https://hooks.example.com/support", ADMIN_ALERT_WEBHOOK_URL: "https://hooks.example.com/admin", APPLICATION_BASE_URL: "https://app.example.com/" };
  const okFetch = () => vi.fn(async () => new Response("ok", { status: 200 }));

  it("posts the trainer, the topic and a link to the conversation — never a message body — on a single line", async () => {
    const f = okFetch(); const r = await notifySupportTeam(t, env, f as unknown as typeof fetch);
    expect(r.ok).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [URL, { body: string }];
    expect(String(url)).toBe("https://hooks.example.com/support");
    const { text } = JSON.parse(init.body);
    expect(text).toContain("Soporte nuevo"); expect(text).toContain("Ana Pérez"); expect(text).toContain("https://app.example.com/staff/soporte/th-1");
    expect(text).not.toMatch(/[\r\n]/);
  });
  it("labels a follow-up differently and falls back to the operator webhook when there is no support one", async () => {
    const f = okFetch(); await notifySupportTeam({ ...t, reply: true }, { ADMIN_ALERT_WEBHOOK_URL: env.ADMIN_ALERT_WEBHOOK_URL }, f as unknown as typeof fetch);
    expect(String((f.mock.calls[0] as unknown as [URL])[0])).toBe("https://hooks.example.com/admin");
    expect(JSON.parse((f.mock.calls[0] as unknown as [URL, { body: string }])[1].body).text).toContain("Respuesta nueva");
  });
  it("never throws: no webhook, an unusable one, or a failing receiver just report the failure", async () => {
    expect(await notifySupportTeam(t, {})).toEqual({ ok: false, reason: "no_webhook" });
    expect((await notifySupportTeam(t, { SUPPORT_ALERT_WEBHOOK_URL: "http://insecure.example.com/x" })).ok).toBe(false);
    const down = vi.fn(async () => { throw new Error("down"); });
    expect((await notifySupportTeam(t, env, down as unknown as typeof fetch)).ok).toBe(false);
  });
});

describe("support realtime", () => {
  it("a trainer hears only their own conversations; the team hears all of them (RLS still decides what is delivered)", () => {
    expect(subscriptionsFor("trainer", "u1").find((s) => s.table === "support_threads")!.filter).toBe("trainer_id=eq.u1");
    const staff = subscriptionsFor("staff", "u2");
    expect(staff.find((s) => s.table === "support_threads")!.filter).toBeUndefined();
    expect(staff.some((s) => s.table === "messages")).toBe(false);
    expect(subscriptionsFor("client", "u3").some((s) => s.table === "support_threads")).toBe(false);
  });
});
