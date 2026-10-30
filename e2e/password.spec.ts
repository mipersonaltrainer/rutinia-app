import { test, expect, type Browser, type Page } from "@playwright/test";
import { admin, alerts, createWorld, login, watchCsp, PASSWORD, type World } from "./helpers";
import { mailFor, noMailFor, openRecoveryLink, verifyLink, waitForMail } from "./mail";

const NEW_PASSWORD = "Cielo-Abierto-2026";
const NEUTRAL = /Si ese correo tiene una cuenta, te enviamos un enlace/;
const APP = `http://localhost:${process.env.E2E_PORT ?? 3050}`;
let ipSeq = 0;
/** A browser context that looks like its own visitor (the app trusts X-Forwarded-For from the hosting proxy), so IP-based limits do not bleed between specs. */
const visitor = async (browser: Browser) => { const ctx = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": `203.0.113.${(Date.now() + ++ipSeq) % 250 + 1}` } }); return { ctx, page: await ctx.newPage() }; };
const wait = (page: Page, ms = 2200) => page.waitForTimeout(ms);              // the forms refuse a submit earlier than AUTH_MIN_FILL_MS (2 s in E2E)

test.describe.configure({ mode: "serial" });

test.describe("recuperar contraseña", () => {
  let w: World;
  test.beforeAll(async () => { w = await createWorld("pwreset"); });

  test("de punta a punta: pedir enlace → correo → contraseña nueva → sesiones cerradas → solo la nueva funciona", async ({ browser }) => {
    const { ctx, page } = await visitor(browser); const csp = watchCsp(page);
    // The user is also signed in on another device when they reset.
    const other = await visitor(browser); await login(other.page, w.trainerEmail); await expect(other.page).toHaveURL(/\/trainer$/);

    await page.goto("/login");
    await page.getByRole("link", { name: "¿Olvidaste tu contraseña?" }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    const before = (await mailFor(w.trainerEmail)).length;
    await page.getByLabel("Correo").fill(w.trainerEmail); await wait(page);
    await page.getByRole("button", { name: "Enviarme el enlace" }).click();
    await expect(page.getByRole("status")).toContainText(NEUTRAL);

    const mail = await waitForMail(w.trainerEmail, before);
    expect(mail.to).toEqual([w.trainerEmail]); const link = verifyLink(mail);
    expect(link).toMatch(/type=recovery/);
    const opened = await openRecoveryLink(page, link, APP);
    test.info().annotations.push({ type: "redirect allow-list", description: opened.viaAllowList ? "link landed on the app origin" : "stack started before supabase/config.toml listed the app origin: code carried over by hand" });
    await expect(page).toHaveURL(/\/reset-password$/);
    await expect(page.getByRole("heading", { name: "Crea tu contraseña nueva" })).toBeVisible();

    // Server-side checks on the new password.
    await page.getByLabel("Contraseña nueva").fill("Contraseña123"); await page.getByLabel("Repítela").fill("Contraseña123");
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(alerts(page)).toContainText("demasiado común");
    await page.getByLabel("Contraseña nueva").fill(NEW_PASSWORD); await page.getByLabel("Repítela").fill(NEW_PASSWORD + "x");
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(alerts(page)).toContainText("no coinciden");

    await page.getByLabel("Contraseña nueva").fill(NEW_PASSWORD); await page.getByLabel("Repítela").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page).toHaveURL(/\/login\?reset=ok/);
    await expect(page.getByRole("status")).toContainText("Contraseña actualizada");

    // Every other session is gone; the old password is dead; the new one works.
    await other.page.goto("/trainer"); await expect(other.page).toHaveURL(/\/login/);
    await page.getByLabel("Correo").fill(w.trainerEmail); await page.getByLabel("Contraseña").fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click(); await expect(alerts(page)).toContainText("Credenciales inválidas");
    await page.getByLabel("Contraseña").fill(NEW_PASSWORD); await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/trainer$/);

    // The same link cannot be used again.
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await openRecoveryLink(page, link, APP);
    await page.goto("/reset-password"); await expect(page.getByRole("heading", { name: "Enlace no válido" })).toBeVisible();
    expect(csp).toEqual([]);
    await ctx.close(); await other.ctx.close();
  });

  test("la respuesta no revela si el correo tiene cuenta, y solo las cuentas reales reciben correo", async ({ browser }) => {
    const ghost = `nadie-${Date.now()}@x.co`; const real = w.clientEmail;
    const texts: string[] = [];
    for (const email of [ghost, real]) {
      const { ctx, page } = await visitor(browser); await page.goto("/forgot-password");
      await page.getByLabel("Correo").fill(email); await wait(page); await page.getByRole("button", { name: "Enviarme el enlace" }).click();
      await expect(page.getByRole("status")).toContainText(NEUTRAL); texts.push((await page.getByRole("status").innerText()).trim()); await ctx.close();
    }
    expect(texts[0]).toBe(texts[1]);                                                       // byte-identical answer
    await waitForMail(real, 0);
    expect(await noMailFor(ghost)).toBe(true);
  });

  test("un robot (campo oculto) recibe la misma respuesta; un envío demasiado rápido pide reintentar; no se envía nada en ningún caso", async ({ browser }) => {
    const email = w.clientEmail; const before = (await mailFor(email)).length;
    const { ctx, page } = await visitor(browser); await page.goto("/forgot-password");
    await page.getByLabel("Correo").fill(email);
    await page.locator('input[name="website"]').evaluate((i: HTMLInputElement) => { i.value = "http://spam.example"; });   // only a script touches this field
    await wait(page); await page.getByRole("button", { name: "Enviarme el enlace" }).click();
    await expect(page.getByRole("status")).toContainText(NEUTRAL);
    const { ctx: c2, page: p2 } = await visitor(browser); await p2.goto("/forgot-password");
    await p2.getByLabel("Correo").fill(email); await p2.getByRole("button", { name: "Enviarme el enlace" }).click();       // far sooner than 2 s: could be a person with autofill
    await expect(p2.getByRole("alert").filter({ hasText: "vuelve a pulsar el botón" })).toBeVisible();                     // told to try again, never the false "check your mail"
    await new Promise((r) => setTimeout(r, 2500));
    expect((await mailFor(email)).length).toBe(before);
    await ctx.close(); await c2.close();
  });

  test("límite de solicitudes por correo: la cuarta en una hora se rechaza", async ({ browser }) => {
    const u = await createWorld("pwlimit"); const before = (await mailFor(u.trainerEmail)).length;
    const { ctx, page } = await visitor(browser); await page.goto("/forgot-password"); await wait(page);
    for (let i = 0; i < 3; i++) {
      await page.getByLabel("Correo").fill(u.trainerEmail); await page.getByRole("button", { name: "Enviarme el enlace" }).click();
      await expect(page.getByRole("status")).toContainText(NEUTRAL); await waitForMail(u.trainerEmail, before + i);   // each of the first three really sends a message
      await page.waitForTimeout(1300);                                                           // Auth itself spaces e-mails to one address (max_frequency 1 s here, 60 s by default)
    }
    await page.getByLabel("Correo").fill(u.trainerEmail); await page.getByRole("button", { name: "Enviarme el enlace" }).click();
    await expect(alerts(page)).toContainText("Demasiados intentos");
    expect(await noMailFor("nobody-" + Date.now() + "@x.co", 1500)).toBe(true);
    expect((await mailFor(u.trainerEmail)).length - before).toBe(3);                          // the fourth request produced nothing
    await ctx.close();
  });

  test("los enlaces de confirmación no sirven de redirección abierta ni se pueden usar sin código", async ({ browser, page: _unused }) => {
    void _unused;
    const { ctx, page } = await visitor(browser);
    await page.goto("/auth/confirm?code=invalido&next=https://evil.example/robo");
    await expect(page).toHaveURL(/\/login\?error=link$/); expect(new URL(page.url()).origin).toBe(APP);
    await expect(page.getByRole("status")).toContainText("no es válido o ya venció");
    await page.goto("/auth/confirm"); await expect(page).toHaveURL(/\/login\?error=link$/);
    await page.goto("/auth/confirm?code=codigo-que-no-existe&next=/trainer"); await expect(page).toHaveURL(/\/login\?error=confirm$/);          // sign-up link opened in another browser: the e-mail is confirmed, only the session could not be opened
    await expect(page.getByText("Tu correo ya quedó confirmado")).toBeVisible();
    await page.goto("/auth/confirm?code=codigo-que-no-existe&next=/reset-password"); await expect(page).toHaveURL(/\/login\?error=link$/);   // a recovery link keeps the strict message
    await page.goto("/auth/confirm?token_hash=00000000000000000000000000000000000000000000000000000000&type=recovery&next=//evil.example"); await expect(page).toHaveURL(/\/login\?error=link$/);
    await page.goto("/reset-password"); await expect(page.getByRole("heading", { name: "Enlace no válido" })).toBeVisible();
    await ctx.close();
  });

  test("una sesión normal no puede saltarse la contraseña actual usando /reset-password", async ({ browser }) => {
    const u = await createWorld("pwskip"); const { ctx, page } = await visitor(browser);
    await login(page, u.trainerEmail); await expect(page).toHaveURL(/\/trainer$/);
    await page.goto("/reset-password");
    await expect(page.getByRole("heading", { name: "Enlace no válido" })).toBeVisible();
    await expect(page.getByLabel("Contraseña nueva")).toHaveCount(0);
    await ctx.close();
  });
});

test.describe("cambiar contraseña con sesión iniciada", () => {
  test("pide la actual, aplica la política, cierra las demás sesiones y la nueva funciona", async ({ browser }) => {
    const u = await createWorld("pwchange");
    const { ctx, page } = await visitor(browser); const other = await visitor(browser);
    await login(page, u.clientEmail); await expect(page).toHaveURL(/\/client$/);
    await login(other.page, u.clientEmail); await expect(other.page).toHaveURL(/\/client$/);

    await page.goto("/client/privacy");
    const form = page.locator("form", { has: page.getByLabel("Contraseña actual") });
    const fill = async (cur: string, nw: string, again = nw) => { await form.getByLabel("Contraseña actual").fill(cur); await form.getByLabel("Contraseña nueva").fill(nw); await form.getByLabel("Repite la nueva").fill(again); await form.getByRole("button", { name: "Cambiar contraseña" }).click(); };
    await fill("incorrecta-123", NEW_PASSWORD); await expect(form.getByRole("alert")).toContainText("actual no es correcta");
    await fill(PASSWORD, NEW_PASSWORD, NEW_PASSWORD + "!"); await expect(form.getByRole("alert")).toContainText("no coinciden");
    await fill(PASSWORD, PASSWORD); await expect(form.getByRole("alert")).toContainText("distinta a la actual");
    await fill(PASSWORD, "Contraseña123"); await expect(form.getByRole("alert")).toContainText("demasiado común");
    await fill(PASSWORD, NEW_PASSWORD);
    await expect(form.getByRole("status")).toContainText("Contraseña actualizada");

    await other.page.goto("/client"); await expect(other.page).toHaveURL(/\/login/);          // the other device was signed out
    await page.goto("/client"); await expect(page).toHaveURL(/\/client$/);                      // this one was not
    const fresh = await visitor(browser);
    await fresh.page.goto("/login"); await fresh.page.getByLabel("Correo").fill(u.clientEmail); await fresh.page.getByLabel("Contraseña").fill(PASSWORD);
    await fresh.page.getByRole("button", { name: "Entrar" }).click(); await expect(alerts(fresh.page)).toContainText("Credenciales inválidas");
    await fresh.page.getByLabel("Contraseña").fill(NEW_PASSWORD); await fresh.page.getByRole("button", { name: "Entrar" }).click(); await expect(fresh.page).toHaveURL(/\/client|\/trainer/);
    await ctx.close(); await other.ctx.close(); await fresh.ctx.close();
  });

  test("el entrenador tiene el mismo formulario en Mi cuenta", async ({ browser }) => {
    const u = await createWorld("pwtrainer"); const { ctx, page } = await visitor(browser);
    await login(page, u.trainerEmail); await page.goto("/trainer/account");
    await expect(page.getByRole("heading", { name: "Cambiar mi contraseña" })).toBeVisible();
    await ctx.close();
  });
});

test.describe("límite de intentos de inicio de sesión", () => {
  test("diez fallos seguidos bloquean esa cuenta desde esa IP, incluso con la contraseña correcta", async ({ browser }) => {
    const u = await createWorld("pwbrute"); const { ctx, page } = await visitor(browser);
    await page.goto("/login");
    for (let i = 0; i < 10; i++) {
      await page.getByLabel("Correo").fill(u.trainerEmail); await page.getByLabel("Contraseña").fill(`mala-${i}-clave`);
      await page.getByRole("button", { name: "Entrar" }).click(); await expect(alerts(page)).toContainText("Credenciales inválidas");
    }
    await page.getByLabel("Contraseña").fill(PASSWORD); await page.getByRole("button", { name: "Entrar" }).click();
    await expect(alerts(page)).toContainText("Demasiados intentos"); await expect(page).toHaveURL(/\/login/);
    // Another visitor is not affected (the limit is per account *and* address).
    const clean = await visitor(browser); await login(clean.page, u.trainerEmail); await expect(clean.page).toHaveURL(/\/trainer$/);
    await ctx.close(); await clean.ctx.close();
  });
  test("un inicio correcto reinicia el contador de esa cuenta", async ({ browser }) => {
    const u = await createWorld("pwreset2"); const { ctx, page } = await visitor(browser); await page.goto("/login");
    for (let i = 0; i < 8; i++) { await page.getByLabel("Correo").fill(u.trainerEmail); await page.getByLabel("Contraseña").fill(`mala-${i}-clave`); await page.getByRole("button", { name: "Entrar" }).click(); await expect(alerts(page)).toContainText("Credenciales inválidas"); }
    await page.getByLabel("Contraseña").fill(PASSWORD); await page.getByRole("button", { name: "Entrar" }).click(); await expect(page).toHaveURL(/\/trainer$/);
    await page.getByRole("button", { name: "Cerrar sesión" }).click(); await page.waitForURL(/\/login/);
    for (let i = 0; i < 8; i++) { await page.getByLabel("Correo").fill(u.trainerEmail); await page.getByLabel("Contraseña").fill(`otra-${i}-clave`); await page.getByRole("button", { name: "Entrar" }).click(); await expect(alerts(page)).toContainText("Credenciales inválidas"); }
    await ctx.close();
  });
});

test.describe("registro de entrenadores", () => {
  const unique = () => `Entrenador E2E ${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const emailFor = (name: string) => `${name.toLowerCase().replace(/[^a-z0-9]/g, "")}@x.co`;
  const profile = async (name: string) => (await admin.from("profiles").select("id,role,full_name").eq("full_name", name)).data ?? [];
  const submit = async (page: Page, name: string, email: string, password: string) => { await page.getByLabel("Nombre completo").fill(name); await page.getByLabel("Correo").fill(email); await page.getByLabel("Contraseña").fill(password); await page.getByRole("button", { name: /Empezar prueba/ }).click(); };

  test("la política de contraseñas se aplica en el servidor y el registro correcto abre la prueba de 7 días", async ({ browser }) => {
    const name = unique(), email = emailFor(name); const { ctx, page } = await visitor(browser); const csp = watchCsp(page);
    await page.goto("/signup"); await wait(page);
    await submit(page, name, email, "Contraseña123"); await expect(alerts(page)).toContainText("demasiado común");
    await submit(page, name, email, name.split(" ")[0] + "-2026-ok"); await expect(alerts(page)).toContainText("nombre");
    expect(await profile(name)).toEqual([]);
    await submit(page, name, email, "Montaña-Clara-2026");
    await expect(page).toHaveURL(/\/trainer$/); await expect(page.getByText(/Prueba gratis: te quedan 7 días/)).toBeVisible();
    const p = await profile(name); expect(p).toHaveLength(1); expect(p[0].role).toBe("trainer");
    expect(csp).toEqual([]);
    // A second registration with the same address says nothing about whether it exists.
    const second = await visitor(browser); await second.page.goto("/signup"); await wait(second.page);
    await submit(second.page, unique(), email, "Montaña-Clara-2026");
    await expect(alerts(second.page)).toContainText("No se pudo crear la cuenta");
    await expect(alerts(second.page)).not.toContainText(/already|ya est[aá] registrad|existe/i);
    await ctx.close(); await second.ctx.close();
  });

  test("un robot (campo oculto) recibe «revisa tu correo» y un envío instantáneo pide reintentar; en ningún caso se crea la cuenta", async ({ browser }) => {
    const hp = unique(), fast = unique();
    const { ctx, page } = await visitor(browser); await page.goto("/signup");
    await page.locator('input[name="website"]').evaluate((i: HTMLInputElement) => { i.value = "https://spam.example"; });
    await wait(page); await submit(page, hp, emailFor(hp), "Montaña-Clara-2026");
    await expect(page.getByRole("status")).toContainText("Te enviamos un correo para confirmar tu cuenta");
    const { ctx: c2, page: p2 } = await visitor(browser); await p2.goto("/signup"); await submit(p2, fast, emailFor(fast), "Montaña-Clara-2026");   // no waiting at all: could be autofill on a phone
    await expect(p2.getByRole("alert").filter({ hasText: "vuelve a pulsar el botón" })).toBeVisible();                                    // a person is told to try again, not left waiting for a mail that will never come
    await new Promise((r) => setTimeout(r, 1500));
    expect(await profile(hp)).toEqual([]); expect(await profile(fast)).toEqual([]);
    await ctx.close(); await c2.close();
  });

  test("límite por dirección: el sexto intento en una hora se rechaza, aunque sea de un robot", async ({ browser }) => {
    const { ctx, page } = await visitor(browser); const answers: string[] = [];
    for (let i = 0; i < 6; i++) {
      await page.goto("/signup"); const name = unique();
      await page.locator('input[name="website"]').evaluate((e: HTMLInputElement) => { e.value = "x"; });
      await submit(page, name, emailFor(name), "Montaña-Clara-2026");
      const msg = page.locator('[role="status"], [role="alert"]:not(#__next-route-announcer__)').first(); await expect(msg).toBeVisible(); answers.push((await msg.innerText()).trim());
    }
    expect(answers.slice(0, 5).every((t) => /Te enviamos un correo/.test(t))).toBe(true);
    expect(answers[5]).toMatch(/Demasiados intentos/);
    await ctx.close();
  });
});
