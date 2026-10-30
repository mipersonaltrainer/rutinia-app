import { redirect } from "next/navigation";
import { currentUser, homeFor } from "@/lib/session";
import { NOINDEX } from "@/lib/site";
import { MfaForm } from "./MfaForm";

export const metadata = { title: "Verificación en dos pasos", ...NOINDEX };

export default async function StaffMfaPage() {
  const { supabase, user, profile } = await currentUser();
  if (!user) redirect("/login");
  if (profile?.role !== "staff" || (await supabase.rpc("is_support_staff_member")).data !== true) redirect(profile ? homeFor(profile.role) : "/login");
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") redirect("/staff");
  const { data: factors } = await supabase.auth.mfa.listFactors();
  return <MfaForm factorId={factors?.totp?.[0]?.id ?? null} />;
}
