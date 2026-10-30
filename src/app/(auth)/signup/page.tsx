import { AuthForm } from "@/components/AuthForm";
import { signUpTrainer } from "@/app/actions";
import { issueFormToken } from "@/lib/auth/antibot";
import { authSecret } from "@/lib/auth/server";
import { googleEnabled } from "@/lib/auth/google";
import { captchaProps } from "@/lib/auth/captcha-props";

export const metadata = { title: "Crea tu cuenta de entrenador", description: "Prueba Rutinia gratis 7 días: evaluación, planes, registro de entrenos y progreso para tus alumnos.", alternates: { canonical: "/signup" } };

export default async function Page() { return <main className="grid min-h-[calc(100dvh-72px)] place-items-center p-4"><AuthForm mode="signup" action={signUpTrainer} google={googleEnabled()} token={issueFormToken(authSecret())} captcha={await captchaProps()} /></main>; }
