import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { admin, alerts, asUser, createWorld, login, watchCsp, type World } from "./helpers";

const BUCKET = "progress-photos";
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
let w: World, other: World;
let path = "";

/** A JPEG that carries EXIF (copyright + description): the upload must strip it. */
const jpegWithExif = () => sharp({ create: { width: 240, height: 320, channels: 3, background: { r: 120, g: 80, b: 60 } } }).jpeg().withExif({ IFD0: { Copyright: "E2E-secreto", ImageDescription: "ubicación-privada" } }).toBuffer();
// Images are loading="lazy": bring them into view first, otherwise a photo far down the page legitimately stays unloaded.
const loaded = async (page: Page, alt: RegExp) => { const img = page.getByAltText(alt).first(); await img.scrollIntoViewIfNeeded(); return img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0); };

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => { w = await createWorld("pho"); other = await createWorld("pho-other"); });

test("el alumno debe activar el consentimiento de fotos antes de poder subir", async ({ page }) => {
  await login(page, w.clientEmail); await expect(page).toHaveURL(/\/client$/);
  await page.goto("/client/photos");
  await expect(page.getByText("Aún no has subido fotos.")).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Activar consentimiento de fotos" }).click();
  await expect(page.locator('input[type="file"]')).toBeVisible();
  expect((await admin.from("consents").select("revoked_at").eq("user_id", w.clientId).eq("type", "photos")).data).toEqual([{ revoked_at: null }]);
});

test("archivos no válidos se rechazan en el servidor y no dejan rastro", async ({ page }) => {
  await login(page, w.clientEmail); await page.goto("/client/photos");
  const file = page.locator('input[type="file"]');
  await file.setInputFiles({ name: "falsa.png", mimeType: "image/png", buffer: Buffer.from("esto no es una imagen, solo texto") });
  await page.getByRole("button", { name: "Subir foto" }).click();
  await expect(alerts(page)).toContainText("Solo se aceptan fotos JPG, PNG o WebP");
  await file.setInputFiles({ name: "grande.jpg", mimeType: "image/jpeg", buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(8 * 1024 * 1024 + 10, 1)]) });
  await page.getByRole("button", { name: "Subir foto" }).click();
  await expect(alerts(page)).toContainText("supera 8 MB");
  expect((await admin.from("progress_photos").select("id").eq("client_id", w.clientId)).data).toEqual([]);
  expect((await admin.storage.from(BUCKET).list(w.clientId)).data ?? []).toHaveLength(0);
});

test("sube una foto con EXIF: se guarda privada, como WebP y sin metadatos, y se ve bajo la CSP", async ({ page }) => {
  const csp = watchCsp(page);
  const original = await jpegWithExif();
  expect((await sharp(original).metadata()).exif).toBeDefined();                                  // the fixture really has EXIF
  await login(page, w.clientEmail); await page.goto("/client/photos");
  await page.locator('input[type="file"]').setInputFiles({ name: "frente.jpg", mimeType: "image/jpeg", buffer: original });
  await page.getByLabel("Nota (opcional)").fill("Primera foto");
  await page.getByRole("button", { name: "Subir foto" }).click();
  await expect(page.getByText("Foto guardada de forma privada.")).toBeVisible();
  await expect(page.getByAltText(/Foto de progreso \(Frente\)/)).toBeVisible();
  await expect.poll(() => loaded(page, /Foto de progreso \(Frente\)/)).toBe(true);

  const row = (await admin.from("progress_photos").select("storage_path,content_type,size_bytes,pose,notes").eq("client_id", w.clientId).single()).data!;
  path = row.storage_path;
  expect(path).toMatch(new RegExp(`^${w.clientId}/[0-9a-f-]{36}\\.webp$`));                       // under the owner's folder, random name
  expect(row).toMatchObject({ content_type: "image/webp", pose: "front", notes: "Primera foto" });
  const stored = Buffer.from(await (await admin.storage.from(BUCKET).download(path)).data!.arrayBuffer());
  const meta = await sharp(stored).metadata();
  expect(meta.format).toBe("webp"); expect(meta.exif).toBeUndefined();                              // EXIF stripped
  expect(stored.includes(Buffer.from("E2E-secreto"))).toBe(false); expect(stored.includes(Buffer.from("ubicación-privada"))).toBe(false);
  expect(csp).toEqual([]);
});

test("acceso estricto: sin sesión, otro alumno u otro entrenador no pueden leer la foto", async ({ request }) => {
  // The bucket is private: the public URL does not serve it.
  expect((await request.get(`${SUPA}/storage/v1/object/public/${BUCKET}/${path}`)).status()).not.toBe(200);
  expect((await request.get(`${SUPA}/storage/v1/object/${BUCKET}/${path}`)).status()).not.toBe(200);           // authenticated route without a token
  for (const email of [other.clientEmail, other.trainerEmail]) {
    const U = await asUser(email);
    expect((await U.storage.from(BUCKET).createSignedUrl(path, 60)).error).not.toBeNull();
    expect((await U.storage.from(BUCKET).download(path)).error).not.toBeNull();
    expect((await U.from("progress_photos").select("id").eq("client_id", w.clientId)).data).toEqual([]);
  }
  // Another user cannot plant files in this client's folder either.
  const O = await asUser(other.clientEmail);
  expect((await O.storage.from(BUCKET).upload(`${w.clientId}/intruso.webp`, Buffer.from("x"), { contentType: "image/webp" })).error).not.toBeNull();
});

test("el entrenador del alumno la ve (con registro de acceso) y deja de verla al retirar el consentimiento", async ({ browser }) => {
  const ctx = await browser.newContext(); const tp = await ctx.newPage(); const csp = watchCsp(tp);
  await login(tp, w.trainerEmail); await expect(tp).toHaveURL(/\/trainer$/);
  await tp.goto(`/trainer/clients/${w.clientId}`);
  await expect(tp.getByAltText(/Foto Frente del/)).toBeVisible();
  await expect.poll(() => loaded(tp, /Foto Frente del/)).toBe(true);
  await expect(tp.getByText("Nota del alumno: Primera foto")).toBeVisible();
  expect((await admin.from("access_audit").select("resource").eq("actor_id", w.trainerId).eq("client_id", w.clientId).eq("resource", "progress_photos_view")).data!.length).toBeGreaterThan(0);
  expect(csp).toEqual([]);

  // Withdrawing the photos consent cuts access immediately, at the database and in the UI.
  await admin.from("consents").update({ revoked_at: new Date().toISOString() }).eq("user_id", w.clientId).eq("type", "photos");
  await tp.reload();
  await expect(tp.getByText("No hay fotos visibles")).toBeVisible();
  const T = await asUser(w.trainerEmail);
  expect((await T.storage.from(BUCKET).createSignedUrl(path, 60)).error).not.toBeNull();
  await admin.from("consents").update({ revoked_at: null }).eq("user_id", w.clientId).eq("type", "photos");
  await ctx.close();
});

test("la revisión del entrenador llega al alumno", async ({ browser }) => {
  const tctx = await browser.newContext(); const tp = await tctx.newPage();
  await login(tp, w.trainerEmail); await expect(tp).toHaveURL(/\/trainer$/);
  await tp.goto(`/trainer/clients/${w.clientId}`);
  await expect(tp.getByText("pendiente").first()).toBeVisible();
  await tp.getByText("Marcar como revisada").click();
  await tp.getByLabel("Comentario (visible para el alumno)").fill("Buen avance, mantén la postura.");
  await tp.getByRole("button", { name: "Guardar revisión" }).click();
  await expect(tp.getByText("revisada", { exact: true })).toBeVisible();
  const cctx = await browser.newContext(); const cp = await cctx.newPage();
  await login(cp, w.clientEmail); await expect(cp).toHaveURL(/\/client$/);
  await cp.goto("/client/photos");
  await expect(cp.getByText("Buen avance, mantén la postura.")).toBeVisible();
  await tctx.close(); await cctx.close();
});

test("límite diario de fotos y eliminación definitiva (archivo y registro)", async ({ page }) => {
  await login(page, w.clientEmail); await page.goto("/client/photos");
  // Fill the daily quota with rows (the upload action counts what was created in the last 24 h).
  const filler = Array.from({ length: 9 }, (_, i) => ({ client_id: w.clientId, taken_on: new Date().toISOString().slice(0, 10), pose: "other", storage_path: `${w.clientId}/relleno-${i}.webp`, content_type: "image/webp", size_bytes: 1000 }));
  expect((await admin.from("progress_photos").insert(filler)).error).toBeNull();
  await page.reload();
  await page.locator('input[type="file"]').setInputFiles({ name: "otra.jpg", mimeType: "image/jpeg", buffer: await jpegWithExif() });
  await page.getByRole("button", { name: "Subir foto" }).click();
  await expect(alerts(page)).toContainText("Límite de 10 fotos por día");
  await admin.from("progress_photos").delete().like("storage_path", `${w.clientId}/relleno-%`);

  await page.reload();
  const card = page.getByRole("listitem").filter({ has: page.getByAltText(/Foto de progreso \(Frente\)/) });
  await card.getByText("Eliminar", { exact: true }).click();
  await card.getByRole("button", { name: "Confirmar: eliminar esta foto" }).click();
  await expect(page.getByText("Aún no has subido fotos.")).toBeVisible();
  expect((await admin.from("progress_photos").select("id").eq("client_id", w.clientId)).data).toEqual([]);
  expect((await admin.storage.from(BUCKET).download(path)).error).not.toBeNull();                    // the file is gone too
});
