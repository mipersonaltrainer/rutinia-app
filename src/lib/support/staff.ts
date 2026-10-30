import { redirect } from "next/navigation";
import { currentUser, homeFor } from "@/lib/session";

/** Leaves a line in staff_access_log (who, what, about whom — never content). Fails closed: if the trace cannot be written, the record is not shown. */
export async function logStaffAccess(supabase: Awaited<ReturnType<typeof requireStaff>>["supabase"], action: "view_trainer" | "view_thread" | "reply_thread" | "close_thread" | "send_campaign", target?: string | null, ref?: string) {
  const { error } = await supabase.rpc("staff_log_access", { p_action: action, p_target: target ?? null, p_ref: ref ?? null });
  if (error) throw new Error("No se pudo registrar el acceso del equipo");
}

/** The team's pages: the caller must be signed in and on the support_staff list (checked in the database by is_support_staff()). Anyone else goes home. */
export async function requireStaff() {
  const { supabase, user, profile } = await currentUser();      // shared with the layout/page of this request
  if (!user) redirect("/login");
  const { data: staff } = await supabase.rpc("is_support_staff");
  if (staff !== true || profile?.role !== "staff") {
    // On the team but without the second factor (when it is required): the verification screen, not the trainer home.
    if (profile?.role === "staff" && (await supabase.rpc("is_support_staff_member")).data === true) redirect("/staff-mfa");
    redirect(profile ? homeFor(profile.role) : "/login");   // not on the team: back to their own home
  }
  return { supabase, userId: user.id, name: profile?.full_name ?? "Equipo" };
}
