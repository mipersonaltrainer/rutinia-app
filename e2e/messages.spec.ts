import { test, expect, type Page } from "@playwright/test";
import { createWorld, login, watchCsp, type World } from "./helpers";

let w: World;
test.beforeAll(async () => { w = await createWorld("msg"); });

const thread = (p: Page) => p.getByRole("list", { name: "Mensajes" });
const box = (p: Page) => p.getByRole("textbox", { name: "Mensaje" });
// The form clears itself only after the server accepted the message, so an empty box is the completion signal.
const send = async (p: Page, text: string) => { await box(p).fill(text); await p.getByRole("button", { name: "Enviar", exact: true }).click(); await expect(box(p)).toHaveValue(""); };

test("mensajes en vivo entre entrenador y alumno, sin recargar", async ({ browser }) => {
  const tctx = await browser.newContext(), cctx = await browser.newContext();
  const tp = await tctx.newPage(), cp = await cctx.newPage();
  const cspT = watchCsp(tp), cspC = watchCsp(cp);

  await login(tp, w.trainerEmail); await expect(tp).toHaveURL(/\/trainer$/);
  await login(cp, w.clientEmail); await expect(cp).toHaveURL(/\/client$/);
  await tp.goto(`/trainer/clients/${w.clientId}/messages`);
  await cp.goto("/client/messages");
  await expect(thread(tp)).toContainText("Aún no hay mensajes");

  // Marker proves the page was never reloaded: a full navigation would erase it.
  await tp.evaluate(() => { (window as unknown as { __live: string }).__live = "sin-recarga"; });
  await cp.evaluate(() => { (window as unknown as { __live: string }).__live = "sin-recarga"; });

  await send(cp, "Hola, ¿puedo cambiar el horario?");
  await expect(thread(tp)).toContainText("Hola, ¿puedo cambiar el horario?");               // arrives via Realtime
  await expect(tp.evaluate(() => (window as unknown as { __live?: string }).__live)).resolves.toBe("sin-recarga");

  await send(tp, "Claro, te propongo el jueves a las 7:00.");
  await expect(thread(cp)).toContainText("te propongo el jueves");
  await expect(cp.evaluate(() => (window as unknown as { __live?: string }).__live)).resolves.toBe("sin-recarga");

  // Read receipt reaches the sender live: the client has the page open, so the trainer's message ends up "leído".
  await expect(thread(tp).getByText("leído").first()).toBeVisible();

  // Message bodies are plain text: markup and links are shown, never executed or activated.
  await send(cp, "<img src=x onerror=window.__xss=1> https://ejemplo.invalid/x");
  await expect(thread(tp)).toContainText("<img src=x onerror=window.__xss=1>");
  expect(await tp.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  await expect(thread(tp).locator("a")).toHaveCount(0);

  // Unread badge on the client nav appears live when the client is on another page and clears when the thread is opened.
  await cp.goto("/client");
  await send(tp, "Recuerda traer la banda elástica.");
  await expect(cp.getByRole("link", { name: /^Mensajes\s*1$/ })).toBeVisible();
  await cp.getByRole("link", { name: /^Mensajes/ }).click();
  await expect(thread(cp)).toContainText("banda elástica");
  await expect(cp.getByRole("link", { name: /^Mensajes\s*\d/ })).toHaveCount(0);

  expect(cspT).toEqual([]); expect(cspC).toEqual([]);
  await tctx.close(); await cctx.close();
});

test("el aviso de urgencias médicas y el límite de caracteres están a la vista", async ({ page }) => {
  await login(page, w.trainerEmail); await expect(page).toHaveURL(/\/trainer$/);
  await page.goto(`/trainer/clients/${w.clientId}/messages`);
  await expect(page.getByText("llama al 123")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Mensaje" })).toHaveAttribute("maxlength", "2000");
});

test("un entrenador ajeno no puede abrir la conversación de otro", async ({ browser }) => {
  const other = await createWorld("msg-other");
  const ctx = await browser.newContext(); const p = await ctx.newPage();
  await login(p, other.trainerEmail); await expect(p).toHaveURL(/\/trainer$/);
  const res = await p.goto(`/trainer/clients/${w.clientId}/messages`);
  expect(res?.status()).toBe(404);
  await ctx.close();
});
