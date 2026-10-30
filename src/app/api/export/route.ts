import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildClientExport, buildTrainerExport } from "@/lib/privacy/export";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: p } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (p?.role === "staff") return NextResponse.json({ error: "not available for support accounts" }, { status: 403 });   // nothing of a person to export
  const body = p?.role === "client" ? await buildClientExport(supabase, user.id) : await buildTrainerExport(supabase, user.id);
  await createAdminClient().from("access_audit").insert({ actor_id: user.id, client_id: user.id, resource: "data_export" });
  return new NextResponse(JSON.stringify(body, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="training-os-mis-datos-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" } });
}
