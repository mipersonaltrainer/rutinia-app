// Administrator-configured USD→COP rate used for Wompi charges. Usage:
//   node --env-file=.env.local scripts/set-fx-rate.mjs 3950.50 "TRM del Banco de la República 2026-10-19"
// The rate is NEVER invented by the app: without a row in fx_rates, Wompi checkout is disabled.
import { createClient } from "@supabase/supabase-js";
const [rate, source] = process.argv.slice(2);
if (!/^\d+(\.\d{1,4})?$/.test(rate ?? "") || Number(rate) <= 0 || !source || source.length < 3) { console.error('Uso: set-fx-rate.mjs <tasa COP por USD> "<fuente documentada>"'); process.exit(1); }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { error } = await sb.from("fx_rates").insert({ base: "USD", quote: "COP", rate, source });
if (error) { console.error(error.message); process.exit(1); }
console.log(`Tasa registrada: 1 USD = ${rate} COP (${source}). Aplica a los pagos que se inicien desde ahora.`);
