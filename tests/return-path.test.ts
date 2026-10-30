import { describe, it, expect } from "vitest";
import { inviteReturnPath, maskEmail } from "@/lib/auth/return-path";

const T = "A".repeat(43);
describe("return path after sign-in", () => {
  it("only an invitation page is honoured", () => {
    expect(inviteReturnPath(`/invite/${T}`)).toBe(`/invite/${T}`);
    expect(inviteReturnPath(`/invite/${"a-_Z9".repeat(8)}`)).not.toBeNull();
  });
  it.each([
    [null], [undefined], [""], ["/trainer"], ["/client/privacy"], ["//evil.com"], ["https://evil.com/invite/" + T], [`/invite/${T}?x=1`], [`/invite/${T}#f`], [`/invite/${T}/extra`],
    ["/invite/corto"], [`/invite/${T}\\evil`], [`/invite/../trainer`], [`/invite/${"A".repeat(200)}`], [`/invite/${T}%0d%0aSet-Cookie:x`], ["javascript:alert(1)"],
  ])("rejects %s", (raw) => { expect(inviteReturnPath(raw as string | null | undefined)).toBeNull(); });
  it("masks the e-mail shown on the invitation page", () => {
    expect(maskEmail("maria@gmail.com")).toBe("m****@gmail.com"); expect(maskEmail("ab@x.co")).toBe("a**@x.co"); expect(maskEmail("sin-arroba")).toBe("***");
    expect(maskEmail("maria@gmail.com")).not.toContain("aria");
  });
});
