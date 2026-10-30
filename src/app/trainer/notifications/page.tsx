import { requireUser } from "@/lib/session";
import { NotificationsList } from "@/components/NotificationsList";
export default async function Notifications() { const { supabase, profile } = await requireUser("trainer"); return <NotificationsList supabase={supabase} userId={profile.id} path="/trainer/notifications" />; }
