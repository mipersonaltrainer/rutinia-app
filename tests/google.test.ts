import { describe, it, expect } from "vitest";
import { googleEnabled } from "@/lib/auth/google";

describe("Google sign-in switch", () => {
  it("is off unless explicitly turned on, so the button never leads to a raw provider error", () => {
    expect(googleEnabled({})).toBe(false);
    for (const v of ["", "off", "true", "1", "ON "]) expect(googleEnabled({ GOOGLE_SIGNIN: v }), JSON.stringify(v)).toBe(v.trim() === "on");
    expect(googleEnabled({ GOOGLE_SIGNIN: "on" })).toBe(true); expect(googleEnabled({ GOOGLE_SIGNIN: " on " })).toBe(true);
  });
});
