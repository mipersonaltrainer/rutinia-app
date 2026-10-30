import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import sharp from "sharp";
import manifest from "@/app/manifest";

describe("PWA", () => {
  const m = manifest();
  it("manifest is installable", () => {
    expect(m.display).toBe("standalone"); expect(m.start_url).toBe("/login"); expect(m.name).toBeTruthy();
    expect(m.icons!.some((i) => i.sizes === "192x192")).toBe(true); expect(m.icons!.some((i) => i.sizes === "512x512" && i.purpose === "maskable")).toBe(true);
  });
  it("every icon exists with its declared size", async () => {
    for (const i of m.icons!) { const f = `public${i.src}`; expect(existsSync(f)).toBe(true); const meta = await sharp(f).metadata(); expect(`${meta.width}x${meta.height}`).toBe(i.sizes); }
    expect((await sharp("public/icons/apple-touch-icon.png").metadata()).width).toBe(180);
  });
  it("the service worker never caches personal data: only GET navigations are touched and only the static shell is stored", () => {
    const sw = readFileSync("public/sw.js", "utf8");
    expect(sw).toMatch(/req\.method !== "GET" \|\| req\.mode !== "navigate"\) return/);
    expect(sw).not.toMatch(/cache\.put|c\.put|addAll\((?!SHELL)/);                  // nothing is written to the cache at runtime
    const shell = /const SHELL = \[([^\]]*)\]/.exec(sw)![1];
    expect(shell).toBe('"/offline", "/icons/icon-192.png", "/icons/icon-512.png"');
    expect(shell).not.toMatch(/trainer|client|api/);
  });
});
