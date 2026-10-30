"use client";
import { ActionForm, fieldCls } from "@/components/ActionForm";
import { changePassword } from "@/app/auth-actions";
import { PASSWORD_MIN } from "@/lib/auth/password";

export function ChangePasswordForm() {
  return (
    <ActionForm action={changePassword} submitLabel="Cambiar contraseña" resetOnOk>
      <h2 className="font-semibold">Cambiar mi contraseña</h2>
      <p className="text-sm text-[var(--muted)]">Al cambiarla cerramos tu sesión en todos los demás dispositivos.</p>
      <label className="block text-sm">Contraseña actual<input name="current" type="password" required autoComplete="current-password" className={fieldCls} /></label>
      <label className="block text-sm">Contraseña nueva<input name="password" type="password" required minLength={PASSWORD_MIN} autoComplete="new-password" className={fieldCls} /></label>
      <label className="block text-sm">Repite la nueva<input name="confirm" type="password" required minLength={PASSWORD_MIN} autoComplete="new-password" className={fieldCls} /></label>
      <p className="text-xs text-[var(--muted)]">Mínimo {PASSWORD_MIN} caracteres, con letras y números. No uses tu nombre ni tu correo.</p>
    </ActionForm>
  );
}
