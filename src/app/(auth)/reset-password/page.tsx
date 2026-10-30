import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { RECOVERY_COOKIE, verifyRecoveryMarker } from "@/lib/auth/recovery";
import { authSecret } from "@/lib/auth/server";
import { authCard } from "@/components/auth/AuthShell";

import { NOINDEX } from "@/lib/site";
export const metadata = { title: "Nueva contraseña", ...NOINDEX };
export default async function Page() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const marker = (await cookies()).get(RECOVERY_COOKIE)?.value;
  const valid = !!user && verifyRecoveryMarker(authSecret(), user.id, marker);
  return (
    <main className="grid min-h-[calc(100dvh-72px)] place-items-center p-4">
      {valid ? <ResetPasswordForm /> : (
        <div className={authCard}><h1 className="text-2xl font-semibold">Enlace no válido</h1>
          <p className="text-sm text-[var(--muted)]">El enlace para cambiar la contraseña venció, ya se usó o no corresponde a esta sesión. Pide uno nuevo.</p>
          <Link href="/forgot-password" className="block w-full rounded-lg bg-[var(--accent)] py-2.5 text-center font-semibold text-black">Pedir un enlace nuevo</Link></div>)}
    </main>
  );
}
