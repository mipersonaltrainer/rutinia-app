import { describe, it, expect, vi } from "vitest";
import { notifyStaffOfMessage, notifyTrainerOfReply, pushToUsers } from "@/lib/support/notify";
import { waitSince } from "@/lib/support/wait";
import { categoryLabel } from "@/lib/support/schema";
import { renderEmail } from "@/lib/marketing/email";

type Sub = { endpoint: string; p256dh: string; auth: string };
function fakeAdmin(o: { staff?: string[]; subs?: Sub[]; emails?: Record<string, string | null> }) {
  const deleted: string[] = []; const queried: string[][] = [];
  const admin = {
    from(table: string) {
      return {
        select() { return table === "support_staff" ? Promise.resolve({ data: (o.staff ?? []).map((user_id) => ({ user_id })) }) : { in: (_c: string, ids: string[]) => { queried.push(ids); return Promise.resolve({ data: o.subs ?? [] }); } }; },
        delete() { return { eq: (_c: string, v: string) => { deleted.push(v); return Promise.resolve({}); } }; },
      };
    },
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: o.emails?.[id] === null ? null : { email: o.emails?.[id] ?? `${id}@x.co` } } }) } },
  };
  return { admin: admin as never, deleted, queried };
}
const ENV = { VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv", VAPID_SUBJECT: "mailto:a@b.co", EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_test", EMAIL_FROM: "Rutinia <hola@rutinia.co>", APPLICATION_BASE_URL: "https://app.example.com/" };
const notice = { threadId: "th-1", trainerName: "Ana\nPérez", category: "pago", subject: "No se activó\r\nmi cupo", reply: false };
const sub = (n: number): Sub => ({ endpoint: `https://push.example.com/${n}`, p256dh: "p".repeat(30), auth: "a".repeat(12) });

describe("notify the team when a trainer writes", () => {
  it("pushes to every team device and e-mails every member, with who/what/where and never the message text", async () => {
    const { admin, queried } = fakeAdmin({ staff: ["s1", "s2"], subs: [sub(1), sub(2), sub(3)] });
    const push = vi.fn(async () => ({ ok: true as const })); const mail = vi.fn(async () => ({ ok: true }));
    const r = await notifyStaffOfMessage(admin, notice, ENV, { sendPushImpl: push as never, sendEmailImpl: mail as never });
    expect(r).toEqual({ push: { sent: 3, failed: 0, removed: 0 }, email: { sent: 2, failed: 0 } });
    expect(queried[0]).toEqual(["s1", "s2"]);
    const payload = (push.mock.calls[0] as unknown as [unknown, unknown, { title: string; body: string; url: string; tag: string }])[2];
    expect(payload).toEqual({ title: "Soporte: mensaje nuevo", body: `Ana Pérez · ${categoryLabel("pago")}`, url: "/staff/soporte/th-1", tag: "support-th-1" });
    const m = (mail.mock.calls[0] as unknown as [unknown, { to: string; subject: string; text: string; link: string; footer: string }, string])[1];
    expect(m.to).toBe("s1@x.co"); expect(m.subject).toBe("Rutinia · mensaje nuevo de Ana Pérez en soporte"); expect(m.link).toBe("/staff/soporte/th-1");
    expect(m.text).toContain("«No se activó mi cupo»"); expect(m.text + payload.body).not.toMatch(/[\r\n]{2}/);
    expect(m.footer).toMatch(/Aviso interno/);
  });
  it("labels a follow-up differently", async () => {
    const { admin } = fakeAdmin({ staff: ["s1"], subs: [] }); const mail = vi.fn(async () => ({ ok: true }));
    await notifyStaffOfMessage(admin, { ...notice, reply: true }, ENV, { sendEmailImpl: mail as never });
    expect((mail.mock.calls[0] as unknown as [unknown, { subject: string }])[1].subject).toMatch(/respuesta nueva/i);
  });
  it("forgets devices the browser says are gone, and counts failures", async () => {
    const { admin, deleted } = fakeAdmin({ staff: ["s1"], subs: [sub(1), sub(2), sub(3)] });
    const push = vi.fn(async (_c: unknown, s: { endpoint: string }) => s.endpoint.endsWith("/1") ? { ok: true as const } : s.endpoint.endsWith("/2") ? { ok: false as const, gone: true, status: 410 } : { ok: false as const, gone: false, status: 500 });
    const r = await notifyStaffOfMessage(admin, notice, { ...ENV, EMAIL_PROVIDER: "" }, { sendPushImpl: push as never });
    expect(r.push).toEqual({ sent: 1, failed: 2, removed: 1 }); expect(deleted).toEqual(["https://push.example.com/2"]);
  });
  it("counts a member without an e-mail address as failed and keeps going", async () => {
    const { admin } = fakeAdmin({ staff: ["s1", "s2"], emails: { s1: null } }); const mail = vi.fn(async () => ({ ok: true }));
    const r = await notifyStaffOfMessage(admin, notice, ENV, { sendEmailImpl: mail as never, sendPushImpl: (async () => ({ ok: true })) as never });
    expect(r.email).toEqual({ sent: 1, failed: 1 });
  });
  it("does nothing without a team or without configured channels, and never throws", async () => {
    const none = fakeAdmin({ staff: [] }); const push = vi.fn(); const mail = vi.fn();
    expect(await notifyStaffOfMessage(none.admin, notice, ENV, { sendPushImpl: push as never, sendEmailImpl: mail as never })).toEqual({ push: { sent: 0, failed: 0, removed: 0 }, email: { sent: 0, failed: 0 } });
    const off = fakeAdmin({ staff: ["s1"], subs: [sub(1)] });
    await notifyStaffOfMessage(off.admin, notice, {}, { sendPushImpl: push as never, sendEmailImpl: mail as never });
    expect(push).not.toHaveBeenCalled(); expect(mail).not.toHaveBeenCalled();
    const broken = { from: () => { throw new Error("db down"); } } as never;
    await expect(notifyStaffOfMessage(broken, notice, ENV)).resolves.toBeDefined();
  });
});

describe("notify the trainer when the team answers", () => {
  it("pushes a generic message with the link to their conversation, and nothing else", async () => {
    const { admin, queried } = fakeAdmin({ subs: [sub(1)] }); const push = vi.fn(async () => ({ ok: true as const }));
    const r = await notifyTrainerOfReply(admin, { trainerId: "t1", threadId: "th-9" }, ENV, { sendPushImpl: push as never });
    expect(r.sent).toBe(1); expect(queried[0]).toEqual(["t1"]);
    expect((push.mock.calls[0] as unknown as [unknown, unknown, object])[2]).toEqual({ title: "Soporte te respondió", body: "Tienes una respuesta del equipo de Rutinia.", url: "/trainer/support/th-9", tag: "support-th-9" });
    expect(await notifyTrainerOfReply(admin, { trainerId: "t1", threadId: "x" }, {}, { sendPushImpl: push as never })).toEqual({ sent: 0, failed: 0, removed: 0 });
  });
  it("pushToUsers with nobody to notify queries nothing", async () => {
    const { admin, queried } = fakeAdmin({}); expect(await pushToUsers(admin, { publicKey: "a", privateKey: "b", subject: "mailto:a@b.co" }, [], { title: "t", body: "b", url: "/x" })).toEqual({ sent: 0, failed: 0, removed: 0 }); expect(queried).toEqual([]);
  });
});

describe("waiting time and the operational e-mail", () => {
  it("says how long a conversation has waited, with an escalating tone", () => {
    const now = new Date("2026-10-29T12:00:00Z"); const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();
    expect(waitSince(ago(0), now)).toEqual({ text: "ahora", tone: "ok" }); expect(waitSince(ago(25), now)).toEqual({ text: "hace 25 min", tone: "ok" });
    expect(waitSince(ago(60), now)).toEqual({ text: "hace 1 h", tone: "warn" }); expect(waitSince(ago(23 * 60 + 59), now)).toEqual({ text: "hace 23 h", tone: "warn" });
    expect(waitSince(ago(50 * 60), now)).toEqual({ text: "hace 2 d", tone: "late" }); expect(waitSince(ago(-5), now).text).toBe("ahora");
  });
  it("line breaks survive in mail clients that ignore white-space: real <br>, with the text still escaped", () => {
    const { html } = renderEmail({ to: "a@b.co", subject: "s", text: "Línea 1 <b>\nLínea 2\r\nLínea 3" }, "https://app.example.com");
    expect(html).toContain("Línea 1 &lt;b&gt;<br>Línea 2<br>Línea 3"); expect(html).not.toContain("<b>");
  });
  it("an operational e-mail has its own footer, not the marketing unsubscribe line; marketing mail is unchanged", () => {
    const ops = renderEmail({ to: "a@b.co", subject: "s", text: "hola <b>", link: "/staff/soporte/1", footer: "Aviso interno." }, "https://app.example.com");
    expect(ops.text).toContain("Aviso interno."); expect(ops.text).not.toMatch(/dejar de recibir/); expect(ops.html).not.toMatch(/Mi cuenta/); expect(ops.html).toContain("hola &lt;b&gt;");
    expect(renderEmail({ to: "a@b.co", subject: "s", text: "x" }, "https://app.example.com").text).toMatch(/dejar de recibir novedades/);
  });
});
