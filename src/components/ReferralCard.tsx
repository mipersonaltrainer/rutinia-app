"use client";
import { useState } from "react";
import { ActionForm, fieldCls } from "./ActionForm";
import { saveReferralReward, redeemReferral } from "@/app/trainer/billing/actions";
import { REFERRAL_CAP, REFERRAL_REWARDS, REFERRAL_TRIAL_DAYS, type ReferralReward } from "@/lib/billing/referrals";

export function ReferralCard({ code, reward, link, rewarded, pending, canRedeem }: { code: string | null; reward: ReferralReward; link: string | null; rewarded: number; pending: number; canRedeem: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(link!); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the link is shown, it can be selected by hand */ } };
  return (
    <div className="space-y-4">
      <ActionForm action={saveReferralReward} submitLabel={code ? "Guardar recompensa" : "Crear mi código"}>
        <h2 className="font-semibold">Invita a otros entrenadores</h2>
        <p className="text-sm text-[var(--muted)]">Comparte tu código: quien se registre con él prueba Rutinia {REFERRAL_TRIAL_DAYS} días gratis en vez de 7. Cuando pague su primer mes, tú recibes lo que elijas aquí (hasta {REFERRAL_CAP} invitados premiados).</p>
        <fieldset className="space-y-2"><legend className="sr-only">Recompensa</legend>
          {(Object.keys(REFERRAL_REWARDS) as ReferralReward[]).map((k) => (
            <label key={k} className="flex min-h-11 items-center gap-3 text-sm"><input type="radio" name="reward" value={k} defaultChecked={reward === k} /> {REFERRAL_REWARDS[k].label}</label>
          ))}
        </fieldset>
        {code && link && (<div className="space-y-2 rounded-lg bg-[var(--surface-2)] p-3 text-sm">
          <p>Tu código: <b className="select-all tracking-widest">{code}</b></p>
          <p className="break-all text-[var(--muted)]"><span className="select-all">{link}</span></p>
          <button type="button" onClick={copy} className="min-h-11 rounded-lg border border-[var(--border)] px-3 py-2">{copied ? "¡Copiado!" : "Copiar enlace"}</button>
          <p className="text-[var(--muted)]">Invitados que ya pagaron: <b>{rewarded}</b> · En prueba: <b>{pending}</b></p>
        </div>)}
      </ActionForm>
      {canRedeem && (
        <ActionForm action={redeemReferral} submitLabel="Aplicar código">
          <h2 className="font-semibold">¿Te recomendó un colega?</h2>
          <label className="block text-sm">Código de referido<input name="code" maxLength={20} autoCapitalize="characters" autoComplete="off" className={fieldCls} /></label>
        </ActionForm>
      )}
    </div>
  );
}
