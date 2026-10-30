"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type MfaState = { error?: string; factorId?: string; qr?: string; secret?: string } | undefined;
const code = z.string().trim().regex(/^\d{6}$/, "El código tiene 6 dígitos");

/** Only people already on the team may enrol or verify; everyone else gets nothing from these actions. */
async function member() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if ((await supabase.rpc("is_support_staff_member")).data !== true) redirect("/login");
  return supabase;
}

/** Creates a TOTP factor and returns the QR (SVG data URI) and the manual key. The factor is unusable until a code is verified. */
export async function startMfaEnrollment(): Promise<MfaState> {
  const supabase = await member();
  const { data: list } = await supabase.auth.mfa.listFactors();
  for (const f of list?.all ?? []) if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });   // abandoned attempts
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Rutinia soporte" });
  if (error || !data) return { error: "No se pudo iniciar la activación. Inténtalo de nuevo." };
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** Verifies a 6-digit code against a factor (new or existing) and, on success, upgrades the session to aal2. */
export async function verifyMfa(_: MfaState, fd: FormData): Promise<MfaState> {
  const supabase = await member();
  const c = code.safeParse(fd.get("code"));
  if (!c.success) return { error: c.error.issues[0].message };
  const factorId = String(fd.get("factorId") ?? "");
  const { data: list } = await supabase.auth.mfa.listFactors();
  if (!(list?.all ?? []).some((f) => f.id === factorId && f.factor_type === "totp")) return { error: "Factor no válido. Recarga la página." };   // only the caller's own factors are listed
  const ch = await supabase.auth.mfa.challenge({ factorId });
  if (ch.error || !ch.data) return { error: "No se pudo verificar. Inténtalo de nuevo." };
  const v = await supabase.auth.mfa.verify({ factorId, challengeId: ch.data.id, code: c.data });
  if (v.error) return { error: "Código incorrecto o vencido. Revisa la hora de tu teléfono e inténtalo otra vez." };
  redirect("/staff");
}
