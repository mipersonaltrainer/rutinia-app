import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";
import { admin, login, PASSWORD } from "./helpers";

// RFC 6238 — acts as the authenticator app.
function totp(secretBase32: string) {
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = ""; for (const ch of secretBase32.replace(/\s|=+$/g, "").toUpperCase()) bits += alpha.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", key).update(ctr).digest(); const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0");
}

let staffEmail: string; let staffId: string;
test.beforeAll(async () => {
  staffEmail = `e2e-mfa-staff-${Date.now()}@x.co`;
  const { data, error } = await admin.auth.admin.createUser({ email: staffEmail, password: PASSWORD, email_confirm: true });
  if (error) throw error; staffId = data.user.id;
  const r = await admin.rpc("make_support_staff", { p_user: staffId }); if (r.error) throw r.error;
  await admin.from("security_settings").update({ staff_mfa_required: true }).eq("id", true);
});
test.afterAll(async () => {
  await admin.from("security_settings").update({ staff_mfa_required: false }).eq("id", true);      // the flag is global: leave it as found
  await admin.from("support_staff").delete().eq("user_id", staffId);
});

test("con el segundo factor exigido, el soporte activa su app, entra y la siguiente sesión pide el código", async ({ browser }) => {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await login(page, staffEmail);
  await page.goto("/staff"); await expect(page).toHaveURL(/\/staff-mfa$/);                       // password only: not let in
  await page.goto("/staff/soporte"); await expect(page).toHaveURL(/\/staff-mfa$/);
  await page.getByRole("button", { name: "Activar" }).click();
  const secret = (await page.locator("span.select-all").innerText()).trim();
  await expect(page.getByRole("img", { name: /Código QR/ })).toBeVisible();
  await page.getByLabel("Código de 6 dígitos").fill("000000");
  await page.getByRole("button", { name: "Verificar y entrar" }).click();
  await expect(page.getByText(/Código incorrecto o vencido/)).toBeVisible();                      // a wrong code does not get in
  await page.getByLabel("Código de 6 dígitos").fill(totp(secret));
  await page.getByRole("button", { name: "Verificar y entrar" }).click();
  await expect(page).toHaveURL(/\/staff$/);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await page.goto("/staff/soporte"); await expect(page).toHaveURL(/\/staff\/soporte$/);           // aal2 sticks for the session
  await ctx.close();

  const ctx2 = await browser.newContext(); const again = await ctx2.newPage();                    // a fresh login starts at password level again
  await login(again, staffEmail);
  await again.goto("/staff"); await expect(again).toHaveURL(/\/staff-mfa$/);
  await expect(again.getByRole("button", { name: "Activar" })).toHaveCount(0);                   // already has a factor: only asks for the code
  await again.getByLabel("Código de 6 dígitos").fill(totp(secret));
  await again.getByRole("button", { name: "Verificar y entrar" }).click();
  await expect(again).toHaveURL(/\/staff$/);
  await ctx2.close();
});

test("un entrenador no ve la pantalla del segundo factor", async ({ browser }) => {
  const email = `e2e-mfa-tr-${Date.now()}@x.co`;
  const { data } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await login(page, email);
  await page.goto("/staff-mfa"); await expect(page).toHaveURL(/\/trainer$/);
  await ctx.close(); await admin.auth.admin.deleteUser(data.user!.id);
});
