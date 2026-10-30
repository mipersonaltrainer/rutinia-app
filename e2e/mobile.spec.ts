import { test, expect, type Page } from "@playwright/test";
import { appendFileSync } from "node:fs";
import { admin, createWorld, login, publishPlan, PASSWORD, type World } from "./helpers";

// Phone-sized audit of every screen: nothing may push the page sideways, controls must be big enough for a thumb, and form fields must be
// at least 16px (below that iOS Safari zooms the page when a field gets focus). Runs on a touch device profile against the production build.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3, reducedMotion: "reduce" });

let w: World; let staffEmail: string; let staffId: string;
test.beforeAll(async () => {
  w = await createWorld("mob"); await publishPlan(w);
  staffEmail = `e2e-mob-staff-${Date.now()}@x.co`;
  const { data, error } = await admin.auth.admin.createUser({ email: staffEmail, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "Soporte móvil" } });
  if (error) throw error; staffId = data.user.id; const c = await admin.rpc("make_support_staff", { p_user: staffId }); if (c.error) throw c.error;
});
test.afterAll(async () => { await admin.rpc("remove_support_staff", { p_user: staffId }); });

type Issue = { path: string; kind: string; detail: string };
async function audit(page: Page, path: string): Promise<Issue[]> {
  await page.goto(path); await page.waitForLoadState("load"); await page.waitForTimeout(600);
  return page.evaluate((p) => {
    const out: { path: string; kind: string; detail: string }[] = []; const W = window.innerWidth;
    const label = (e: Element) => `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}.${String((e as HTMLElement).className || "").toString().split(/\s+/).slice(0, 3).join(".")} «${(e.textContent || "").trim().slice(0, 28)}»`;
    const visible = (e: Element) => { const r = (e as HTMLElement).getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && !e.closest(".sr-only, [aria-hidden='true'], [hidden]"); };
    const doc = document.scrollingElement!; if (doc.scrollWidth > W + 1) out.push({ path: p, kind: "overflow-page", detail: `scrollWidth ${doc.scrollWidth} > ${W}` });
    // elements that stick out of the screen and are not inside a container that scrolls or clips on purpose
    const clipped = (e: Element) => { for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const o = getComputedStyle(a); if (/(auto|scroll|hidden|clip)/.test(o.overflowX)) return true; } return false; };
    const seen = new Set<string>();
    for (const e of Array.from(document.querySelectorAll("body *"))) { if (!visible(e) || clipped(e)) continue; const r = e.getBoundingClientRect(); if (r.right > W + 1 && getComputedStyle(e).position !== "fixed") { const k = label(e); if (!seen.has(k) && seen.size < 4) { seen.add(k); out.push({ path: p, kind: "sticks-out", detail: `${k} right=${Math.round(r.right)}` }); } } }
    for (const e of Array.from(document.querySelectorAll("button, select, summary, textarea, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), nav a, header a, a.btn, [role=button], [role=tab]"))) {
      if (!visible(e)) continue; const r = e.getBoundingClientRect(); if (r.height < 40 || r.width < 40) out.push({ path: p, kind: "small-target", detail: `${label(e)} ${Math.round(r.width)}×${Math.round(r.height)}` });
    }
    for (const e of Array.from(document.querySelectorAll("input[type=checkbox], input[type=radio]"))) { if (!visible(e)) continue; const l = e.closest("label"); const r = (l ?? e).getBoundingClientRect(); if (r.height < 32) out.push({ path: p, kind: "small-target", detail: `${label(l ?? e)} ${Math.round(r.width)}×${Math.round(r.height)}` }); }
    for (const e of Array.from(document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]), select, textarea"))) { if (!visible(e)) continue; const fs = parseFloat(getComputedStyle(e).fontSize); if (fs < 16) out.push({ path: p, kind: "ios-zoom", detail: `${label(e)} font ${fs}px` }); }
    return out;
  }, path);
}

const PUBLIC = ["/", "/login", "/signup", "/forgot-password", "/privacidad", "/terminos"];
// With MOBILE_AUDIT_OUT set, every issue is also appended (one JSON per line) so a full baseline survives failing tests that restart the worker.
const keep = (xs: Issue[]) => { if (process.env.MOBILE_AUDIT_OUT) for (const i of xs) appendFileSync(process.env.MOBILE_AUDIT_OUT, JSON.stringify(i) + "\n"); return xs; };

test.describe("celular", () => {
  test("pantallas públicas", async ({ page }) => { const bad: Issue[] = []; for (const p of PUBLIC) bad.push(...keep(await audit(page, p))); expect(bad.map((i) => `${i.path} ${i.kind} ${i.detail}`)).toEqual([]); });
  test("entrenador", async ({ page }) => {
    await login(page, w.trainerEmail); const bad: Issue[] = [];
    for (const p of ["/trainer", "/trainer/clients", `/trainer/clients/${w.clientId}`, "/trainer/plans", "/trainer/exercises", "/trainer/billing", "/trainer/support", "/trainer/account", "/trainer/notifications"]) bad.push(...keep(await audit(page, p)));
    expect(bad.map((i) => `${i.path} ${i.kind} ${i.detail}`)).toEqual([]);
  });
  test("alumno", async ({ page }) => {
    await login(page, w.clientEmail); const bad: Issue[] = [];
    for (const p of ["/client", "/client/plan", "/client/progress", "/client/measurements", "/client/assessment", "/client/photos", "/client/messages", "/client/assistant", "/client/privacy"]) bad.push(...keep(await audit(page, p)));
    expect(bad.map((i) => `${i.path} ${i.kind} ${i.detail}`)).toEqual([]);
  });
  test("equipo de soporte", async ({ page }) => {
    await login(page, staffEmail); const bad: Issue[] = [];
    for (const p of ["/staff", "/staff/soporte", "/staff/entrenadores", `/staff/entrenadores/${w.trainerId}`, "/staff/ventas", "/staff/marketing", "/staff/marketing/nueva", "/staff/marketing/cumpleanos", "/staff/sistema"]) bad.push(...keep(await audit(page, p)));
    expect(bad.map((i) => `${i.path} ${i.kind} ${i.detail}`)).toEqual([]);
  });
});

test.describe("celular: navegación", () => {
  test("el menú se abre, navega, se cierra solo y marca la sección activa; el escritorio no cambia", async ({ page, browser }) => {
    await login(page, w.trainerEmail); await page.goto("/trainer");
    const menu = page.getByRole("button", { name: "Menú" });
    await expect(menu).toBeVisible(); await expect(page.getByRole("complementary")).toBeHidden();                      // the sidebar is not shown on a phone
    await menu.click(); await expect(page.getByRole("dialog", { name: "Menú" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Panel" })).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0);                        // Escape closes it
    await menu.click(); await page.getByRole("link", { name: "Facturación" }).click();
    await expect(page).toHaveURL(/\/trainer\/billing$/); await expect(page.getByRole("dialog")).toHaveCount(0);        // a navigation closes it
    expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth)).toBe(true);
    await menu.click(); await page.getByRole("button", { name: "Cerrar sesión" }).click(); await expect(page).toHaveURL(/\/($|login)/);
    const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const d = await desk.newPage(); await login(d, w.trainerEmail); await d.goto("/trainer");
    await expect(d.getByRole("button", { name: "Menú" })).toBeHidden(); await expect(d.getByRole("link", { name: "Facturación" })).toBeVisible(); await desk.close();
  });
  test("el alumno y el equipo también tienen su menú móvil", async ({ browser }) => {
    for (const [email, name, home] of [[w.clientEmail, "Mi plan", /\/client\/plan$/], [staffEmail, "Ventas", /\/staff\/ventas$/]] as const) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); const p = await ctx.newPage(); await login(p, email);
      await p.getByRole("button", { name: "Menú" }).or(p.getByRole("button", { name: "Panel de soporte" })).first().click();
      await p.getByRole("link", { name, exact: true }).click(); await expect(p).toHaveURL(home); await ctx.close();
    }
  });
});
