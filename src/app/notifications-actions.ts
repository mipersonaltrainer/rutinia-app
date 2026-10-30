"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function markAllRead(path: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser(); if (!user) return;
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  revalidatePath(path, "layout");
}
