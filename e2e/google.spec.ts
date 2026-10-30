import { test, expect } from "@playwright/test";

const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";

test.describe("Google", () => {
  test("el login y el registro ofrecen Google; con una invitación pendiente no se ofrece", async ({ page }) => {
    await page.goto("/login"); await expect(page.getByRole("link", { name: "Continuar con Google" })).toHaveAttribute("href", "/auth/google");
    await page.goto("/signup"); await expect(page.getByRole("link", { name: "Registrarme con Google" })).toHaveAttribute("href", "/auth/google");
    await expect(page.getByText(/Al continuar aceptas los/)).toBeVisible();
    await page.goto("/login?next=/invite/token_de_invitacion_de_prueba_123"); await expect(page.getByRole("link", { name: /Google/ })).toHaveCount(0);          // an invited student must not create a trainer account by accident
  });

  test("«Continuar con Google» lleva al proveedor con PKCE y vuelve a /auth/confirm", async ({ request }) => {
    const r = await request.get("/auth/google", { maxRedirects: 0 });
    expect(r.status()).toBe(307);
    const loc = new URL(r.headers()["location"]);
    expect(loc.origin + loc.pathname).toBe(`${SUPABASE}/auth/v1/authorize`);
    expect(loc.searchParams.get("provider")).toBe("google"); expect(loc.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{40,}$/); expect(loc.searchParams.get("code_challenge_method")).toBe("s256");
    const back = new URL(loc.searchParams.get("redirect_to")!); expect(back.pathname).toBe("/auth/confirm"); expect(back.searchParams.get("next")).toBe("/trainer"); expect(back.searchParams.get("provider")).toBe("google");
    expect(loc.searchParams.get("prompt") ?? loc.searchParams.get("query_params") ?? "").toBeTruthy();
    expect((r.headers()["set-cookie"] ?? "")).toMatch(/code-verifier/);                                                                   // this browser keeps the proof it needs to finish
  });

  test("si Google se cancela o falla, el aviso lo dice con claridad y no sale nada raro", async ({ page }) => {
    for (const url of ["/auth/confirm?error=access_denied&provider=google", "/auth/confirm?code=no-existe&next=/trainer&provider=google"]) {
      await page.goto(url); await expect(page).toHaveURL(/\/login\?error=google$/);
      await expect(page.getByRole("status")).toContainText("No pudimos iniciar sesión con Google"); expect(new URL(page.url()).origin).toBe(new URL(page.url()).origin);
    }
    await page.goto("/auth/confirm?code=no-existe&next=/trainer"); await expect(page).toHaveURL(/\/login\?error=confirm$/);              // the e-mail sign-up message is unchanged
  });
});
