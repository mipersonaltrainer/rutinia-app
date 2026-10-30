import webpush from "web-push";

export type PushSub = { endpoint: string; p256dh: string; auth: string };
export type PushPayload = { title: string; body: string; url?: string };
export type PushConfig = { publicKey: string; privateKey: string; subject: string };

/** VAPID keys identify Rutinia to the browsers' push services. Without all three, push is simply not offered. */
export function pushConfig(env: Record<string, string | undefined> = process.env): PushConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim(), privateKey = env.VAPID_PRIVATE_KEY?.trim(), subject = env.VAPID_SUBJECT?.trim();
  return publicKey && privateKey && subject && /^(mailto:|https:\/\/)/.test(subject) ? { publicKey, privateKey, subject } : null;
}

export type PushResult = { ok: true } | { ok: false; gone: boolean; status?: number };
/** `gone`: the browser says the subscription no longer exists (404/410), so it should be deleted. */
export async function sendPush(cfg: PushConfig, sub: PushSub, payload: PushPayload, client: Pick<typeof webpush, "sendNotification"> = webpush): Promise<PushResult> {
  try {
    await client.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { vapidDetails: { subject: cfg.subject, publicKey: cfg.publicKey, privateKey: cfg.privateKey }, TTL: 86400, timeout: 8000 });
    return { ok: true };
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    return { ok: false, gone: status === 404 || status === 410, status };
  }
}
