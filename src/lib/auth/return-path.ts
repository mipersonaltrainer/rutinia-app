/** Where the login form may send someone afterwards: ONLY back to an invitation page (strict shape), never an arbitrary path or URL. */
export function inviteReturnPath(raw: string | null | undefined): string | null {
  return typeof raw === "string" && /^\/invite\/[A-Za-z0-9_-]{20,100}$/.test(raw) ? raw : null;
}
export function maskEmail(email: string): string {
  const [u, d] = email.split("@"); if (!d) return "***";
  return `${u.slice(0, 1)}${"*".repeat(Math.max(2, Math.min(6, u.length - 1)))}@${d}`;
}
