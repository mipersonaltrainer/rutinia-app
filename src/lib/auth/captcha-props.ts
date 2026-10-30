import { headers } from "next/headers";
import { turnstileSiteKey } from "./turnstile";

/** What a server page hands to an auth form so it can show the challenge: the public site key and this request's CSP nonce (set by src/proxy.ts). Undefined = no widget. */
export async function captchaProps(): Promise<{ siteKey: string; nonce?: string } | undefined> {
  const siteKey = turnstileSiteKey();
  if (!siteKey) return undefined;
  return { siteKey, nonce: (await headers()).get("x-nonce") ?? undefined };
}
