import { checkEnv } from "@/lib/env";

/** Runs once when the server starts. In production a broken configuration stops the boot instead of failing on a customer. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const { errors, warnings } = checkEnv(process.env);
  for (const w of warnings) console.warn(`[config] aviso: ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`[config] ERROR: ${e}`);
    throw new Error(`Configuración de producción inválida (${errors.length} error/es). Revisa los logs [config].`);
  }
}
