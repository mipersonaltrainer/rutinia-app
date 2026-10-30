import { purgeTestUsers } from "../tests/setup/purge-test-users";
export default async function teardown() { await purgeTestUsers(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321"); }
