import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { issueFormToken } from "@/lib/auth/antibot";
import { authSecret } from "@/lib/auth/server";
import { captchaProps } from "@/lib/auth/captcha-props";

import { NOINDEX } from "@/lib/site";
export const metadata = { title: "Recuperar contraseña", ...NOINDEX };
export default async function Page() { return <main className="grid min-h-[calc(100dvh-72px)] place-items-center p-4"><ForgotPasswordForm token={issueFormToken(authSecret())} captcha={await captchaProps()} /></main>; }
