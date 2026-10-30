import { requireUser } from "@/lib/session";
import { NotificationsList } from "@/components/NotificationsList";
export default async function Notifications() { const { supabase, profile } = await requireUser("client"); return <NotificationsList supabase={supabase} userId={profile.id} path="/client/notifications" />; }
