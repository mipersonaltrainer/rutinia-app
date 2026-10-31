import { describe, it, expect } from "vitest";
import { URL_VECTORS } from "./fixtures-call-urls";
import { isAllowedCallUrl, callUrlProblem, newJitsiLink, cleanMessage, CALL_HOSTS } from "@/lib/messaging/links";

describe("Google Meet links", () => {
  it("accepts a real room, with or without the trailing slash, and a lookup link", () => {
    for (const u of ["https://meet.google.com/abc-defg-hij", "https://meet.google.com/abc-defg-hij/", "https://meet.google.com/lookup/abc123_-x"]) expect(callUrlProblem(u), u).toBeNull();
  });
  it("explains what to do when the link is the «new meeting» page or not a room", () => {
    for (const u of ["https://meet.google.com/new", "https://meet.google.com/", "https://meet.google.com/landing", "https://meet.google.com/abc-defg-hij/extra"]) expect(callUrlProblem(u), u).toMatch(/Crear reunión en Google Meet/);
  });
  it("other providers and invalid links keep the general rule", () => {
    expect(callUrlProblem("https://zoom.us/j/123456789")).toBeNull();
    expect(callUrlProblem("https://evil.example/abc-defg-hij")).toMatch(/Google Meet, Zoom/);
    expect(callUrlProblem("javascript:alert(1)")).toMatch(/Google Meet, Zoom/);
  });
});

describe("call links", () => {
  it.each(URL_VECTORS)("%s -> %s", (u, ok) => expect(isAllowedCallUrl(u)).toBe(ok));
  it("rejects over-long links", () => expect(isAllowedCallUrl("https://zoom.us/" + "a".repeat(500))).toBe(false));
  it("generated Jitsi rooms are allowed, unguessable and unique", () => {
    const a = newJitsiLink(), b = newJitsiLink();
    expect(isAllowedCallUrl(a)).toBe(true); expect(a).not.toBe(b); expect(a).toMatch(/rutinia-[0-9a-f]{32}$/);
  });
  it("host list is the documented one", () => expect(CALL_HOSTS.length).toBe(6));
});

describe("cleanMessage", () => {
  it("trims, normalises and strips control/bidi characters", () => {
    expect(cleanMessage("  hola‮\u0000 mundo \r\n x ")).toEqual({ ok: true, body: "hola mundo \n x" });
  });
  it("rejects empty and too long", () => {
    expect(cleanMessage("   ").ok).toBe(false); expect(cleanMessage("a".repeat(2001)).ok).toBe(false); expect(cleanMessage("a".repeat(2000)).ok).toBe(true);
  });
});
