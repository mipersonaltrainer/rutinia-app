import Link from "next/link";
import { acceptInvitation, linkExistingClient } from "./actions";
import { InviteAcceptForm } from "@/components/InviteAcceptForm";
import { RelinkForm } from "@/components/RelinkForm";
import { signOut } from "@/app/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hashInviteToken } from "@/lib/invitations";
import { maskEmail } from "@/lib/auth/return-path";
import { NOINDEX } from "@/lib/site";

export const metadata = { title: "Invitación", ...NOINDEX };   // the URL carries a secret token: never index, never leak it in a Referer (see Referrer-Policy)
const card = "w-full max-w-sm space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6";

export default async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: rows } = await createAdminClient().rpc("invitation_context", { p_hash: hashInviteToken(token) });
  const ctx = (rows as { email: string; trainer_name: string; usable: boolean; account_id: string | null; account_role: string | null }[] | null)?.[0];
  const shell = (children: React.ReactNode) => <main className="grid min-h-[calc(100dvh-72px)] place-items-center p-4">{children}</main>;

  if (!ctx || !ctx.usable || (ctx.account_id && ctx.account_role !== "client")) {
    return shell(<div className={card}><h1 className="text-2xl font-semibold">Invitación no disponible</h1><p className="text-sm text-[var(--muted)]">La invitación es inválida, caducó o ya se usó. Pídele a tu entrenador una nueva.</p></div>);
  }
  if (!ctx.account_id) return shell(<InviteAcceptForm action={acceptInvitation.bind(null, token)} />);        // nobody has this e-mail yet: create the account

  // The e-mail already belongs to a client. The token never grants access to that account: they sign in as themselves first.
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (user?.id === ctx.account_id) return shell(<RelinkForm action={linkExistingClient.bind(null, token)} trainerName={ctx.trainer_name} />);
  if (user) {
    return shell(<div className={card}><h1 className="text-2xl font-semibold">Esta invitación es para otra cuenta</h1>
      <p className="text-sm text-[var(--muted)]">Estás conectado con otra cuenta. Cierra sesión e inicia con el correo al que se envió ({maskEmail(ctx.email)}).</p>
      <form action={signOut}><button className="w-full rounded-lg border border-[var(--border)] py-2.5">Cerrar sesión</button></form></div>);
  }
  return shell(<div className={card}><h1 className="text-2xl font-semibold">Ya tienes una cuenta</h1>
    <p className="text-sm text-[var(--muted)]">{ctx.trainer_name} te invitó con {maskEmail(ctx.email)}, que ya tiene una cuenta en Rutinia. Inicia sesión con ella para vincularte; volverás aquí para confirmar tus consentimientos.</p>
    <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} className="block w-full rounded-lg bg-[var(--accent)] py-2.5 text-center font-semibold text-black">Iniciar sesión</Link></div>);
}
