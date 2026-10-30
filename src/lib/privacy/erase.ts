import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBillingConfig } from "@/lib/billing/config";
import { createPayPalClient } from "@/lib/billing/providers/paypal";

export const PHOTO_BUCKET = "progress-photos";

/** Client erasure: database first (authoritative), then stored files; leftovers are logged without personal data. */
export async function eraseClientAccount(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("erase_client", { p_client: userId });
  if (error) throw new Error(`erase_client: ${error.message}`);
  const paths = ((data as { storage_paths?: string[] })?.storage_paths) ?? [];
  let orphaned: string[] = [];
  if (paths.length) {
    const { error: rmErr } = await admin.storage.from(PHOTO_BUCKET).remove(paths);
    if (rmErr) orphaned = paths;
  }
  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr && !/not found/i.test(delErr.message)) throw new Error(`deleteUser: ${delErr.message}`);
  if (orphaned.length) await admin.from("erasure_log").insert({ subject_hash: createHash("sha256").update(userId).digest("hex"), role: "client", kind: "client_erasure", detail: { orphaned_files: orphaned.length, paths: orphaned } });
  return { photosRemoved: paths.length - orphaned.length, orphaned: orphaned.length };
}

/** Trainer closure: personal content and access are removed, billing records stay (accounting retention). */
export async function closeTrainerAccount(userId: string) {
  const admin = createAdminClient();
  const { data: sub } = await admin.from("trainer_subscriptions").select("provider,provider_subscription_id").eq("trainer_id", userId).maybeSingle();
  if (sub?.provider === "paypal" && sub.provider_subscription_id) {
    const cfg = getBillingConfig();
    if (cfg.paypal.enabled) { try { await createPayPalClient(cfg).cancelSubscription(sub.provider_subscription_id, "Cierre de cuenta"); } catch { /* best effort: the account is closed regardless and the webhook reconciles */ } }
  }
  const { error } = await admin.rpc("close_trainer_account", { p_trainer: userId });
  if (error) throw new Error(`close_trainer_account: ${error.message}`);
  const { error: uErr } = await admin.auth.admin.updateUserById(userId, { email: `cerrada+${userId}@invalid.local`, password: randomBytes(32).toString("hex"), ban_duration: "876000h", user_metadata: { full_name: "Cuenta cerrada" } });
  if (uErr) throw new Error(`updateUser: ${uErr.message}`);
  return { closed: true };
}
