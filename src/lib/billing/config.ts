export type Provider = "paypal" | "wompi" | "bold";
export interface BillingConfig {
  baseUrl: string;
  wompi: { enabled: boolean; env: "sandbox" | "production"; publicKey: string; privateKey: string; eventsSecret: string; integritySecret: string; apiBase: string };
  bold: { enabled: boolean; identityKey: string; secretKey: string };
  paypal: { enabled: boolean; env: "sandbox" | "production"; clientId: string; clientSecret: string; webhookId: string; planId: string; apiBase: string };
}
const e = (k: string) => process.env[k]?.trim() ?? "";

export function getBillingConfig(): BillingConfig {
  const wEnv = e("WOMPI_ENVIRONMENT") === "production" ? "production" : "sandbox";
  const pEnv = e("PAYPAL_ENVIRONMENT") === "production" ? "production" : "sandbox";
  const wompi = { env: wEnv as "sandbox" | "production", publicKey: e("WOMPI_PUBLIC_KEY"), privateKey: e("WOMPI_PRIVATE_KEY"), eventsSecret: e("WOMPI_EVENTS_SECRET"), integritySecret: e("WOMPI_INTEGRITY_SECRET"), apiBase: wEnv === "production" ? "https://production.wompi.co/v1" : "https://sandbox.wompi.co/v1" };
  const paypal = { env: pEnv as "sandbox" | "production", clientId: e("PAYPAL_CLIENT_ID"), clientSecret: e("PAYPAL_CLIENT_SECRET"), webhookId: e("PAYPAL_WEBHOOK_ID"), planId: e("PAYPAL_PLAN_ID"), apiBase: pEnv === "production" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com" };
  const bold = { identityKey: e("BOLD_IDENTITY_KEY"), secretKey: e("BOLD_SECRET_KEY") };
  return {
    baseUrl: e("APPLICATION_BASE_URL") || "http://localhost:3000",
    wompi: { ...wompi, enabled: !!(wompi.publicKey && wompi.privateKey && wompi.eventsSecret && wompi.integritySecret) },
    bold: { ...bold, enabled: !!(bold.identityKey && bold.secretKey) },
    paypal: { ...paypal, enabled: !!(paypal.clientId && paypal.clientSecret && paypal.webhookId) },
  };
}
