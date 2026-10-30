// One-time setup of the PayPal catalog product + $10/month plan (official endpoints: /v1/catalogs/products, /v1/billing/plans).
// Usage: node --env-file=.env.local scripts/paypal-setup.mjs   → prints PAYPAL_PLAN_ID to put in your env.
const env = process.env.PAYPAL_ENVIRONMENT === "production" ? "production" : "sandbox";
const base = env === "production" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
const { PAYPAL_CLIENT_ID: id, PAYPAL_CLIENT_SECRET: secret } = process.env;
if (!id || !secret) { console.error("Faltan PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET"); process.exit(1); }
const tokRes = await fetch(`${base}/v1/oauth2/token`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
if (!tokRes.ok) { console.error("Autenticación PayPal fallida", tokRes.status); process.exit(1); }
const token = (await tokRes.json()).access_token;
const call = async (path, body, key) => { const r = await fetch(`${base}${path}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "PayPal-Request-Id": key }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) { console.error(path, r.status, JSON.stringify(j)); process.exit(1); } return j; };
const product = await call("/v1/catalogs/products", { name: "Rutinia - Suscripción de entrenador", description: "Plataforma para entrenadores personales (incluye 20 alumnos activos)", type: "SERVICE", category: "SOFTWARE" }, "training-os-product-v1");
const plan = await call("/v1/billing/plans", {
  product_id: product.id, name: "Rutinia mensual USD 10", description: "USD 10.00 por mes, incluye hasta 20 alumnos activos",
  billing_cycles: [{ frequency: { interval_unit: "MONTH", interval_count: 1 }, tenure_type: "REGULAR", sequence: 1, total_cycles: 0, pricing_scheme: { fixed_price: { value: "10.00", currency_code: "USD" } } }],
  payment_preferences: { auto_bill_outstanding: true, setup_fee_failure_action: "CANCEL", payment_failure_threshold: 3 },
}, "rutinia-plan-v1");
console.log(`Entorno: ${env}\nPAYPAL_PLAN_ID=${plan.id}   (estado del plan: ${plan.status})`);
