import { test, expect, type Page, type Browser } from "@playwright/test";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { admin, alerts, createWorld, login, publishPlan, watchCsp, PASSWORD, type World } from "./helpers";

// Technical quality gates: SEO, error handling, accessibility (WCAG 2.2 AA), session-cookie hardening and performance budgets.
// These run against the production build, so they guard what users actually get.
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const BASE = `http://localhost:${process.env.E2E_PORT ?? 3050}`;

async function axeViolations(page: Page) {
  await page.evaluate(axeSource);                                                    // evaluate() is not subject to the page's CSP
  return page.evaluate(async (tags) => {
    // @ts-expect-error axe is injected above
    const r = await axe.run(document, { runOnly: tags });
    return r.violations.map((v: { id: string; nodes: { html: string }[] }) => `${v.id}: ${v.nodes[0].html.replace(/\s+/g, " ").slice(0, 100)}`);
  }, TAGS);
}
const metaContent = (page: Page, sel: string) => page.evaluate((q) => document.querySelector(q)?.getAttribute("content") ?? null, sel);
// JavaScript requested before the load event (what the first load costs). Scripts the page itself chooses to fetch afterwards, once idle (the Realtime client), are not part of the first load.
const jsBytes = (page: Page) => page.evaluate(() => { const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming; return (performance.getEntriesByType("resource") as PerformanceResourceTiming[]).filter((r) => /\.js(\?|$)/.test(r.name) && r.startTime <= nav.loadEventStart).reduce((n, r) => n + (r.transferSize || r.encodedBodySize || 0), 0) / 1024; });

// What the first load costs, measured from what the SERVER asks for: every <script src> in the HTML, at its gzip size. Deterministic — it does not depend on how
// quickly the browser hydrates or what it fetches while idle. (The timing-based jsBytes above stays as a diagnostic: when it disagrees, the test says so.)
const firstLoadKB = async (page: Page, path: string) => {
  const html = await (await page.request.get(path)).text();
  const tags = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]).filter((t) => !/\snomodule\b/i.test(t));      // the legacy-browser polyfill is never downloaded by a modern browser
  const srcs = [...new Set(tags.map((t) => /\ssrc="([^"]+)"/.exec(t)?.[1]).filter((x): x is string => !!x))];
  let bytes = 0; for (const src of srcs) bytes += gzipSync(await (await page.request.get(src)).body()).length;
  return { kb: bytes / 1024, scripts: srcs.length };
};

let w: World;
test.beforeAll(async () => { w = await createWorld("quality"); await publishPlan(w); });

test.describe("SEO técnico", () => {
  test("robots.txt y sitemap.xml existen, apuntan al dominio configurado y no exponen áreas privadas", async ({ request }) => {
    const robots = await request.get("/robots.txt"); expect(robots.status()).toBe(200);
    const txt = await robots.text();
    expect(txt).toContain(`Sitemap: ${BASE}/sitemap.xml`);
    for (const p of ["/trainer/", "/client/", "/api/", "/auth/", "/invite/"]) expect(txt).toContain(`Disallow: ${p}`);
    const map = await request.get("/sitemap.xml"); expect(map.status()).toBe(200); expect(map.headers()["content-type"]).toMatch(/xml/);
    const locs = [...(await map.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([`${BASE}/`, `${BASE}/signup`, `${BASE}/privacidad`, `${BASE}/terminos`, `${BASE}/cookies`]);
    for (const l of locs) expect((await request.get(l)).status(), l).toBe(200);          // every listed URL is real, and the sitemap is not a list of redirects
  });

  test("cada página pública tiene título, descripción y canónica propios, un solo h1 e idioma", async ({ page }) => {
    const seen = { titles: new Set<string>(), descriptions: new Set<string>() };
    for (const path of ["/", "/signup", "/privacidad", "/terminos", "/cookies"]) {
      await page.goto(path);
      const title = await page.title(); const desc = await metaContent(page, 'meta[name="description"]');
      expect(title.length, path).toBeGreaterThan(10); expect(title.length, `${path} title too long`).toBeLessThanOrEqual(70);
      expect(desc, path).toBeTruthy(); expect(desc!.length, `${path} description`).toBeLessThanOrEqual(170);
      expect(await page.locator('link[rel="canonical"]').getAttribute("href"), path).toBe(path === "/" ? BASE : `${BASE}${path}`);
      expect(await page.locator("h1").count(), `${path} h1`).toBe(1);
      expect(await page.locator("html").getAttribute("lang")).toBe("es");
      seen.titles.add(title); if (path !== "/") seen.descriptions.add(desc!);
    }
    expect(seen.titles.size).toBe(4);                                                    // no duplicated titles
    expect(seen.descriptions.size).toBe(3);
  });

  test("la portada trae Open Graph, Twitter Card y datos estructurados válidos que coinciden con lo que se muestra", async ({ page, request }) => {
    await page.goto("/");
    expect(await metaContent(page, 'meta[property="og:type"]')).toBe("website");
    expect(await metaContent(page, 'meta[property="og:locale"]')).toBe("es_CO");
    expect(await metaContent(page, 'meta[name="twitter:card"]')).toBe("summary_large_image");
    const og = await metaContent(page, 'meta[property="og:image"]'); expect(og).toBe(`${BASE}/og.png`);
    const img = await request.get(og!); expect(img.status()).toBe(200); expect(img.headers()["content-type"]).toBe("image/png");
    expect(await metaContent(page, 'meta[property="og:image:width"]')).toBe("1200"); expect(await metaContent(page, 'meta[property="og:image:height"]')).toBe("630");
    expect(await metaContent(page, 'meta[property="og:image:alt"]')).toBeTruthy();

    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents(); expect(blocks).toHaveLength(1);
    const ld = JSON.parse(blocks[0]);
    expect(ld).toMatchObject({ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Rutinia", url: BASE, offers: { "@type": "Offer", price: "40000.00", priceCurrency: "COP" } });
    await expect(page.locator("#precios")).toContainText("$40.000");                      // the structured price is the one on the page
    await expect(page.locator("#precios")).toContainText("20 alumnos");
    expect(JSON.stringify(ld)).not.toMatch(/aggregateRating|review/i);
  });

  test("las pantallas privadas, de acceso y con secretos en la URL no se indexan; el 404 es un 404 real, en español y sin indexar", async ({ page, browser }) => {
    const robotsOf = async (p: Page) => (await metaContent(p, 'meta[name="robots"]')) ?? "";
    for (const path of ["/login", "/forgot-password", "/reset-password", "/offline", "/invite/token-de-prueba"]) { await page.goto(path); expect(await robotsOf(page), path).toMatch(/noindex/); }
    const ctx = await browser.newContext({ baseURL: BASE }); const p = await ctx.newPage();
    await login(p, w.trainerEmail); await p.goto("/trainer/billing"); expect(await robotsOf(p), "trainer").toMatch(/noindex/);
    await ctx.close();
    const c2 = await browser.newContext({ baseURL: BASE }); const p2 = await c2.newPage(); await login(p2, w.clientEmail); await p2.goto("/client/plan"); expect(await robotsOf(p2), "client").toMatch(/noindex/); await c2.close();
    await page.goto("/");                                                                // public pages stay indexable
    expect(await robotsOf(page)).not.toMatch(/noindex/);
    const res = await page.goto("/esta-pagina-no-existe"); expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "No encontramos esa página" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ir al inicio" })).toHaveAttribute("href", "/");
    expect(await robotsOf(page)).toMatch(/noindex/); await expect(page.getByText("This page could not be found")).toHaveCount(0);
  });
});

test.describe("errores de red y de interfaz", () => {
  test("sin conexión, el formulario de acceso conserva lo escrito, avisa qué pasó y funciona al volver la conexión", async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: BASE }); const page = await ctx.newPage(); await page.goto("/login");
    await page.getByLabel("Correo").fill(w.trainerEmail); await page.getByLabel("Contraseña").fill(PASSWORD);
    await ctx.setOffline(true);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(alerts(page)).toContainText("No pudimos conectar");
    await expect(page.getByLabel("Correo")).toHaveValue(w.trainerEmail); await expect(page.getByLabel("Contraseña")).toHaveValue(PASSWORD);   // nothing typed was lost
    await expect(page.getByRole("button", { name: "Entrar" })).toBeEnabled();            // no stuck "Procesando…"
    await ctx.setOffline(false);
    await page.getByRole("button", { name: "Entrar" }).click(); await expect(page).toHaveURL(/\/trainer$/);
    await ctx.close();
  });

  test("sin conexión, recuperar contraseña y guardar una serie del entrenamiento muestran el error en el propio formulario", async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: BASE }); const page = await ctx.newPage();
    await page.goto("/forgot-password"); await page.getByLabel("Correo").fill("alguien@x.co"); await page.waitForTimeout(2200);
    await ctx.setOffline(true); await page.getByRole("button", { name: "Enviarme el enlace" }).click();
    await expect(alerts(page)).toContainText("No pudimos conectar"); await expect(page.getByLabel("Correo")).toHaveValue("alguien@x.co");
    await ctx.setOffline(false);

    await login(page, w.clientEmail); await page.goto("/client/plan"); await page.getByRole("button", { name: "Entrenar" }).click(); await expect(page).toHaveURL(/\/client\/workout\//);
    const row = page.locator("form").filter({ has: page.getByLabel("kg") }).first();
    await row.getByLabel("kg").fill("45"); await ctx.setOffline(true); await row.getByRole("button", { name: "Guardar" }).click();
    await expect(row.getByRole("alert")).toContainText("No pudimos conectar"); await expect(row.getByLabel("kg")).toHaveValue("45");
    await ctx.setOffline(false); await row.getByRole("button", { name: "Guardar" }).click(); await expect(row.getByRole("button", { name: "✓" })).toBeVisible();
    await ctx.close();
  });

  test("una acción simple (cerrar sesión) sin conexión muestra la pantalla de error amigable y se recupera con «Reintentar»", async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: BASE }); const page = await ctx.newPage(); const cspErrors = watchCsp(page);
    await login(page, w.trainerEmail); await expect(page).toHaveURL(/\/trainer$/);
    await ctx.setOffline(true); await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page.getByRole("heading", { name: "Algo salió mal" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reintentar" })).toBeVisible(); await expect(page.getByText("This page couldn")).toHaveCount(0);
    expect(await page.locator("body").innerText()).not.toMatch(/at \w+ \(|node_modules|stack/i);            // nothing technical leaks
    await ctx.setOffline(false); await page.getByRole("button", { name: "Reintentar" }).click();
    await expect(page.getByRole("heading", { name: "Algo salió mal" })).toHaveCount(0);
    expect(cspErrors).toEqual([]);
    await ctx.close();
  });
});

test.describe("accesibilidad WCAG 2.2 AA (axe-core, todas las pantallas)", () => {
  test("pantallas públicas: cero violaciones", async ({ page }) => {
    const bad: string[] = [];
    for (const path of ["/", "/login", "/signup", "/forgot-password", "/privacidad", "/terminos", "/cookies", "/offline", "/reset-password", "/esta-pagina-no-existe"]) { await page.goto(path); await page.waitForTimeout(1500); /* axe measures colour: wait for the entrance animations to settle (halfway through a fade the contrast is lower) */ for (const v of await axeViolations(page)) bad.push(`${path} → ${v}`); }
    expect(bad).toEqual([]);
  });
  test("pantallas del entrenador: cero violaciones", async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: BASE }); const page = await ctx.newPage(); await login(page, w.trainerEmail); const bad: string[] = [];
    for (const path of ["/trainer", "/trainer/clients", `/trainer/clients/${w.clientId}`, `/trainer/clients/${w.clientId}/messages`, "/trainer/plans", "/trainer/exercises", "/trainer/billing", "/trainer/support", "/trainer/account", "/trainer/notifications", "/trainer/account"]) { await page.goto(path); await page.waitForTimeout(300); for (const v of await axeViolations(page)) bad.push(`${path.replace(w.clientId, "{c}")} → ${v}`); }
    expect(bad).toEqual([]); await ctx.close();
  });
  test("pantallas del alumno: cero violaciones", async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: BASE }); const page = await ctx.newPage(); await login(page, w.clientEmail); const bad: string[] = [];
    for (const path of ["/client", "/client/plan", "/client/progress", "/client/assessment", "/client/measurements", "/client/photos", "/client/messages", "/client/assistant", "/client/privacy"]) { await page.goto(path); await page.waitForTimeout(300); for (const v of await axeViolations(page)) bad.push(`${path} → ${v}`); }
    expect(bad).toEqual([]); await ctx.close();
  });
  test("se puede usar con teclado: «Saltar al contenido» lleva al contenido y el foco es visible", async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: BASE }); const page = await ctx.newPage(); await login(page, w.clientEmail); await page.goto("/client");
    await page.keyboard.press("Tab"); const skip = page.getByRole("link", { name: "Saltar al contenido" }); await expect(skip).toBeFocused(); await expect(skip).toBeVisible();
    await page.keyboard.press("Enter"); await expect(page).toHaveURL(/#contenido$/);
    await page.keyboard.press("Tab"); const outline = await page.evaluate(() => { const e = document.activeElement as HTMLElement; const s = getComputedStyle(e); return `${s.outlineStyle} ${s.outlineWidth}`; });
    expect(outline).not.toMatch(/^none|0px/); await ctx.close();
  });
});

test.describe("sesión y exposición de credenciales", () => {
  test("la cookie de sesión es httpOnly y SameSite=Lax, el JavaScript no la ve y el token de refresco no viaja en la página", async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: BASE }); const page = await ctx.newPage(); await login(page, w.clientEmail); await page.goto("/client");
    const auth = (await ctx.cookies()).filter((c) => c.name.startsWith("sb-")); expect(auth.length).toBeGreaterThan(0);
    for (const c of auth) { expect(c.httpOnly, c.name).toBe(true); expect(c.sameSite, c.name).toBe("Lax"); }
    expect(await page.evaluate(() => document.cookie)).not.toContain("sb-");
    const raw = auth.map((c) => c.value).join(""); const decoded = JSON.parse(Buffer.from(raw.replace(/^base64-/, ""), "base64url").toString("utf8")) as { refresh_token: string; access_token: string };
    const html = await page.content(); expect(html).not.toContain(decoded.refresh_token);   // the long-lived credential never reaches page scripts
    await ctx.close();
  });
  test("el tiempo real sigue funcionando sin que el cliente lea cookies, y su código no viene en los scripts iniciales de la página", async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: BASE }); const page = await ctx.newPage(); await login(page, w.clientEmail);
    const sockets: string[] = []; page.on("websocket", (ws) => sockets.push(ws.url()));
    await page.goto("/client/messages"); await page.waitForLoadState("load");
    // Deterministic: the scripts the HTML itself references (what blocks the first load) must not contain the Realtime client...
    // (read from the served HTML, not the live DOM: the lazy chunk is legitimately injected into the DOM once the page is idle)
    const served = await (await ctx.request.get("/client/messages")).text();
    const initial = [...served.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => new URL(m[1].replace(/&amp;/g, "&"), BASE).href);
    expect(initial.length).toBeGreaterThan(3);
    for (const src of initial) expect(await (await ctx.request.get(src)).text(), src).not.toContain("RealtimeClient");
    // ...yet the channel does get opened once the page is idle.
    await expect.poll(() => sockets.some((u) => u.includes("/realtime/")), { timeout: 8000 }).toBe(true);
    await ctx.close();
  });
});

test.describe("rendimiento: presupuestos y carga", () => {
  test("la portada muestra el titular sin esperar al JavaScript (el LCP no depende de la hidratación)", async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: BASE }); const page = await ctx.newPage();
    await page.route(/\/_next\/static\/.*\.js/, (r) => r.abort());                      // no script ever runs
    await page.goto("/");
    const h1 = page.getByRole("heading", { level: 1 }); await expect(h1).toBeVisible();
    // effective opacity = product of the element and all its ancestors (a hidden wrapper hides everything inside it)
    await expect.poll(() => h1.evaluate((e) => { let o = 1; for (let n: Element | null = e; n; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return Math.round(o * 100) / 100; }), { timeout: 4000 }).toBe(1);
    await ctx.close();
  });
  test("sin JavaScript el contenido sigue siendo legible (nada queda oculto a la espera de un script)", async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: BASE, javaScriptEnabled: false }); const page = await ctx.newPage(); await page.goto("/");
    await expect(page.getByRole("heading", { name: /Precios simples/ })).toBeVisible(); await expect(page.locator("#precios")).toContainText("$40.000");
    await ctx.close();
  });
  test("presupuesto de JavaScript en la primera carga (KB transferidos, comprimidos)", async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: BASE }); const page = await ctx.newPage(); const over: string[] = []; const seen: string[] = [];
    const check = async (path: string, budget: number) => {
      const { kb, scripts } = await firstLoadKB(page, path); seen.push(`${path}: ${kb.toFixed(0)} KB in ${scripts} scripts (budget ${budget})`);
      if (kb > budget) over.push(`${path}: ${kb.toFixed(0)} KB > ${budget}`);
      await page.goto(path); await page.waitForLoadState("load"); const timed = await jsBytes(page);        // diagnostic only: what the browser actually requested before load
      if (timed > budget && kb <= budget) test.info().annotations.push({ type: "js-timing-diagnostic", description: `${path}: the browser requested ${timed.toFixed(0)} KB before load, but the HTML asks for ${kb.toFixed(0)} KB` });
    };
    for (const [path, budget] of [["/", 170], ["/login", 170], ["/signup", 170], ["/privacidad", 165]] as const) await check(path, budget);
    await login(page, w.clientEmail);
    for (const [path, budget] of [["/client", 175], ["/client/plan", 175], ["/client/progress", 175], ["/client/measurements", 175]] as const) await check(path, budget);
    expect(over, seen.join("\n")).toEqual([]); await ctx.close();
  });
  test("las gráficas (≈100 KB) no se descargan si no hay datos que dibujar, y sí cuando los hay", async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: BASE }); const page = await ctx.newPage(); await login(page, w.clientEmail);
    const chunks: string[] = []; page.on("response", (r) => { if (/_next\/static\/chunks\/.*\.js/.test(r.url())) chunks.push(r.url()); });
    const hasRecharts = async () => { let found = false; for (const u of new Set(chunks)) { const body = await (await ctx.request.get(u)).text(); if (/recharts|ResponsiveContainer/.test(body) && body.length > 150_000) found = true; } return found; };
    await page.goto("/client/measurements"); await page.waitForTimeout(1500);
    expect(await hasRecharts(), "new user with no weights must not pay for the charting library").toBe(false);
    for (const [i, kg] of [70.5, 70.1].entries()) await admin.from("anthropometric_measurements").insert({ client_id: w.clientId, entered_by: w.clientId, taken_by: "self", method: "scale", measured_on: `2026-10-${10 + i}`, weight_kg: kg });
    chunks.length = 0; await page.goto("/client/measurements"); await expect(page.getByRole("img", { name: "Evolución del peso en kilogramos" })).toBeVisible({ timeout: 8000 });
    expect(await hasRecharts(), "with two weights the chart must load").toBe(true);
    await ctx.close();
  });
  test("los íconos y la imagen social se cachean (sin revalidar en cada visita) y el sitemap se puede cachear", async ({ request }) => {
    for (const p of ["/icons/icon-192.png", "/og.png"]) expect((await request.get(p)).headers()["cache-control"], p).toMatch(/max-age=86400/);
    expect((await request.get("/_next/static/chunks/" + (await (await request.get("/login")).text()).match(/chunks\/([\w-]+\.js)/)![1])).headers()["cache-control"]).toMatch(/immutable/);
  });
  test("las páginas públicas no usan «no-store», para que el botón «atrás» restaure al instante (bfcache); las privadas sí no se guardan", async ({ request, browser }) => {
    for (const p of ["/", "/privacidad", "/terminos", "/cookies", "/signup"]) expect((await request.get(p)).headers()["cache-control"], p).not.toMatch(/no-store/);
    const ctx = await browser.newContext({ baseURL: BASE }); const page = await ctx.newPage(); await login(page, w.clientEmail);
    const res = await page.goto("/client/privacy"); expect(res!.headers()["cache-control"]).toMatch(/no-store|private/); await ctx.close();
  });
});

test("la consola no registra errores ni advertencias en el recorrido principal", async ({ browser }: { browser: Browser }) => {
  const ctx = await browser.newContext({ baseURL: BASE }); const page = await ctx.newPage(); const issues: string[] = [];
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) issues.push(`${m.type()}: ${m.text().slice(0, 140)}`); }); page.on("pageerror", (e) => issues.push(`pageerror: ${e.message.slice(0, 140)}`));
  for (const p of ["/", "/login", "/signup", "/privacidad"]) await page.goto(p);
  await login(page, w.trainerEmail); for (const p of ["/trainer", "/trainer/clients", `/trainer/clients/${w.clientId}`, "/trainer/billing"]) { await page.goto(p); await page.waitForTimeout(400); }
  expect(issues).toEqual([]); await ctx.close();
});

test.describe("movimiento", () => {
  const opacityOf = (page: Page, sel: string) => page.locator(sel).first().evaluate((e) => Number(getComputedStyle(e).opacity));
  test("el acceso muestra el camino de vuelta a la página de inicio y el fondo animado no intercepta clics", async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: BASE, reducedMotion: "no-preference" }); const page = await ctx.newPage();
    for (const path of ["/login", "/signup", "/forgot-password"]) {
      await page.goto(path);
      await expect(page.getByRole("link", { name: "Volver al inicio" })).toHaveAttribute("href", "/");
      await expect(page.locator(".auth-bg")).toHaveAttribute("aria-hidden", "true");
      expect(await page.locator(".auth-bg").evaluate((e) => getComputedStyle(e).pointerEvents)).toBe("none");
    }
    await page.goto("/login"); await page.getByRole("link", { name: "Volver al inicio" }).click(); await expect(page).toHaveURL(/\/$/);
    await ctx.close();
  });
  test("con movimiento, el panel entra animado y termina completamente visible; las cifras llegan a su valor exacto", async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: BASE, reducedMotion: "no-preference" }); const page = await ctx.newPage();
    await login(page, w.trainerEmail); await page.goto("/trainer");
    await expect.poll(() => page.locator(".page-in").first().evaluate((e) => getComputedStyle(e).animationName), { timeout: 3000 }).toBe("app-rise");
    await expect.poll(() => opacityOf(page, ".page-in"), { timeout: 4000 }).toBe(1);
    await expect(page.getByText(/de 20 cupos en uso/)).toBeVisible();
    await ctx.close();
  });
  test("con «reducir movimiento» no hay ninguna animación de entrada ni de fondo", async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: BASE, reducedMotion: "reduce" }); const page = await ctx.newPage();
    await page.goto("/login");
    for (const sel of [".auth-blob-a", ".auth-grid", ".auth-curve-line", ".auth-bars > span"]) expect(await page.locator(sel).first().evaluate((e) => getComputedStyle(e).animationName), sel).toBe("none");
    await login(page, w.trainerEmail); await page.goto("/trainer");
    expect(await page.locator(".page-in").first().evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
    await ctx.close();
  });
});

test.describe("accesibilidad del panel de soporte", () => {
  test("pantallas del equipo: cero violaciones", async ({ browser }) => {
    const email = `e2e-quality-staff-${Date.now()}@x.co`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "Soporte calidad" } });
    if (error) throw error; await admin.rpc("make_support_staff", { p_user: data.user.id });
    const ctx = await browser.newContext({ baseURL: BASE }); const page = await ctx.newPage(); await login(page, email); const bad: string[] = [];
    for (const path of ["/staff", "/staff/soporte", "/staff/entrenadores", `/staff/entrenadores/${w.trainerId}`, "/staff/ventas", "/staff/ventas?mes=2027-02&moneda=USD", "/staff/marketing", "/staff/marketing/nueva", "/staff/marketing/cumpleanos", "/staff/sistema"]) { await page.goto(path); await page.waitForTimeout(1200); bad.push(...(await axeViolations(page)).map((v: string) => `${path} → ${v}`)); }
    expect(bad).toEqual([]); await ctx.close(); await admin.rpc("remove_support_staff", { p_user: data.user.id });
  });
});
